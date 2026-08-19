/**
 * ipc/settings.ts
 * IPC handlers for app settings and first run onboarding.
 * Responsibilities & Invariants:
 * - Validates incoming IPC payloads against Zod schemas from @horizon/shared-types (Invariant I-15).
 * - Keeps native folder access in the main process, never the renderer (Invariant I-8).
 */
import { BrowserWindow, dialog, ipcMain, OpenDialogOptions } from "electron";
import {
  SettingsCompleteOnboardingRequestSchema,
  SettingsGetOnboardingStateRequestSchema,
  SettingsGetScanScopeRequestSchema,
  SettingsRequestScanScopeRequestSchema,
  SettingsSaveScanScopeRequestSchema,
} from "@horizon/shared-types";
import {
  completeOnboarding,
  getOnboardingState,
  getSavedScanScope,
  saveScanScope,
} from "../services/settings";

export function registerSettingsIpc() {
  ipcMain.handle("settings:getOnboardingState", async (_event, payload: unknown) => {
    try {
      SettingsGetOnboardingStateRequestSchema.parse(payload);
      return { ok: true, data: getOnboardingState() };
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "SETTINGS_ONBOARDING_STATE_FAILED",
          message: err.message || "Failed to read onboarding state",
        },
      };
    }
  });

  ipcMain.handle("settings:requestScanScope", async (event, payload: unknown) => {
    try {
      SettingsRequestScanScopeRequestSchema.parse(payload);
      const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      const options: OpenDialogOptions = {
        title: "Choose folders for Horizon to scan",
        buttonLabel: "Use Selected Folders",
        properties: ["openDirectory", "multiSelections"],
      };
      const result = parentWindow
        ? await dialog.showOpenDialog(parentWindow, options)
        : await dialog.showOpenDialog(options);
      return {
        ok: true,
        data: {
          paths: result.canceled ? [] : result.filePaths,
        },
      };
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "SETTINGS_SCAN_SCOPE_PICK_FAILED",
          message: err.message || "Failed to choose scan folders",
        },
      };
    }
  });

  ipcMain.handle("settings:getScanScope", async (_event, payload: unknown) => {
    try {
      SettingsGetScanScopeRequestSchema.parse(payload);
      return { ok: true, data: { scope: getSavedScanScope() } };
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "SETTINGS_SCAN_SCOPE_READ_FAILED",
          message: err.message || "Failed to read scan scope",
        },
      };
    }
  });

  ipcMain.handle("settings:saveScanScope", async (_event, payload: unknown) => {
    try {
      const validated = SettingsSaveScanScopeRequestSchema.parse(payload);
      return { ok: true, data: saveScanScope(validated.scope) };
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "SETTINGS_SCAN_SCOPE_SAVE_FAILED",
          message: err.message || "Failed to save scan scope",
        },
      };
    }
  });

  ipcMain.handle("settings:completeOnboarding", async (_event, payload: unknown) => {
    try {
      const validated = SettingsCompleteOnboardingRequestSchema.parse(payload);
      return { ok: true, data: completeOnboarding(validated) };
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "SETTINGS_ONBOARDING_COMPLETE_FAILED",
          message: err.message || "Failed to complete onboarding",
        },
      };
    }
  });
}
