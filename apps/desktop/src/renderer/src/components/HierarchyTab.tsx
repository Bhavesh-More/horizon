/**
 * HierarchyTab.tsx
 * Owns: Visual Disk Hierarchy Tree Explorer tab.
 * Upholds:
 * - Interactive collapsible tree matching TreeSize / WizTree layout.
 * - Displays Size, Allocated, Files, Folders, % of Parent bar, Last Modified.
 * - "Safe to clean" badges on known cache/artifact directories.
 * - Drive selector, custom folder picker, and hidden files toggle.
 * - Pure token-based styling compliant with ui-tokens.md & ui-rules.md.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileText,
  FileVideo,
  Folder,
  FolderOpen,
  FolderTree,
  HardDrive,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  HierarchyDiskInfo,
  HierarchyNode,
} from "@horizon/shared-types";
import { Button } from "@horizon/ui";

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 Bytes";
  // Use decimal units (1000) matching macOS Finder / modern OS standard
  const k = 1000;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatNumber(num: number): string {
  return num.toLocaleString();
}

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "—";
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return "—";
  }
}

function getFileIcon(fileName: string, isDirectory: boolean) {
  if (isDirectory) {
    return <Folder className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />;
  }
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext || "")) {
    return <FileImage className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />;
  }
  if (["mp4", "mkv", "mov", "avi", "webm"].includes(ext || "")) {
    return <FileVideo className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />;
  }
  if (["mp3", "wav", "flac", "aac", "ogg"].includes(ext || "")) {
    return <FileAudio className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />;
  }
  if (["zip", "tar", "gz", "7z", "rar", "zst"].includes(ext || "")) {
    return <FileArchive className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />;
  }
  if (["ts", "tsx", "js", "jsx", "py", "rs", "go", "json", "html", "css"].includes(ext || "")) {
    return <FileCode className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />;
  }
  if (["pdf", "txt", "md", "docx", "doc", "rtf"].includes(ext || "")) {
    return <FileText className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />;
  }
  return <File className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />;
}

/** Badge color mapping for clean categories */
function getCleanBadgeClass(category: string | null | undefined): string {
  switch (category) {
    case "cache":
    case "package_cache":
      return "bg-tag-safe-bg text-tag-safe-text";
    case "build_artifact":
      return "bg-tag-check-bg text-tag-check-text";
    case "log":
      return "bg-tag-unsure-bg text-tag-unsure-text";
    case "trash":
      return "bg-tag-danger-bg text-tag-danger-text";
    default:
      return "";
  }
}

export const HierarchyTab: React.FC = React.memo(function HierarchyTab() {
  const [drives, setDrives] = useState<HierarchyDiskInfo[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>("");
  const [showHidden, setShowHidden] = useState<boolean>(() => {
    try {
      return localStorage.getItem("horizon_allow_hidden_files") === "true";
    } catch {
      return false;
    }
  });
  const [rootNode, setRootNode] = useState<HierarchyNode | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isPickingFolder, setIsPickingFolder] = useState<boolean>(false);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [loadedChildrenMap, setLoadedChildrenMap] = useState<Map<string, HierarchyNode[]>>(new Map());
  const [loadingNodePaths, setLoadingNodePaths] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Initial drive discovery
  const loadDrives = useCallback(async () => {
    if (!window.horizon?.hierarchy) return;
    try {
      const res = await window.horizon.hierarchy.listDrives();
      if (res.ok && res.data) {
        setDrives(res.data.drives);
        if (!selectedPath) {
          const initial = res.data.defaultPath || res.data.drives[0]?.path || "/";
          setSelectedPath(initial);
        }
      }
    } catch (err: any) {
      console.error("Failed to list drives:", err);
    }
  }, [selectedPath]);

  useEffect(() => {
    loadDrives();
  }, [loadDrives]);

  // Scan directory tree for current path
  const scanCurrentPath = useCallback(
    async (pathTarget: string, hidden: boolean) => {
      if (!window.horizon?.hierarchy || !pathTarget) return;
      setIsLoading(true);
      setError(null);
      try {
        const res = await window.horizon.hierarchy.scanDirectory({
          path: pathTarget,
          showHidden: hidden,
          depth: 1,
        });

        if (res.ok && res.data) {
          setRootNode(res.data.root);
          setExpandedPaths(new Set([res.data.root.path]));
          setLoadedChildrenMap(new Map());
        } else {
          setError(res.error?.message || "Failed to scan directory hierarchy.");
        }
      } catch (err: any) {
        setError(err.message || "An unexpected scan error occurred.");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    if (selectedPath) {
      scanCurrentPath(selectedPath, showHidden);
    }
  }, [selectedPath, showHidden, scanCurrentPath]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    scanCurrentPath(selectedPath, showHidden);
  };

  const handlePickCustomFolder = async () => {
    if (!window.horizon?.hierarchy || isPickingFolder) return;
    setIsPickingFolder(true);
    try {
      const res = await window.horizon.hierarchy.pickDirectory();
      if (res.ok && res.data && !res.data.canceled && res.data.selectedPath) {
        setSelectedPath(res.data.selectedPath);
      }
    } catch (err: any) {
      console.error("Failed to pick custom folder:", err);
    } finally {
      setIsPickingFolder(false);
    }
  };

  const handleToggleHidden = () => {
    const nextVal = !showHidden;
    setShowHidden(nextVal);
    try {
      localStorage.setItem("horizon_allow_hidden_files", String(nextVal));
    } catch {}
  };

  const handleToggleNode = async (node: HierarchyNode) => {
    if (!node.isDirectory) return;

    const isExpanded = expandedPaths.has(node.path);
    if (isExpanded) {
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        next.delete(node.path);
        return next;
      });
      return;
    }

    // Expand
    setExpandedPaths((prev) => new Set(prev).add(node.path));

    // If children are already loaded on the node or in loadedChildrenMap, no need to re-fetch
    if (node.children && node.children.length > 0) return;
    if (loadedChildrenMap.has(node.path)) return;

    // Fetch children lazily via du-based scan
    if (!window.horizon?.hierarchy) return;
    setLoadingNodePaths((prev) => new Set(prev).add(node.path));
    try {
      const res = await window.horizon.hierarchy.scanDirectory({
        path: node.path,
        showHidden,
        depth: 1,
      });

      if (res.ok && res.data && res.data.root.children) {
        setLoadedChildrenMap((prev) => {
          const next = new Map(prev);
          next.set(node.path, res.data!.root.children || []);
          return next;
        });
      }
    } catch (err) {
      console.error("Failed to load subfolder children:", err);
    } finally {
      setLoadingNodePaths((prev) => {
        const next = new Set(prev);
        next.delete(node.path);
        return next;
      });
    }
  };

  const handleReveal = (targetPath: string) => {
    if (window.horizon?.system?.showInFolder) {
      window.horizon.system.showInFolder(targetPath);
    }
  };

  // Compute total cleanable bytes from visible children
  const cleanableBytes = rootNode?.children
    ?.filter((c) => c.cleanCategory)
    .reduce((sum, c) => sum + c.sizeBytes, 0) ?? 0;

  // Recursive flat row renderer with tree depth indentation
  const renderTreeRows = useCallback(
    (node: HierarchyNode, depth: number = 0): React.ReactNode[] => {
      const isExpanded = expandedPaths.has(node.path);
      const isNodeLoading = loadingNodePaths.has(node.path);
      const effectiveChildren = loadedChildrenMap.get(node.path) || node.children || [];

      const rows: React.ReactNode[] = [];

      rows.push(
        <tr
          key={node.path}
          className="group border-b border-border text-row hover:bg-surface-secondary/60 transition-colors"
        >
          {/* Name & Tree Indentation Column */}
          <td className="py-2 pr-4 pl-3">
            <div
              className="flex items-center gap-1.5"
              style={{ paddingLeft: `${depth * 18}px` }}
            >
              {node.isDirectory ? (
                <button
                  type="button"
                  onClick={() => handleToggleNode(node)}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-xs hover:bg-surface text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                  title={isExpanded ? "Collapse folder" : "Expand folder"}
                >
                  {isNodeLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin text-text-secondary" />
                  ) : isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>
              ) : (
                <span className="h-5 w-5 shrink-0" />
              )}

              {getFileIcon(node.name, node.isDirectory)}

              <span
                className={`truncate font-medium ${
                  node.isHidden ? "text-text-tertiary italic" : "text-text-primary"
                }`}
                title={node.path}
              >
                {node.name}
              </span>

              {node.isHidden ? (
                <span className="rounded-xs bg-surface-secondary px-1 py-0.5 text-[10px] text-text-tertiary shrink-0">
                  hidden
                </span>
              ) : null}

              {/* Safe to clean badge */}
              {node.cleanCategory ? (
                <span
                  className={`shrink-0 rounded-xs px-1.5 py-0.5 text-[10px] font-semibold ${getCleanBadgeClass(node.cleanCategory)}`}
                  title={node.cleanLabel || "Safe to clean"}
                >
                  {node.cleanCategory === "trash" ? "🗑 Trash" :
                   node.cleanCategory === "cache" ? "♻ Cache" :
                   node.cleanCategory === "build_artifact" ? "🔨 Build" :
                   node.cleanCategory === "package_cache" ? "📦 Pkg Cache" :
                   node.cleanCategory === "log" ? "📋 Logs" : "Safe to clean"}
                </span>
              ) : null}

              <button
                type="button"
                onClick={() => handleReveal(node.path)}
                className="opacity-0 group-hover:opacity-100 ml-auto rounded-xs px-1.5 py-0.5 text-meta text-text-secondary hover:text-text-primary hover:bg-surface transition-all cursor-pointer shrink-0"
                title="Reveal in Finder/Explorer"
              >
                Reveal
              </button>
            </div>
          </td>

          {/* Size Column */}
          <td className="whitespace-nowrap px-3 py-2 font-semibold text-text-primary">
            {formatBytes(node.sizeBytes)}
          </td>

          {/* Allocated Column */}
          <td className="whitespace-nowrap px-3 py-2 text-text-secondary">
            {formatBytes(node.allocatedBytes)}
          </td>

          {/* Files Column */}
          <td className="whitespace-nowrap px-3 py-2 text-text-secondary text-right">
            {formatNumber(node.fileCount)}
          </td>

          {/* Folders Column */}
          <td className="whitespace-nowrap px-3 py-2 text-text-secondary text-right">
            {node.isDirectory ? formatNumber(node.folderCount) : "0"}
          </td>

          {/* % of Parent Column */}
          <td className="w-36 px-3 py-2">
            <div className="flex items-center gap-2">
              <div className="relative h-4 flex-1 overflow-hidden rounded-xs bg-surface-secondary">
                <div
                  className="h-full bg-btn-primary-bg opacity-85 transition-all duration-300"
                  style={{ width: `${Math.max(0, Math.min(100, node.percentOfParent))}%` }}
                />
              </div>
              <span className="w-11 text-right text-meta font-medium text-text-primary">
                {node.percentOfParent.toFixed(1)}%
              </span>
            </div>
          </td>

          {/* Last Modified Column */}
          <td className="whitespace-nowrap px-3 py-2 text-meta text-text-secondary text-right">
            {formatDate(node.lastModified)}
          </td>
        </tr>
      );

      if (isExpanded && effectiveChildren.length > 0) {
        for (const child of effectiveChildren) {
          rows.push(...renderTreeRows(child, depth + 1));
        }
      }

      return rows;
    },
    [expandedPaths, loadedChildrenMap, loadingNodePaths, showHidden]
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header Toolbar */}
      <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-border bg-background px-6">
        <div>
          <h1 className="font-rounded text-title text-text-primary">
            Disk Hierarchy
          </h1>
          <p className="text-meta text-text-secondary">
            Collapsible visual tree explorer of disk and folder space usage
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Drive / Root Selector Dropdown */}
          <div className="flex items-center gap-1.5 rounded-sm border border-border bg-surface px-2.5 py-1.5 text-row text-text-primary">
            <HardDrive className="h-4 w-4 text-text-secondary shrink-0" />
            <select
              value={selectedPath}
              onChange={(e) => setSelectedPath(e.target.value)}
              className="bg-transparent text-row text-text-primary focus:outline-hidden cursor-pointer"
            >
              {drives.map((drive) => (
                <option key={drive.id} value={drive.path} className="bg-surface text-text-primary">
                  {drive.name} ({formatBytes(drive.usedBytes)} used)
                </option>
              ))}
            </select>
          </div>

          {/* Browse Folder Button */}
          <Button
            type="button"
            onClick={handlePickCustomFolder}
            disabled={isPickingFolder}
            className="inline-flex items-center gap-1.5 cursor-pointer"
          >
            {isPickingFolder ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FolderOpen className="h-4 w-4" />
            )}
            <span>Browse Folder</span>
          </Button>

          {/* Show Hidden Files Toggle Button */}
          <button
            type="button"
            onClick={handleToggleHidden}
            className={`flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-row transition-colors cursor-pointer ${
              showHidden
                ? "border-tag-check-text bg-tag-check-bg text-tag-check-text font-medium"
                : "border-border bg-surface text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
            }`}
            title="Toggle visibility of hidden dotfiles and system folders"
          >
            {showHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            <span>Hidden Files</span>
          </button>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLoading || isRefreshing}
            className="flex h-9 w-9 items-center justify-center rounded-sm border border-btn-secondary-border bg-surface text-text-primary hover:bg-surface-secondary transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh tree analysis"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-6">
        {/* Selected Root Summary Chip */}
        {rootNode && !isLoading ? (
          <div className="mb-4 flex items-center justify-between rounded-md border border-border bg-surface px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <FolderTree className="h-5 w-5 shrink-0 text-text-secondary" />
              <div className="truncate">
                <p className="text-row font-semibold text-text-primary truncate" title={rootNode.path}>
                  {rootNode.path}
                </p>
                <p className="text-meta text-text-secondary">
                  Disk usage: {formatBytes(rootNode.sizeBytes)} across{" "}
                  {formatNumber(rootNode.fileCount)} files and{" "}
                  {formatNumber(rootNode.folderCount)} folders
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 shrink-0">
              {cleanableBytes > 0 ? (
                <div className="flex items-center gap-1.5 rounded-sm border border-tag-safe-text/30 bg-tag-safe-bg px-3 py-1.5">
                  <Sparkles className="h-4 w-4 text-tag-safe-text" />
                  <span className="text-meta font-semibold text-tag-safe-text">
                    {formatBytes(cleanableBytes)} cleanable
                  </span>
                </div>
              ) : null}
              <span className="text-meta text-text-secondary">
                Allocated: <strong className="text-text-primary">{formatBytes(rootNode.allocatedBytes)}</strong>
              </span>
            </div>
          </div>
        ) : null}

        {/* Error State */}
        {error ? (
          <div className="mb-4 rounded-md border border-tag-danger-bg bg-tag-danger-bg/20 p-4 text-tag-danger-text">
            <p className="text-row font-semibold">Hierarchy analysis failed</p>
            <p className="mt-1 text-meta">{error}</p>
          </div>
        ) : null}

        {/* Tree Table */}
        {isLoading ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center rounded-md border border-border bg-surface p-12 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-text-secondary" />
            <p className="mt-3 text-row font-semibold text-text-primary">
              Analyzing directory hierarchy...
            </p>
            <p className="mt-1 text-meta text-text-secondary">
              Using system disk tools for accurate sizes
            </p>
          </div>
        ) : rootNode ? (
          <div className="overflow-x-auto rounded-md border border-border bg-surface">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-surface-secondary/80 text-meta font-medium text-text-secondary">
                  <th className="py-2.5 pr-4 pl-3">Name</th>
                  <th className="px-3 py-2.5">Size</th>
                  <th className="px-3 py-2.5">Allocated</th>
                  <th className="px-3 py-2.5 text-right">Files</th>
                  <th className="px-3 py-2.5 text-right">Folders</th>
                  <th className="px-3 py-2.5 w-36">% of Parent</th>
                  <th className="px-3 py-2.5 text-right">Last Modified</th>
                </tr>
              </thead>
              <tbody>{renderTreeRows(rootNode)}</tbody>
            </table>
          </div>
        ) : (
          <div className="flex min-h-[300px] flex-col items-center justify-center rounded-md border border-border bg-surface p-12 text-center">
            <FolderTree className="h-8 w-8 text-text-secondary" />
            <p className="mt-3 text-row font-semibold text-text-primary">
              No directory selected
            </p>
            <p className="mt-1 text-meta text-text-secondary">
              Choose a disk drive or click "Browse Folder" to start hierarchy exploration.
            </p>
          </div>
        )}
      </main>
    </div>
  );
});
