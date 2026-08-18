import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Settings,
  Sparkles,
} from "lucide-react";
import {
  RecommendationGenerationState,
  RecommendationRecord,
  RecommendationsGetActiveResponse,
} from "@horizon/shared-types";
import { Button } from "@horizon/ui";
import { RecommendationCard } from "./RecommendationCard";

function stateSubtitle(state: RecommendationGenerationState): string {
  if (state === "waiting_for_scan") return "Run a scan before asking for recommendations";
  if (state === "generating" || state === "preparing_context" || state === "validating") {
    return "Review cards are being prepared from the latest scan metadata";
  }
  if (state === "provider_unavailable") return "Connect an AI provider in Settings to generate cards";
  if (state === "no_results") return "No useful recommendations were found for the latest scan";
  if (state === "error") return "The last generation attempt did not complete";
  if (state === "ready") return "Metadata based cleanup suggestions from the latest completed scan";
  return "Generate review cards after the next completed scan";
}

function stateIcon(state: RecommendationGenerationState) {
  if (state === "ready") return <CheckCircle2 className="h-4 w-4" aria-hidden="true" />;
  if (state === "provider_unavailable" || state === "error") {
    return <AlertCircle className="h-4 w-4" aria-hidden="true" />;
  }
  return <Sparkles className="h-4 w-4" aria-hidden="true" />;
}

interface AssistantTabProps {
  onReviewRecommendation: (recommendation: RecommendationRecord) => void;
  onOpenSettings: () => void;
}

export const AssistantTab = React.memo(function AssistantTab({
  onReviewRecommendation,
  onOpenSettings,
}: AssistantTabProps) {
  const [data, setData] = useState<RecommendationsGetActiveResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [dismissingId, setDismissingId] = useState<number | null>(null);

  const generationState = data?.generationState ?? "idle";
  const recommendations = data?.recommendations ?? [];
  const isWorking =
    isLoading ||
    isRegenerating ||
    generationState === "generating" ||
    generationState === "preparing_context" ||
    generationState === "validating";

  const loadRecommendations = useCallback(async () => {
    if (!window.horizon?.recommendations) return;
    setIsLoading(true);
    try {
      const res = await window.horizon.recommendations.getActive();
      if (res.ok && res.data) setData(res.data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecommendations();

    const unsubscribeGeneration =
      window.horizon?.recommendations?.onGenerationEvent(() => {
        loadRecommendations();
      });
    const unsubscribeScan = window.horizon?.scan?.onProgress((event) => {
      if (event.event === "complete") loadRecommendations();
    });

    return () => {
      unsubscribeGeneration?.();
      unsubscribeScan?.();
    };
  }, [loadRecommendations]);

  const handleRegenerate = async () => {
    if (!window.horizon?.recommendations) return;
    setIsRegenerating(true);
    try {
      const res = await window.horizon.recommendations.regenerate();
      if (res.ok) await loadRecommendations();
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleDismiss = async (recommendationId: number) => {
    if (!window.horizon?.recommendations) return;
    setDismissingId(recommendationId);
    try {
      const res = await window.horizon.recommendations.dismiss(recommendationId);
      if (res.ok) await loadRecommendations();
    } finally {
      setDismissingId(null);
    }
  };

  const emptyTitle = useMemo(() => {
    if (generationState === "waiting_for_scan") return "No completed scan yet";
    if (generationState === "provider_unavailable") return "AI provider needed";
    if (generationState === "no_results") return "Nothing strong enough to suggest";
    if (generationState === "error") return "Generation needs attention";
    return "No active recommendations";
  }, [generationState]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-border bg-background px-6">
        <div>
          <h1 className="font-rounded text-title text-text-primary">Assistant</h1>
          <p className="text-meta text-text-secondary">{stateSubtitle(generationState)}</p>
        </div>
        <div className="flex items-center gap-2">
          {generationState === "provider_unavailable" ? (
            <Button
              type="button"
              onClick={onOpenSettings}
              className="inline-flex items-center gap-2"
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
              Settings
            </Button>
          ) : null}
          <Button
            type="button"
            onClick={handleRegenerate}
            disabled={isWorking || generationState === "waiting_for_scan"}
            className="inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <RefreshCw
              className={`h-4 w-4 ${isWorking ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            Regenerate
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="mb-4 rounded-md border border-border bg-surface p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-surface-secondary text-text-secondary">
              {stateIcon(generationState)}
            </div>
            <div className="min-w-0">
              <p className="text-row font-semibold text-text-primary">
                Review only recommendations
              </p>
              <p className="mt-1 text-meta text-text-secondary">
                Cards are generated from metadata such as paths, sizes, dates,
                categories, duplicate groups, and forecast signals.
              </p>
              {data?.lastError ? (
                <p className="mt-2 text-meta-emphasis text-tag-danger-text">
                  {data.lastError.message}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {isLoading && recommendations.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-md border border-border bg-surface p-8 text-center">
            <div>
              <RefreshCw className="mx-auto h-5 w-5 animate-spin text-text-secondary" aria-hidden="true" />
              <p className="mt-3 text-row font-semibold text-text-primary">
                Loading recommendations
              </p>
            </div>
          </div>
        ) : recommendations.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-md border border-border bg-surface p-8 text-center">
            <div>
              <Sparkles className="mx-auto h-6 w-6 text-text-secondary" aria-hidden="true" />
              <p className="mt-3 text-row font-semibold text-text-primary">
                {emptyTitle}
              </p>
              <p className="mt-1 max-w-sm text-meta text-text-secondary">
                {stateSubtitle(generationState)}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            {recommendations.map((recommendation) => (
              <RecommendationCard
                key={recommendation.id}
                recommendation={recommendation}
                onReview={onReviewRecommendation}
                onDismiss={handleDismiss}
                isDismissing={dismissingId === recommendation.id}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
});
