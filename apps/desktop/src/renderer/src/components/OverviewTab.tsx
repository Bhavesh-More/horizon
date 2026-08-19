import React, { useState, useEffect, useCallback, useRef, useTransition } from "react";
import {
  RefreshCw,
  FileImage,
  FileVideo,
  FileAudio,
  FileText,
  Archive,
  Code2,
  File,
  HardDrive,
  CheckCircle2,
} from "lucide-react";
import { Button, ScanResultRow } from "@horizon/ui";
import { FileItem, CategoryStat, ScanProgressEvent, ForecastGetResponse } from "@horizon/shared-types";
import { TrendingUp, Sparkles, ChevronRight, ShieldCheck } from "lucide-react";

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

const CATEGORY_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType }
> = {
  image: { label: "Images", icon: FileImage },
  video: { label: "Videos", icon: FileVideo },
  audio: { label: "Audio", icon: FileAudio },
  document: { label: "Documents", icon: FileText },
  archive: { label: "Archives", icon: Archive },
  dev_artifact: { label: "Dev Artifacts", icon: Code2 },
  other: { label: "Other", icon: File },
};

interface OverviewTabProps {
  onNavigateToTab?: (tabName: string) => void;
}

export const OverviewTab = React.memo(function OverviewTab({
  onNavigateToTab,
}: OverviewTabProps) {
  const [isPending, startTransition] = useTransition();
  const [isScanning, setIsScanning] = useState(false);
  const [recentFiles, setRecentFiles] = useState<FileItem[]>([]);
  const [categories, setCategories] = useState<Record<string, CategoryStat>>({});
  const [totalFiles, setTotalFiles] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [lastCompletedAt, setLastCompletedAt] = useState<string | null>(null);
  const [forecastData, setForecastData] = useState<ForecastGetResponse | null>(null);
  const [scanScopeLabel, setScanScopeLabel] = useState("Default folders");

  // Mutable stream buffer ref to decouple high-frequency IPC stream from React rendering
  const streamRef = useRef({
    totalFiles: 0,
    totalBytes: 0,
    categories: {} as Record<string, CategoryStat>,
    recentFiles: [] as FileItem[],
    dirty: false,
  });

  const fetchForecast = useCallback(async () => {
    try {
      if (!window.horizon?.forecast) return;
      const res = await window.horizon.forecast.get();
      if (res.ok && res.data) {
        setForecastData(res.data);
      }
    } catch (err) {
      console.error("Failed to load forecast data in Overview:", err);
    }
  }, []);

  const fetchLatestScan = useCallback(async () => {
    try {
      if (!window.horizon?.scan) return;
      const res = await window.horizon.scan.getLatest();
      if (res.ok && res.data) {
        const data = res.data;
        startTransition(() => {
          if (data.scanRun) {
            setTotalFiles(data.scanRun.totalFiles);
            setTotalBytes(data.scanRun.totalBytes);
            setLastCompletedAt(data.scanRun.completedAt);
          }
          setRecentFiles(data.recentFiles);
          setCategories(data.categories);
        });
      }
      fetchForecast();
    } catch (err) {
      console.error("Failed to load latest scan:", err);
    }
  }, [fetchForecast]);

  // Flush mutable stream ref to React state on a controlled 150ms cadence using React transitions
  useEffect(() => {
    if (!isScanning) return;

    const interval = setInterval(() => {
      if (streamRef.current.dirty) {
        streamRef.current.dirty = false;
        const snapshot = {
          totalFiles: streamRef.current.totalFiles,
          totalBytes: streamRef.current.totalBytes,
          categories: { ...streamRef.current.categories },
          recentFiles: [...streamRef.current.recentFiles],
        };

        startTransition(() => {
          setTotalFiles(snapshot.totalFiles);
          setTotalBytes(snapshot.totalBytes);
          setCategories(snapshot.categories);
          setRecentFiles(snapshot.recentFiles);
        });
      }
    }, 150);

    return () => clearInterval(interval);
  }, [isScanning]);

  useEffect(() => {
    fetchLatestScan();

    if (!window.horizon?.scan) return;

    const resetScanState = () => {
      streamRef.current = {
        totalFiles: 0,
        totalBytes: 0,
        categories: {},
        recentFiles: [],
        dirty: false,
      };
      setIsScanning(true);
      startTransition(() => {
        setTotalFiles(0);
        setTotalBytes(0);
        setCategories({});
        setRecentFiles([]);
        setLastCompletedAt(null);
      });
    };

    const unsubscribe = window.horizon.scan.onProgress((event: ScanProgressEvent) => {
      if (event.event === "started") {
        resetScanState();
      } else if ((event.event === "batch" && event.files) || (event.event === "found" && event.file)) {
        const incoming = event.files || (event.file ? [event.file] : []);
        if (incoming.length === 0) return;

        // Mutate ref buffer instantly without triggering React state re-renders
        const ref = streamRef.current;
        ref.totalFiles += incoming.length;

        for (const item of incoming) {
          ref.totalBytes += item.sizeBytes;
          const cat = item.category;
          const currentCat = ref.categories[cat] || { files: 0, bytes: 0 };
          ref.categories[cat] = {
            files: currentCat.files + 1,
            bytes: currentCat.bytes + item.sizeBytes,
          };
        }

        ref.recentFiles = [...incoming.slice().reverse(), ...ref.recentFiles].slice(0, 50);
        ref.dirty = true;
      } else if (event.event === "complete" || event.event === "failed" || event.event === "cancelled") {
        setIsScanning(false);
        fetchLatestScan();
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [fetchLatestScan]);

  const handleRunScan = async () => {
    if (isScanning || !window.horizon?.scan) return;
    try {
      setIsScanning(true);
      const scopeResult = await window.horizon.settings.getScanScope();
      const scope = scopeResult.ok && scopeResult.data?.scope.length
        ? scopeResult.data.scope
        : [
            "Documents",
            "Desktop",
            "Downloads",
            "Pictures",
            "Movies",
            "Music",
          ];
      setScanScopeLabel(
        scope.length > 3
          ? `${scope.slice(0, 3).map((item) => item.split("/").filter(Boolean).pop() || item).join(", ")} +${scope.length - 3}`
          : scope.map((item) => item.split("/").filter(Boolean).pop() || item).join(", ")
      );
      await window.horizon.scan.start(scope);
    } catch (err) {
      console.error("Failed to start scan:", err);
      setIsScanning(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header Bar */}
      <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-border bg-background px-6">
        <div>
          <h1 className="font-rounded text-title text-text-primary">Overview</h1>
          <p className="text-meta text-text-secondary">
            {isScanning
              ? `Scanning storage… (${totalFiles.toLocaleString()} files indexed)`
              : lastCompletedAt
              ? `Last scan completed ${new Date(lastCompletedAt).toLocaleTimeString()}`
              : "Ready to scan disk storage"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className={`rounded-md border border-border bg-surface px-3 py-1.5 text-meta text-text-secondary transition-all duration-300 ${isScanning ? "border-btn-primary-bg/50" : ""}`}>
            <span className="font-semibold text-text-primary">
              {formatBytes(totalBytes)}
            </span>{" "}
            indexed
          </div>

          <Button
            onClick={handleRunScan}
            disabled={isScanning}
            className="flex items-center gap-2 transition-all duration-200"
          >
            <RefreshCw
              className={`h-4 w-4 ${isScanning ? "animate-spin text-btn-primary-text" : ""}`}
              aria-hidden="true"
            />
            <span>{isScanning ? "Scanning…" : "Run Scan"}</span>
          </Button>
        </div>
      </header>

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Storage Summary Banner */}
        <section className={`rounded-md border border-border bg-surface p-5 transition-all duration-300 ${isScanning ? "ring-1 ring-btn-primary-bg/30" : ""}`}>
          <div className="flex items-center justify-between pb-3">
            <div className="flex items-center gap-2.5">
              <HardDrive className={`h-5 w-5 ${isScanning ? "animate-pulse text-btn-primary-bg" : "text-text-secondary"}`} />
              <h2 className="text-row font-semibold text-text-primary">
                Indexed Storage Breakdown
              </h2>
            </div>
            <div className="flex items-center gap-1.5 text-meta text-text-secondary">
              <CheckCircle2 className="h-3.5 w-3.5 text-tag-safe-text" />
              <span>Safety model active</span>
            </div>
          </div>

          {/* Bar indicator */}
          <div className="h-2.5 w-full rounded-xs bg-storage-free overflow-hidden">
            <div
              className={`h-full bg-storage-used transition-all duration-500 ease-out ${isScanning ? "opacity-90" : ""}`}
              style={{
                width: totalBytes > 0 ? "100%" : "0%",
              }}
            />
          </div>

          <div className="mt-3 flex items-center justify-between text-meta">
            <span className="text-text-secondary">
              Indexed:{" "}
              <strong className="text-text-primary font-semibold transition-all">
                {formatBytes(totalBytes)}
              </strong>{" "}
              across {totalFiles.toLocaleString()} files
            </span>
            <span className="text-text-secondary">
              Scope: {scanScopeLabel}
            </span>
          </div>
        </section>

        {/* Forecast Headline Card */}
        {forecastData?.totalForecast && (
          <section
            onClick={() => onNavigateToTab?.("Forecast")}
            className="cursor-pointer rounded-md border border-border bg-surface p-4 transition-colors hover:border-border/80 hover:bg-surface-secondary/40"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xs bg-surface-secondary text-btn-primary-bg">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-row font-semibold text-text-primary">
                      {forecastData.totalForecast.slopeBytesPerDay <= 0 && !forecastData.totalForecast.horizonDays
                        ? "Storage Runway: Healthy (> 1 Year)"
                        : `Storage Runway: ~${forecastData.totalForecast.horizonDays} Days to Full`}
                    </span>
                    <span
                      className={`rounded-xs px-1.5 py-0.5 text-meta font-medium ${
                        forecastData.totalForecast.isSynthetic
                          ? "bg-tag-unsure-bg text-tag-unsure-text"
                          : "bg-tag-safe-bg text-tag-safe-text"
                      }`}
                    >
                      {forecastData.totalForecast.isSynthetic
                        ? "Estimated History"
                        : `${forecastData.totalForecast.sampleCount} Tracked Days`}
                    </span>
                  </div>

                  <p className="mt-0.5 text-meta text-text-secondary">
                    {forecastData.fastestGrowing && forecastData.fastestGrowing.slopeBytesPerDay > 0
                      ? `${forecastData.fastestGrowing.category} is growing fastest (${formatBytes(
                          forecastData.fastestGrowing.slopeBytesPerDay * 30
                        )}/mo)`
                      : "Daily storage growth rate is balanced"}
                    {forecastData.safeCleanableDaysGained > 0 && (
                      <span className="ml-2 font-medium text-tag-safe-text">
                        · Cleaning safe items would add ~{forecastData.safeCleanableDaysGained} days
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 text-meta text-btn-primary-bg">
                <span>View Forecast</span>
                <ChevronRight className="h-4 w-4" />
              </div>
            </div>
          </section>
        )}

        {/* Categories Grid */}
        <section className="space-y-3">
          <h2 className="text-row font-semibold text-text-primary">
            Categories Overview
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {Object.entries(CATEGORY_CONFIG).map(([catKey, config]) => {
              const Icon = config.icon;
              const stat = categories[catKey] || { files: 0, bytes: 0 };
              const hasFiles = stat.files > 0;
              return (
                <div
                  key={catKey}
                  className={`flex flex-col justify-between rounded-md border border-border bg-surface p-4 transition-all duration-300 hover:border-border/80 ${
                    isScanning && hasFiles ? "border-border/90 bg-surface/90" : ""
                  }`}
                >
                  <div className="flex items-center justify-between pb-2">
                    <span className="text-meta font-medium text-text-secondary">
                      {config.label}
                    </span>
                    <div className="flex h-6 w-6 items-center justify-center rounded-xs bg-surface-secondary text-text-secondary">
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    </div>
                  </div>
                  <div>
                    <p className="text-row font-semibold text-text-primary transition-all">
                      {formatBytes(stat.bytes)}
                    </p>
                    <p className="text-meta text-text-tertiary">
                      {stat.files.toLocaleString()} files
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Live Scan / Indexed Files Stream */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-row font-semibold text-text-primary">
              {isScanning ? "Live Scan Feed" : "Recently Indexed Files"}
            </h2>
            <span className="text-meta text-text-tertiary">
              Showing top {recentFiles.length} items
            </span>
          </div>

          <div className="overflow-hidden rounded-md border border-border bg-surface">
            {recentFiles.length === 0 ? (
              <div className="p-8 text-center text-meta text-text-secondary">
                No scan results yet. Click &quot;Run Scan&quot; above to index storage.
              </div>
            ) : (
              recentFiles.map((file, idx) => (
                <ScanResultRow
                  key={file.id || `${file.path}-${idx}`}
                  path={file.path}
                  sizeBytes={file.sizeBytes}
                  category={file.category}
                  extension={file.extension}
                  modifiedAt={file.modifiedAt}
                />
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
});
