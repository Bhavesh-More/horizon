import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  FileArchive,
  FolderOpen,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { Button } from "@horizon/ui";
import {
  ArchiveContentItem,
  ArchiveRecord,
  ArchiveListResponse,
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

function fileName(filePath: string): string {
  return filePath.split("/").pop() ?? filePath.split("\\").pop() ?? filePath;
}

function statusLabel(status: ArchiveRecord["status"]): string {
  if (status === "active") return "Active";
  if (status === "restored") return "Restored";
  return "Deleted";
}

export const ArchiveTab = React.memo(function ArchiveTab() {
  const [data, setData] = useState<ArchiveListResponse>({
    archives: [],
    totalArchives: 0,
    totalOriginalBytes: 0,
    totalArchiveBytes: 0,
  });
  const [selectedArchiveId, setSelectedArchiveId] = useState<number | null>(null);
  const [contents, setContents] = useState<ArchiveContentItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedArchive = useMemo(
    () =>
      data.archives.find((archive) => archive.id === selectedArchiveId) ??
      data.archives[0] ??
      null,
    [data.archives, selectedArchiveId]
  );

  const loadArchives = useCallback(async () => {
    if (!window.horizon?.archive) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await window.horizon.archive.list();
      if (res.ok && res.data) {
        setData(res.data);
        setSelectedArchiveId((current) => {
          if (current && res.data!.archives.some((archive) => archive.id === current)) {
            return current;
          }
          return res.data!.archives[0]?.id ?? null;
        });
      } else {
        setError(res.error?.message || "Failed to load archives");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load archives");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadArchives();
  }, [loadArchives]);

  useEffect(() => {
    if (!selectedArchive || !window.horizon?.archive) {
      setContents([]);
      return;
    }

    let cancelled = false;
    window.horizon.archive.contents(selectedArchive.id).then((res) => {
      if (cancelled) return;
      if (res.ok && res.data) {
        setContents(res.data.contents);
      } else {
        setContents(selectedArchive.contents);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [selectedArchive]);

  const handleRestore = async () => {
    if (!selectedArchive || !window.horizon?.archive || selectedArchive.status !== "active") {
      return;
    }
    setIsRestoring(true);
    setError(null);
    try {
      const res = await window.horizon.archive.restore(selectedArchive.id);
      if (res.ok) {
        await loadArchives();
      } else {
        setError(res.error?.message || "Failed to restore archive");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore archive");
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-border bg-background px-6">
        <div>
          <h1 className="font-rounded text-title text-text-primary">Archive</h1>
          <p className="text-meta text-text-secondary">
            {isLoading
              ? "Loading archive bundles"
              : `${data.totalArchives} bundles · ${formatBytes(
                  data.totalOriginalBytes
                )} original data protected`}
          </p>
        </div>
        <Button
          type="button"
          onClick={loadArchives}
          disabled={isLoading}
          className="inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} aria-hidden="true" />
          Refresh
        </Button>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <section className="mb-4 rounded-md border border-border bg-surface p-4">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-secondary text-text-primary">
              <Archive className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-row font-semibold text-text-primary">
                Compress, verify, then trash originals
              </p>
              <p className="text-meta text-text-secondary">
                Archive bundles stay restorable while original file rows remain in the audit trail.
              </p>
            </div>
          </div>
        </section>

        {error ? (
          <div className="mb-4 rounded-md border border-border bg-surface p-3 text-meta-emphasis text-tag-danger-text">
            {error}
          </div>
        ) : null}

        {isLoading && data.archives.length === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-md border border-border bg-surface text-meta text-text-secondary">
            Loading archives...
          </div>
        ) : data.archives.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-md border border-border bg-surface p-8 text-center">
            <FileArchive className="h-8 w-8 text-text-tertiary" aria-hidden="true" />
            <p className="mt-3 text-row font-semibold text-text-primary">
              No archive bundles yet
            </p>
            <p className="mt-1 max-w-sm text-meta text-text-secondary">
              Select files in Duplicates, Unused Files, or Large Files to create a verified archive bundle.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            <section className="overflow-hidden rounded-md border border-border bg-surface">
              <div className="border-b border-border px-4 py-3">
                <p className="text-row font-semibold text-text-primary">
                  Bundles
                </p>
                <p className="text-meta text-text-secondary">
                  {formatBytes(data.totalArchiveBytes)} stored across archive files
                </p>
              </div>
              <div className="divide-y divide-border">
                {data.archives.map((archive) => {
                  const isSelected = selectedArchive?.id === archive.id;
                  return (
                    <button
                      key={archive.id}
                      type="button"
                      onClick={() => setSelectedArchiveId(archive.id)}
                      className={`flex w-full items-center justify-between px-4 py-3 text-left transition-colors ${
                        isSelected
                          ? "bg-surface-secondary"
                          : "hover:bg-surface-secondary/50"
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-background text-text-secondary">
                          <FileArchive className="h-4 w-4" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-row font-semibold text-text-primary">
                            {fileName(archive.bundlePath)}
                          </p>
                          <p className="truncate text-meta text-text-tertiary">
                            {archive.destinationDir}
                          </p>
                        </div>
                      </div>
                      <div className="ml-4 flex shrink-0 items-center gap-3 text-meta text-text-secondary">
                        <span>{archive.originalFileCount} files</span>
                        <span>{formatBytes(archive.archiveSizeBytes)}</span>
                        <span
                          className={`rounded-xs px-1.5 py-0.5 font-medium ${
                            archive.status === "active"
                              ? "bg-tag-safe-bg text-tag-safe-text"
                              : "bg-tag-unsure-bg text-tag-unsure-text"
                          }`}
                        >
                          {statusLabel(archive.status)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {selectedArchive ? (
              <section className="overflow-hidden rounded-md border border-border bg-surface">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-row font-semibold text-text-primary">
                      {fileName(selectedArchive.bundlePath)}
                    </p>
                    <p className="text-meta text-text-secondary">
                      Created {formatDate(selectedArchive.createdAt)} · {formatBytes(selectedArchive.originalBytes)} original
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={handleRestore}
                    disabled={selectedArchive.status !== "active" || isRestoring}
                    className="inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isRestoring ? (
                      <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
                    )}
                    Restore
                  </Button>
                </div>

                <div className="divide-y divide-border">
                  {contents.length === 0 ? (
                    <div className="flex items-center gap-2 px-4 py-6 text-meta text-text-secondary">
                      <AlertCircle className="h-4 w-4" aria-hidden="true" />
                      No contents found for this archive.
                    </div>
                  ) : (
                    contents.map((item) => (
                      <div key={`${item.fileId}-${item.entryPath}`} className="flex items-center justify-between px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-surface-secondary text-text-secondary">
                            <FolderOpen className="h-4 w-4" aria-hidden="true" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-row font-medium text-text-primary">
                              {fileName(item.originalPath)}
                            </p>
                            <p className="truncate text-meta text-text-tertiary">
                              {item.originalPath}
                            </p>
                          </div>
                        </div>
                        <div className="ml-4 flex shrink-0 items-center gap-3 text-meta text-text-secondary">
                          <span>{item.category}</span>
                          <span className="font-semibold text-text-primary">
                            {formatBytes(item.sizeBytes)}
                          </span>
                          {selectedArchive.status === "restored" ? (
                            <CheckCircle2 className="h-4 w-4 text-tag-safe-text" aria-hidden="true" />
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
});
