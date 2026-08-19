import { describe, expect, it } from "vitest";
import {
  SettingsCompleteOnboardingRequestSchema,
  SettingsGetOnboardingStateResponseSchema,
  SettingsRequestScanScopeResponseSchema,
  SettingsSaveScanScopeRequestSchema,
} from "./settings";

describe("settings shared schemas", () => {
  it("parses onboarding state responses", () => {
    const parsed = SettingsGetOnboardingStateResponseSchema.parse({
      completed: false,
      completedAt: null,
      scanScope: ["/Users/test/Documents"],
      aiProviderSkipped: false,
    });

    expect(parsed.scanScope).toEqual(["/Users/test/Documents"]);
  });

  it("requires at least one scan scope path when saving", () => {
    expect(() =>
      SettingsSaveScanScopeRequestSchema.parse({ scope: [] })
    ).toThrow();
  });

  it("parses native folder picker responses", () => {
    const parsed = SettingsRequestScanScopeResponseSchema.parse({
      paths: ["/Users/test/Downloads", "/Volumes/Media"],
    });

    expect(parsed.paths).toHaveLength(2);
  });

  it("parses onboarding completion requests", () => {
    const parsed = SettingsCompleteOnboardingRequestSchema.parse({
      scanScope: ["/Users/test/Desktop"],
      aiProviderSkipped: true,
    });

    expect(parsed.aiProviderSkipped).toBe(true);
  });
});
