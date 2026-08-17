import { ipcMain } from "electron";
import {
  ForecastWhatIfRequestSchema,
  ForecastGetResponse,
  ForecastWhatIfResponse,
} from "@horizon/shared-types";
import { getForecastData, simulateWhatIf } from "../services/forecasting";

export function registerForecastIpc() {
  ipcMain.handle("forecast:get", async (): Promise<{
    ok: boolean;
    data?: ForecastGetResponse;
    error?: { code: string; message: string };
  }> => {
    try {
      const data = getForecastData();
      return { ok: true, data };
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "FORECAST_GET_FAILED",
          message: err.message || "Failed to retrieve storage forecast data",
        },
      };
    }
  });

  ipcMain.handle(
    "forecast:whatIf",
    async (
      _event,
      payload: unknown
    ): Promise<{
      ok: boolean;
      data?: ForecastWhatIfResponse;
      error?: { code: string; message: string };
    }> => {
      try {
        const validated = ForecastWhatIfRequestSchema.parse(payload);
        const data = simulateWhatIf(validated.adjustments);
        return { ok: true, data };
      } catch (err: any) {
        return {
          ok: false,
          error: {
            code: "FORECAST_WHAT_IF_FAILED",
            message: err.message || "Failed to compute what-if simulation",
          },
        };
      }
    }
  );
}
