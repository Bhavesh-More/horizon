import React, { useState } from "react";
import { ChevronDown, ChevronRight, Check, Sparkles, Files, Image as ImageIcon } from "lucide-react";
import { SafetyTagPill, SafetyTier } from "@horizon/ui";
import { DuplicateGroup, DuplicateGroupMember } from "@horizon/shared-types";

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

interface DuplicateGroupCardProps {
  group: DuplicateGroup;
  selectedFileIds: Set<number>;
  onToggleFileSelection: (fileId: number) => void;
  onSelectKeepFile: (groupId: number, keepFileId: number) => void;
  defaultExpanded?: boolean;
}

export const DuplicateGroupCard = React.memo(
  function DuplicateGroupCard({
    group,
    selectedFileIds,
    onToggleFileSelection,
    onSelectKeepFile,
    defaultExpanded = true,
  }: DuplicateGroupCardProps) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    const isExact = group.hashType === "exact";
    const Icon = isExact ? Files : ImageIcon;

    return (
      <div className="overflow-hidden rounded-md border border-border bg-surface [content-visibility:auto] [contain-intrinsic-size:0_80px] transition-colors duration-150 hover:border-border/80">
        {/* Group Header */}
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
              <Icon className="h-4 w-4" aria-hidden="true" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-row font-semibold text-text-primary">
                  {isExact ? "Exact Match Group" : "Near-Duplicate Group"}
                </span>
                <span className="rounded-xs bg-surface-secondary px-1.5 py-0.5 text-meta font-medium uppercase text-text-secondary">
                  {group.hashType}
                </span>
                {!isExact && group.members.length > 0 && (
                  <span className="flex items-center gap-1 rounded-xs bg-tag-check-bg px-1.5 py-0.5 text-meta font-medium text-tag-check-text">
                    <Sparkles className="h-3 w-3" />
                    {Math.round((group.members[1]?.similarityScore || 0.95) * 100)}% visual similarity
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-meta text-text-tertiary">
                {group.memberCount} files · {formatBytes(group.totalSizeBytes)} total
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-meta font-semibold text-tag-safe-text">
                Save {formatBytes(group.reclaimableBytes)}
              </p>
              <p className="text-meta text-text-tertiary">
                {group.members.filter((m) => selectedFileIds.has(m.fileId)).length} of {group.memberCount} selected for removal
              </p>
            </div>
          </div>
        </div>

        {/* Expanded File Members List */}
        {isExpanded && (
          <div className="border-t border-border divide-y divide-border bg-surface-secondary/40">
            {group.members.map((member: DuplicateGroupMember) => {
              const isSelected = selectedFileIds.has(member.fileId);
              const fileName = member.path.split("/").pop() || member.path.split("\\").pop() || member.path;

              return (
                <div
                  key={member.fileId}
                  className={`flex items-center justify-between px-4 py-3 transition-colors ${
                    member.isRecommendedKeep ? "bg-surface/80" : isSelected ? "bg-tag-danger-bg/10" : "bg-surface/40"
                  }`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3 pr-4">
                    {/* Selection Checkbox */}
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleFileSelection(member.fileId)}
                      disabled={member.isRecommendedKeep}
                      className="h-4 w-4 rounded-xs border-border bg-surface text-btn-primary-bg focus:ring-1 focus:ring-btn-primary-bg disabled:opacity-30 cursor-pointer"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-row font-medium text-text-primary">
                          {fileName}
                        </p>

                        {member.isRecommendedKeep ? (
                          <span className="inline-flex items-center gap-1 rounded-xs bg-tag-safe-bg px-2 py-0.5 text-meta font-medium text-tag-safe-text">
                            <Check className="h-3 w-3" /> Recommended Keep
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onSelectKeepFile(group.groupId, member.fileId)}
                            className="text-meta text-text-tertiary underline hover:text-text-primary"
                          >
                            Make Keep
                          </button>
                        )}
                      </div>
                      <p className="truncate text-meta text-text-tertiary">{member.path}</p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <SafetyTagPill tier="safe" />
                    <span className="text-meta-emphasis font-semibold text-text-primary">
                      {formatBytes(member.sizeBytes)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  },
  (prevProps, nextProps) => {
    if (prevProps.group !== nextProps.group) return false;
    if (prevProps.onToggleFileSelection !== nextProps.onToggleFileSelection) return false;
    if (prevProps.onSelectKeepFile !== nextProps.onSelectKeepFile) return false;

    // Check if selection state of any member belonging to this specific group changed
    for (const member of nextProps.group.members) {
      if (prevProps.selectedFileIds.has(member.fileId) !== nextProps.selectedFileIds.has(member.fileId)) {
        return false;
      }
    }
    return true;
  }
);
