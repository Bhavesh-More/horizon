import React, { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  Archive as ArchiveIcon,
  Code2,
  File,
  CheckSquare,
  Square,
  Clock,
} from "lucide-react";
import { FileCategory, UnusedFileGroup } from "@horizon/shared-types";

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDate(isoString: string): string {
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

const CATEGORY_META: Record<
  FileCategory,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  document: { label: "Documents", icon: FileText },
  image: { label: "Images", icon: ImageIcon },
  video: { label: "Videos", icon: Film },
  audio: { label: "Audio", icon: Music },
  archive: { label: "Archives", icon: ArchiveIcon },
  dev_artifact: { label: "Development Artifacts", icon: Code2 },
  other: { label: "Other Files", icon: File },
};

interface UnusedFileCategoryCardProps {
  group: UnusedFileGroup;
  selectedFileIds: Set<number>;
  onToggleFile: (fileId: number) => void;
  onToggleGroup: (fileIds: number[], select: boolean) => void;
  defaultExpanded?: boolean;
}

export const UnusedFileCategoryCard = React.memo(
  function UnusedFileCategoryCard({
    group,
    selectedFileIds,
    onToggleFile,
    onToggleGroup,
    defaultExpanded = true,
  }: UnusedFileCategoryCardProps) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    const meta = CATEGORY_META[group.category] || {
      label: group.category,
      icon: File,
    };
    const CategoryIcon = meta.icon;

    const groupFileIds = group.files.map((f) => f.fileId);
    const selectedCountInGroup = group.files.filter((f) =>
      selectedFileIds.has(f.fileId)
    ).length;
    const allSelected =
      group.files.length > 0 && selectedCountInGroup === group.files.length;
    const someSelected = selectedCountInGroup > 0 && !allSelected;

    const handleGroupToggle = (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleGroup(groupFileIds, !allSelected);
    };

    return (
      <div className="overflow-hidden rounded-md border border-border bg-surface [content-visibility:auto] transition-colors duration-150 hover:border-border/80">
        {/* Card Header */}
        <div
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex cursor-pointer items-center justify-between bg-surface px-4 py-3 transition-colors hover:bg-surface-secondary"
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="flex h-6 w-6 items-center justify-center rounded-xs text-text-tertiary hover:text-text-primary"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              )}
            </button>

            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-surface-secondary text-text-secondary">
              <CategoryIcon className="h-4 w-4" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-row font-semibold text-text-primary">
                  {meta.label}
                </span>
                <span className="rounded-xs bg-surface-secondary px-1.5 py-0.5 text-meta font-medium text-text-secondary">
                  {group.fileCount} {group.fileCount === 1 ? "file" : "files"}
                </span>
                <span className="text-meta font-medium text-text-tertiary">
                  · {formatBytes(group.totalSizeBytes)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-meta font-medium text-text-secondary">
                {selectedCountInGroup} of {group.fileCount} selected
              </p>
            </div>

            <button
              type="button"
              onClick={handleGroupToggle}
              className="flex items-center gap-1.5 rounded-xs px-2 py-1 text-meta font-medium text-text-secondary hover:bg-background hover:text-text-primary transition-colors"
            >
              {allSelected ? (
                <>
                  <CheckSquare className="h-3.5 w-3.5 text-text-primary" />
                  <span>Deselect</span>
                </>
              ) : someSelected ? (
                <>
                  <CheckSquare className="h-3.5 w-3.5 text-text-secondary" />
                  <span>Select All</span>
                </>
              ) : (
                <>
                  <Square className="h-3.5 w-3.5 text-text-tertiary" />
                  <span>Select All</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* File Rows */}
        {isExpanded && (
          <div className="divide-y divide-border border-t border-border bg-background">
            {group.files.map((file) => {
              const isSelected = selectedFileIds.has(file.fileId);
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
                  onClick={() => onToggleFile(file.fileId)}
                  className={`flex cursor-pointer items-center justify-between px-4 py-2.5 transition-colors ${
                    isSelected
                      ? "bg-surface-secondary/70 hover:bg-surface-secondary"
                      : "hover:bg-surface"
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

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-row font-medium text-text-primary">
                          {fileName}
                        </span>
                        {file.usedFallback && (
                          <span
                            title="File system access time was not available; last modified date was used as fallback."
                            className="shrink-0 rounded-xs bg-tag-unsure-bg px-1.5 py-0.5 text-meta text-tag-unsure-text"
                          >
                            Modified date (fallback)
                          </span>
                        )}
                      </div>
                      <p className="truncate text-meta text-text-tertiary">
                        {dirPath}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-6">
                    <div className="flex items-center gap-1 text-meta text-text-secondary">
                      <Clock className="h-3.5 w-3.5 text-text-tertiary" />
                      <span>
                        {file.usedFallback ? "Modified: " : "Accessed: "}
                        {formatDate(file.lastActivity)}
                      </span>
                    </div>

                    <span className="w-20 text-right text-row font-medium text-text-primary">
                      {formatBytes(file.sizeBytes)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }
);
