/**
 * settings.ts
 * Owns: persisted app preferences, including first run onboarding state.
 * Upholds:
 * - Invariant I-8: renderer receives settings only through typed IPC.
 * - Invariant I-15: settings writes are validated by IPC schemas before reaching this service.
 */
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { settings } from "../db/schema";
import { OnboardingState } from "@horizon/shared-types";

const ONBOARDING_COMPLETED_KEY = "onboarding.completed";
const ONBOARDING_COMPLETED_AT_KEY = "onboarding.completed_at";
const ONBOARDING_AI_SKIPPED_KEY = "onboarding.ai_provider_skipped";
const SCAN_SCOPE_KEY = "scan.scope";

const DEFAULT_SCOPE_DIRS = [
  "Documents",
  "Desktop",
  "Downloads",
  "Pictures",
  "Movies",
  "Music",
];

export function getDefaultScanScope(): string[] {
  return DEFAULT_SCOPE_DIRS.map((folder) => path.join(os.homedir(), folder));
}

function readSetting(key: string): string | null {
  const row = db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .get();
  return row?.value ?? null;
}

function writeSetting(key: string, value: string): void {
  const now = new Date().toISOString();
  const existing = db
    .select({ key: settings.key })
    .from(settings)
    .where(eq(settings.key, key))
    .get();

  if (existing) {
    db.update(settings)
      .set({ value, updatedAt: now })
      .where(eq(settings.key, key))
      .run();
    return;
  }

  db.insert(settings)
    .values({ key, value, updatedAt: now })
    .run();
}

function parseBoolean(value: string | null): boolean {
  return value === "true";
}

function parseScope(value: string | null): string[] {
  if (!value) return getDefaultScanScope();

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return getDefaultScanScope();
    const clean = normalizeScanScope(parsed.filter((item) => typeof item === "string"));
    return clean.length > 0 ? clean : getDefaultScanScope();
  } catch {
    return getDefaultScanScope();
  }
}

function normalizeScanScope(scope: string[]): string[] {
  return Array.from(
    new Set(scope.map((item) => item.trim()).filter((item) => item.length > 0))
  ).slice(0, 20);
}

export function getSavedScanScope(): string[] {
  return parseScope(readSetting(SCAN_SCOPE_KEY));
}

export function saveScanScope(scope: string[]): { scope: string[] } {
  const clean = normalizeScanScope(scope);
  const persistedScope = clean.length > 0 ? clean : getDefaultScanScope();
  writeSetting(SCAN_SCOPE_KEY, JSON.stringify(persistedScope));
  return { scope: persistedScope };
}

export function getOnboardingState(): OnboardingState {
  return {
    completed: parseBoolean(readSetting(ONBOARDING_COMPLETED_KEY)),
    completedAt: readSetting(ONBOARDING_COMPLETED_AT_KEY),
    scanScope: getSavedScanScope(),
    aiProviderSkipped: parseBoolean(readSetting(ONBOARDING_AI_SKIPPED_KEY)),
  };
}

export function completeOnboarding(params: {
  scanScope: string[];
  aiProviderSkipped?: boolean;
}): OnboardingState {
  const completedAt = new Date().toISOString();
  saveScanScope(params.scanScope);
  writeSetting(ONBOARDING_COMPLETED_KEY, "true");
  writeSetting(ONBOARDING_COMPLETED_AT_KEY, completedAt);
  writeSetting(
    ONBOARDING_AI_SKIPPED_KEY,
    params.aiProviderSkipped ? "true" : "false"
  );
  return getOnboardingState();
}
