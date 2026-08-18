import React from "react";
import {
  Archive,
  ArrowRight,
  Clock3,
  Files,
  HardDrive,
  Sparkles,
  X,
} from "lucide-react";
import {
  RecommendationRecord,
  RecommendationType,
} from "@horizon/shared-types";
import { Button } from "@horizon/ui";

function typeLabel(type: RecommendationType): string {
  switch (type) {
    case "duplicate":
      return "Duplicate";
    case "unused":
      return "Unused";
    case "large_file":
      return "Large File";
    case "archive":
      return "Archive";
    case "forecast":
      return "Forecast";
    case "cleanup":
      return "Cleanup";
  }
}

function TypeIcon({ type }: { type: RecommendationType }) {
  if (type === "duplicate") return <Files className="h-4 w-4" aria-hidden="true" />;
  if (type === "large_file") return <HardDrive className="h-4 w-4" aria-hidden="true" />;
  if (type === "archive") return <Archive className="h-4 w-4" aria-hidden="true" />;
  if (type === "unused") return <Clock3 className="h-4 w-4" aria-hidden="true" />;
  return <Sparkles className="h-4 w-4" aria-hidden="true" />;
}

interface RecommendationCardProps {
  recommendation: RecommendationRecord;
  onReview: (recommendation: RecommendationRecord) => void;
  onDismiss: (recommendationId: number) => void;
  isDismissing?: boolean;
}

export const RecommendationCard = React.memo(function RecommendationCard({
  recommendation,
  onReview,
  onDismiss,
  isDismissing,
}: RecommendationCardProps) {
  const relatedCount = recommendation.relatedFileIds.length;

  return (
    <article className="rounded-md border border-border bg-surface p-5 transition-colors duration-150 hover:border-border/80">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-surface-secondary text-text-secondary">
            <TypeIcon type={recommendation.recommendationType} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-xs bg-tag-safe-bg px-1.5 py-0.5 text-meta font-medium text-tag-safe-text">
                {typeLabel(recommendation.recommendationType)}
              </span>
              <span className="text-meta text-text-tertiary">
                Priority {recommendation.priority}
              </span>
            </div>
            <h2 className="mt-2 text-row font-semibold text-text-primary">
              {recommendation.title}
            </h2>
            <p className="mt-1 text-row font-normal text-text-secondary">
              {recommendation.reason}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-meta text-text-tertiary">
              <span>
                {relatedCount === 0
                  ? "Forecast based"
                  : `${relatedCount} related item${relatedCount === 1 ? "" : "s"}`}
              </span>
              <span>Review only</span>
              {recommendation.modelName ? <span>{recommendation.modelName}</span> : null}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onDismiss(recommendation.id)}
          disabled={isDismissing}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-text-tertiary transition-colors hover:bg-surface-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:text-text-tertiary"
          aria-label="Dismiss recommendation"
          title="Dismiss recommendation"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          type="button"
          onClick={() => onReview(recommendation)}
          className="inline-flex items-center gap-2"
        >
          Review
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </article>
  );
});
