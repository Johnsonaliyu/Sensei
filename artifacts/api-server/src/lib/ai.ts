import type { BotConfig } from "@workspace/api-zod";

type Provider = "groq" | "nvidia";
type ChatResult = { reply: string; provider: Provider; usedFallback: boolean };

const PROVIDERS: Array<{
  name: Provider;
  endpoint: string;
  key: string | undefined;
  model: string;
}> = [
  {
    name: "groq",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    key: process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL ?? "qwen/qwen3.8-27b",
  },
  {
    name: "nvidia",
    endpoint: "https://integrate.api.nvidia.com/v1/chat/completions",
    key: process.env.NVIDIA_API_KEY,
    model: process.env.NVIDIA_MODEL ?? "nvidia/nemotron-3.5-lightning-30b-a3b",
  },
];

async function requestProvider(
  provider: (typeof PROVIDERS)[number],
  systemPrompt: string,
  message: string,
): Promise<string> {
  if (!provider.key) throw new Error(`${provider.name} is not configured.`);

  const response = await fetch(provider.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      temperature: 0.4,
      max_tokens: 700,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`${provider.name} request failed with status ${response.status}.`);
  }

  const result = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const reply = result.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error(`${provider.name} returned an empty response.`);
  return reply;
}

export async function generateReply(
  config: Pick<BotConfig, "businessName" | "useCase" | "description" | "systemPrompt" | "tone">,
  message: string,
): Promise<ChatResult> {
  const systemPrompt = [
    `You are the WhatsApp assistant for ${config.businessName}.`,
    `Use case: ${config.useCase.replaceAll("_", " ")}.`,
    `Business information: ${config.description || "No additional information supplied."}`,
    `Communication tone: ${config.tone}.`,
    config.systemPrompt,
    "Be accurate, concise, and helpful. Do not invent business policies, prices, bookings, or order details.",
  ]
    .filter(Boolean)
    .join("\n");

  let primaryError: unknown;
  try {
    return {
      reply: await requestProvider(PROVIDERS[0], systemPrompt, message),
      provider: "groq",
      usedFallback: false,
    };
  } catch (error) {
    primaryError = error;
  }

  try {
    return {
      reply: await requestProvider(PROVIDERS[1], systemPrompt, message),
      provider: "nvidia",
      usedFallback: true,
    };
  } catch {
    throw new Error(
      primaryError instanceof Error
        ? "Both AI providers are unavailable. Check the Groq and NVIDIA API keys and try again."
        : "Both AI providers are unavailable. Check the provider configuration and try again.",
    );
  }
}
