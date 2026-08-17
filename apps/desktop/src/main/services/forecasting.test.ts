import { describe, it, expect, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn().mockReturnValue("/tmp/horizon_test"),
  },
}));

import {
  computeTheilSenRegression,
  addDaysToDate,
  DataPoint,
} from "./forecasting";

describe("forecasting service", () => {
  describe("computeTheilSenRegression", () => {
    it("computes exact slope for perfectly linear data", () => {
      // y = 100 + 10 * x
      const points: DataPoint[] = [
        { x: 0, y: 100 },
        { x: 1, y: 110 },
        { x: 2, y: 120 },
        { x: 3, y: 130 },
        { x: 4, y: 140 },
      ];

      const res = computeTheilSenRegression(points);
      expect(res.slope).toBeCloseTo(10, 3);
      expect(res.slopeLow).toBeCloseTo(10, 3);
      expect(res.slopeHigh).toBeCloseTo(10, 3);
      expect(res.intercept).toBeCloseTo(100, 3);
      expect(res.sampleCount).toBe(5);
    });

    it("resists extreme one-off spike outliers (e.g. single large download)", () => {
      // Steady growth of 10/day, with a massive spike on day 2 that was later cleaned or transient
      const points: DataPoint[] = [
        { x: 0, y: 100 },
        { x: 1, y: 110 },
        { x: 2, y: 999 }, // Extreme outlier
        { x: 3, y: 130 },
        { x: 4, y: 140 },
      ];

      const res = computeTheilSenRegression(points);
      // Theil-Sen should identify the median slope as 10 despite the spike
      expect(res.slope).toBeCloseTo(10, 1);
    });

    it("calculates 10th and 90th percentile slope spread for variable growth", () => {
      const points: DataPoint[] = [
        { x: 0, y: 100 },
        { x: 1, y: 105 },
        { x: 2, y: 115 },
        { x: 3, y: 120 },
        { x: 4, y: 140 },
      ];

      const res = computeTheilSenRegression(points);
      expect(res.slope).toBeGreaterThan(0);
      expect(res.slopeLow).toBeLessThanOrEqual(res.slope);
      expect(res.slopeHigh).toBeGreaterThanOrEqual(res.slope);
    });

    it("handles zero or single point gracefully", () => {
      expect(computeTheilSenRegression([])).toEqual({
        slope: 0,
        slopeLow: 0,
        slopeHigh: 0,
        intercept: 0,
        sampleCount: 0,
      });

      expect(computeTheilSenRegression([{ x: 0, y: 500 }])).toEqual({
        slope: 0,
        slopeLow: 0,
        slopeHigh: 0,
        intercept: 500,
        sampleCount: 1,
      });
    });
  });

  describe("addDaysToDate", () => {
    it("adds days to a date string accurately", () => {
      const base = new Date("2026-08-01T00:00:00.000Z");
      const result = addDaysToDate(base, 10);
      expect(result).toBe("2026-08-11");
    });
  });
});
