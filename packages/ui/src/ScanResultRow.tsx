import React from "react";
import {
  FileImage,
  FileVideo,
  FileAudio,
  FileText,
  Archive,
  Code2,
  File,
} from "lucide-react";

export interface ScanResultRowProps {
  path: string;
  sizeBytes: number;
  category: "image" | "video" | "audio" | "document" | "archive" | "dev_artifact" | "other" | string;
  extension?: string;
  modifiedAt?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function getCategoryIcon(category: string) {
  switch (category) {
    case "image":
      return FileImage;
    case "video":
      return FileVideo;
    case "audio":
      return FileAudio;
    case "document":
      return FileText;
    case "archive":
      return Archive;
    case "dev_artifact":
      return Code2;
    default:
      return File;
  }
}

export const ScanResultRow = React.memo(function ScanResultRow({
  path,
  sizeBytes,
  category,
  extension,
}: ScanResultRowProps) {
  const Icon = getCategoryIcon(category);
  const fileName = path.split("/").pop() || path.split("\\").pop() || path;

  return (
    <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-2.5 transition-colors hover:bg-surface-secondary">
      <div className="flex min-w-0 flex-1 items-center gap-3 pr-4">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xs bg-surface-secondary text-text-secondary">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-row font-medium text-text-primary">
            {fileName}
          </p>
          <p className="truncate text-meta text-text-tertiary">{path}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {extension && (
          <span className="rounded-xs bg-surface-secondary px-1.5 py-0.5 text-meta uppercase text-text-secondary">
            {extension.replace(".", "")}
          </span>
        )}
        <span className="text-meta-emphasis text-text-primary font-semibold">
          {formatBytes(sizeBytes)}
        </span>
      </div>
    </div>
  );
});
