import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Archive, RefreshCw, Trash2, Layers, CheckSquare, Square, AlertCircle, Sparkles } from "lucide-react";
import { Button, ConfirmationModal, ConfirmationModalItem } from "@horizon/ui";
import { DuplicateGroup, DuplicateDetectionProgress, ScanProgressEvent } from "@horizon/shared-types";
import { DuplicateGroupCard } from "./DuplicateGroupCard";

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export const DuplicatesTab = React.memo(function DuplicatesTab() {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [filterType, setFilterType] = useState<"all" | "exact" | "perceptual" | "embedding">("all");
  const [isLoading, setIsLoading] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionProgress, setDetectionProgress] = useState<{
    phase?: "exact" | "perceptual" | "embedding";
    processedFiles?: number;
    totalFiles?: number;
  }>({});

  // Map of fileId -> selected for removal
  const [selectedFileIds, setSelectedFileIds] = useState<Set<number>>(new Set());

  // Modal state
  const [isTrashModalOpen, setIsTrashModalOpen] = useState(false);
  const [isTrashing, setIsTrashing] = useState(false);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  // Keep a ref to current filterType for use in async callbacks without stale closures
  const filterTypeRef = useRef(filterType);
  useEffect(() => { filterTypeRef.current = filterType; }, [filterType]);

  // ── Fetch duplicate groups ──────────────────────────────────────────────
  // Stable function — does not depend on filterType state directly,
  // reads it from the ref to avoid re-subscribing progress listener on filter changes.
  const fetchDuplicates = useCallback(async (typeOverride?: "all" | "exact" | "perceptual" | "embedding") => {
    if (!window.horizon?.duplicates) return;
    const type = typeOverride ?? filterTypeRef.current;
    setIsLoading(true);
    try {
      const res = await window.horizon.duplicates.list(undefined, type === "all" ? undefined : type);
      if (res.ok && res.data) {
        const fetchedGroups = res.data.groups;
        setGroups(fetchedGroups);

        // Pre-select all non-recommended files
        const initialSelections = new Set<number>();
        for (const group of fetchedGroups) {
          for (const member of group.members) {
            if (!member.isRecommendedKeep) initialSelections.add(member.fileId);
          }
        }
        setSelectedFileIds(initialSelections);
      }
    } catch (err) {
      console.error("Failed to load duplicate groups:", err);
    } finally {
      setIsLoading(false);
    }
  }, []); // stable — reads filterType from ref, not closure

  // ── Subscribe to detection progress — runs ONCE on mount ──────────────
  useEffect(() => {
    // Initial load
    fetchDuplicates();

    if (!window.horizon?.duplicates) return;

    // Check if detection is already running (e.g. auto-triggered before tab mounted)
    window.horizon.duplicates.isRunning().then((res) => {
      if (res?.data === true) setIsDetecting(true);
    }).catch(() => {/* ignore */});

    const unsubscribeDuplicates = window.horizon.duplicates.onProgress((event: DuplicateDetectionProgress) => {
      if (event.event === "started" || event.event === "progress") {
        setIsDetecting(true);
        setDetectionProgress({
          phase: event.phase,
          processedFiles: event.processedFiles,
          totalFiles: event.totalFiles,
        });
      } else if (event.event === "complete" || event.event === "failed") {
        setIsDetecting(false);
        setDetectionProgress({});
        fetchDuplicates();
      }
    });

    const unsubscribeScan = window.horizon?.scan?.onProgress((event: ScanProgressEvent) => {
      if (event.event === "started") {
        setIsDetecting(true);
      } else if (event.event === "failed" || event.event === "cancelled") {
        setIsDetecting(false);
      }
    });

    return () => {
      unsubscribeDuplicates?.();
      unsubscribeScan?.();
    };
  }, [fetchDuplicates]); // fetchDuplicates is stable (no deps), so this runs only once

  // ── Filter change handler ────────────────────────────────────────────
  const handleFilterChange = useCallback((type: "all" | "exact" | "perceptual" | "embedding") => {
    setFilterType(type);
    filterTypeRef.current = type;
    fetchDuplicates(type);
  }, [fetchDuplicates]);

  // ── Manual detection trigger ──────────────────────────────────────────
  const handleRunDetection = async () => {
    if (isDetecting || !window.horizon?.duplicates) return;
    try {
      setIsDetecting(true);
      await window.horizon.duplicates.start();
    } catch (err) {
      console.error("Failed to trigger duplicate detection:", err);
      setIsDetecting(false);
    }
  };

  const handleToggleFileSelection = useCallback((fileId: number) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }, []);

  const handleSelectKeepFile = useCallback((groupId: number, keepFileId: number) => {
    setGroups((prevGroups) =>
      prevGroups.map((g) => {
        if (g.groupId !== groupId) return g;
        return {
          ...g,
          members: g.members.map((m) => ({ ...m, isRecommendedKeep: m.fileId === keepFileId })),
        };
      })
    );

    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      const targetGroup = groups.find((g) => g.groupId === groupId);
      if (targetGroup) {
        for (const member of targetGroup.members) {
          if (member.fileId === keepFileId) {
            next.delete(member.fileId);
          } else {
            next.add(member.fileId);
          }
        }
      }
      return next;
    });
  }, [groups]);

  // ── Selected file metrics ─────────────────────────────────────────────
  const selectedItemsSummary = useMemo(() => {
    const selectedList: ConfirmationModalItem[] = [];
    let totalBytes = 0;

    for (const group of groups) {
      for (const member of group.members) {
        if (selectedFileIds.has(member.fileId)) {
          totalBytes += member.sizeBytes;
          if (isTrashModalOpen || isArchiveModalOpen) {
            const fileName = member.path.split("/").pop() ?? member.path.split("\\").pop() ?? member.path;
            selectedList.push({
              id: member.fileId,
              name: fileName,
              path: member.path,
              sizeFormatted: formatBytes(member.sizeBytes),
              safetyTier: "safe",
            });
          }
        }
      }
    }

    return { items: selectedList, totalBytes, totalBytesFormatted: formatBytes(totalBytes) };
  }, [groups, selectedFileIds, isTrashModalOpen, isArchiveModalOpen]);

  const handleConfirmTrash = async () => {
    if (selectedFileIds.size === 0 || !window.horizon?.cleanup) return;
    setIsTrashing(true);
    try {
      const idsToTrash = Array.from(selectedFileIds);
      const res = await window.horizon.cleanup.trash(idsToTrash);
      if (res.ok && res.data) {
        setIsTrashModalOpen(false);
        await fetchDuplicates();
      }
    } catch (err) {
      console.error("Failed to trash files:", err);
    } finally {
      setIsTrashing(false);
    }
  };

  const handleConfirmArchive = async () => {
    if (selectedFileIds.size === 0 || !window.horizon?.archive) return;
    setIsArchiving(true);
    try {
      const idsToArchive = Array.from(selectedFileIds);
      const res = await window.horizon.archive.create(idsToArchive);
      if (res.ok && res.data) {
        setIsArchiveModalOpen(false);
        await fetchDuplicates();
      }
    } catch (err) {
      console.error("Failed to archive duplicate files:", err);
    } finally {
      setIsArchiving(false);
    }
  };

  const selectAllSafely = () => {
    const allRemovable = new Set<number>();
    for (const group of groups) {
      for (const member of group.members) {
        if (!member.isRecommendedKeep) allRemovable.add(member.fileId);
      }
    }
    setSelectedFileIds(allRemovable);
  };

  const deselectAll = () => setSelectedFileIds(new Set());

  const totalReclaimableBytes = groups.reduce((acc, g) => acc + g.reclaimableBytes, 0);

  // Progress bar percentage
  const progressPct =
    detectionProgress.totalFiles && detectionProgress.totalFiles > 0
      ? Math.round(((detectionProgress.processedFiles ?? 0) / detectionProgress.totalFiles) * 100)
      : 20; // indeterminate fallback

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header Bar */}
      <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-border bg-background px-6">
        <div>
          <h1 className="font-rounded text-title text-text-primary">Duplicates</h1>
          <p className="text-meta text-text-secondary">
            {isDetecting
              ? `Scanning ${detectionProgress.phase ?? "…"} hashes — ${detectionProgress.processedFiles ?? 0} / ${detectionProgress.totalFiles ?? "?"} files`
              : `${groups.length} duplicate groups · ${formatBytes(totalReclaimableBytes)} total reclaimable`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Filter Pills */}
          <div className="flex rounded-md border border-border bg-surface p-1 text-meta">
            {(["all", "exact", "perceptual", "embedding"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => handleFilterChange(type)}
                className={`rounded-xs px-2.5 py-1 transition-colors ${
                  filterType === type
                    ? "bg-surface-secondary text-text-primary font-medium"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {type === "all"
                  ? "All"
                  : type === "exact"
                  ? "Exact Match"
                  : type === "perceptual"
                  ? "Near-Duplicate Images"
                  : "Semantic Documents"}
              </button>
            ))}
          </div>

          <Button
            onClick={handleRunDetection}
            disabled={isDetecting}
            className="flex items-center gap-2 transition-all duration-200"
          >
            <RefreshCw
              className={`h-4 w-4 ${isDetecting ? "animate-spin text-btn-primary-text" : ""}`}
              aria-hidden="true"
            />
            <span>{isDetecting ? "Scanning…" : "Detect Duplicates"}</span>
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Detection Progress Bar */}
        {isDetecting && (
          <div className="rounded-md border border-btn-primary-bg/40 bg-surface p-4 text-meta text-text-primary ring-1 ring-btn-primary-bg/20">
            <div className="flex items-center justify-between pb-2">
              <span className="font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-btn-primary-bg animate-pulse" />
                Running Duplicate Detection ({detectionProgress.phase ?? "indexing"})
              </span>
              <span>
                {detectionProgress.processedFiles ?? 0} / {detectionProgress.totalFiles ?? "…"} files
              </span>
            </div>
            <div className="h-2 w-full rounded-xs bg-storage-free overflow-hidden">
              <div
                className="h-full bg-btn-primary-bg transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Action Summary Banner */}
        <section className="flex items-center justify-between rounded-md border border-border bg-surface p-4">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-secondary text-text-primary">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <p className="text-row font-semibold text-text-primary">
                {selectedFileIds.size} files selected ({selectedItemsSummary.totalBytesFormatted} to reclaim)
              </p>
              <p className="text-meta text-text-secondary">
                Recommended files are automatically preserved. Selected files will be moved safely to Trash.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={selectAllSafely}
              className="flex items-center gap-1.5 rounded-xs px-2.5 py-1.5 text-meta font-medium text-text-secondary hover:bg-surface-secondary hover:text-text-primary transition-colors"
            >
              <CheckSquare className="h-4 w-4" /> Select Recommended
            </button>
            <button
              type="button"
              onClick={deselectAll}
              className="flex items-center gap-1.5 rounded-xs px-2.5 py-1.5 text-meta font-medium text-text-secondary hover:bg-surface-secondary hover:text-text-primary transition-colors"
            >
              <Square className="h-4 w-4" /> Deselect All
            </button>
            <Button
              onClick={() => setIsTrashModalOpen(true)}
              disabled={selectedFileIds.size === 0 || isTrashing}
              className="flex items-center gap-2 bg-tag-danger-bg text-tag-danger-text hover:bg-tag-danger-bg/80"
            >
              <Trash2 className="h-4 w-4" />
              <span>Move Selected to Trash</span>
            </Button>
            <Button
              type="button"
              onClick={() => setIsArchiveModalOpen(true)}
              disabled={selectedFileIds.size === 0 || isArchiving}
              className="flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Archive className="h-4 w-4" />
              <span>Archive</span>
            </Button>
          </div>
        </section>

        {/* Groups List */}
        {isLoading && groups.length === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-lg border border-border bg-surface text-meta text-text-secondary">
            Loading duplicate groups…
          </div>
        ) : groups.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-border bg-surface p-8 text-center">
            <AlertCircle className="h-8 w-8 text-text-tertiary pb-2" />
            <p className="text-row font-semibold text-text-primary">No Duplicate Groups Found</p>
            <p className="mt-1 max-w-sm text-meta text-text-secondary">
              Run a storage scan from the Overview tab or click &quot;Detect Duplicates&quot; above to find duplicate
              files.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group, idx) => (
              <DuplicateGroupCard
                key={group.groupId}
                group={group}
                selectedFileIds={selectedFileIds}
                onToggleFileSelection={handleToggleFileSelection}
                onSelectKeepFile={handleSelectKeepFile}
                defaultExpanded={idx < 5}
              />
            ))}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      <ConfirmationModal
        open={isTrashModalOpen}
        onOpenChange={setIsTrashModalOpen}
        title="Move Selected Duplicates to Trash?"
        description="The selected duplicate files will be moved to your operating system Trash. One file in each group will be preserved."
        items={selectedItemsSummary.items}
        totalBytesFormatted={selectedItemsSummary.totalBytesFormatted}
        confirmLabel="Move to Trash"
        onConfirm={handleConfirmTrash}
        isLoading={isTrashing}
      />
      <ConfirmationModal
        open={isArchiveModalOpen}
        onOpenChange={setIsArchiveModalOpen}
        title="Archive Selected Duplicates?"
        description="The selected duplicate files will be compressed into a verified archive bundle first. Originals move to operating system Trash only after verification succeeds."
        items={selectedItemsSummary.items}
        totalBytesFormatted={selectedItemsSummary.totalBytesFormatted}
        confirmLabel="Create Archive"
        onConfirm={handleConfirmArchive}
        isLoading={isArchiving}
      />
    </div>
  );
});
