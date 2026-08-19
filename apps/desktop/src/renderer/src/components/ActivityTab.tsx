import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  ExternalLink,
  Filter,
  HardDrive,
  RefreshCw,
  ScanSearch,
  Trash2,
} from "lucide-react";
import { Button } from "@horizon/ui";
import type {
  ActivityItem,
  ActivityListResponse,
  ActivityType,
} from "@horizon/shared-types";

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatTimestamp(isoString?: string | null): string {
  if (!isoString) return "Unknown";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

function getActivityIcon(type: ActivityType) {
  switch (type) {
    case "scan":
      return ScanSearch;
    case "trash":
      return Trash2;
    case "archive":
      return Archive;
    case "restore":
      return ArchiveRestore;
    default:
      return HardDrive;
  }
}

function getActivityBadgeStyle(type: ActivityType) {
  switch (type) {
    case "scan":
      return "bg-surface-secondary text-text-secondary border-border";
    case "trash":
      return "bg-tag-danger-bg text-tag-danger-text border-tag-danger-text/20";
    case "archive":
      return "bg-tag-check-bg text-tag-check-text border-tag-check-text/20";
    case "restore":
      return "bg-tag-safe-bg text-tag-safe-text border-tag-safe-text/20";
    default:
      return "bg-surface-secondary text-text-secondary border-border";
  }
}

export const ActivityTab = React.memo(function ActivityTab() {
  const [data, setData] = useState<ActivityListResponse>({
    items: [],
    totalItems: 0,
    totalScans: 0,
    totalActions: 0,
    totalBytesAffected: 0,
  });
  const [filterType, setFilterType] = useState<string>("all");
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trashFeedback, setTrashFeedback] = useState<string | null>(null);

  const loadActivity = useCallback(async () => {
    if (!window.horizon?.activity) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await window.horizon.activity.list(100);
      if (res.ok && res.data) {
        setData(res.data);
      } else {
        setError(res.error?.message || "Failed to load activity log");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load activity log");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  const handleOpenTrash = async () => {
    if (!window.horizon?.activity) return;
    try {
      const res = await window.horizon.activity.openTrash();
      if (res.ok && res.data?.success) {
        setTrashFeedback("OS Trash opened");
      } else {
        setTrashFeedback("Could not open OS Trash automatically");
      }
      setTimeout(() => setTrashFeedback(null), 3000);
    } catch {
      setTrashFeedback("Could not open OS Trash");
      setTimeout(() => setTrashFeedback(null), 3000);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const filteredItems = useMemo(() => {
    if (filterType === "all") return data.items;
    return data.items.filter((item) => item.type === filterType);
  }, [data.items, filterType]);

  return (
    <div className="flex h-full flex-col bg-background text-text-primary">
      {/* Header Bar */}
      <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-border bg-background px-6">
        <div>
          <h1 className="font-rounded text-title font-semibold text-text-primary">
            Activity
          </h1>
          <p className="text-meta text-text-secondary">
            Reverse-chronological audit log of scans, cleans, archives, and restores
          </p>
        </div>

        <div className="flex items-center gap-3">
          {trashFeedback && (
            <span className="flex items-center gap-1.5 rounded-sm bg-surface-secondary px-2.5 py-1 text-meta font-medium text-text-primary">
              <CheckCircle2 className="h-3.5 w-3.5 text-tag-safe-text" />
              {trashFeedback}
            </span>
          )}
          <Button
            type="button"
            onClick={loadActivity}
            disabled={isLoading}
            className="flex items-center gap-2 rounded-sm bg-surface-secondary border border-border px-3 py-1.5 text-row text-text-primary hover:bg-surface transition-colors cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Metric Summary Cards */}
        <div className="grid grid-cols-4 gap-4">
          <div className="rounded-md border border-border bg-surface p-4">
            <p className="text-meta font-medium text-text-secondary">Total Events</p>
            <p className="mt-1 font-rounded text-title font-semibold text-text-primary">
              {data.totalItems}
            </p>
            <p className="text-meta text-text-tertiary mt-1">Audit log records</p>
          </div>

          <div className="rounded-md border border-border bg-surface p-4">
            <p className="text-meta font-medium text-text-secondary">Scans Executed</p>
            <p className="mt-1 font-rounded text-title font-semibold text-text-primary">
              {data.totalScans}
            </p>
            <p className="text-meta text-text-tertiary mt-1">Filesystem index runs</p>
          </div>

          <div className="rounded-md border border-border bg-surface p-4">
            <p className="text-meta font-medium text-text-secondary">Cleanup Actions</p>
            <p className="mt-1 font-rounded text-title font-semibold text-text-primary">
              {data.totalActions}
            </p>
            <p className="text-meta text-text-tertiary mt-1">Trash, archive & restore</p>
          </div>

          <div className="rounded-md border border-border bg-surface p-4">
            <p className="text-meta font-medium text-text-secondary">Data Processed</p>
            <p className="mt-1 font-rounded text-title font-semibold text-text-primary">
              {formatBytes(data.totalBytesAffected)}
            </p>
            <p className="text-meta text-text-tertiary mt-1">Total bytes audited</p>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex items-center justify-between rounded-md border border-border bg-surface px-4 py-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-text-tertiary" />
            <span className="text-meta font-medium text-text-secondary mr-2">Filter:</span>
            {(
              [
                { key: "all", label: "All Events" },
                { key: "trash", label: "Trash" },
                { key: "archive", label: "Archive" },
                { key: "restore", label: "Restore" },
                { key: "scan", label: "Scan" },
              ] as const
            ).map((filter) => {
              const isSelected = filterType === filter.key;
              return (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setFilterType(filter.key)}
                  className={`rounded-sm px-2.5 py-1 text-meta font-medium transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-btn-primary-bg text-btn-primary-text"
                      : "bg-surface-secondary text-text-secondary hover:bg-border hover:text-text-primary"
                  }`}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>

          <p className="text-meta text-text-tertiary">
            Showing {filteredItems.length} of {data.totalItems} entries
          </p>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="rounded-md border border-tag-danger-text/20 bg-tag-danger-bg p-4 text-row text-tag-danger-text">
            {error}
          </div>
        )}

        {/* Audit Log Entries List */}
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-md border border-border bg-surface p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-sm bg-surface-secondary text-text-tertiary">
              <Clock3 className="h-6 w-6" />
            </div>
            <p className="mt-4 text-row font-semibold text-text-primary">
              No activity records found
            </p>
            <p className="mt-1 max-w-sm text-meta text-text-secondary">
              {filterType === "all"
                ? "Scans, deletions, archives, and restore actions will automatically appear here once performed."
                : `No events matching the "${filterType}" filter.`}
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-border bg-surface divide-y divide-border overflow-hidden">
            {filteredItems.map((item) => {
              const Icon = getActivityIcon(item.type);
              const badgeStyle = getActivityBadgeStyle(item.type);
              const isExpanded = expandedItemIds.has(item.id);

              return (
                <div
                  key={item.id}
                  className="transition-colors hover:bg-surface-secondary/40"
                >
                  <div className="flex items-center justify-between px-4 py-3.5">
                    {/* Left: Icon & Description */}
                    <div className="flex min-w-0 flex-1 items-center gap-3 pr-4">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-surface-secondary text-text-secondary">
                        <Icon className="h-4 w-4" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-row font-medium text-text-primary">
                            {item.title}
                          </p>
                          <span
                            className={`rounded-xs border px-1.5 py-0.2 text-[10px] uppercase font-semibold tracking-wider ${badgeStyle}`}
                          >
                            {item.type}
                          </span>
                        </div>
                        <p className="truncate text-meta text-text-secondary mt-0.5">
                          {item.description}
                        </p>
                      </div>
                    </div>

                    {/* Right: Timestamp, Bytes & Actions */}
                    <div className="flex shrink-0 items-center gap-4">
                      <div className="text-right">
                        <p className="text-meta-emphasis font-semibold text-text-primary">
                          {item.bytesAffected > 0 ? formatBytes(item.bytesAffected) : "—"}
                        </p>
                        <p className="text-meta text-text-tertiary">
                          {formatTimestamp(item.timestamp)}
                        </p>
                      </div>

                      {/* Undo / Open Trash Affordance */}
                      {item.undoAvailable && (
                        <button
                          type="button"
                          onClick={handleOpenTrash}
                          title="Open OS Trash to restore files if needed"
                          className="flex items-center gap-1.5 rounded-sm border border-border bg-surface px-2.5 py-1 text-meta font-medium text-text-primary hover:bg-surface-secondary transition-colors cursor-pointer"
                        >
                          <ExternalLink className="h-3 w-3 text-text-secondary" />
                          <span>{item.undoLabel || "Open Trash"}</span>
                        </button>
                      )}

                      {/* Paths Expand Toggle */}
                      {item.paths.length > 0 && (
                        <button
                          type="button"
                          onClick={() => toggleExpand(item.id)}
                          aria-label={isExpanded ? "Collapse file paths" : "Expand file paths"}
                          className="flex h-7 w-7 items-center justify-center rounded-xs text-text-secondary hover:bg-surface-secondary hover:text-text-primary transition-colors cursor-pointer"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded File Path Details */}
                  {isExpanded && item.paths.length > 0 && (
                    <div className="border-t border-border bg-background/60 px-4 py-3">
                      <p className="text-meta font-medium text-text-secondary mb-1.5">
                        Impacted Paths ({item.paths.length}):
                      </p>
                      <div className="max-h-36 overflow-y-auto space-y-1 rounded-sm border border-border bg-surface p-2 text-meta font-mono text-text-secondary">
                        {item.paths.map((p, idx) => (
                          <div key={idx} className="truncate">
                            {p}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});
