import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import {
  GetBotConfigResponse,
  GetSenseiDashboardResponse,
  GetWhatsappStatusResponse,
  ListConversationsResponse,
  SaveBotConfigBody,
  SaveBotConfigResponse,
  TestBotReplyBody,
  TestBotReplyResponse,
  DisconnectWhatsappResponse,
  ConnectWhatsappResponse,
} from "@workspace/api-zod";
import { getSupabaseAdmin, getAuthenticatedUser } from "../lib/supabase";
import { generateReply } from "../lib/ai";
import {
  disconnectWhatsapp,
  getWhatsappStatus,
  loadBotConfigForUser,
  startWhatsappPairing,
} from "../lib/whatsapp";

const router: IRouter = Router();
type AuthenticatedRequest = Request & { senseiUserId: string };

function userId(req: Request): string {
  return (req as AuthenticatedRequest).senseiUserId;
}

router.use(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authorization = req.header("authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) {
    res.status(401).json({ error: "Sign in to access your Sensei workspace." });
    return;
  }

  try {
    const user = await getAuthenticatedUser(accessToken);
    if (!user) {
      res.status(401).json({ error: "Your session has expired. Sign in again." });
      return;
    }
    (req as AuthenticatedRequest).senseiUserId = user.id;
    next();
  } catch {
    res.status(503).json({ error: "Sensei could not verify your session." });
  }
});

async function ensureBotConfig(userIdValue: string) {
  const client = getSupabaseAdmin();
  const { data, error } = await client
    .from("sensei_bot_configs")
    .select("*")
    .eq("user_id", userIdValue)
    .maybeSingle();
  if (error) throw new Error("Could not load the chatbot setup.");
  if (data) return data;

  const { data: created, error: createError } = await client
    .from("sensei_bot_configs")
    .upsert(
      {
        user_id: userIdValue,
        business_name: "My business",
        use_case: "customer_support",
        description: "",
        system_prompt: "Answer customer questions using only the business information provided.",
        welcome_message: "Hi! How can I help you today?",
        tone: "friendly",
        is_active: true,
      },
      { onConflict: "user_id", ignoreDuplicates: true },
    )
    .select("*")
    .maybeSingle();
  if (createError) throw new Error("Could not create the chatbot setup.");
  if (created) return created;

  const { data: refreshed, error: refreshError } = await client
    .from("sensei_bot_configs")
    .select("*")
    .eq("user_id", userIdValue)
    .single();
  if (refreshError || !refreshed) throw new Error("Could not load the chatbot setup.");
  return refreshed;
}

function mapBotConfig(row: Record<string, unknown>) {
  return {
    id: String(row.user_id),
    businessName: String(row.business_name),
    useCase: row.use_case,
    description: String(row.description ?? ""),
    systemPrompt: String(row.system_prompt ?? ""),
    welcomeMessage: String(row.welcome_message ?? ""),
    tone: row.tone,
    isActive: Boolean(row.is_active),
    updatedAt: row.updated_at,
  };
}

router.get("/sensei/dashboard", async (req, res): Promise<void> => {
  const currentUserId = userId(req);
  const client = getSupabaseAdmin();
  const [config, status, today, month, recent] = await Promise.all([
    ensureBotConfig(currentUserId),
    getWhatsappStatus(currentUserId),
    client.from("sensei_conversations").select("id", { count: "exact", head: true })
      .eq("user_id", currentUserId).gte("last_message_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
    client.from("sensei_messages").select("id", { count: "exact", head: true })
      .eq("user_id", currentUserId).gte("sent_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    client.from("sensei_conversations")
      .select("id, customer_name, customer_phone, preview, last_message_at, unread_count, state")
      .eq("user_id", currentUserId).order("last_message_at", { ascending: false }).limit(5),
  ]);
  if (today.error || month.error || recent.error) {
    res.status(503).json({ error: "Dashboard data is unavailable. Apply the Sensei Supabase schema and try again." });
    return;
  }

  const result = {
    businessName: config.business_name,
    botActive: Boolean(config.is_active),
    whatsappStatus: status.connectionState,
    whatsappPhone: status.phoneNumber,
    useCase: config.use_case,
    conversationsToday: today.count ?? 0,
    messagesThisMonth: month.count ?? 0,
    responseRate: (today.count ?? 0) > 0 ? 100 : 0,
    recentConversations: (recent.data ?? []).map((row) => ({
      id: row.id,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      preview: row.preview,
      lastMessageAt: row.last_message_at,
      unreadCount: row.unread_count ?? 0,
      state: row.state,
    })),
  };
  res.json(GetSenseiDashboardResponse.parse(result));
});

router.get("/sensei/bot-config", async (req, res): Promise<void> => {
  const config = await ensureBotConfig(userId(req));
  res.json(GetBotConfigResponse.parse(mapBotConfig(config)));
});

router.put("/sensei/bot-config", async (req, res): Promise<void> => {
  const parsed = SaveBotConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const value = parsed.data;
  const { data, error } = await getSupabaseAdmin()
    .from("sensei_bot_configs")
    .upsert(
      {
        user_id: userId(req),
        business_name: value.businessName,
        use_case: value.useCase,
        description: value.description,
        system_prompt: value.systemPrompt,
        welcome_message: value.welcomeMessage,
        tone: value.tone,
        is_active: value.isActive,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select("*")
    .single();
  if (error || !data) {
    res.status(503).json({ error: "Could not save the chatbot setup. Apply the Sensei Supabase schema and try again." });
    return;
  }
  res.json(SaveBotConfigResponse.parse(mapBotConfig(data)));
});

router.get("/sensei/whatsapp/status", async (req, res): Promise<void> => {
  res.json(GetWhatsappStatusResponse.parse(await getWhatsappStatus(userId(req))));
});

router.post("/sensei/whatsapp/connect", async (req, res): Promise<void> => {
  await ensureBotConfig(userId(req));
  res.json(ConnectWhatsappResponse.parse(await startWhatsappPairing(userId(req))));
});

router.post("/sensei/whatsapp/disconnect", async (req, res): Promise<void> => {
  res.json(DisconnectWhatsappResponse.parse(await disconnectWhatsapp(userId(req))));
});

router.post("/sensei/ai/test", async (req, res): Promise<void> => {
  const parsed = TestBotReplyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const config = await loadBotConfigForUser(userId(req));
  try {
    const result = await generateReply(config, parsed.data.message);
    res.json(TestBotReplyResponse.parse(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI providers are unavailable.";
    res.status(502).json({ error: message });
  }
});

router.get("/sensei/conversations", async (req, res): Promise<void> => {
  const { data, error } = await getSupabaseAdmin()
    .from("sensei_conversations")
    .select("id, customer_name, customer_phone, preview, last_message_at, unread_count, state")
    .eq("user_id", userId(req))
    .order("last_message_at", { ascending: false })
    .limit(100);
  if (error) {
    res.status(503).json({ error: "Conversation data is unavailable. Apply the Sensei Supabase schema and try again." });
    return;
  }

  const result = (data ?? []).map((row) => ({
    id: row.id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    preview: row.preview,
    lastMessageAt: row.last_message_at,
    unreadCount: row.unread_count ?? 0,
    state: row.state,
  }));
  res.json(ListConversationsResponse.parse(result));
});

export default router;
