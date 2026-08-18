import { ipcMain } from "electron";
import {
  RecommendationsDismissRequestSchema,
  RecommendationsGetActiveRequestSchema,
  RecommendationsGetByIdRequestSchema,
  RecommendationsRegenerateRequestSchema,
} from "@horizon/shared-types";
import {
  dismissRecommendation,
  generateRecommendationsForScan,
  getRecommendationsActive,
} from "../services/recommendations";
import {
  getLatestCompletedScanRunId,
  getRecommendationById,
} from "../services/recommendation-repository";

export function registerRecommendationsIpc() {
  const handleGetActive = async (_event: Electron.IpcMainInvokeEvent, payload: unknown) => {
    try {
      const validated = RecommendationsGetActiveRequestSchema.parse(payload);
      const data = await getRecommendationsActive(validated?.scanRunId);
      return { ok: true, data };
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "RECOMMENDATIONS_GET_ACTIVE_FAILED",
          message: err.message || "Failed to load recommendations",
        },
      };
    }
  };

  ipcMain.handle("recommendations:getActive", handleGetActive);
  ipcMain.handle("recommendations:list", handleGetActive);

  ipcMain.handle("recommendations:regenerate", async (_event, payload: unknown) => {
    try {
      const validated = RecommendationsRegenerateRequestSchema.parse(payload);
      const scanRunId = validated?.scanRunId ?? getLatestCompletedScanRunId();

      if (!scanRunId) {
        return {
          ok: true,
          data: { batchId: null, generationId: null, state: "waiting_for_scan" },
        };
      }

      const data = await generateRecommendationsForScan(scanRunId);
      return { ok: true, data };
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "RECOMMENDATIONS_REGENERATE_FAILED",
          message: err.message || "Failed to generate recommendations",
        },
      };
    }
  });

  ipcMain.handle("recommendations:dismiss", async (_event, payload: unknown) => {
    try {
      const validated = RecommendationsDismissRequestSchema.parse(payload);
      const record = dismissRecommendation(validated.recommendationId);
      if (!record) {
        throw new Error("Recommendation not found");
      }
      return {
        ok: true,
        data: {
          recommendationId: validated.recommendationId,
          status: "dismissed",
        },
      };
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "RECOMMENDATIONS_DISMISS_FAILED",
          message: err.message || "Failed to dismiss recommendation",
        },
      };
    }
  });

  ipcMain.handle("recommendations:getById", async (_event, payload: unknown) => {
    try {
      const validated = RecommendationsGetByIdRequestSchema.parse(payload);
      const data = getRecommendationById(validated.recommendationId);
      return { ok: true, data };
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "RECOMMENDATIONS_GET_BY_ID_FAILED",
          message: err.message || "Failed to load recommendation",
        },
      };
    }
  });
}
