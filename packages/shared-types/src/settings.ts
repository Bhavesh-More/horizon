import { z } from "zod";

/**
 * Stored first run setup state returned by settings:getOnboardingState.
 */
export const OnboardingStateSchema = z.object({
  completed: z.boolean(),
  completedAt: z.string().nullable(),
  scanScope: z.array(z.string()),
  aiProviderSkipped: z.boolean(),
});
export type OnboardingState = z.infer<typeof OnboardingStateSchema>;

/**
 * Request payload for settings:getOnboardingState.
 */
export const SettingsGetOnboardingStateRequestSchema = z.object({});
export type SettingsGetOnboardingStateRequest = z.infer<
  typeof SettingsGetOnboardingStateRequestSchema
>;

/**
 * Response shape for settings:getOnboardingState.
 */
export const SettingsGetOnboardingStateResponseSchema = OnboardingStateSchema;
export type SettingsGetOnboardingStateResponse = z.infer<
  typeof SettingsGetOnboardingStateResponseSchema
>;

/**
 * Request payload for settings:requestScanScope.
 */
export const SettingsRequestScanScopeRequestSchema = z.object({});
export type SettingsRequestScanScopeRequest = z.infer<
  typeof SettingsRequestScanScopeRequestSchema
>;

/**
 * Response shape for settings:requestScanScope.
 */
export const SettingsRequestScanScopeResponseSchema = z.object({
  paths: z.array(z.string()),
});
export type SettingsRequestScanScopeResponse = z.infer<
  typeof SettingsRequestScanScopeResponseSchema
>;

/**
 * Request payload for settings:getScanScope.
 */
export const SettingsGetScanScopeRequestSchema = z.object({});
export type SettingsGetScanScopeRequest = z.infer<
  typeof SettingsGetScanScopeRequestSchema
>;

/**
 * Response shape for settings:getScanScope.
 */
export const SettingsGetScanScopeResponseSchema = z.object({
  scope: z.array(z.string()),
});
export type SettingsGetScanScopeResponse = z.infer<
  typeof SettingsGetScanScopeResponseSchema
>;

/**
 * Request payload for settings:saveScanScope.
 */
export const SettingsSaveScanScopeRequestSchema = z.object({
  scope: z.array(z.string().min(1)).min(1).max(20),
});
export type SettingsSaveScanScopeRequest = z.infer<
  typeof SettingsSaveScanScopeRequestSchema
>;

/**
 * Response shape for settings:saveScanScope.
 */
export const SettingsSaveScanScopeResponseSchema = SettingsGetScanScopeResponseSchema;
export type SettingsSaveScanScopeResponse = z.infer<
  typeof SettingsSaveScanScopeResponseSchema
>;

/**
 * Request payload for settings:completeOnboarding.
 */
export const SettingsCompleteOnboardingRequestSchema = z.object({
  scanScope: z.array(z.string().min(1)).min(1).max(20),
  aiProviderSkipped: z.boolean().optional(),
});
export type SettingsCompleteOnboardingRequest = z.infer<
  typeof SettingsCompleteOnboardingRequestSchema
>;

/**
 * Response shape for settings:completeOnboarding.
 */
export const SettingsCompleteOnboardingResponseSchema = OnboardingStateSchema;
export type SettingsCompleteOnboardingResponse = z.infer<
  typeof SettingsCompleteOnboardingResponseSchema
>;
