/**
 * llm-client.ts
 * Owns: Multi-provider AI abstraction (Ollama, OpenAI, etc.).
 * Upholds:
 * - Invariant I-5: API keys read securely via secure-storage.ts, never logged or returned over IPC.
 * - Invariant I-6: Prompts contain file metadata only, never raw file contents.
 * - Invariant I-7: Local Ollama is zero-config default; cloud calls require explicit user setup. No silent cloud fallback.
 */
import { Ollama } from "ollama";
import OpenAI from "openai";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { aiProviderConfig } from "../db/schema";
import {
  getProviderKey,
  saveProviderKey,
  hasProviderKey,
} from "../core/secure-storage";
import {
  AiProviderName,
  AiProviderInfo,
  AiProviderStatusResponse,
} from "@horizon/shared-types";

const DEFAULT_MODELS: Record<AiProviderName, string> = {
  ollama: "llama3.2:3b",
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
  groq: "llama-3.1-8b-instant",
  openrouter: "meta-llama/llama-3.2-3b-instruct",
};

const DISPLAY_NAMES: Record<AiProviderName, string> = {
  ollama: "Ollama (Local Default)",
  openai: "OpenAI",
  anthropic: "Anthropic",
  groq: "Groq",
  openrouter: "OpenRouter",
};

/**
 * Ensure default provider configuration exists in SQLite on startup
 */
export function ensureDefaultAiConfig(): void {
  try {
    const existing = db.select().from(aiProviderConfig).all();
    if (existing.length === 0) {
      db.insert(aiProviderConfig)
        .values({
          providerName: "ollama",
          modelName: DEFAULT_MODELS.ollama,
          isActive: 1,
          addedAt: new Date().toISOString(),
        })
        .run();
    }
  } catch (err) {
    console.error("Failed to initialize default AI provider config:", err);
  }
}

/**
 * List local models from local Ollama daemon
 */
export async function listOllamaModels(
  host: string = "http://127.0.0.1:11434"
): Promise<{ reachable: boolean; models: string[] }> {
  try {
    const ollama = new Ollama({ host });
    const response = await ollama.list();
    const models = (response.models || []).map((m) => m.name);
    return { reachable: true, models };
  } catch {
    return { reachable: false, models: [] };
  }
}

/**
 * Get comprehensive status for all supported providers
 */
export async function getProvidersStatus(): Promise<AiProviderStatusResponse> {
  ensureDefaultAiConfig();
  const dbConfigs = db.select().from(aiProviderConfig).all();
  const configMap = new Map(dbConfigs.map((c) => [c.providerName, c]));

  // Check Ollama daemon reachability & local models
  const ollamaCheck = await listOllamaModels();

  let activeProvider: AiProviderName = "ollama";
  let activeModel: string = DEFAULT_MODELS.ollama;

  const supported: AiProviderName[] = [
    "ollama",
    "openai",
    "anthropic",
    "groq",
    "openrouter",
  ];

  const providers: AiProviderInfo[] = supported.map((name) => {
    const isLocal = name === "ollama";
    const stored = configMap.get(name);
    const hasKey = hasProviderKey(name);
    const isConfigured = isLocal ? ollamaCheck.reachable : hasKey;
    const modelName = stored?.modelName || DEFAULT_MODELS[name];
    const isActive = stored ? stored.isActive === 1 : false;

    if (isActive) {
      activeProvider = name;
      activeModel = modelName;
    }

    return {
      providerName: name,
      displayName: DISPLAY_NAMES[name],
      modelName,
      isActive,
      isConfigured,
      hasKey,
      isLocal,
      availableModels: isLocal ? ollamaCheck.models : undefined,
    };
  });

  return {
    providers,
    activeProvider,
    activeModel,
  };
}

/**
 * Test connection to a provider with a probe request
 */
export async function testProviderConnection(params: {
  provider: AiProviderName;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}): Promise<{ success: boolean; latencyMs?: number; error?: string }> {
  const startTime = Date.now();

  try {
    if (params.provider === "ollama") {
      const host = params.baseUrl || "http://127.0.0.1:11434";
      const ollama = new Ollama({ host });
      await ollama.generate({
        model: params.model,
        prompt: "ping",
        options: { num_predict: 1 },
      });
      return { success: true, latencyMs: Date.now() - startTime };
    }

    if (params.provider === "openai") {
      const key = params.apiKey || getProviderKey("openai");
      if (!key) {
        return { success: false, error: "No API key provided for OpenAI" };
      }

      const client = new OpenAI({ apiKey: key });
      await client.chat.completions.create({
        model: params.model || DEFAULT_MODELS.openai,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      });

      return { success: true, latencyMs: Date.now() - startTime };
    }

    return {
      success: false,
      error: `Provider ${params.provider} testing not yet configured`,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Connection probe failed",
      latencyMs: Date.now() - startTime,
    };
  }
}

/**
 * Configure and persist an AI provider's settings and API key
 */
export async function configureProvider(params: {
  provider: AiProviderName;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  setActive?: boolean;
}): Promise<{ success: boolean; message?: string }> {
  // Validate probe request first if an API key is provided or for cloud providers
  if (params.provider !== "ollama" && params.apiKey) {
    const probe = await testProviderConnection(params);
    if (!probe.success) {
      throw new Error(
        `API key validation failed: ${probe.error || "Connection test rejected"}`
      );
    }
  }

  // Save key securely via safeStorage if provided
  if (params.apiKey) {
    saveProviderKey(params.provider, params.apiKey);
  }

  const now = new Date().toISOString();

  // If setting active, deactivate other providers first
  if (params.setActive) {
    db.update(aiProviderConfig).set({ isActive: 0 }).run();
  }

  const existing = db
    .select()
    .from(aiProviderConfig)
    .where(eq(aiProviderConfig.providerName, params.provider))
    .get();

  if (existing) {
    db.update(aiProviderConfig)
      .set({
        modelName: params.model,
        isActive: params.setActive ? 1 : existing.isActive,
      })
      .where(eq(aiProviderConfig.providerName, params.provider))
      .run();
  } else {
    db.insert(aiProviderConfig)
      .values({
        providerName: params.provider,
        modelName: params.model,
        isActive: params.setActive ? 1 : 0,
        addedAt: now,
      })
      .run();
  }

  return { success: true, message: "Provider configured successfully" };
}

/**
 * Switch the active provider in SQLite
 */
export async function setActiveProvider(
  provider: AiProviderName
): Promise<{ success: boolean }> {
  ensureDefaultAiConfig();

  const target = db
    .select()
    .from(aiProviderConfig)
    .where(eq(aiProviderConfig.providerName, provider))
    .get();

  if (!target) {
    // If not yet in DB, configure with default model
    db.update(aiProviderConfig).set({ isActive: 0 }).run();
    db.insert(aiProviderConfig)
      .values({
        providerName: provider,
        modelName: DEFAULT_MODELS[provider],
        isActive: 1,
        addedAt: new Date().toISOString(),
      })
      .run();
  } else {
    db.update(aiProviderConfig).set({ isActive: 0 }).run();
    db.update(aiProviderConfig)
      .set({ isActive: 1 })
      .where(eq(aiProviderConfig.providerName, provider))
      .run();
  }

  return { success: true };
}

/**
 * Generate completion using currently active AI provider
 */
export async function generateCompletion(params: {
  prompt: string;
  systemPrompt?: string;
}): Promise<string> {
  const status = await getProvidersStatus();
  const active = status.providers.find((p) => p.isActive);

  if (!active) {
    throw new Error("No active AI provider configured");
  }

  if (active.providerName === "ollama") {
    const ollama = new Ollama({ host: "http://127.0.0.1:11434" });
    const response = await ollama.generate({
      model: active.modelName,
      prompt: params.prompt,
      system: params.systemPrompt,
    });
    return response.response;
  }

  if (active.providerName === "openai") {
    const key = getProviderKey("openai");
    if (!key) {
      throw new Error("OpenAI API key missing in secure storage");
    }
    const client = new OpenAI({ apiKey: key });
    const response = await client.chat.completions.create({
      model: active.modelName,
      messages: [
        ...(params.systemPrompt
          ? [{ role: "system" as const, content: params.systemPrompt }]
          : []),
        { role: "user" as const, content: params.prompt },
      ],
    });
    return response.choices[0]?.message?.content || "";
  }

  throw new Error(`Active provider ${active.providerName} is not yet supported`);
}

/**
 * Generate structured and validated output with one repair retry
 */
export async function generateStructured<T>(params: {
  prompt: string;
  systemPrompt?: string;
  schema: z.ZodSchema<T>;
}): Promise<T> {
  const structuredPrompt = `${params.prompt}\n\nIMPORTANT: Respond ONLY with valid JSON matching the requested schema with no markdown code fences.`;
  const rawResponse = await generateCompletion({
    prompt: structuredPrompt,
    systemPrompt: params.systemPrompt,
  });

  try {
    const cleaned = rawResponse.replace(/```json\s*|```/g, "").trim();
    const parsedJson = JSON.parse(cleaned);
    return params.schema.parse(parsedJson);
  } catch (initialErr) {
    // Attempt one repair re-prompt
    const repairPrompt = `The previous response failed schema validation:\nResponse was: ${rawResponse}\nError: ${initialErr}\n\nPlease output only corrected valid JSON matching the schema.`;
    const repairedResponse = await generateCompletion({
      prompt: repairPrompt,
      systemPrompt: params.systemPrompt,
    });
    const cleanedRepaired = repairedResponse
      .replace(/```json\s*|```/g, "")
      .trim();
    const repairedJson = JSON.parse(cleanedRepaired);
    return params.schema.parse(repairedJson);
  }
}
