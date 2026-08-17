import { ipcMain } from "electron";
import {
  AiProviderConfigureRequestSchema,
  AiProviderSelectRequestSchema,
  AiProviderTestRequestSchema,
} from "@horizon/shared-types";
import {
  getProvidersStatus,
  listOllamaModels,
  configureProvider,
  setActiveProvider,
  testProviderConnection,
} from "../services/llm-client";

export function registerAiProviderIpc() {
  ipcMain.handle("ai-provider:getStatus", async () => {
    try {
      const data = await getProvidersStatus();
      return { ok: true, data };
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "AI_PROVIDER_STATUS_FAILED",
          message: err.message || "Failed to fetch AI provider status",
        },
      };
    }
  });

  ipcMain.handle("ai-provider:listOllamaModels", async () => {
    try {
      const data = await listOllamaModels();
      return { ok: true, data };
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "OLLAMA_MODEL_LIST_FAILED",
          message: err.message || "Failed to list local Ollama models",
        },
      };
    }
  });

  ipcMain.handle("ai-provider:configure", async (_event, payload: unknown) => {
    try {
      const validated = AiProviderConfigureRequestSchema.parse(payload);
      const data = await configureProvider(validated);
      return { ok: true, data };
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "AI_PROVIDER_CONFIGURE_FAILED",
          message: err.message || "Failed to configure AI provider",
        },
      };
    }
  });

  ipcMain.handle("ai-provider:select", async (_event, payload: unknown) => {
    try {
      const validated = AiProviderSelectRequestSchema.parse(payload);
      const data = await setActiveProvider(validated.provider);
      return { ok: true, data };
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "AI_PROVIDER_SELECT_FAILED",
          message: err.message || "Failed to select active AI provider",
        },
      };
    }
  });

  ipcMain.handle("ai-provider:test", async (_event, payload: unknown) => {
    try {
      const validated = AiProviderTestRequestSchema.parse(payload);
      const data = await testProviderConnection(validated);
      return { ok: true, data };
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "AI_PROVIDER_TEST_FAILED",
          message: err.message || "Failed to test AI provider connection",
        },
      };
    }
  });
}
