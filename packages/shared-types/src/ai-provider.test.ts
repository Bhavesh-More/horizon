import { describe, it, expect } from "vitest";
import {
  AiProviderNameSchema,
  AiProviderConfigureRequestSchema,
  AiProviderStatusResponseSchema,
  AiProviderSelectRequestSchema,
  AiProviderTestRequestSchema,
  AiProviderTestResponseSchema,
  AiProviderListOllamaModelsResponseSchema,
} from "./ai-provider";

describe("AI Provider Schemas", () => {
  describe("AiProviderNameSchema", () => {
    it("accepts supported provider names", () => {
      expect(AiProviderNameSchema.parse("ollama")).toBe("ollama");
      expect(AiProviderNameSchema.parse("openai")).toBe("openai");
      expect(AiProviderNameSchema.parse("anthropic")).toBe("anthropic");
      expect(AiProviderNameSchema.parse("groq")).toBe("groq");
      expect(AiProviderNameSchema.parse("openrouter")).toBe("openrouter");
    });

    it("rejects unknown provider names", () => {
      expect(() => AiProviderNameSchema.parse("custom_llm")).toThrow();
    });
  });

  describe("AiProviderConfigureRequestSchema", () => {
    it("accepts valid Ollama configure request without key", () => {
      const parsed = AiProviderConfigureRequestSchema.parse({
        provider: "ollama",
        model: "llama3.2:3b",
        setActive: true,
      });
      expect(parsed.provider).toBe("ollama");
      expect(parsed.model).toBe("llama3.2:3b");
      expect(parsed.setActive).toBe(true);
      expect(parsed.apiKey).toBeUndefined();
    });

    it("accepts valid OpenAI configure request with key", () => {
      const parsed = AiProviderConfigureRequestSchema.parse({
        provider: "openai",
        model: "gpt-4o-mini",
        apiKey: "sk-test-12345",
      });
      expect(parsed.provider).toBe("openai");
      expect(parsed.model).toBe("gpt-4o-mini");
      expect(parsed.apiKey).toBe("sk-test-12345");
    });

    it("rejects empty model name", () => {
      expect(() =>
        AiProviderConfigureRequestSchema.parse({
          provider: "openai",
          model: "",
        })
      ).toThrow();
    });
  });

  describe("AiProviderStatusResponseSchema", () => {
    it("validates provider status response", () => {
      const payload = {
        providers: [
          {
            providerName: "ollama" as const,
            displayName: "Ollama (Local)",
            modelName: "llama3.2:3b",
            isActive: true,
            isConfigured: true,
            hasKey: false,
            isLocal: true,
            availableModels: ["llama3.2:3b", "nomic-embed-text"],
          },
          {
            providerName: "openai" as const,
            displayName: "OpenAI",
            modelName: "gpt-4o-mini",
            isActive: false,
            isConfigured: false,
            hasKey: false,
            isLocal: false,
          },
        ],
        activeProvider: "ollama" as const,
        activeModel: "llama3.2:3b",
      };

      const parsed = AiProviderStatusResponseSchema.parse(payload);
      expect(parsed.activeProvider).toBe("ollama");
      expect(parsed.providers).toHaveLength(2);
      expect(parsed.providers[0].availableModels).toEqual([
        "llama3.2:3b",
        "nomic-embed-text",
      ]);
    });
  });

  describe("AiProviderTestRequestSchema & ResponseSchema", () => {
    it("validates test connection request and response", () => {
      const request = AiProviderTestRequestSchema.parse({
        provider: "openai",
        model: "gpt-4o-mini",
        apiKey: "sk-test",
      });
      expect(request.provider).toBe("openai");

      const successResponse = AiProviderTestResponseSchema.parse({
        success: true,
        latencyMs: 340,
      });
      expect(successResponse.success).toBe(true);
      expect(successResponse.latencyMs).toBe(340);

      const errorResponse = AiProviderTestResponseSchema.parse({
        success: false,
        error: "Incorrect API key provided",
      });
      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error).toBe("Incorrect API key provided");
    });
  });

  describe("AiProviderListOllamaModelsResponseSchema", () => {
    it("validates local model listing", () => {
      const parsed = AiProviderListOllamaModelsResponseSchema.parse({
        reachable: true,
        models: ["llama3.2:3b", "llama3.1:8b"],
      });
      expect(parsed.reachable).toBe(true);
      expect(parsed.models).toEqual(["llama3.2:3b", "llama3.1:8b"]);
    });
  });
});
