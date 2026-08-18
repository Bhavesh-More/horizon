/**
 * recommendation-prompt.ts
 * Owns: prompt assembly for bounded metadata based AI recommendations.
 * Upholds:
 * - Invariant I-6: no raw file contents are requested or supplied.
 * - Phase 9 safety: recommendations may only point users to review existing Horizon tabs.
 */
import { RecommendationContext } from "@horizon/shared-types";

export const RECOMMENDATION_SYSTEM_PROMPT = [
  "You are Horizon Assistant, a careful storage cleanup analyst.",
  "Use only the metadata evidence supplied in the prompt.",
  "Never claim to inspect file contents.",
  "Never recommend deleting, moving, archiving, or modifying files directly.",
  "Every recommendation must ask the user to review evidence in Horizon.",
  "Return only JSON. Do not include markdown.",
].join("\n");

export function buildRecommendationPrompt(
  context: RecommendationContext
): string {
  return JSON.stringify(
    {
      task:
        "Produce zero to five storage recommendations for the user to review.",
      rules: [
        "Use only file IDs, paths, names, sizes, dates, categories, duplicate groups, and forecasts in evidence.",
        "Do not invent file IDs, paths, sizes, dates, categories, duplicate groups, or forecasts.",
        "The action field must always be review.",
        "Use target_tab to route the user to duplicates, unused, large_files, forecast, or overview.",
        "Prefer exact duplicate savings, old unused candidates, very large files, and urgent forecast risk.",
        "Do not use destructive phrases such as delete now, remove immediately, purge, erase, or permanently delete.",
        "Titles should be short and factual. Reasons should be one sentence grounded in evidence.",
      ],
      output_schema: {
        recommendations: [
          {
            recommendation_type:
              "duplicate | unused | large_file | archive | forecast | cleanup",
            title: "short factual title",
            reason: "one evidence backed sentence",
            priority: "integer 0 to 100",
            related_file_ids: "array of file IDs from evidence, or empty for forecast only",
            target_tab:
              "duplicates | unused | large_files | forecast | overview",
            action: "review",
          },
        ],
      },
      evidence: context,
    },
    null,
    2
  );
}
