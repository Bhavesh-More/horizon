/**
 * recommendation-validator.ts
 * Owns: deterministic validation of LLM recommendation output.
 * Upholds:
 * - Invariant I-6: output can only reference metadata evidence already supplied.
 * - Phase 9 safety: AI cards are review-only and never destructive commands.
 */
import {
  RecommendationContext,
  RecommendationOutputItem,
  RecommendationTargetTab,
} from "@horizon/shared-types";

const DESTRUCTIVE_PATTERN =
  /\b(delete now|remove immediately|purge|erase|permanently delete|auto-delete|autodelete|trash now)\b/i;

function evidenceFileIds(context: RecommendationContext): Set<number> {
  const ids = new Set<number>();

  for (const group of context.duplicates) {
    for (const member of group.members) ids.add(member.fileId);
  }
  for (const file of context.unused) ids.add(file.fileId);
  for (const file of context.largeFiles) ids.add(file.fileId);

  return ids;
}

function targetMatchesType(
  type: RecommendationOutputItem["recommendation_type"],
  targetTab: RecommendationTargetTab
): boolean {
  if (type === "duplicate") return targetTab === "duplicates";
  if (type === "unused" || type === "archive") return targetTab === "unused";
  if (type === "large_file") return targetTab === "large_files";
  if (type === "forecast") return targetTab === "forecast";
  if (type === "cleanup") return targetTab === "overview";
  return false;
}

function hasEvidenceForType(
  item: RecommendationOutputItem,
  context: RecommendationContext
): boolean {
  if (item.recommendation_type === "duplicate") {
    return context.duplicates.length > 0 && item.related_file_ids.length > 0;
  }
  if (item.recommendation_type === "unused" || item.recommendation_type === "archive") {
    return context.unused.length > 0 && item.related_file_ids.length > 0;
  }
  if (item.recommendation_type === "large_file") {
    return context.largeFiles.length > 0 && item.related_file_ids.length > 0;
  }
  if (item.recommendation_type === "forecast") return context.forecast !== null;
  if (item.recommendation_type === "cleanup") {
    return (
      context.scan.duplicateGroupCount > 0 ||
      context.scan.unusedCandidateCount > 0 ||
      context.scan.largeFileCount > 0
    );
  }
  return false;
}

function isSafeText(item: RecommendationOutputItem): boolean {
  return !DESTRUCTIVE_PATTERN.test(`${item.title} ${item.reason}`);
}

function hasValidFileIds(
  item: RecommendationOutputItem,
  validFileIds: Set<number>
): boolean {
  return item.related_file_ids.every((id) => validFileIds.has(id));
}

function dedupeKey(item: RecommendationOutputItem): string {
  return [
    item.recommendation_type,
    item.target_tab,
    [...item.related_file_ids].sort((a, b) => a - b).join(","),
    item.title.trim().toLowerCase(),
  ].join("|");
}

export function validateRecommendationOutput(
  items: RecommendationOutputItem[],
  context: RecommendationContext
): RecommendationOutputItem[] {
  const validFileIds = evidenceFileIds(context);
  const seen = new Set<string>();
  const accepted: RecommendationOutputItem[] = [];

  for (const item of items) {
    if (accepted.length >= 5) break;
    if (item.action !== "review") continue;
    if (!targetMatchesType(item.recommendation_type, item.target_tab)) continue;
    if (!hasEvidenceForType(item, context)) continue;
    if (!hasValidFileIds(item, validFileIds)) continue;
    if (!isSafeText(item)) continue;

    const key = dedupeKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    accepted.push(item);
  }

  return accepted.sort((a, b) => b.priority - a.priority);
}
