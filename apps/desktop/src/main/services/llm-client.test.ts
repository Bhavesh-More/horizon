import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock electron safeStorage
vi.mock("electron", () => ({
  app: {
    getPath: vi.fn().mockReturnValue("/tmp/horizon_test_userdata"),
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn().mockReturnValue(true),
    encryptString: vi.fn((str) => Buffer.from(str)),
    decryptString: vi.fn((buf) => buf.toString("utf-8")),
  },
}));

// Mock Ollama SDK
vi.mock("ollama", () => {
  return {
    Ollama: vi.fn().mockImplementation(() => ({
      list: vi.fn().mockResolvedValue({
        models: [{ name: "llama3.2:3b" }, { name: "nomic-embed-text" }],
      }),
      generate: vi.fn().mockResolvedValue({
        response: '{"recommendation": "test"}',
      }),
    })),
  };
});

// Mock OpenAI SDK
vi.mock("openai", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: "pong" } }],
          }),
        },
      },
    })),
  };
});

// Mock DB client
const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../db/client", () => ({
  db: mockDb,
}));

import {
  getProvidersStatus,
  listOllamaModels,
  testProviderConnection,
  setActiveProvider,
  extractJsonFromText,
  repairJson,
  parseAndValidateJson,
} from "./llm-client";
import { setMockSecretStore } from "../core/secure-storage";
import { z } from "zod";

describe("llm-client service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMockSecretStore(true);
  });

  it("discovers local Ollama models successfully", async () => {
    const res = await listOllamaModels();
    expect(res.reachable).toBe(true);
    expect(res.models).toContain("llama3.2:3b");
    expect(res.models).toContain("nomic-embed-text");
  });

  it("returns providers status with default active Ollama", async () => {
    const mockRows = [
      {
        providerName: "ollama",
        modelName: "llama3.2:3b",
        isActive: 1,
        addedAt: "2026-08-17T00:00:00.000Z",
      },
    ];

    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        all: vi.fn().mockReturnValue(mockRows),
      }),
    });

    const status = await getProvidersStatus();
    expect(status.activeProvider).toBe("ollama");
    expect(status.activeModel).toBe("llama3.2:3b");
    expect(status.providers).toHaveLength(5);
    const ollama = status.providers.find((p) => p.providerName === "ollama");
    expect(ollama?.isActive).toBe(true);
    expect(ollama?.isLocal).toBe(true);
  });

  it("tests Ollama provider connection probe", async () => {
    const probe = await testProviderConnection({
      provider: "ollama",
      model: "llama3.2:3b",
    });
    expect(probe.success).toBe(true);
    expect(probe.latencyMs).toBeTypeOf("number");
  });

  it("tests OpenAI provider probe with apiKey", async () => {
    const probe = await testProviderConnection({
      provider: "openai",
      model: "gpt-4o-mini",
      apiKey: "sk-test-valid-key",
    });
    expect(probe.success).toBe(true);
    expect(probe.latencyMs).toBeTypeOf("number");
  });

  it("fails OpenAI probe when key is missing", async () => {
    const probe = await testProviderConnection({
      provider: "openai",
      model: "gpt-4o-mini",
    });
    expect(probe.success).toBe(false);
    expect(probe.error).toContain("No API key");
  });

  describe("JSON extraction and repair", () => {
    const testSchema = z.object({
      recommendations: z.array(
        z.object({
          title: z.string(),
          priority: z.number(),
        })
      ),
    });

    it("extracts json from markdown code fences", () => {
      const input = "Here is the response:\n```json\n{\"recommendations\": [{\"title\": \"clean\", \"priority\": 80}]}\n```";
      const cleaned = extractJsonFromText(input);
      expect(cleaned).toBe("{\"recommendations\": [{\"title\": \"clean\", \"priority\": 80}]}");
    });

    it("repairs unescaped quotes inside property values", () => {
      const input = '{"recommendations": [{"title": "Review "Downloads/file.pdf" duplicates", "priority": 90}]}';
      const parsed = parseAndValidateJson(input, testSchema);
      expect(parsed.recommendations).toHaveLength(1);
      expect(parsed.recommendations[0].title).toContain('Downloads/file.pdf');
      expect(parsed.recommendations[0].priority).toBe(90);
    });

    it("repairs trailing commas in arrays and objects", () => {
      const input = '{"recommendations": [{"title": "Test", "priority": 50, }, ], }';
      const parsed = parseAndValidateJson(input, testSchema);
      expect(parsed.recommendations[0].priority).toBe(50);
    });

    it("repairs comments and unescaped newlines", () => {
      const input = `// Model output
      {
        /* block comment */
        "recommendations": [
          {
            "title": "Review line1
line2",
            "priority": 70
          }
        ]
      }`;
      const parsed = parseAndValidateJson(input, testSchema);
      expect(parsed.recommendations[0].title).toContain("line1");
    });

    it("auto-wraps bare array when object with recommendations is expected", () => {
      const input = '[{"title": "Direct Array", "priority": 60}]';
      const parsed = parseAndValidateJson(input, testSchema);
      expect(parsed.recommendations).toHaveLength(1);
      expect(parsed.recommendations[0].title).toBe("Direct Array");
    });

    it("repairs truncated JSON responses", () => {
      const input = '{"recommendations": [{"title": "Truncated title", "priority": 40';
      const parsed = parseAndValidateJson(input, testSchema);
      expect(parsed.recommendations[0].title).toBe("Truncated title");
      expect(parsed.recommendations[0].priority).toBe(40);
    });
  });
});
