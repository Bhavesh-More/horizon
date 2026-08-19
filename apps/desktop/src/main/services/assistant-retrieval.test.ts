import { describe, expect, it } from "vitest";
import { extractAssistantSearchTerms } from "./assistant-retrieval";

describe("assistant retrieval helpers", () => {
  it("extracts stable search terms from folders, extensions, and natural language", () => {
    const terms = extractAssistantSearchTerms(
      "Show duplicate videos in /Users/me/Downloads and old .zip archives"
    );

    expect(terms).toContain("downloads");
    expect(terms).toContain("videos");
    expect(terms).toContain("zip");
    expect(terms).toContain("archives");
    expect(terms).not.toContain("show");
  });

  it("deduplicates terms and caps the query width", () => {
    const terms = extractAssistantSearchTerms(
      "photos photos screenshots downloads desktop movies music documents archives backups cache temp"
    );

    expect(terms.filter((term) => term === "photos")).toHaveLength(1);
    expect(terms.length).toBeLessThanOrEqual(10);
  });
});
