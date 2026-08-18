/**
 * recommendations.ts
 * Owns: Phase 9 AI recommendation orchestration.
 * Upholds:
 * - Invariant I-6: LLM context is metadata only, never raw file contents.
 * - Invariant I-7: uses only the active configured provider, with no silent cloud fallback.
 * - Phase 9 safety: generated cards are review-only.
 */
import { randomUUID } from "node:crypto";
import { BrowserWindow } from "electron";
import {
  RecommendationGenerationEvent,
  RecommendationGenerationState,
  RecommendationOutputSchema,
  RecommendationProviderError,
  RecommendationsGetActiveResponse,
  RecommendationsRegenerateResponse,
} from "@horizon/shared-types";
import { generateStructured, getProvidersStatus } from "./llm-client";
import { buildRecommendationContext } from "./recommendation-context";
import {
  RECOMMENDATION_SYSTEM_PROMPT,
  buildRecommendationPrompt,
} from "./recommendation-prompt";
import { validateRecommendationOutput } from "./recommendation-validator";
import {
  completeRecommendationBatch,
  createRecommendationBatch,
  failRecommendationBatch,
  getActiveRecommendations,
  getLastFailedBatch,
  getLatestBatchForScan,
  getLatestCompletedScanRunId,
  hasRunningBatch,
  insertRecommendations,
  markRunningBatchesStaleExcept,
  updateRecommendationStatus,
} from "./recommendation-repository";

const runningGenerations = new Map<
  number,
  Promise<RecommendationsRegenerateResponse>
>();

function broadcastRecommendationEvent(event: RecommendationGenerationEvent) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("recommendations:generation", event);
    }
  }
}

function classifyProviderError(error: unknown): RecommendationProviderError {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (message.includes("api key") || message.includes("auth")) {
    return "authentication_failed";
  }
  if (message.includes("quota") || message.includes("rate limit")) {
    return "quota_exceeded";
  }
  if (message.includes("timeout") || message.includes("timed out")) {
    return "timeout";
  }
  if (
    message.includes("network") ||
    message.includes("fetch failed") ||
    message.includes("econnrefused") ||
    message.includes("connection") ||
    message.includes("not yet supported")
  ) {
    return "network_error";
  }
  if (
    message.includes("json") ||
    message.includes("schema") ||
    message.includes("parse")
  ) {
    return "invalid_response";
  }

  return "unknown";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Recommendation generation failed";
}

function resolveScanRunId(scanRunId?: number): number | null {
  return scanRunId ?? getLatestCompletedScanRunId();
}

export async function getRecommendationsActive(
  scanRunId?: number
): Promise<RecommendationsGetActiveResponse> {
  const resolvedScanRunId = resolveScanRunId(scanRunId);
  if (!resolvedScanRunId) {
    return {
      batch: null,
      recommendations: [],
      generationState: "waiting_for_scan",
      lastError: null,
    };
  }

  if (runningGenerations.has(resolvedScanRunId) || hasRunningBatch(resolvedScanRunId)) {
    return {
      batch: getLatestBatchForScan(resolvedScanRunId, ["running"]),
      recommendations: getActiveRecommendations(resolvedScanRunId),
      generationState: "generating",
      lastError: null,
    };
  }

  const batch = getLatestBatchForScan(resolvedScanRunId);
  const recommendations = getActiveRecommendations(resolvedScanRunId);
  const failedBatch = getLastFailedBatch(resolvedScanRunId);

  let generationState: RecommendationGenerationState = "idle";
  if (batch?.status === "complete") generationState = "ready";
  if (batch?.status === "no_results") generationState = "no_results";
  if (batch?.status === "failed") {
    generationState =
      batch.errorCategory === "not_configured" ||
      batch.errorCategory === "provider_unavailable"
        ? "provider_unavailable"
        : "error";
  }

  return {
    batch,
    recommendations,
    generationState,
    lastError: failedBatch?.errorCategory
      ? {
          category: failedBatch.errorCategory,
          message: failedBatch.errorMessage ?? "Recommendation generation failed",
        }
      : null,
  };
}

export async function generateRecommendationsForScan(
  scanRunId: number
): Promise<RecommendationsRegenerateResponse> {
  const existing = runningGenerations.get(scanRunId);
  if (existing) return existing;

  const run = runRecommendationGeneration(scanRunId).finally(() => {
    runningGenerations.delete(scanRunId);
  });
  runningGenerations.set(scanRunId, run);
  return run;
}

async function runRecommendationGeneration(
  scanRunId: number
): Promise<RecommendationsRegenerateResponse> {
  const generationId = randomUUID();
  let batchId: number | null = null;

  try {
    markRunningBatchesStaleExcept(scanRunId);
    const contextResult = await buildRecommendationContext(scanRunId);
    const providerStatus = await getProvidersStatus();
    const activeProvider = providerStatus.providers.find((provider) => provider.isActive);

    const batch = createRecommendationBatch({
      scanRunId,
      generationId,
      sourceForecastId: contextResult.sourceForecastId,
      provider: activeProvider?.providerName ?? providerStatus.activeProvider ?? null,
      modelName: activeProvider?.modelName ?? providerStatus.activeModel ?? null,
    });
    batchId = batch.id;

    broadcastRecommendationEvent({
      event: "started",
      scanRunId,
      generationId,
    });

    if (!activeProvider) {
      failRecommendationBatch({
        batchId,
        errorCategory: "not_configured",
        errorMessage: "No active AI provider is configured.",
      });
      broadcastRecommendationEvent({
        event: "failed",
        scanRunId,
        generationId,
        errorCategory: "not_configured",
        message: "No active AI provider is configured.",
      });
      return { batchId, generationId, state: "provider_unavailable" };
    }

    if (!activeProvider.isConfigured) {
      failRecommendationBatch({
        batchId,
        errorCategory: "provider_unavailable",
        errorMessage: `${activeProvider.displayName} is not reachable or configured.`,
      });
      broadcastRecommendationEvent({
        event: "failed",
        scanRunId,
        generationId,
        errorCategory: "provider_unavailable",
        message: `${activeProvider.displayName} is not reachable or configured.`,
      });
      return { batchId, generationId, state: "provider_unavailable" };
    }

    const output = await generateStructured({
      prompt: buildRecommendationPrompt(contextResult.context),
      systemPrompt: RECOMMENDATION_SYSTEM_PROMPT,
      schema: RecommendationOutputSchema,
    });

    const validItems = validateRecommendationOutput(
      output.recommendations,
      contextResult.context
    );

    if (validItems.length === 0) {
      completeRecommendationBatch({ batchId, status: "no_results" });
      broadcastRecommendationEvent({
        event: "completed",
        scanRunId,
        generationId,
        count: 0,
      });
      return { batchId, generationId, state: "no_results" };
    }

    insertRecommendations({
      scanRunId,
      batchId,
      generationId,
      provider: activeProvider.providerName,
      modelName: activeProvider.modelName,
      items: validItems,
    });
    completeRecommendationBatch({ batchId, status: "complete" });

    broadcastRecommendationEvent({
      event: "completed",
      scanRunId,
      generationId,
      count: validItems.length,
    });

    return { batchId, generationId, state: "ready" };
  } catch (error) {
    const category = classifyProviderError(error);
    const message = errorMessage(error);
    if (batchId !== null) {
      failRecommendationBatch({
        batchId,
        errorCategory: category,
        errorMessage: message,
      });
    }
    broadcastRecommendationEvent({
      event: "failed",
      scanRunId,
      generationId,
      errorCategory: category,
      message,
    });
    return {
      batchId,
      generationId,
      state:
        category === "provider_unavailable" || category === "not_configured"
          ? "provider_unavailable"
          : "error",
    };
  }
}

export function dismissRecommendation(recommendationId: number) {
  return updateRecommendationStatus(recommendationId, "dismissed");
}
