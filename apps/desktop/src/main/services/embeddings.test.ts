import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Electron app & safeStorage
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

// Mock llm-client
vi.mock("./llm-client", () => ({
  getProvidersStatus: vi.fn().mockResolvedValue({
    activeProvider: "ollama",
    activeModel: "llama3.2:3b",
    providers: [
      {
        providerName: "ollama",
        displayName: "Ollama (Local Default)",
        modelName: "llama3.2:3b",
        isActive: true,
        isConfigured: true,
        hasKey: false,
        isLocal: true,
        ollamaMode: "local",
      },
    ],
  }),
  getOllamaHost: vi.fn().mockReturnValue("http://127.0.0.1:11434"),
  getProviderKey: vi.fn().mockReturnValue(null),
  OLLAMA_LOCAL_HOST: "http://127.0.0.1:11434",
}));

// Mock secure-storage
vi.mock("../core/secure-storage", () => ({
  getProviderKey: vi.fn().mockReturnValue("sk-test"),
}));

// Mock Ollama
vi.mock("ollama", () => {
  return {
    Ollama: vi.fn().mockImplementation(() => ({
      embeddings: vi.fn().mockImplementation(async ({ prompt }: { prompt: string }) => {
        // Return synthetic embedding based on prompt content
        if (prompt.includes("quantum computing algorithm")) {
          return { embedding: [0.9, 0.1, 0.05, 0.0] };
        }
        if (prompt.includes("quantum computer algorithms")) {
          return { embedding: [0.88, 0.12, 0.04, 0.01] };
        }
        if (prompt.includes("chocolate cake recipe")) {
          return { embedding: [0.0, 0.05, 0.95, 0.8] };
        }
        return { embedding: [0.5, 0.5, 0.5, 0.5] };
      }),
    })),
  };
});

// Mock fs/promises
vi.mock("node:fs/promises", () => ({
  default: {
    open: vi.fn().mockImplementation(async (filePath: string) => {
      let content = "";
      if (filePath.includes("quantum1.txt")) {
        content = "Introduction to quantum computing algorithm implementations.";
      } else if (filePath.includes("quantum2.txt")) {
        content = "Introduction to quantum computer algorithms implementations.";
      } else if (filePath.includes("recipe.txt")) {
        content = "Delicious chocolate cake recipe with cocoa powder and sugar.";
      } else if (filePath.includes("empty.txt")) {
        content = "";
      }

      return {
        read: vi.fn().mockImplementation(async (buf: Buffer) => {
          if (!content) return { bytesRead: 0 };
          const bytes = Buffer.from(content);
          bytes.copy(buf);
          return { bytesRead: bytes.length };
        }),
        close: vi.fn().mockResolvedValue(undefined),
      };
    }),
  },
}));

import {
  isTextDocumentCandidate,
  cosineSimilarity,
  extractDocumentText,
  clusterDocumentEmbeddings,
  DocumentCandidate,
} from "./embeddings";

describe("embeddings service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isTextDocumentCandidate", () => {
    it("identifies supported text and code document extensions", () => {
      expect(isTextDocumentCandidate("/test/notes.md", "document")).toBe(true);
      expect(isTextDocumentCandidate("/test/data.json", "document")).toBe(true);
      expect(isTextDocumentCandidate("/test/script.py", "dev_artifact")).toBe(true);
      expect(isTextDocumentCandidate("/test/index.ts", "dev_artifact")).toBe(true);
    });

    it("rejects non-text or binary categories/extensions", () => {
      expect(isTextDocumentCandidate("/test/image.jpg", "image")).toBe(false);
      expect(isTextDocumentCandidate("/test/video.mp4", "video")).toBe(false);
      expect(isTextDocumentCandidate("/test/archive.zip", "archive")).toBe(false);
    });
  });

  describe("cosineSimilarity", () => {
    it("returns 1.0 for identical normalized vectors", () => {
      const a = [1, 0, 0];
      const b = [1, 0, 0];
      expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);
    });

    it("returns 0.0 for orthogonal vectors", () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];
      expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
    });

    it("computes accurate cosine similarity for high-dimensional vectors", () => {
      const a = [0.9, 0.1, 0.05, 0.0];
      const b = [0.88, 0.12, 0.04, 0.01];
      const sim = cosineSimilarity(a, b);
      expect(sim).toBeGreaterThan(0.95);
    });

    it("handles empty or mismatched arrays gracefully", () => {
      expect(cosineSimilarity([], [])).toBe(0);
      expect(cosineSimilarity([1, 2], [1])).toBe(0);
    });
  });

  describe("extractDocumentText", () => {
    it("extracts text up to maxChars", async () => {
      const text = await extractDocumentText("/test/quantum1.txt", 2000);
      expect(text).toContain("quantum computing algorithm");
    });

    it("returns null for empty files", async () => {
      const text = await extractDocumentText("/test/empty.txt", 2000);
      expect(text).toBeNull();
    });
  });

  describe("clusterDocumentEmbeddings", () => {
    it("clusters near-duplicate documents with cosine similarity >= 0.85", async () => {
      const candidates: DocumentCandidate[] = [
        {
          fileId: 1,
          path: "/test/quantum1.txt",
          sizeBytes: 1500,
          category: "document",
          modifiedAt: "2026-08-01T00:00:00.000Z",
        },
        {
          fileId: 2,
          path: "/test/quantum2.txt",
          sizeBytes: 1600,
          category: "document",
          modifiedAt: "2026-08-02T00:00:00.000Z",
        },
        {
          fileId: 3,
          path: "/test/recipe.txt",
          sizeBytes: 1200,
          category: "document",
          modifiedAt: "2026-08-01T00:00:00.000Z",
        },
      ];

      const groups = await clusterDocumentEmbeddings(candidates, 0.85);

      expect(groups).toHaveLength(1);
      expect(groups[0].memberCount).toBe(2);
      expect(groups[0].members.map((m) => m.fileId)).toContain(1);
      expect(groups[0].members.map((m) => m.fileId)).toContain(2);
      expect(groups[0].members.map((m) => m.fileId)).not.toContain(3);

      // Verify recommended keep is the newest file (fileId 2, modified Aug 2)
      const keepMember = groups[0].members.find((m) => m.isRecommendedKeep);
      expect(keepMember?.fileId).toBe(2);
    });

    it("returns empty array when fewer than 2 valid candidates exist", async () => {
      const candidates: DocumentCandidate[] = [
        {
          fileId: 1,
          path: "/test/quantum1.txt",
          sizeBytes: 1500,
          category: "document",
        },
      ];

      const groups = await clusterDocumentEmbeddings(candidates, 0.85);
      expect(groups).toEqual([]);
    });
  });
});
