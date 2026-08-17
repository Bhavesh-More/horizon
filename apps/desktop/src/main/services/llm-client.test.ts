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
} from "./llm-client";
import { setMockSecretStore } from "../core/secure-storage";

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
});
