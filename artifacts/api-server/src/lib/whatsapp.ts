import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import makeWASocket, {
  BufferJSON,
  DisconnectReason,
  initAuthCreds,
  makeCacheableSignalKeyStore,
  type AuthenticationCreds,
  type SignalDataTypeMap,
  type SignalDataSet,
  type SignalKeyStore,
  type WASocket,
  type WAMessage,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import type { BotConfig, WhatsappStatus } from "@workspace/api-zod";
import { logger } from "./logger";
import { generateReply } from "./ai";
import { getSupabaseAdmin } from "./supabase";

type StoredSession = {
  user_id: string;
  encrypted_auth_state: string | null;
  connection_state: WhatsappStatus["connectionState"];
  phone_number: string | null;
  connected_at: string | null;
  error_message: string | null;
};

type SessionRuntime = {
  socket?: WASocket;
  connectionState: WhatsappStatus["connectionState"];
  phoneNumber: string | null;
  connectedAt: string | null;
  qrCodeDataUrl: string | null;
  qrExpiresAt: string | null;
  error: string | null;
};

type PersistedAuthState = {
  creds: AuthenticationCreds;
  keys: Record<string, Record<string, unknown>>;
};

const sessions = new Map<string, SessionRuntime>();
const startupPromises = new Map<string, Promise<void>>();
const disconnectingUsers = new Set<string>();

function encryptionKey(): Buffer {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Supabase server credentials are not configured.");
  return createHash("sha256")
    .update(secret)
    .update("sensei-baileys-session-v1")
    .digest();
}

function encryptAuthState(value: PersistedAuthState): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const serialized = JSON.stringify(value, BufferJSON.replacer);
  const encrypted = Buffer.concat([cipher.update(serialized, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(".");
}

function decryptAuthState(value: string): PersistedAuthState {
  const [ivText, tagText, dataText] = value.split(".");
  if (!ivText || !tagText || !dataText) throw new Error("Stored WhatsApp session is invalid.");

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivText, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataText, "base64")),
    decipher.final(),
  ]).toString("utf8");

  return JSON.parse(decrypted, BufferJSON.reviver) as PersistedAuthState;
}

async function loadSessionRow(userId: string): Promise<StoredSession | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("sensei_whatsapp_sessions")
    .select("user_id, encrypted_auth_state, connection_state, phone_number, connected_at, error_message")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Could not read the WhatsApp connection.");
  return (data as StoredSession | null) ?? null;
}

async function saveSessionRow(userId: string, patch: Partial<StoredSession>): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("sensei_whatsapp_sessions")
    .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" });
  if (error) throw new Error("Could not save the WhatsApp connection.");
}

function statusFromRuntime(runtime?: SessionRuntime, row?: StoredSession | null): WhatsappStatus {
  const connectedAt = runtime?.connectedAt ?? row?.connected_at ?? null;
  const qrExpiresAt = runtime?.qrExpiresAt ?? null;
  return {
    connectionState: runtime?.connectionState ?? row?.connection_state ?? "disconnected",
    phoneNumber: runtime?.phoneNumber ?? row?.phone_number ?? null,
    connectedAt: connectedAt ? new Date(connectedAt) : null,
    qrCodeDataUrl: runtime?.qrCodeDataUrl ?? null,
    qrExpiresAt: qrExpiresAt ? new Date(qrExpiresAt) : null,
    error: runtime?.error ?? row?.error_message ?? null,
  };
}

async function readBotConfig(userId: string): Promise<BotConfig> {
  const { data, error } = await getSupabaseAdmin()
    .from("sensei_bot_configs")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw new Error("Save your chatbot setup before connecting WhatsApp.");
  return {
    id: data.user_id,
    businessName: data.business_name,
    useCase: data.use_case,
    description: data.description,
    systemPrompt: data.system_prompt,
    welcomeMessage: data.welcome_message,
    tone: data.tone,
    isActive: data.is_active,
    updatedAt: data.updated_at,
  } as BotConfig;
}

function getMessageText(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const data = message as Record<string, unknown>;
  const conversation = data.conversation;
  if (typeof conversation === "string") return conversation;
  const extended = data.extendedTextMessage as { text?: string } | undefined;
  if (typeof extended?.text === "string") return extended.text;
  const image = data.imageMessage as { caption?: string } | undefined;
  if (typeof image?.caption === "string") return image.caption;
  return "";
}

async function persistIncomingMessage(
  userId: string,
  socket: WASocket,
  message: WAMessage,
): Promise<void> {
  const remoteJid = message.key.remoteJid;
  const text = getMessageText(message.message);
  if (message.key.fromMe || !remoteJid || remoteJid.endsWith("@g.us") || !text.trim()) return;
  if (remoteJid === "status@broadcast") return;

  const client = getSupabaseAdmin();
  const customerPhone = remoteJid.split("@")[0].split(":")[0];
  const now = new Date().toISOString();
  const { data: conversation, error: conversationError } = await client
    .from("sensei_conversations")
    .upsert(
      {
        user_id: userId,
        customer_phone: customerPhone,
        customer_name: message.pushName || customerPhone,
        preview: text,
        last_message_at: now,
        state: "open",
      },
      { onConflict: "user_id,customer_phone" },
    )
    .select("id, unread_count")
    .single();
  if (conversationError || !conversation) throw new Error("Could not save the customer conversation.");

  await client.from("sensei_conversations")
    .update({ unread_count: (conversation.unread_count ?? 0) + 1 })
    .eq("id", conversation.id)
    .eq("user_id", userId);
  const { error: inboundError } = await client.from("sensei_messages").insert({
    user_id: userId,
    conversation_id: conversation.id,
    direction: "inbound",
    content: text,
    sent_at: now,
  });
  if (inboundError) throw new Error("Could not save the incoming customer message.");

  const config = await readBotConfig(userId);
  if (!config.isActive) return;

    const { data: recent } = await client
    .from("sensei_messages")
    .select("direction, content")
    .eq("user_id", userId)
    .eq("conversation_id", conversation.id)
    .order("sent_at", { ascending: false })
    .limit(20);
  const history = (recent ?? [])
    .reverse()
    .map((row) => ({
      role: row.direction === "outbound" ? ("assistant" as const) : ("user" as const),
      content: String(row.content),
    }));
  const generated = await generateReply(config, text, history);
  await socket.sendMessage(remoteJid, { text: generated.reply });
  const sentAt = new Date().toISOString();
  const { error: outboundError } = await client.from("sensei_messages").insert({
    user_id: userId,
    conversation_id: conversation.id,
    direction: "outbound",
    content: generated.reply,
    provider: generated.provider,
    sent_at: sentAt,
  });
  if (outboundError) throw new Error("The reply was sent but could not be saved to the conversation.");
  await client.from("sensei_conversations")
    .update({ preview: generated.reply, last_message_at: sentAt })
    .eq("id", conversation.id)
    .eq("user_id", userId);
}

async function createSession(userId: string, stored?: StoredSession | null): Promise<void> {
  if (sessions.get(userId)?.socket) return;
  const existingStart = startupPromises.get(userId);
  if (existingStart) return existingStart;

  const start = (async () => {
    const saved = stored ?? await loadSessionRow(userId);
    let state: PersistedAuthState;
    try {
      state = saved?.encrypted_auth_state
        ? decryptAuthState(saved.encrypted_auth_state)
        : { creds: initAuthCreds(), keys: {} };
    } catch (error) {
      logger.error({ err: error, userId }, "Could not restore encrypted WhatsApp session");
      throw new Error("The saved WhatsApp session could not be unlocked. Reconnect the number.");
    }

    const runtime: SessionRuntime = {
      connectionState: saved?.encrypted_auth_state ? "reconnecting" : "connecting",
      phoneNumber: saved?.phone_number ?? null,
      connectedAt: saved?.connected_at ?? null,
      qrCodeDataUrl: null,
      qrExpiresAt: null,
      error: null,
    };
    sessions.set(userId, runtime);

    let persistChain = Promise.resolve();
    const persist = () => {
      const encrypted = encryptAuthState(state);
      persistChain = persistChain
        .then(() => saveSessionRow(userId, {
          encrypted_auth_state: encrypted,
          connection_state: runtime.connectionState,
          phone_number: runtime.phoneNumber,
          connected_at: runtime.connectedAt,
          error_message: runtime.error,
        }))
        .catch((error: unknown) => {
          logger.error({ err: error, userId }, "Could not persist WhatsApp session state");
        });
    };

    const backingKeys: Record<string, Record<string, unknown>> = state.keys ?? {};
    const keyStore: SignalKeyStore = {
      get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
        const values: Record<string, SignalDataTypeMap[T]> = {};
        for (const id of ids) {
          const value = backingKeys[type]?.[id];
          if (value !== undefined) values[id] = value as SignalDataTypeMap[T];
        }
        return values;
      },
      set: async (data: SignalDataSet) => {
        for (const [type, values] of Object.entries(data)) {
          if (!values) continue;
          backingKeys[type] ??= {};
          for (const [id, value] of Object.entries(values)) {
            if (value === null) delete backingKeys[type][id];
            else backingKeys[type][id] = value;
          }
        }
        state.keys = backingKeys;
        persist();
      },
      clear: async () => {
        for (const key of Object.keys(backingKeys)) delete backingKeys[key];
        state.keys = backingKeys;
        persist();
      },
    };

    const socket = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(keyStore),
      },
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });
    runtime.socket = socket;
    socket.ev.on("creds.update", (creds) => {
      state.creds = { ...state.creds, ...creds };
      persist();
    });
    socket.ev.on("connection.update", async (update) => {
      if (update.qr) {
        runtime.connectionState = "qr_ready";
        runtime.qrCodeDataUrl = await QRCode.toDataURL(update.qr, { margin: 1, width: 260 });
        runtime.qrExpiresAt = new Date(Date.now() + 60_000).toISOString();
        runtime.error = null;
        await saveSessionRow(userId, {
          connection_state: runtime.connectionState,
          phone_number: runtime.phoneNumber,
          connected_at: runtime.connectedAt,
          error_message: null,
        });
      }
      if (update.connection === "open") {
        runtime.connectionState = "connected";
        runtime.phoneNumber = socket.user?.id?.split("@")[0]?.split(":")[0] ?? null;
        runtime.connectedAt = new Date().toISOString();
        runtime.qrCodeDataUrl = null;
        runtime.qrExpiresAt = null;
        runtime.error = null;
        persist();
        await saveSessionRow(userId, {
          connection_state: runtime.connectionState,
          phone_number: runtime.phoneNumber,
          connected_at: runtime.connectedAt,
          error_message: null,
        });
      }
      if (update.connection === "close") {
        const statusCode = (update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
          ?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        runtime.connectionState = loggedOut ? "disconnected" : "reconnecting";
        runtime.error = loggedOut ? "WhatsApp signed this device out. Pair again to reconnect." : null;
        runtime.socket = undefined;
        if (disconnectingUsers.has(userId)) {
          disconnectingUsers.delete(userId);
          sessions.delete(userId);
          return;
        }
        if (loggedOut) {
          state = { creds: initAuthCreds(), keys: {} };
          sessions.delete(userId);
          await saveSessionRow(userId, {
            encrypted_auth_state: null,
            connection_state: "disconnected",
            phone_number: null,
            connected_at: null,
            error_message: runtime.error,
          });
        } else {
          await saveSessionRow(userId, {
            connection_state: "reconnecting",
            phone_number: runtime.phoneNumber,
            connected_at: runtime.connectedAt,
            error_message: null,
          });
          setTimeout(() => {
            void createSession(userId).catch((error: unknown) => {
              logger.warn({ err: error, userId }, "WhatsApp reconnect attempt failed");
            });
          }, 2_000);
        }
      }
    });
    socket.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const message of messages) {
        try {
          await persistIncomingMessage(userId, socket, message);
        } catch (error) {
          logger.error({ err: error, userId }, "Could not process an incoming WhatsApp message");
        }
      }
    });

    await saveSessionRow(userId, {
      encrypted_auth_state: encryptAuthState(state),
      connection_state: runtime.connectionState,
      phone_number: runtime.phoneNumber,
      connected_at: runtime.connectedAt,
      error_message: null,
    });
  })();

  startupPromises.set(userId, start);
  try {
    await start;
  } finally {
    startupPromises.delete(userId);
  }
}

export async function getWhatsappStatus(userId: string): Promise<WhatsappStatus> {
  const row = await loadSessionRow(userId);
  let runtime = sessions.get(userId);
  if (!runtime && row?.encrypted_auth_state) {
    void createSession(userId, row).catch((error: unknown) => {
      logger.error({ err: error, userId }, "Could not restore WhatsApp session");
    });
    return statusFromRuntime(
      {
        connectionState: "reconnecting",
        phoneNumber: row.phone_number,
        connectedAt: row.connected_at,
        qrCodeDataUrl: null,
        qrExpiresAt: null,
        error: null,
      },
      row,
    );
  }
  runtime = sessions.get(userId);
  return statusFromRuntime(runtime, row);
}

export async function startWhatsappPairing(userId: string): Promise<WhatsappStatus> {
  const runtime = sessions.get(userId);
  if (runtime?.socket && runtime.connectionState !== "disconnected" && runtime.connectionState !== "error") {
    return statusFromRuntime(runtime);
  }

  await saveSessionRow(userId, {
    connection_state: "connecting",
    phone_number: null,
    connected_at: null,
    error_message: null,
  });
  try {
    await createSession(userId, null);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start WhatsApp pairing.";
    await saveSessionRow(userId, { connection_state: "error", error_message: message });
    return {
      connectionState: "error",
      phoneNumber: null,
      connectedAt: null,
      qrCodeDataUrl: null,
      qrExpiresAt: null,
      error: message,
    };
  }
  return getWhatsappStatus(userId);
}

export async function disconnectWhatsapp(userId: string): Promise<WhatsappStatus> {
  const runtime = sessions.get(userId);
  disconnectingUsers.add(userId);
  runtime?.socket?.end(new Error("Disconnected by the business owner."));
  sessions.delete(userId);
  await saveSessionRow(userId, {
    encrypted_auth_state: null,
    connection_state: "disconnected",
    phone_number: null,
    connected_at: null,
    error_message: null,
  });
  return {
    connectionState: "disconnected",
    phoneNumber: null,
    connectedAt: null,
    qrCodeDataUrl: null,
    qrExpiresAt: null,
    error: null,
  };
}

export async function loadBotConfigForUser(userId: string): Promise<BotConfig> {
  return readBotConfig(userId);
}
