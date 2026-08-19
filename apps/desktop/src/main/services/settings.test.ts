import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn().mockReturnValue("/tmp/horizon_test_userdata"),
  },
}));

vi.mock("../db/client", () => {
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  };
  return { db: mockDb };
});

import { db } from "../db/client";
import {
  completeOnboarding,
  getDefaultScanScope,
  getOnboardingState,
  getSavedScanScope,
  saveScanScope,
} from "./settings";

function mockSettingReads(values: Array<{ value: string } | null>) {
  const queue = [...values];
  vi.mocked(db.select).mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        get: vi.fn(() => queue.shift() ?? null),
      }),
    }),
  }) as any);
}

function mockWrites(existingRows: Array<{ key: string } | null> = []) {
  const queue = [...existingRows];
  vi.mocked(db.insert).mockReturnValue({
    values: vi.fn().mockReturnValue({
      run: vi.fn(),
    }),
  } as any);
  vi.mocked(db.update).mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        run: vi.fn(),
      }),
    }),
  } as any);
  vi.mocked(db.select).mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        get: vi.fn(() => queue.shift() ?? null),
      }),
    }),
  }) as any);
}

describe("settings service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns default scan scope when no saved scope exists", () => {
    mockSettingReads([null]);

    const scope = getSavedScanScope();

    expect(scope).toHaveLength(6);
    expect(scope.some((item) => item.endsWith("/Documents"))).toBe(true);
  });

  it("normalizes saved scan scope values", () => {
    mockWrites([null]);

    const result = saveScanScope([
      "/Users/test/Documents",
      "  /Users/test/Documents  ",
      "/Users/test/Downloads",
    ]);

    expect(result.scope).toEqual([
      "/Users/test/Documents",
      "/Users/test/Downloads",
    ]);
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it("reads onboarding state from settings rows", () => {
    mockSettingReads([
      { value: "true" },
      { value: "2026-08-19T00:00:00.000Z" },
      { value: JSON.stringify(["/Users/test/Desktop"]) },
      { value: "true" },
    ]);

    const state = getOnboardingState();

    expect(state).toEqual({
      completed: true,
      completedAt: "2026-08-19T00:00:00.000Z",
      scanScope: ["/Users/test/Desktop"],
      aiProviderSkipped: true,
    });
  });

  it("persists onboarding completion and scan scope", () => {
    mockWrites([
      null,
      null,
      null,
      null,
      { key: "read-completed" },
      { key: "read-completed-at" },
      { key: "read-scope" },
      { key: "read-ai-skipped" },
    ]);
    vi.mocked(db.select).mockImplementationOnce(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ get: vi.fn(() => null) }),
      }),
    }) as any);

    const state = completeOnboarding({
      scanScope: ["/Users/test/Documents"],
      aiProviderSkipped: true,
    });

    expect(db.insert).toHaveBeenCalled();
    expect(state.scanScope).toEqual(getDefaultScanScope());
  });
});
