import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Trash2,
  Archive,
  HardDriveDownload,
  CheckSquare,
  Square,
  AlertCircle,
  Filter,
  ArrowUpDown,
  FolderOpen,
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  Archive as ArchiveIcon,
  Code2,
  File,
  Clock,
} from "lucide-react";
import { Button, ConfirmationModal, ConfirmationModalItem } from "@horizon/ui";
import {
  FileCategory,
  LargeFileItem,
  LargeFilesListResponse,
  ScanProgressEvent,
} from "@horizon/shared-types";

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDate(isoString?: string | null): string {
  if (!isoString) return "Unknown";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return isoString;
  }
}

const SIZE_PRESETS: { label: string; bytes: number }[] = [
  { label: "5 MB+", bytes: 5 * 1024 * 1024 },
  { label: "50 MB+", bytes: 50 * 1024 * 1024 },
  { label: "100 MB+", bytes: 100 * 1024 * 1024 },
  { label: "500 MB+", bytes: 500 * 1024 * 1024 },
  { label: "1 GB+", bytes: 1024 * 1024 * 1024 },
];

const CATEGORY_OPTIONS: { id: "all" | FileCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "video", label: "Videos" },
  { id: "archive", label: "Archives" },
  { id: "document", label: "Documents" },
  { id: "image", label: "Images" },
  { id: "audio", label: "Audio" },
  { id: "dev_artifact", label: "Dev Artifacts" },
  { id: "other", label: "Other" },
];

const CATEGORY_ICONS: Record<
  FileCategory,
  React.ComponentType<{ className?: string }>
> = {
  document: FileText,
  image: ImageIcon,
  video: Film,
  audio: Music,
  archive: ArchiveIcon,
  dev_artifact: Code2,
  other: File,
};

export const LargeFilesTab = React.memo(function LargeFilesTab() {
  const [data, setData] = useState<LargeFilesListResponse>({
    files: [],
    totalFiles: 0,
    totalSizeBytes: 0,
  });
  const [minSizeBytes, setMinSizeBytes] = useState<number>(50 * 1024 * 1024); // 50 MB default
  const [selectedCategory, setSelectedCategory] = useState<"all" | FileCategory>("all");
  const [sortBy, setSortBy] = useState<"size" | "date" | "name">("size");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [isLoading, setIsLoading] = useState(false);

  // Multi-select state
  const [selectedFileIds, setSelectedFileIds] = useState<Set<number>>(new Set());

  // Modal state
  const [isTrashModalOpen, setIsTrashModalOpen] = useState(false);
  const [isTrashing, setIsTrashing] = useState(false);

  // Refs for current state to prevent stale closures in async handlers
  const minSizeRef = useRef(minSizeBytes);
  useEffect(() => {
    minSizeRef.current = minSizeBytes;
  }, [minSizeBytes]);

  const categoryRef = useRef(selectedCategory);
  useEffect(() => {
    categoryRef.current = selectedCategory;
  }, [selectedCategory]);

  const sortByRef = useRef(sortBy);
  useEffect(() => {
    sortByRef.current = sortBy;
  }, [sortBy]);

  const sortOrderRef = useRef(sortOrder);
  useEffect(() => {
    sortOrderRef.current = sortOrder;
  }, [sortOrder]);

  // Fetch large files from main process
  const fetchLargeFiles = useCallback(
    async (
      overrideMinSize?: number,
      overrideCategory?: "all" | FileCategory,
      overrideSortBy?: "size" | "date" | "name",
      overrideSortOrder?: "asc" | "desc"
    ) => {
      if (!window.horizon?.largeFiles) return;
      const minSize = overrideMinSize ?? minSizeRef.current;
      const cat = overrideCategory ?? categoryRef.current;
      const sort = overrideSortBy ?? sortByRef.current;
      const order = overrideSortOrder ?? sortOrderRef.current;

      setIsLoading(true);
      try {
        const res = await window.horizon.largeFiles.list({
          minSizeBytes: minSize,
          category: cat === "all" ? undefined : cat,
          sortBy: sort,
          sortOrder: order,
        });

        if (res.ok && res.data) {
          setData(res.data);
          // Retain only selected IDs that still exist in the new dataset
          const currentIds = new Set(res.data.files.map((f: { fileId: number }) => f.fileId));
          setSelectedFileIds((prev) => {
            const next = new Set<number>();
            for (const id of prev) {
              if (currentIds.has(id)) next.add(id);
            }
            return next;
          });
        }
      } catch (err) {
        console.error("Failed to load large files:", err);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Initial load and scan listener
  useEffect(() => {
    fetchLargeFiles();

    const unsubscribeScan = window.horizon?.scan?.onProgress(
      (event: ScanProgressEvent) => {
        if (event.event === "complete") {
          fetchLargeFiles();
        }
      }
    );

    return () => {
      unsubscribeScan?.();
    };
  }, [fetchLargeFiles]);

  // Filter change handlers
  const handleSizePresetChange = (bytes: number) => {
    setMinSizeBytes(bytes);
    fetchLargeFiles(bytes, selectedCategory, sortBy, sortOrder);
  };

  const handleCategoryChange = (cat: "all" | FileCategory) => {
    setSelectedCategory(cat);
    fetchLargeFiles(minSizeBytes, cat, sortBy, sortOrder);
  };

  const handleSortChange = (newSortBy: "size" | "date" | "name") => {
    let newOrder: "asc" | "desc" = "desc";
    if (newSortBy === sortBy) {
      newOrder = sortOrder === "desc" ? "asc" : "desc";
    } else if (newSortBy === "name") {
      newOrder = "asc";
    }

    setSortBy(newSortBy);
    setSortOrder(newOrder);
    fetchLargeFiles(minSizeBytes, selectedCategory, newSortBy, newOrder);
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

  // Select all / Deselect all
  const handleSelectAll = () => {
    const allIds = new Set(data.files.map((f) => f.fileId));
    setSelectedFileIds(allIds);
  };

  const handleDeselectAll = () => {
    setSelectedFileIds(new Set());
  };

  // Reveal file in OS Finder / Explorer
  const handleRevealInFolder = async (e: React.MouseEvent, filePath: string) => {
    e.stopPropagation();
    if (!window.horizon?.system) return;
    try {
      await window.horizon.system.showInFolder(filePath);
    } catch (err) {
      console.error("Failed to reveal file in folder:", err);
    }
  };

  // Summary of selected items for action banner & modal
  const selectedItemsSummary = useMemo(() => {
    const selectedList: ConfirmationModalItem[] = [];
    let totalBytes = 0;

    for (const file of data.files) {
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

    return {
      items: selectedList,
      totalBytes,
      totalBytesFormatted: formatBytes(totalBytes),
    };
  }, [data.files, selectedFileIds, isTrashModalOpen]);

  // Execute trash cleanup
  const handleConfirmTrash = async () => {
    if (selectedFileIds.size === 0 || !window.horizon?.cleanup) return;
    setIsTrashing(true);
    try {
      const idsToTrash = Array.from(selectedFileIds);
      const res = await window.horizon.cleanup.trash(idsToTrash);
      if (res.ok && res.data) {
        setIsTrashModalOpen(false);
        setSelectedFileIds(new Set());
        await fetchLargeFiles();
      }
    } catch (err) {
      console.error("Failed to trash large files:", err);
    } finally {
      setIsTrashing(false);
    }
  };

  const activePreset =
    SIZE_PRESETS.find((p) => p.bytes === minSizeBytes)?.label ??
    formatBytes(minSizeBytes);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header Bar */}
      <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-border bg-background px-6">
        <div>
          <h1 className="font-rounded text-title text-text-primary">
            Large Files
          </h1>
          <p className="text-meta text-text-secondary">
            {isLoading
              ? "Loading large files…"
              : `${data.totalFiles} files >= ${activePreset} · ${formatBytes(
                  data.totalSizeBytes
                )} total space`}
          </p>
        </div>

        {/* Size Preset Pills */}
        <div className="flex items-center gap-1 rounded-md border border-border bg-surface p-1 text-meta">
          {SIZE_PRESETS.map((preset) => (
            <button
              key={preset.bytes}
              type="button"
              onClick={() => handleSizePresetChange(preset.bytes)}
              className={`rounded-xs px-2.5 py-1 transition-colors cursor-pointer ${
                minSizeBytes === preset.bytes
                  ? "bg-surface-secondary text-text-primary font-medium"
                  : "text-text-secondary hover:text-text-primary hover:bg-surface-secondary/40"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </header>

      {/* Filter & Sort Bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-6 py-2 text-meta">
        {/* Category Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
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

        {/* Sort Controls */}
        <div className="flex items-center gap-1 shrink-0 pl-4">
          <span className="text-text-tertiary flex items-center gap-1 mr-1">
            <ArrowUpDown className="h-3.5 w-3.5" /> Sort:
          </span>
          {(["size", "date", "name"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleSortChange(s)}
              className={`rounded-xs px-2 py-1 transition-colors cursor-pointer ${
                sortBy === s
                  ? "bg-surface-secondary text-text-primary font-medium"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {s === "size"
                ? `Size ${sortBy === "size" ? (sortOrder === "desc" ? "↓" : "↑") : ""}`
                : s === "date"
                ? `Date ${sortBy === "date" ? (sortOrder === "desc" ? "↓" : "↑") : ""}`
                : `Name ${sortBy === "name" ? (sortOrder === "asc" ? "↓" : "↑") : ""}`}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Action Summary Banner */}
        <section className="flex items-center justify-between rounded-md border border-border bg-surface p-4">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-secondary text-text-primary">
              <HardDriveDownload className="h-5 w-5" />
            </div>
            <div>
              <p className="text-row font-semibold text-text-primary">
                {selectedFileIds.size} files selected (
                {selectedItemsSummary.totalBytesFormatted} to reclaim)
              </p>
              <p className="text-meta text-text-secondary">
                Select files to move to Trash or Archive.
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

        {/* Large Files List Card */}
        {isLoading && data.files.length === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-lg border border-border bg-surface text-meta text-text-secondary">
            Loading large files…
          </div>
        ) : data.files.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-border bg-surface p-8 text-center">
            <AlertCircle className="h-8 w-8 text-text-tertiary pb-2" />
            <p className="text-row font-semibold text-text-primary">
              No Large Files Found
            </p>
            <p className="mt-1 max-w-sm text-meta text-text-secondary">
              No files matching size &gt;= {activePreset} were found in the current
              category. Try choosing a smaller size preset or run a storage scan
              from Overview.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-border bg-surface">
            <div className="divide-y divide-border">
              {data.files.map((file) => {
                const isSelected = selectedFileIds.has(file.fileId);
                const Icon = CATEGORY_ICONS[file.category] || File;
                const fileName =
                  file.path.split("/").pop() ??
                  file.path.split("\\").pop() ??
                  file.path;
                const dirPath = file.path.substring(
                  0,
                  file.path.length - fileName.length
                );

                return (
                  <div
                    key={file.fileId}
                    onClick={() => handleToggleFile(file.fileId)}
                    className={`flex cursor-pointer items-center justify-between px-4 py-3 transition-colors ${
                      isSelected
                        ? "bg-surface-secondary/70 hover:bg-surface-secondary"
                        : "hover:bg-surface-secondary/40"
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3 pr-4">
                      {/* Checkbox */}
                      <div
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-xs border transition-colors ${
                          isSelected
                            ? "border-btn-primary-bg bg-btn-primary-bg text-btn-primary-text"
                            : "border-border bg-surface"
                        }`}
                      >
                        {isSelected && (
                          <CheckSquare className="h-3 w-3" aria-hidden="true" />
                        )}
                      </div>

                      {/* Icon */}
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-surface-secondary text-text-secondary">
                        <Icon className="h-4 w-4" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-row font-medium text-text-primary">
                            {fileName}
                          </span>
                          {file.extension && (
                            <span className="shrink-0 rounded-xs bg-surface-secondary px-1.5 py-0.5 text-meta uppercase text-text-secondary">
                              {file.extension}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-meta text-text-tertiary">
                          {dirPath}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-5">
                      <div className="flex items-center gap-1 text-meta text-text-secondary">
                        <Clock className="h-3.5 w-3.5 text-text-tertiary" />
                        <span>
                          {formatDate(file.modifiedAt || file.accessedAt || file.createdAt)}
                        </span>
                      </div>

                      <span className="w-24 text-right text-row font-semibold text-text-primary">
                        {formatBytes(file.sizeBytes)}
                      </span>

                      {/* Reveal in Finder / File Explorer Button */}
                      <button
                        type="button"
                        onClick={(e) => handleRevealInFolder(e, file.path)}
                        title="Reveal in Finder / Explorer"
                        className="flex h-7 w-7 items-center justify-center rounded-xs text-text-tertiary hover:bg-surface-secondary hover:text-text-primary transition-colors cursor-pointer"
                      >
                        <FolderOpen className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      <ConfirmationModal
        open={isTrashModalOpen}
        onOpenChange={setIsTrashModalOpen}
        title="Move Selected Large Files to Trash?"
        description="The selected large files will be moved safely to your operating system Trash. You can recover them from Trash at any time."
        items={selectedItemsSummary.items}
        totalBytesFormatted={selectedItemsSummary.totalBytesFormatted}
        confirmLabel="Move to Trash"
        onConfirm={handleConfirmTrash}
        isLoading={isTrashing}
      />
    </div>
  );
});
