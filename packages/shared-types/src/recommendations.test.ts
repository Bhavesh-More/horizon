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
});
