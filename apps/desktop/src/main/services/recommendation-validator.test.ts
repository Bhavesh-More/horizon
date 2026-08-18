import { describe, expect, it } from "vitest";
import {
  RecommendationContext,
  RecommendationOutputItem,
} from "@horizon/shared-types";
import { validateRecommendationOutput } from "./recommendation-validator";

const context: RecommendationContext = {
  generatedAt: "2026-08-18T00:00:00.000Z",
  scan: {
    scanId: 1,
    completedAt: "2026-08-18T00:00:00.000Z",
    filesIndexed: 3,
    totalBytes: 700,
    reclaimableBytes: 300,
    duplicateGroupCount: 1,
    unusedCandidateCount: 1,
    largeFileCount: 1,
  },
  duplicates: [
    {
      groupId: 10,
      type: "exact",
      fileCount: 2,
      totalBytes: 200,
      reclaimableBytes: 100,
      opportunityScore: 92,
      members: [
        {
          fileId: 101,
          name: "a.mov",
          path: "/Users/example/a.mov",
          sizeBytes: 100,
          modifiedAt: "2026-08-01T00:00:00.000Z",
        },
        {
          fileId: 102,
          name: "a copy.mov",
          path: "/Users/example/a copy.mov",
          sizeBytes: 100,
          modifiedAt: "2026-08-01T00:00:00.000Z",
        },
      ],
    },
  ],
  unused: [
    {
      fileId: 201,
      name: "old.zip",
      path: "/Users/example/old.zip",
      sizeBytes: 100,
      category: "archive",
      lastAccessedAt: "2025-01-01T00:00:00.000Z",
      lastModifiedAt: null,
      ageDays: 590,
      opportunityScore: 80,
    },
  ],
  largeFiles: [
    {
      fileId: 301,
      name: "large.iso",
      path: "/Users/example/large.iso",
      sizeBytes: 500,
      category: "other",
      lastAccessedAt: null,
      lastModifiedAt: "2026-07-01T00:00:00.000Z",
      opportunityScore: 70,
    },
  ],
  forecast: {
    forecastId: 1,
    projectedFullDate: "2026-09-01",
    daysToFull: 14,
    modelType: "theil_sen",
    confidence: 0.7,
    fastestGrowingCategories: [{ category: "video", growthBytesPerDay: 10 }],
  },
};

function item(
  overrides: Partial<RecommendationOutputItem> = {}
): RecommendationOutputItem {
  return {
    recommendation_type: "duplicate",
    title: "Review exact duplicates",
    reason: "Two files share the same content hash in duplicate group 10.",
    priority: 90,
    related_file_ids: [101, 102],
    target_tab: "duplicates",
    action: "review",
    ...overrides,
  };
}

describe("validateRecommendationOutput", () => {
  it("keeps supported review recommendations", () => {
    const result = validateRecommendationOutput([item()], context);
    expect(result).toHaveLength(1);
    expect(result[0].target_tab).toBe("duplicates");
  });

  it("drops recommendations with invented file ids", () => {
    const result = validateRecommendationOutput(
      [item({ related_file_ids: [999] })],
      context
    );
    expect(result).toHaveLength(0);
  });

  it("drops destructive recommendations", () => {
    const result = validateRecommendationOutput(
      [item({ title: "Permanently delete exact duplicates" })],
      context
    );
    expect(result).toHaveLength(0);
  });

  it("drops recommendations routed to the wrong tab", () => {
    const result = validateRecommendationOutput(
      [item({ target_tab: "unused" })],
      context
    );
    expect(result).toHaveLength(0);
  });
});
