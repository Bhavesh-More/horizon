import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FolderOpen,
  HardDrive,
  Loader2,
  LockKeyhole,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@horizon/ui";
import {
  AiProviderStatusResponse,
  OnboardingState,
  ScanProgressEvent,
  ScanSummary,
} from "@horizon/shared-types";

type OnboardingStep = "welcome" | "permissions" | "ai" | "scope" | "scan" | "summary";

interface FirstRunGateProps {
  onComplete: () => void;
}

const STEPS: Array<{ id: OnboardingStep; label: string }> = [
  { id: "welcome", label: "Welcome" },
  { id: "permissions", label: "Folders" },
  { id: "ai", label: "AI" },
  { id: "scope", label: "Scope" },
  { id: "scan", label: "Scan" },
  { id: "summary", label: "Done" },
];

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function displayPath(pathValue: string): string {
  const parts = pathValue.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : pathValue;
}

export const FirstRunGate = React.memo(function FirstRunGate({
  onComplete,
}: FirstRunGateProps) {
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [scanScope, setScanScope] = useState<string[]>([]);
  const [providerStatus, setProviderStatus] = useState<AiProviderStatusResponse | null>(null);
  const [aiProviderSkipped, setAiProviderSkipped] = useState(false);
  const [allowHiddenFiles, setAllowHiddenFiles] = useState<boolean>(() => {
    try {
      return localStorage.getItem("horizon_allow_hidden_files") === "true";
    } catch {
      return false;
    }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isPickingFolders, setIsPickingFolders] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [scanSummary, setScanSummary] = useState<ScanSummary | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ files: 0, bytes: 0 });

  const activeStepIndex = STEPS.findIndex((item) => item.id === step);
  const activeProvider = providerStatus?.providers.find(
    (provider) => provider.providerName === providerStatus.activeProvider
  );

  const canContinueFromScope = scanScope.length > 0;

  const scopePreview = useMemo(
    () => scanScope.map((item) => ({ path: item, label: displayPath(item) })),
    [scanScope]
  );

  useEffect(() => {
    let isMounted = true;

    async function loadState() {
      try {
        const [settingsResult, providerResult] = await Promise.all([
          window.horizon.settings.getOnboardingState(),
          window.horizon.aiProvider.getStatus(),
        ]);

        if (!isMounted) return;

        if (settingsResult.ok && settingsResult.data) {
          const state: OnboardingState = settingsResult.data;
          setScanScope(state.scanScope);
          setAiProviderSkipped(state.aiProviderSkipped);
        }

        if (providerResult.ok && providerResult.data) {
          setProviderStatus(providerResult.data);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadState();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!window.horizon?.scan) return;

    const unsubscribe = window.horizon.scan.onProgress((event: ScanProgressEvent) => {
      if (event.event === "started") {
        setIsScanning(true);
        setScanError(null);
        setProgress({ files: 0, bytes: 0 });
        setScanSummary(null);
      } else if ((event.event === "batch" && event.files) || (event.event === "found" && event.file)) {
        const incoming = event.files || (event.file ? [event.file] : []);
        if (incoming.length === 0) return;
        setProgress((current) => ({
          files: current.files + incoming.length,
          bytes:
            current.bytes +
            incoming.reduce((total, item) => total + item.sizeBytes, 0),
        }));
      } else if (event.event === "complete") {
        setIsScanning(false);
        setScanSummary(event.summary ?? null);
        setProgress((current) => ({
          files: event.summary?.totalFiles ?? current.files,
          bytes: event.summary?.totalBytes ?? current.bytes,
        }));
        setStep("summary");
      } else if (event.event === "failed" || event.event === "cancelled") {
        setIsScanning(false);
        setScanError(event.error || "The scan did not finish. Choose a smaller folder set and try again.");
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  const addScopePaths = useCallback((paths: string[]) => {
    setScanScope((current) =>
      Array.from(new Set([...current, ...paths].filter(Boolean))).slice(0, 20)
    );
  }, []);

  const handlePickFolders = async () => {
    setIsPickingFolders(true);
    try {
      const result = await window.horizon.settings.requestScanScope();
      if (result.ok && result.data?.paths.length) {
        addScopePaths(result.data.paths);
      }
    } finally {
      setIsPickingFolders(false);
    }
  };

  const handleRemoveScope = (pathValue: string) => {
    setScanScope((current) => current.filter((item) => item !== pathValue));
  };

  const handleUseActiveProvider = async () => {
    if (providerStatus?.activeProvider) {
      await window.horizon.aiProvider.select(providerStatus.activeProvider);
    }
    setAiProviderSkipped(false);
    setStep("scope");
  };

  const handleStartScan = async () => {
    if (isScanning || scanScope.length === 0) return;
    setStep("scan");
    setScanError(null);
    const result = await window.horizon.scan.start(scanScope);
    if (!result.ok) {
      setIsScanning(false);
      setScanError(result.error?.message || "Horizon could not start the first scan.");
    }
  };

  const handleFinish = async () => {
    if (scanScope.length === 0) return;
    setIsCompleting(true);
    try {
      const result = await window.horizon.settings.completeOnboarding(
        scanScope,
        aiProviderSkipped
      );
      if (result.ok) {
        onComplete();
      }
    } finally {
      setIsCompleting(false);
    }
  };

  const renderStep = () => {
    if (isLoading) {
      return (
        <div className="flex h-full items-center justify-center text-text-secondary">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          Loading setup
        </div>
      );
    }

    if (step === "welcome") {
      return (
        <div className="space-y-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-surface-secondary text-btn-primary-bg">
            <HardDrive className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-rounded text-title text-text-primary">
              Set up Horizon
            </h2>
            <p className="mt-2 max-w-lg text-row text-text-secondary">
              Horizon scans the folders you choose, keeps every result local, and
              turns storage data into cleanup, archive, and forecast guidance.
            </p>
          </div>
          <Button onClick={() => setStep("permissions")} className="inline-flex items-center gap-2">
            <span>Start Setup</span>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      );
    }

    if (step === "permissions") {
      return (
        <div className="space-y-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-secondary text-btn-primary-bg">
              <LockKeyhole className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-rounded text-title text-text-primary">
                Choose folders Horizon can scan
              </h2>
              <p className="mt-2 text-row text-text-secondary">
                On macOS, grant Full Disk Access in System Settings if your
                selected folders show permission errors during the first scan.
              </p>
            </div>
          </div>

          {/* Yellow Permission Prompt for Hidden Files */}
          <div className="rounded-md border border-tag-check-text/40 bg-tag-check-bg p-4 text-tag-check-text">
            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-tag-check-text/10 text-tag-check-text mt-0.5">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="hidden-files-permission" className="text-row font-semibold text-tag-check-text cursor-pointer">
                    Scan Hidden Files & System Folders
                  </label>
                  <input
                    id="hidden-files-permission"
                    type="checkbox"
                    checked={allowHiddenFiles}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setAllowHiddenFiles(val);
                      try {
                        localStorage.setItem("horizon_allow_hidden_files", String(val));
                      } catch {}
                    }}
                    className="h-4 w-4 rounded-xs border-tag-check-text accent-btn-primary-bg cursor-pointer"
                  />
                </div>
                <p className="mt-1 text-meta leading-relaxed opacity-90">
                  Allow Horizon to inspect dotfiles (e.g. <code>.config</code>, <code>.cache</code>) and hidden folders.
                </p>
                <p className="mt-2 text-meta font-medium">
                  ⚠️ <strong>Hint:</strong> If not allowed, hidden files cannot be shown in the Hierarchy tree view or cleanup tools.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-border bg-surface p-4">
            <p className="text-row font-semibold text-text-primary">
              Default folders are ready
            </p>
            <p className="mt-1 text-meta text-text-secondary">
              Documents, Desktop, Downloads, Pictures, Movies, and Music are
              selected by default. Add any project or media folders you want
              Horizon to include.
            </p>
            <div className="mt-4 flex items-center gap-3">
              <Button
                onClick={handlePickFolders}
                disabled={isPickingFolders}
                className="inline-flex items-center gap-2"
              >
                {isPickingFolders ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <FolderOpen className="h-4 w-4" aria-hidden="true" />
                )}
                <span>{isPickingFolders ? "Opening Picker" : "Add Folders"}</span>
              </Button>
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.setItem("horizon_allow_hidden_files", String(allowHiddenFiles));
                  } catch {}
                  setStep("ai");
                }}
                className="rounded-sm border border-btn-secondary-border bg-surface px-3 py-2 text-row text-text-primary transition-colors hover:bg-surface-secondary"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (step === "ai") {
      return (
        <div className="space-y-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-secondary text-btn-primary-bg">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-rounded text-title text-text-primary">
                AI recommendations
              </h2>
              <p className="mt-2 text-row text-text-secondary">
                Horizon uses the selected provider only for metadata summaries.
                Local Ollama stays selected by default and cloud providers are
                only used when you configure them yourself.
              </p>
            </div>
          </div>

          <div className="rounded-md border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-row font-semibold text-text-primary">
                  {activeProvider?.displayName ?? "Ollama (Local Default)"}
                </p>
                <p className="mt-1 text-meta text-text-secondary">
                  {activeProvider?.isConfigured
                    ? `${providerStatus?.activeModel ?? activeProvider.modelName} is available`
                    : "You can finish setup now and configure AI later in Settings"}
                </p>
              </div>
              <span
                className={`rounded-xs px-1.5 py-0.5 text-meta font-medium ${
                  activeProvider?.isConfigured
                    ? "bg-tag-safe-bg text-tag-safe-text"
                    : "bg-tag-unsure-bg text-tag-unsure-text"
                }`}
              >
                {activeProvider?.isConfigured ? "Ready" : "Optional"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleUseActiveProvider} className="inline-flex items-center gap-2">
              <span>Use Active Provider</span>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
            <button
              type="button"
              onClick={() => {
                setAiProviderSkipped(true);
                setStep("scope");
              }}
              className="rounded-sm border border-btn-secondary-border bg-surface px-3 py-2 text-row text-text-primary transition-colors hover:bg-surface-secondary"
            >
              Configure Later
            </button>
          </div>
        </div>
      );
    }

    if (step === "scope") {
      return (
        <div className="space-y-5">
          <div>
            <h2 className="font-rounded text-title text-text-primary">
              Review scan scope
            </h2>
            <p className="mt-2 text-row text-text-secondary">
              These folders will be used for the first scan and future Overview
              scans. You can add more now or adjust later in Settings.
            </p>
          </div>

          <div className="overflow-hidden rounded-md border border-border bg-surface">
            {scopePreview.map((item) => (
              <div
                key={item.path}
                className="flex items-center justify-between border-b border-border px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-row font-medium text-text-primary">
                    {item.label}
                  </p>
                  <p className="truncate text-meta text-text-tertiary">{item.path}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveScope(item.path)}
                  className="ml-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
                  aria-label={`Remove ${item.label}`}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handlePickFolders}
              className="inline-flex items-center gap-2 rounded-sm border border-btn-secondary-border bg-surface px-3 py-2 text-row text-text-primary transition-colors hover:bg-surface-secondary"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Add Folder</span>
            </button>
            <Button
              onClick={handleStartScan}
              disabled={!canContinueFromScope}
              className="inline-flex items-center gap-2"
            >
              <span>Run First Scan</span>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      );
    }

    if (step === "scan") {
      return (
        <div className="space-y-5">
          <div>
            <h2 className="font-rounded text-title text-text-primary">
              First scan
            </h2>
            <p className="mt-2 text-row text-text-secondary">
              Horizon is indexing metadata from your selected folders. Large
              folders can take a little while, and the app stays responsive.
            </p>
          </div>

          <div className="rounded-md border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-row font-semibold text-text-primary">
                  {isScanning ? "Scanning selected folders" : "Preparing scan"}
                </p>
                <p className="mt-1 text-meta text-text-secondary">
                  {progress.files.toLocaleString()} files indexed,{" "}
                  {formatBytes(progress.bytes)} found
                </p>
              </div>
              <Loader2 className="h-5 w-5 animate-spin text-btn-primary-bg" aria-hidden="true" />
            </div>
            <div className="mt-4 h-2 rounded-xs bg-storage-free overflow-hidden">
              <div className="h-full w-[66%] rounded-xs bg-storage-used" />
            </div>
          </div>

          {scanError && (
            <div className="rounded-md bg-tag-danger-bg p-3 text-row text-tag-danger-text">
              {scanError}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-tag-safe-bg text-tag-safe-text">
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h2 className="font-rounded text-title text-text-primary">
            Horizon is ready
          </h2>
          <p className="mt-2 text-row text-text-secondary">
            Found {(scanSummary?.totalFiles ?? progress.files).toLocaleString()} files
            across {formatBytes(scanSummary?.totalBytes ?? progress.bytes)}. The
            Overview tab will show the latest scan and next actions.
          </p>
        </div>
        <Button
          onClick={handleFinish}
          disabled={isCompleting}
          className="inline-flex items-center gap-2"
        >
          {isCompleting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          <span>{isCompleting ? "Saving Setup" : "Go to Overview"}</span>
        </Button>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-6">
      <div className="flex h-[560px] w-[680px] overflow-hidden rounded-lg border border-border bg-surface-overlay">
        <aside className="w-[180px] shrink-0 border-r border-border bg-surface p-5">
          <div className="mb-6 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-btn-primary-bg text-btn-primary-text">
              <HardDrive className="h-3.5 w-3.5" aria-hidden="true" />
            </div>
            <span className="text-row font-semibold text-text-primary">Horizon</span>
          </div>
          <div className="space-y-2">
            {STEPS.map((item, index) => {
              const isActive = item.id === step;
              const isDone = index < activeStepIndex;
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-2 rounded-sm px-2 py-2 text-row ${
                    isActive
                      ? "bg-surface-secondary font-medium text-text-primary"
                      : "text-text-secondary"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-xs text-meta ${
                      isDone
                        ? "bg-tag-safe-bg text-tag-safe-text"
                        : "bg-surface-secondary text-text-secondary"
                    }`}
                  >
                    {isDone ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
                  </span>
                  <span>{item.label}</span>
                </div>
              );
            })}
          </div>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col p-6">
          <div className="flex-1">{renderStep()}</div>
          <div className="border-t border-border pt-4 text-meta text-text-tertiary">
            Setup stays on this device. Horizon stores scan metadata locally.
          </div>
        </main>
      </div>
    </div>
  );
});
