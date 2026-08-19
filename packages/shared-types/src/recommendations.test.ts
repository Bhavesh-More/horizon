import { describe, expect, it } from "vitest";
import { RecommendationOutputSchema } from "./recommendations";

describe("RecommendationOutputSchema", () => {
  it("caps model output at five recommendation cards", () => {
    const one = {
      recommendation_type: "forecast",
      title: "Review storage forecast",
      reason: "The forecast has a projected full date.",
      priority: 70,
      related_file_ids: [],
      target_tab: "forecast",
      action: "review",
    };

    const result = RecommendationOutputSchema.safeParse({
      recommendations: [one, one, one, one, one, one],
    });

    expect(result.success).toBe(false);
  });

  it("handles raw array output directly from LLM", () => {
    const rawArray = [
      {
        recommendation_type: "large_file",
        title: "Clean large files",
        reason: "5 files over 500MB found",
        priority: "80", // string coerced to number
        related_file_ids: ["10", "11"], // string IDs coerced to numbers
        target_tab: "large_files",
      },
    ];

    const result = RecommendationOutputSchema.safeParse(rawArray);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recommendations).toHaveLength(1);
      expect(result.data.recommendations[0].priority).toBe(80);
      expect(result.data.recommendations[0].related_file_ids).toEqual([10, 11]);
      expect(result.data.recommendations[0].action).toBe("review");
    }
  });

  it("handles alternative wrapper keys like items or cards", () => {
    const wrapped = {
      cards: [
        {
          recommendation_type: "duplicate",
          title: "Exact duplicates found",
          reason: "Found 2.1 GB of exact duplicates",
          priority: 90,
          related_file_ids: [1, 2],
          target_tab: "duplicates",
          action: "review",
        },
      ],
    };

    const result = RecommendationOutputSchema.safeParse(wrapped);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recommendations).toHaveLength(1);
    }
  });
});
