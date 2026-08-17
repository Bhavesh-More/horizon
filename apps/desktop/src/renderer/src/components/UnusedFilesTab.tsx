import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Trash2,
  Archive,
  Layers3,
  CheckSquare,
  Square,
  AlertCircle,
  Calendar,
  Filter,
} from "lucide-react";
import { Button, ConfirmationModal, ConfirmationModalItem } from "@horizon/ui";
import {
  FileCategory,
  UnusedFileGroup,
  UnusedFilesListResponse,
  ScanProgressEvent,
} from "@horizon/shared-types";
import { UnusedFileCategoryCard } from "./UnusedFileCategoryCard";

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

const CATEGORY_OPTIONS: { id: "all" | FileCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "document", label: "Documents" },
  { id: "video", label: "Videos" },
  { id: "image", label: "Images" },
  { id: "audio", label: "Audio" },
  { id: "archive", label: "Archives" },
  { id: "dev_artifact", label: "Dev Artifacts" },
  { id: "other", label: "Other" },
];

export const UnusedFilesTab = React.memo(function UnusedFilesTab() {
  const [data, setData] = useState<UnusedFilesListResponse>({
    groups: [],
    totalFiles: 0,
    totalReclaimableBytes: 0,
  });
  const [thresholdDays, setThresholdDays] = useState<number>(180);
  const [selectedCategory, setSelectedCategory] = useState<"all" | FileCategory>("all");
  const [isLoading, setIsLoading] = useState(false);

  // Multi-select state
  const [selectedFileIds, setSelectedFileIds] = useState<Set<number>>(new Set());

  // Modal state
  const [isTrashModalOpen, setIsTrashModalOpen] = useState(false);
  const [isTrashing, setIsTrashing] = useState(false);

  // Keep refs for active filters so async callbacks don't have stale closures
  const thresholdRef = useRef(thresholdDays);
  useEffect(() => {
    thresholdRef.current = thresholdDays;
  }, [thresholdDays]);

  const categoryRef = useRef(selectedCategory);
  useEffect(() => {
    categoryRef.current = selectedCategory;
  }, [selectedCategory]);

  // Fetch unused files from main process
  const fetchUnusedFiles = useCallback(
    async (overrideDays?: number, overrideCategory?: "all" | FileCategory) => {
      if (!window.horizon?.unusedFiles) return;
      const days = overrideDays ?? thresholdRef.current;
      const cat = overrideCategory ?? categoryRef.current;

      setIsLoading(true);
      try {
        const res = await window.horizon.unusedFiles.list(
          days,
          cat === "all" ? undefined : cat
        );
        if (res.ok && res.data) {
          setData(res.data);
          // Keep only selections that still exist in the new data
          const allNewIds = new Set(
            res.data.groups.flatMap((g) => g.files.map((f) => f.fileId))
          );
          setSelectedFileIds((prev) => {
            const next = new Set<number>();
            for (const id of prev) {
              if (allNewIds.has(id)) next.add(id);
            }
            return next;
          });
        }
      } catch (err) {
        console.error("Failed to load unused files:", err);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Initial load on mount and subscribe to scan progress
  useEffect(() => {
    fetchUnusedFiles();

    const unsubscribeScan = window.horizon?.scan?.onProgress(
      (event: ScanProgressEvent) => {
        if (event.event === "complete") {
          fetchUnusedFiles();
        }
      }
    );

    return () => {
      unsubscribeScan?.();
    };
  }, [fetchUnusedFiles]);

  // Debounced threshold slider handler
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleThresholdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setThresholdDays(val);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      fetchUnusedFiles(val, selectedCategory);
    }, 250);
  };

  // Category filter handler
  const handleCategoryChange = (cat: "all" | FileCategory) => {
    setSelectedCategory(cat);
    fetchUnusedFiles(thresholdDays, cat);
  };

  // Toggle single file selection
  const handleToggleFile = useCallback((fileId: number) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }, []);

  // Toggle group selection
  const handleToggleGroup = useCallback((fileIds: number[], select: boolean) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      for (const id of fileIds) {
        if (select) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  // Select all / Deselect all
  const handleSelectAll = () => {
    const allIds = new Set(
      data.groups.flatMap((g) => g.files.map((f) => f.fileId))
    );
    setSelectedFileIds(allIds);
  };

  const handleDeselectAll = () => {
    setSelectedFileIds(new Set());
  };

  // Summary of selected items for action banner & modal
  const selectedItemsSummary = useMemo(() => {
    const selectedList: ConfirmationModalItem[] = [];
    let totalBytes = 0;

    for (const group of data.groups) {
      for (const file of group.files) {
        if (selectedFileIds.has(file.fileId)) {
          totalBytes += file.sizeBytes;
          if (isTrashModalOpen) {
            const fileName =
              file.path.split("/").pop() ??
              file.path.split("\\").pop() ??
              file.path;
            selectedList.push({
              id: file.fileId,
              name: fileName,
              path: file.path,
              sizeFormatted: formatBytes(file.sizeBytes),
              safetyTier: "safe",
            });
          }
        }
      }
    }

    return {
      items: selectedList,
      totalBytes,
      totalBytesFormatted: formatBytes(totalBytes),
    };
  }, [data.groups, selectedFileIds, isTrashModalOpen]);

  // Execute trash cleanup via Phase 2 deletion safety core
  const handleConfirmTrash = async () => {
    if (selectedFileIds.size === 0 || !window.horizon?.cleanup) return;
    setIsTrashing(true);
    try {
      const idsToTrash = Array.from(selectedFileIds);
      const res = await window.horizon.cleanup.trash(idsToTrash);
      if (res.ok && res.data) {
        setIsTrashModalOpen(false);
        setSelectedFileIds(new Set());
        await fetchUnusedFiles();
      }
    } catch (err) {
      console.error("Failed to trash unused files:", err);
    } finally {
      setIsTrashing(false);
    }
  };

  const monthsEstimate = Math.round(thresholdDays / 30);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header Bar */}
      <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-border bg-background px-6">
        <div>
          <h1 className="font-rounded text-title text-text-primary">
            Unused Files
          </h1>
          <p className="text-meta text-text-secondary">
            {isLoading
              ? "Scanning staleness index…"
              : `${data.totalFiles} files untouched for >${thresholdDays} days · ${formatBytes(
                  data.totalReclaimableBytes
                )} reclaimable`}
          </p>
        </div>

        {/* Staleness Slider Controls */}
        <div className="flex items-center gap-4 rounded-md border border-border bg-surface px-3 py-1.5">
          <div className="flex items-center gap-2 text-meta text-text-secondary">
            <Calendar className="h-4 w-4 text-text-tertiary" />
            <span className="font-medium text-text-primary">
              {thresholdDays} days
            </span>
            <span className="text-text-tertiary">
              (~{monthsEstimate} {monthsEstimate === 1 ? "month" : "months"})
            </span>
          </div>

          <input
            type="range"
            min="30"
            max="730"
            step="30"
            value={thresholdDays}
            onChange={handleThresholdChange}
            className="h-1.5 w-32 cursor-pointer appearance-none rounded-lg bg-storage-free accent-btn-primary-bg"
            title="Adjust staleness threshold in days"
          />
        </div>
      </header>

      {/* Filter Chips Bar */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border bg-surface px-6 py-2 overflow-x-auto text-meta">
        <Filter className="h-3.5 w-3.5 mr-1 text-text-tertiary shrink-0" />
        {CATEGORY_OPTIONS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => handleCategoryChange(id)}
            className={`rounded-xs px-2.5 py-1 transition-colors whitespace-nowrap cursor-pointer ${
              selectedCategory === id
                ? "bg-surface-secondary text-text-primary font-medium"
                : "text-text-secondary hover:text-text-primary hover:bg-surface-secondary/50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Action Summary Banner */}
        <section className="flex items-center justify-between rounded-md border border-border bg-surface p-4">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-secondary text-text-primary">
              <Layers3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-row font-semibold text-text-primary">
                {selectedFileIds.size} files selected (
                {selectedItemsSummary.totalBytesFormatted} to reclaim)
              </p>
              <p className="text-meta text-text-secondary">
                Selected files can be moved safely to Trash or archived.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSelectAll}
              className="flex items-center gap-1.5 rounded-xs px-2.5 py-1.5 text-meta font-medium text-text-secondary hover:bg-surface-secondary hover:text-text-primary transition-colors cursor-pointer"
            >
              <CheckSquare className="h-4 w-4" /> Select All
            </button>
            <button
              type="button"
              onClick={handleDeselectAll}
              className="flex items-center gap-1.5 rounded-xs px-2.5 py-1.5 text-meta font-medium text-text-secondary hover:bg-surface-secondary hover:text-text-primary transition-colors cursor-pointer"
            >
              <Square className="h-4 w-4" /> Deselect All
            </button>

            {/* Move to Trash Button */}
            <Button
              onClick={() => setIsTrashModalOpen(true)}
              disabled={selectedFileIds.size === 0 || isTrashing}
              className="flex items-center gap-2 bg-tag-danger-bg text-tag-danger-text hover:bg-tag-danger-bg/80 cursor-pointer"
            >
              <Trash2 className="h-4 w-4" />
              <span>Move to Trash</span>
            </Button>

            {/* Archive Button (Stubbed until Phase 11) */}
            <button
              type="button"
              disabled
              title="Archiving will be available in Phase 11 (Archive bundle support)"
              className="flex items-center gap-1.5 rounded-xs px-3 py-1.5 text-meta font-medium text-text-tertiary bg-surface-secondary opacity-60 cursor-not-allowed border border-border"
            >
              <Archive className="h-4 w-4" />
              <span>Archive</span>
            </button>
          </div>
        </section>

        {/* Grouped Category Cards */}
        {isLoading && data.groups.length === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-lg border border-border bg-surface text-meta text-text-secondary">
            Loading unused files…
          </div>
        ) : data.groups.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-border bg-surface p-8 text-center">
            <AlertCircle className="h-8 w-8 text-text-tertiary pb-2" />
            <p className="text-row font-semibold text-text-primary">
              No Unused Files Found
            </p>
            <p className="mt-1 max-w-sm text-meta text-text-secondary">
              No files untouched for more than {thresholdDays} days were found.
              Try reducing the staleness slider or run a storage scan from the
              Overview tab.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {data.groups.map((group, idx) => (
              <UnusedFileCategoryCard
                key={group.category}
                group={group}
                selectedFileIds={selectedFileIds}
                onToggleFile={handleToggleFile}
                onToggleGroup={handleToggleGroup}
                defaultExpanded={idx < 4}
              />
            ))}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      <ConfirmationModal
        open={isTrashModalOpen}
        onOpenChange={setIsTrashModalOpen}
        title="Move Selected Unused Files to Trash?"
        description="The selected unused files will be moved safely to your operating system Trash. You can recover them from Trash at any time."
        items={selectedItemsSummary.items}
        totalBytesFormatted={selectedItemsSummary.totalBytesFormatted}
        confirmLabel="Move to Trash"
        onConfirm={handleConfirmTrash}
        isLoading={isTrashing}
      />
    </div>
  );
});
