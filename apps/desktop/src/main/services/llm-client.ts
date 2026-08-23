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
import Anthropic from "@anthropic-ai/sdk";
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

/** Default local Ollama endpoint */
export const OLLAMA_LOCAL_HOST = "http://127.0.0.1:11434";

/**
 * Returns the Ollama base URL to use: the user-configured remote URL if saved,
 * otherwise the local default.
 */
export function getOllamaHost(): string {
  try {
    const stored = db
      .select()
      .from(aiProviderConfig)
      .where(eq(aiProviderConfig.providerName, "ollama"))
      .get();
    return stored?.baseUrl || OLLAMA_LOCAL_HOST;
  } catch {
    return OLLAMA_LOCAL_HOST;
  }
}

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
    } else {
      const hasActive = existing.some((c) => c.isActive === 1);
      if (!hasActive) {
        db.update(aiProviderConfig)
          .set({ isActive: 1 })
          .where(eq(aiProviderConfig.providerName, "ollama"))
          .run();
      }
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

  // Determine Ollama host: use stored remote URL if configured
  const ollamaStoredConfig = configMap.get("ollama");
  const ollamaHost = ollamaStoredConfig?.baseUrl || OLLAMA_LOCAL_HOST;
  const ollamaMode = ollamaStoredConfig?.baseUrl ? "remote" : "local";

  // Check Ollama daemon reachability & list models from the configured host
  const ollamaCheck = await listOllamaModels(ollamaHost);

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

    const info: AiProviderInfo = {
      providerName: name,
      displayName: DISPLAY_NAMES[name],
      modelName,
      isActive,
      isConfigured,
      hasKey,
      isLocal,
      availableModels: isLocal ? ollamaCheck.models : undefined,
    };

    if (name === "ollama") {
      info.ollamaMode = ollamaMode;
      if (ollamaStoredConfig?.baseUrl) {
        info.baseUrl = ollamaStoredConfig.baseUrl;
      }
    }

    return info;
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

    if (params.provider === "groq") {
      const key = params.apiKey || getProviderKey("groq");
      if (!key) {
        return { success: false, error: "No API key provided for Groq" };
      }

      const client = new OpenAI({
        apiKey: key,
        baseURL: "https://api.groq.com/openai/v1",
      });
      await client.chat.completions.create({
        model: params.model || DEFAULT_MODELS.groq,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      });

      return { success: true, latencyMs: Date.now() - startTime };
    }

    if (params.provider === "openrouter") {
      const key = params.apiKey || getProviderKey("openrouter");
      if (!key) {
        return { success: false, error: "No API key provided for OpenRouter" };
      }

      const client = new OpenAI({
        apiKey: key,
        baseURL: "https://openrouter.ai/api/v1",
      });
      await client.chat.completions.create({
        model: params.model || DEFAULT_MODELS.openrouter,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      });

      return { success: true, latencyMs: Date.now() - startTime };
    }

    if (params.provider === "anthropic") {
      const key = params.apiKey || getProviderKey("anthropic");
      if (!key) {
        return { success: false, error: "No API key provided for Anthropic" };
      }

      const client = new Anthropic({ apiKey: key });
      await client.messages.create({
        model: params.model || DEFAULT_MODELS.anthropic,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      });

      return { success: true, latencyMs: Date.now() - startTime };
    }

    return {
      success: false,
      error: `Provider ${params.provider} is not supported`,
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
  // For Ollama remote mode, validate connectivity against the custom endpoint
  if (params.provider === "ollama" && params.baseUrl) {
    const probe = await testProviderConnection(params);
    if (!probe.success) {
      throw new Error(
        `Ollama remote connection failed: ${probe.error || "Connection test rejected"}`
      );
    }
  }

  // Validate probe request first if an API key is provided for cloud providers
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

  // baseUrl: empty string means "clear" (revert to local), undefined means "don't change"
  const resolvedBaseUrl =
    params.baseUrl !== undefined
      ? params.baseUrl.trim() || null
      : existing?.baseUrl ?? null;

  if (existing) {
    db.update(aiProviderConfig)
      .set({
        modelName: params.model,
        isActive: params.setActive ? 1 : existing.isActive,
        baseUrl: resolvedBaseUrl,
      })
      .where(eq(aiProviderConfig.providerName, params.provider))
      .run();
  } else {
    db.insert(aiProviderConfig)
      .values({
        providerName: params.provider,
        modelName: params.model,
        isActive: params.setActive ? 1 : 0,
        baseUrl: resolvedBaseUrl,
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
  jsonMode?: boolean;
}): Promise<string> {
  const status = await getProvidersStatus();
  const active = status.providers.find((p) => p.isActive);

  if (!active) {
    throw new Error("No active AI provider configured");
  }

  if (active.providerName === "ollama") {
    const ollama = new Ollama({ host: getOllamaHost() });
    const response = await ollama.generate({
      model: active.modelName,
      prompt: params.prompt,
      system: params.systemPrompt,
      format: params.jsonMode ? "json" : undefined,
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
      response_format: params.jsonMode ? { type: "json_object" } : undefined,
      messages: [
        ...(params.systemPrompt
          ? [{ role: "system" as const, content: params.systemPrompt }]
          : []),
        { role: "user" as const, content: params.prompt },
      ],
    });
    return response.choices[0]?.message?.content || "";
  }

  if (active.providerName === "groq") {
    const key = getProviderKey("groq");
    if (!key) {
      throw new Error("Groq API key missing in secure storage");
    }
    const client = new OpenAI({
      apiKey: key,
      baseURL: "https://api.groq.com/openai/v1",
    });
    const response = await client.chat.completions.create({
      model: active.modelName,
      response_format: params.jsonMode ? { type: "json_object" } : undefined,
      messages: [
        ...(params.systemPrompt
          ? [{ role: "system" as const, content: params.systemPrompt }]
          : []),
        { role: "user" as const, content: params.prompt },
      ],
    });
    return response.choices[0]?.message?.content || "";
  }

  if (active.providerName === "openrouter") {
    const key = getProviderKey("openrouter");
    if (!key) {
      throw new Error("OpenRouter API key missing in secure storage");
    }
    const client = new OpenAI({
      apiKey: key,
      baseURL: "https://openrouter.ai/api/v1",
    });
    const response = await client.chat.completions.create({
      model: active.modelName,
      response_format: params.jsonMode ? { type: "json_object" } : undefined,
      messages: [
        ...(params.systemPrompt
          ? [{ role: "system" as const, content: params.systemPrompt }]
          : []),
        { role: "user" as const, content: params.prompt },
      ],
    });
    return response.choices[0]?.message?.content || "";
  }

  if (active.providerName === "anthropic") {
    const key = getProviderKey("anthropic");
    if (!key) {
      throw new Error("Anthropic API key missing in secure storage");
    }
    const client = new Anthropic({ apiKey: key });
    const response = await client.messages.create({
      model: active.modelName,
      max_tokens: 4096,
      system: params.systemPrompt,
      messages: [{ role: "user", content: params.prompt }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock?.text || "";
  }

  throw new Error(`Active provider ${active.providerName} is not yet supported`);
}

/**
 * Extracts a clean JSON string from LLM output (handles code fences, preamble, etc.)
 */
export function extractJsonFromText(rawText: string): string {
  if (!rawText) return "";

  const codeBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    const candidate = codeBlockMatch[1].trim();
    if (candidate.startsWith("{") || candidate.startsWith("[")) {
      return candidate;
    }
  }

  const firstBracket = rawText.indexOf("[");
  const firstBrace = rawText.indexOf("{");

  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
    const lastBracket = rawText.lastIndexOf("]");
    if (lastBracket > firstBracket) {
      return rawText.substring(firstBracket, lastBracket + 1).trim();
    }
    return rawText.substring(firstBracket).trim();
  }

  if (firstBrace !== -1) {
    const lastBrace = rawText.lastIndexOf("}");
    if (lastBrace > firstBrace) {
      return rawText.substring(firstBrace, lastBrace + 1).trim();
    }
    return rawText.substring(firstBrace).trim();
  }

  return rawText.replace(/```json\s*|```/g, "").trim();
}

function removeCommentsFromText(str: string): string {
  let result = "";
  let inString = false;
  let escape = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const next = str[i + 1];

    if (inString) {
      result += char;
      if (escape) {
        escape = false;
      } else if (char === "\\") {
        escape = true;
      } else if (char === '"') {
        inString = false;
      }
    } else {
      if (char === '"') {
        inString = true;
        result += char;
      } else if (char === "/" && next === "/") {
        i += 2;
        while (i < str.length && str[i] !== "\n" && str[i] !== "\r") {
          i++;
        }
        if (i < str.length) result += str[i];
      } else if (char === "/" && next === "*") {
        i += 2;
        while (i < str.length - 1 && !(str[i] === "*" && str[i + 1] === "/")) {
          i++;
        }
        i++;
      } else {
        result += char;
      }
    }
  }

  return result;
}

function fixStringsAndStructure(str: string): string {
  let result = "";
  let inString = false;
  let escape = false;
  const stack: Array<"{" | "["> = [];

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (!inString) {
      if (char === "{" || char === "[") {
        stack.push(char);
        result += char;
      } else if (char === "}") {
        if (stack[stack.length - 1] === "{") stack.pop();
        result += char;
      } else if (char === "]") {
        if (stack[stack.length - 1] === "[") stack.pop();
        result += char;
      } else if (char === '"') {
        inString = true;
        result += char;
      } else {
        result += char;
      }
    } else {
      if (escape) {
        result += char;
        escape = false;
      } else if (char === "\\") {
        escape = true;
        result += char;
      } else if (char === "\n") {
        result += "\\n";
      } else if (char === "\r") {
        // skip carriage return inside string
      } else if (char === "\t") {
        result += "\\t";
      } else if (char === '"') {
        let lookAheadIdx = i + 1;
        while (lookAheadIdx < str.length && /\s/.test(str[lookAheadIdx])) {
          lookAheadIdx++;
        }
        const nextNonWs = str[lookAheadIdx];
        const isFollowedByDelimiter =
          nextNonWs === "," ||
          nextNonWs === "}" ||
          nextNonWs === "]" ||
          nextNonWs === ":" ||
          lookAheadIdx >= str.length;

        if (isFollowedByDelimiter) {
          inString = false;
          result += char;
        } else {
          result += '\\"';
        }
      } else {
        result += char;
      }
    }
  }

  if (inString) {
    result += '"';
  }

  result = result.replace(/:\s*$/, ": null").replace(/,\s*$/, "");

  while (stack.length > 0) {
    const open = stack.pop();
    result = result.replace(/,\s*$/, "");
    if (open === "{") {
      result += "}";
    } else if (open === "[") {
      result += "]";
    }
  }

  return result;
}

/**
 * Repairs common JSON formatting flaws produced by LLMs:
 * - Unescaped quotes inside string values
 * - Trailing commas before } and ]
 * - Single/multi-line comments
 * - Unescaped newlines/tabs inside strings
 * - Truncated JSON structures
 */
export function repairJson(raw: string): string {
  let text = extractJsonFromText(raw).trim();
  if (!text) return "";

  text = removeCommentsFromText(text);
  text = fixStringsAndStructure(text);
  text = text.replace(/,(\s*[}\]])/g, "$1");

  return text;
}

/**
 * Robustly parses and validates JSON output from an LLM against a Zod schema.
 */
export function parseAndValidateJson<T extends z.ZodTypeAny>(
  rawText: string,
  schema: T
): z.infer<T> {
  const cleaned = extractJsonFromText(rawText);
  if (!cleaned) {
    throw new Error("No JSON content found in model output");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    try {
      const repaired = repairJson(rawText);
      parsed = JSON.parse(repaired);
    } catch (parseErr) {
      throw new Error(
        `Failed to parse model JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`
      );
    }
  }

  if (Array.isArray(parsed)) {
    const wrapped = { recommendations: parsed };
    const wrappedResult = schema.safeParse(wrapped);
    if (wrappedResult.success) {
      return wrappedResult.data;
    }
  }

  const result = schema.safeParse(parsed);
  if (result.success) {
    return result.data;
  }

  const issues = result.error.issues;
  const firstIssue = issues[0];
  const location = firstIssue?.path?.join(".") || "root";
  throw new Error(
    `Schema validation failed at ${location}: ${firstIssue?.message || "Invalid structure"}`
  );
}

/**
 * Generate structured and validated output with one repair retry
 */
export async function generateStructured<T extends z.ZodTypeAny>(params: {
  prompt: string;
  systemPrompt?: string;
  schema: T;
}): Promise<z.infer<T>> {
  const structuredPrompt = `${params.prompt}\n\nIMPORTANT: Respond ONLY with valid JSON matching the requested schema. Do NOT include markdown code fences, trailing commas, or unescaped quotes in strings.`;
  const rawResponse = await generateCompletion({
    prompt: structuredPrompt,
    systemPrompt: params.systemPrompt,
    jsonMode: true,
  });

  try {
    return parseAndValidateJson(rawResponse, params.schema);
  } catch (initialErr) {
    // Attempt one repair re-prompt with explicit schema reminder
    const repairPrompt = `The previous response failed validation:\nError: ${initialErr instanceof Error ? initialErr.message : String(initialErr)}\nPrevious response was:\n${rawResponse}\n\nPlease output ONLY valid JSON matching the schema (for recommendations, wrap in {"recommendations": [...]}). Ensure all quotes inside strings are escaped with backslash.`;
    const repairedResponse = await generateCompletion({
      prompt: repairPrompt,
      systemPrompt: params.systemPrompt,
      jsonMode: true,
    });
    return parseAndValidateJson(repairedResponse, params.schema);
  }
}
