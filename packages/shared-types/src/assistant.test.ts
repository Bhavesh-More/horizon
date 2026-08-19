import { describe, expect, it } from "vitest";
import {
  AssistantChatRequestSchema,
  AssistantStreamEventSchema,
} from "./assistant";

describe("Assistant chat schemas", () => {
  it("trims chat messages and accepts an optional scan id", () => {
    const result = AssistantChatRequestSchema.parse({
      message: "  Where are my large videos?  ",
      scanRunId: 3,
    });

    expect(result.message).toBe("Where are my large videos?");
    expect(result.scanRunId).toBe(3);
  });

  it("rejects empty chat messages", () => {
    const result = AssistantChatRequestSchema.safeParse({ message: "   " });
    expect(result.success).toBe(false);
  });

  it("validates stream failure categories", () => {
    const result = AssistantStreamEventSchema.safeParse({
      requestId: "request-1",
      event: "failed",
      errorCategory: "waiting_for_scan",
      message: "Run a scan first.",
    });

    expect(result.success).toBe(true);
  });
});
