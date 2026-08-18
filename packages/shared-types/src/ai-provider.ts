import { z } from "zod";

/**
 * Supported AI providers in Horizon
 */
export const AiProviderNameSchema = z.enum([
  "ollama",
  "openai",
  "anthropic",
  "groq",
  "openrouter",
]);
export type AiProviderName = z.infer<typeof AiProviderNameSchema>;

/**
 * Ollama connection mode
 */
export const OllamaModeSchema = z.enum(["local", "remote"]);
export type OllamaMode = z.infer<typeof OllamaModeSchema>;

/**
 * Metadata for a single AI provider instance
 */
export const AiProviderInfoSchema = z.object({
  providerName: AiProviderNameSchema,
  displayName: z.string(),
  modelName: z.string(),
  isActive: z.boolean(),
  isConfigured: z.boolean(),
  hasKey: z.boolean(),
  isLocal: z.boolean(),
  /** Ollama only: "local" uses 127.0.0.1:11434, "remote" uses a user-supplied base URL */
  ollamaMode: OllamaModeSchema.optional(),
  /** Ollama only: persisted remote base URL (e.g. https://my-vps:11434) */
  baseUrl: z.string().optional(),
  availableModels: z.array(z.string()).optional(),
});
export type AiProviderInfo = z.infer<typeof AiProviderInfoSchema>;

/**
 * Response shape for ai-provider:getStatus
 */
export const AiProviderStatusResponseSchema = z.object({
  providers: z.array(AiProviderInfoSchema),
  activeProvider: AiProviderNameSchema,
  activeModel: z.string(),
});
export type AiProviderStatusResponse = z.infer<
  typeof AiProviderStatusResponseSchema
>;

/**
 * Request payload for ai-provider:configure
 */
export const AiProviderConfigureRequestSchema = z.object({
  provider: AiProviderNameSchema,
  model: z.string().min(1, "Model name cannot be empty"),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  setActive: z.boolean().optional(),
});
export type AiProviderConfigureRequest = z.infer<
  typeof AiProviderConfigureRequestSchema
>;

/**
 * Response shape for ai-provider:configure
 */
export const AiProviderConfigureResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});
export type AiProviderConfigureResponse = z.infer<
  typeof AiProviderConfigureResponseSchema
>;

/**
 * Request payload for ai-provider:select
 */
export const AiProviderSelectRequestSchema = z.object({
  provider: AiProviderNameSchema,
});
export type AiProviderSelectRequest = z.infer<
  typeof AiProviderSelectRequestSchema
>;

/**
 * Request payload for ai-provider:test
 */
export const AiProviderTestRequestSchema = z.object({
  provider: AiProviderNameSchema,
  model: z.string().min(1, "Model name cannot be empty"),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
});
export type AiProviderTestRequest = z.infer<typeof AiProviderTestRequestSchema>;

/**
 * Response shape for ai-provider:test
 */
export const AiProviderTestResponseSchema = z.object({
  success: z.boolean(),
  latencyMs: z.number().optional(),
  error: z.string().optional(),
});
export type AiProviderTestResponse = z.infer<
  typeof AiProviderTestResponseSchema
>;

/**
 * Response shape for ai-provider:listOllamaModels
 */
export const AiProviderListOllamaModelsResponseSchema = z.object({
  reachable: z.boolean(),
  models: z.array(z.string()),
});
export type AiProviderListOllamaModelsResponse = z.infer<
  typeof AiProviderListOllamaModelsResponseSchema
>;
