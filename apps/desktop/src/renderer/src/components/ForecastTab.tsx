import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  TrendingUp,
  AlertTriangle,
  Sparkles,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  CheckCircle2,
  RefreshCw,
  Sliders,
  ChevronRight,
  ShieldCheck,
  Files,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import {
  ForecastGetResponse,
  CategoryForecast,
  ForecastWhatIfResponse,
} from "@horizon/shared-types";
import { Button } from "@horizon/ui";

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  const val = parseFloat((bytes / Math.pow(k, i)).toFixed(1));
  return `${val} ${sizes[i] || "B"}`;
}

function formatRate(bytesPerDay: number): string {
  const perMonth = bytesPerDay * 30;
  if (Math.abs(perMonth) < 1024 * 1024) {
    return `${formatBytes(bytesPerDay)}/day`;
  }
  return `${formatBytes(perMonth)}/mo`;
}

interface ForecastTabProps {
  onNavigateToTab?: (tabName: string, filter?: string) => void;
}

export const ForecastTab = React.memo(function ForecastTab({
  onNavigateToTab,
}: ForecastTabProps) {
  const [data, setData] = useState<ForecastGetResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // What-if simulator state
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [whatIfResult, setWhatIfResult] = useState<ForecastWhatIfResponse | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const fetchForecast = useCallback(async () => {
    if (!window.horizon?.forecast) return;
    setIsLoading(true);
    try {
      const res = await window.horizon.forecast.get();
      if (res.ok && res.data) {
        setData(res.data);
      }
    } catch (err) {
      console.error("Failed to load forecast data:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchForecast();
  }, [fetchForecast]);

  // Handle what-if computation
  const runSimulation = useCallback(
    async (categoriesToClean: Set<string>) => {
      if (!window.horizon?.forecast || !data) return;

      const adjustments: Array<{ category: string; bytesToRemove: number }> = [];
      const latestSnapshot = data.history[data.history.length - 1];

      for (const cat of categoriesToClean) {
        const catBytes = latestSnapshot?.categories?.[cat] || 0;
        if (catBytes > 0) {
          adjustments.push({ category: cat, bytesToRemove: catBytes });
        }
      }

      if (adjustments.length === 0) {
        setWhatIfResult(null);
        return;
      }

      setIsSimulating(true);
      try {
        const res = await window.horizon.forecast.whatIf(adjustments);
        if (res.ok && res.data) {
          setWhatIfResult(res.data);
        }
      } catch (err) {
        console.error("Failed to run what-if simulation:", err);
      } finally {
        setIsSimulating(false);
      }
    },
    [data]
  );

  const handleToggleCategory = (category: string) => {
    const updated = new Set(selectedCategories);
    if (updated.has(category)) {
      updated.delete(category);
    } else {
      updated.add(category);
    }
    setSelectedCategories(updated);
    runSimulation(updated);
  };

  const handleScenarioSafe = () => {
    // Select dev_artifact, archive
    const safeSet = new Set<string>();
    const latestSnapshot = data?.history[data.history.length - 1];
    if (latestSnapshot?.categories) {
      for (const cat of Object.keys(latestSnapshot.categories)) {
        if (cat === "dev_artifact" || cat === "archive") {
          safeSet.add(cat);
        }
      }
    }
    setSelectedCategories(safeSet);
    runSimulation(safeSet);
  };

  const handleResetSimulation = () => {
    setSelectedCategories(new Set());
    setWhatIfResult(null);
  };

  // Prepare chart dataset
  const chartData = useMemo(() => {
    if (!data || data.history.length === 0) return [];

    const historyPoints: Array<{
      date: string;
      actualUsed: number | null;
      projectedUsed: number | null;
      projectedLow: number | null;
      projectedHigh: number | null;
      isSynthetic: boolean;
    }> = data.history.map((h) => ({
      date: h.snapshotDate.slice(5), // MM-DD
      actualUsed: Math.round(h.volumeUsedBytes / (1024 * 1024 * 1024)), // GB
      projectedUsed: null,
      projectedLow: null,
      projectedHigh: null,
      isSynthetic: h.isSynthetic,
    }));

    const total = data.totalForecast;
    if (total && total.slopeBytesPerDay > 0 && data.history.length > 0) {
      const lastPoint = data.history[data.history.length - 1];
      const lastDate = new Date(lastPoint.snapshotDate);
      const lastUsedGB = lastPoint.volumeUsedBytes / (1024 * 1024 * 1024);
      const slopeGBPerDay = total.slopeBytesPerDay / (1024 * 1024 * 1024);
      const slopeLowGB = total.slopeLowBytesPerDay / (1024 * 1024 * 1024);
      const slopeHighGB = total.slopeHighBytesPerDay / (1024 * 1024 * 1024);

      // Connect last point to projection
      historyPoints[historyPoints.length - 1].projectedUsed = Math.round(lastUsedGB);
      historyPoints[historyPoints.length - 1].projectedLow = Math.round(lastUsedGB);
      historyPoints[historyPoints.length - 1].projectedHigh = Math.round(lastUsedGB);

      // Add 3 projection steps forward (e.g. +7, +14, +30 days)
      const steps = [7, 14, 30];
      for (const d of steps) {
        const futureDate = new Date(lastDate.getTime() + d * 24 * 60 * 60 * 1000);
        const mmdd = `${String(futureDate.getMonth() + 1).padStart(2, "0")}-${String(
          futureDate.getDate()
        ).padStart(2, "0")}`;

        const mid = Math.round(lastUsedGB + slopeGBPerDay * d);
        const low = Math.round(lastUsedGB + slopeLowGB * d);
        const high = Math.round(lastUsedGB + slopeHighGB * d);

        historyPoints.push({
          date: mmdd,
          actualUsed: null,
          projectedUsed: mid,
          projectedLow: low,
          projectedHigh: high,
          isSynthetic: false,
        });
      }
    }

    return historyPoints;
  }, [data]);

  const totalForecast = data?.totalForecast;
  const isHealthy = !totalForecast || (totalForecast.slopeBytesPerDay <= 0 && !totalForecast.horizonDays);
  const daysToFull = totalForecast?.horizonDays;
  const isBootstrap = totalForecast?.dataSource === "bootstrap";

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-border bg-background px-6">
        <div>
          <h1 className="font-rounded text-title text-text-primary">Storage Forecast</h1>
          <p className="text-meta text-text-secondary">
            Theil-Sen robust median regression · Explainable time-series storage projections
          </p>
        </div>

        <Button
          onClick={fetchForecast}
          disabled={isLoading}
          className="flex items-center gap-2"
        >
          <RefreshCw
            className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          <span>Refresh</span>
        </Button>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Top Headline Banner */}
        <div className="rounded-lg border border-border bg-surface p-5">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-xs bg-surface-secondary text-btn-primary-bg">
                  <TrendingUp className="h-4 w-4" />
                </span>
                <h2 className="text-row font-semibold text-text-primary">
                  {isHealthy
                    ? "Healthy Runway (> 1 Year)"
                    : `Projected Full in ~${daysToFull} Days`}
                </h2>
                <span
                  className={`rounded-xs px-2 py-0.5 text-meta font-medium ${
                    isBootstrap
                      ? "bg-tag-unsure-bg text-tag-unsure-text"
                      : "bg-tag-safe-bg text-tag-safe-text"
                  }`}
                >
                  {isBootstrap ? "Estimated History" : `${totalForecast?.sampleCount || 0} Tracked Days`}
                </span>
              </div>

              <p className="text-meta text-text-secondary">
                {isHealthy ? (
                  "Your current disk growth rate is stable. No capacity alerts projected in the next 12 months."
                ) : (
                  <>
                    Estimated fill date:{" "}
                    <strong className="text-text-primary">
                      {totalForecast?.projectedFullDate || "Upcoming"}
                    </strong>{" "}
                    (Confidence range: {totalForecast?.projectedFullDateLow || "earlier"} to{" "}
                    {totalForecast?.projectedFullDateHigh || "later"})
                  </>
                )}
              </p>
            </div>

            {data?.fastestGrowing && data.fastestGrowing.slopeBytesPerDay > 0 && (
              <div className="rounded-md border border-border bg-surface-secondary p-3 text-right">
                <div className="text-meta text-text-secondary">Fastest Growing Driver</div>
                <div className="text-meta-emphasis text-text-primary capitalize">
                  {data.fastestGrowing.category} ({formatRate(data.fastestGrowing.slopeBytesPerDay)})
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Forecast Visualizer Chart */}
        <div className="rounded-lg border border-border bg-surface p-5">
          <div className="flex items-center justify-between pb-4">
            <div>
              <h3 className="text-row font-semibold text-text-primary">
                Disk Usage & Trajectory (GB)
              </h3>
              <p className="text-meta text-text-secondary">
                Historical snapshot series with median Theil-Sen extrapolation & 90% confidence envelope
              </p>
            </div>
            <div className="flex items-center gap-4 text-meta">
              <span className="flex items-center gap-1.5 text-text-secondary">
                <span className="h-2.5 w-2.5 rounded-full bg-storage-used" />
                Actual Usage
              </span>
              <span className="flex items-center gap-1.5 text-text-secondary">
                <span className="h-2.5 w-2.5 rounded-full bg-btn-primary-bg" />
                Projected Trend
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: -10 }}>
                <XAxis dataKey="date" stroke="var(--color-text-tertiary)" fontSize={11} />
                <YAxis stroke="var(--color-text-tertiary)" fontSize={11} unit=" GB" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-surface)",
                    borderColor: "var(--color-border)",
                    borderRadius: "6px",
                    fontSize: "12px",
                    color: "var(--color-text-primary)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="projectedHigh"
                  stroke="none"
                  fill="var(--color-btn-primary-bg)"
                  fillOpacity={0.12}
                  name="Confidence Range"
                />
                <Line
                  type="monotone"
                  dataKey="actualUsed"
                  stroke="var(--color-storage-used)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "var(--color-storage-used)" }}
                  name="Actual (GB)"
                  connectNulls={false}
                />
                <Line
                  type="monotone"
                  dataKey="projectedUsed"
                  stroke="var(--color-btn-primary-bg)"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 3, fill: "var(--color-btn-primary-bg)" }}
                  name="Projected (GB)"
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Two Column Grid: Growth Breakdown & What-If Simulator */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Category Growth Breakdown */}
          <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
            <div>
              <h3 className="text-row font-semibold text-text-primary">
                Category Growth Rates
              </h3>
              <p className="text-meta text-text-secondary">
                Median monthly growth trend computed across recent snapshots
              </p>
            </div>

            <div className="divide-y divide-border rounded-md border border-border bg-surface-secondary/50">
              {data?.categoryForecasts.map((cat) => {
                const isGrowing = cat.slopeBytesPerDay > 1024 * 1024;
                const isShrinking = cat.slopeBytesPerDay < -1024 * 1024;
                const Icon = isGrowing ? ArrowUpRight : isShrinking ? ArrowDownRight : Minus;
                const colorClass = isGrowing
                  ? "text-tag-danger-text"
                  : isShrinking
                  ? "text-tag-safe-text"
                  : "text-text-tertiary";

                return (
                  <div
                    key={cat.category}
                    className="flex items-center justify-between p-3 transition-colors hover:bg-surface-secondary"
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`h-4 w-4 ${colorClass}`} />
                      <div>
                        <span className="text-meta-emphasis text-text-primary capitalize">
                          {cat.category}
                        </span>
                        <p className="text-meta text-text-tertiary">
                          {cat.sampleCount} points · {cat.dataSource}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className={`text-meta-emphasis ${colorClass}`}>
                        {formatRate(cat.slopeBytesPerDay)}
                      </span>
                      <p className="text-meta text-text-tertiary">
                        {formatBytes(cat.slopeBytesPerDay)}/day
                      </p>
                    </div>
                  </div>
                );
              })}

              {(!data?.categoryForecasts || data.categoryForecasts.length === 0) && (
                <div className="p-4 text-center text-meta text-text-secondary">
                  No category forecast models calculated yet. Run a disk scan to begin tracking.
                </div>
              )}
            </div>
          </div>

          {/* Interactive What-If Simulator */}
          <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-row font-semibold text-text-primary flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-btn-primary-bg" />
                  What-If Cleanup Simulator
                </h3>
                <p className="text-meta text-text-secondary">
                  Simulate how hypothetical cleanups extend your disk runway
                </p>
              </div>

              {selectedCategories.size > 0 && (
                <button
                  type="button"
                  onClick={handleResetSimulation}
                  className="text-meta text-btn-primary-bg hover:underline cursor-pointer"
                >
                  Reset
                </button>
              )}
            </div>

            {/* Quick Scenario Buttons */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleScenarioSafe}
                className="flex items-center gap-1.5 rounded-xs border border-border bg-surface-secondary px-2.5 py-1 text-meta font-medium text-text-primary hover:border-btn-primary-bg transition-colors"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-tag-safe-text" />
                Clean Safe Items
              </button>
            </div>

            {/* Cleanable Category Checklist */}
            <div className="space-y-2 rounded-md border border-border bg-surface-secondary/40 p-3 max-h-48 overflow-y-auto">
              {data?.categoryForecasts.map((cat) => {
                const isSelected = selectedCategories.has(cat.category);
                const latestSnapshot = data.history[data.history.length - 1];
                const currentSize = latestSnapshot?.categories?.[cat.category] || 0;

                return (
                  <label
                    key={cat.category}
                    className="flex cursor-pointer items-center justify-between rounded-xs p-1.5 transition-colors hover:bg-surface-secondary"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleCategory(cat.category)}
                        className="rounded border-border text-btn-primary-bg focus:ring-0 cursor-pointer"
                      />
                      <span className="text-meta text-text-primary capitalize">
                        {cat.category}
                      </span>
                    </div>
                    <span className="text-meta text-text-secondary">
                      {formatBytes(currentSize)}
                    </span>
                  </label>
                );
              })}
            </div>

            {/* Simulation Results Banner */}
            {whatIfResult && (
              <div className="rounded-md border border-tag-safe-text/30 bg-tag-safe-bg/10 p-3.5 space-y-2">
                <div className="flex items-center justify-between text-row font-semibold text-text-primary">
                  <span className="flex items-center gap-1.5 text-tag-safe-text">
                    <CheckCircle2 className="h-4 w-4" />
                    Runway Extension: +{whatIfResult.daysGained} Days
                  </span>
                  <span className="text-meta font-normal text-text-secondary">
                    Frees {formatBytes(whatIfResult.totalBytesRemoved)}
                  </span>
                </div>

                <p className="text-meta text-text-secondary">
                  Projected full date shifts from{" "}
                  <strong className="text-text-primary">{whatIfResult.baselineFullDate}</strong> to{" "}
                  <strong className="text-tag-safe-text">{whatIfResult.projectedFullDate}</strong>.
                </p>

                {onNavigateToTab && (
                  <Button
                    onClick={() => onNavigateToTab("Duplicates")}
                    className="w-full flex items-center justify-center gap-2 mt-2"
                  >
                    <span>Apply this plan in Duplicates & Unused</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
