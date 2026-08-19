import { describe, expect, it } from "vitest";
import { AssistantRetrievalContext } from "@horizon/shared-types";
import { ASSISTANT_SYSTEM_PROMPT, buildAssistantPrompt } from "./assistant-prompt";

const context: AssistantRetrievalContext = {
  generatedAt: "2026-08-18T00:00:00.000Z",
  evidenceStrength: "useful",
  searchTerms: ["downloads", "video"],
  scan: {
    scanId: 1,
    completedAt: "2026-08-18T00:00:00.000Z",
    totalFiles: 2,
    totalBytes: 300,
    scopePaths: ["/Users/example/Downloads"],
  },
  matchedFiles: [
    {
      fileId: 10,
      name: "clip.mov",
      path: "/Users/example/Downloads/clip.mov",
      sizeBytes: 300,
      category: "video",
      extension: ".mov",
      modifiedAt: "2026-08-01T00:00:00.000Z",
      accessedAt: null,
    },
  ],
  duplicates: [],
  forecast: null,
  recommendations: [],
};

describe("assistant prompt", () => {
  it("states metadata-only and review-only system rules", () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("metadata");
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("Never claim to inspect");
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("review actions");
  });

  it("serializes retrieved metadata and the user question", () => {
    const prompt = buildAssistantPrompt({
      message: "What should I review?",
      context,
    });

    expect(prompt).toContain("What should I review?");
    expect(prompt).toContain("clip.mov");
    expect(prompt).toContain("metadataContext");
    expect(prompt).not.toContain("fileContents");
  });
});
