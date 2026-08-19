import React, { useState, useEffect, useCallback } from "react";
import {
  Sparkles,
  Key,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff,
  Sun,
  Moon,
  Monitor,
  FolderLock,
  Cpu,
  Globe,
  Server,
} from "lucide-react";
import {
  AiProviderName,
  AiProviderInfo,
  AiProviderStatusResponse,
  OllamaMode,
} from "@horizon/shared-types";
import { applyTheme, getSavedTheme, ThemeMode } from "../lib/theme";

const THEMES = [
  { id: "light" as const, label: "Light", icon: Sun },
  { id: "dark" as const, label: "Dark", icon: Moon },
  { id: "system" as const, label: "System", icon: Monitor },
] as const;

export const SettingsTab: React.FC = React.memo(function SettingsTab() {
  const [loading, setLoading] = useState<boolean>(true);
  const [status, setStatus] = useState<AiProviderStatusResponse | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<AiProviderName>("ollama");
  const [modelInput, setModelInput] = useState<string>("llama3.2:3b");
  const [apiKeyInput, setApiKeyInput] = useState<string>("");
  const [showKey, setShowKey] = useState<boolean>(false);
  const [activeTheme, setActiveTheme] = useState<ThemeMode>(() => getSavedTheme());

  // Ollama-specific local / remote mode state
  const [ollamaMode, setOllamaMode] = useState<OllamaMode>("local");
  const [baseUrlInput, setBaseUrlInput] = useState<string>("");

  // Test & Action status states
  const [testing, setTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    latencyMs?: number;
    error?: string;
  } | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [refreshingOllama, setRefreshingOllama] = useState<boolean>(false);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const res = await window.horizon.aiProvider.getStatus();
      if (res.ok && res.data) {
        setStatus(res.data);
        const currentActive = res.data.providers.find((p) => p.isActive);
        if (currentActive) {
          setSelectedProvider(currentActive.providerName);
          setModelInput(currentActive.modelName);
          if (currentActive.providerName === "ollama") {
            setOllamaMode(currentActive.ollamaMode || "local");
            setBaseUrlInput(currentActive.baseUrl || "");
          }
        }
      }
    } catch (err) {
      console.error("Failed to load AI provider status:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Handle provider tab selection in UI
  const handleSelectProvider = (providerName: AiProviderName) => {
    setSelectedProvider(providerName);
    setTestResult(null);
    setSaveMessage(null);
    setApiKeyInput("");

    const prov = status?.providers.find((p) => p.providerName === providerName);
    if (prov) {
      setModelInput(prov.modelName);
      if (providerName === "ollama") {
        setOllamaMode(prov.ollamaMode || "local");
        setBaseUrlInput(prov.baseUrl || "");
      }
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setSaveMessage(null);

    try {
      const res = await window.horizon.aiProvider.test({
        provider: selectedProvider,
        model: modelInput.trim(),
        apiKey: apiKeyInput.trim() || undefined,
        baseUrl:
          selectedProvider === "ollama" && ollamaMode === "remote"
            ? baseUrlInput.trim() || undefined
            : undefined,
      });

      if (res.ok && res.data) {
        setTestResult(res.data);
      } else {
        setTestResult({
          success: false,
          error: res.error?.message || "Probe request failed",
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err.message || "Network test failed",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveAndActivate = async () => {
    setSaving(true);
    setSaveMessage(null);

    try {
      const res = await window.horizon.aiProvider.configure({
        provider: selectedProvider,
        model: modelInput.trim(),
        apiKey: apiKeyInput.trim() || undefined,
        // For Ollama: pass the remote URL if in remote mode, empty string to clear if switching to local
        baseUrl:
          selectedProvider === "ollama"
            ? ollamaMode === "remote"
              ? baseUrlInput.trim()
              : "" // empty string clears stored remote URL
            : undefined,
        setActive: true,
      });

      if (res.ok) {
        setSaveMessage("Provider configured and activated successfully.");
        setApiKeyInput("");
        await fetchStatus();
      } else {
        setTestResult({
          success: false,
          error: res.error?.message || "Failed to save configuration",
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err.message || "Failed to configure provider",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshOllama = async () => {
    setRefreshingOllama(true);
    try {
      const res = await window.horizon.aiProvider.listOllamaModels();
      if (res.ok && res.data) {
        await fetchStatus();
      }
    } catch (err) {
      console.error("Failed to refresh Ollama models:", err);
    } finally {
      setRefreshingOllama(false);
    }
  };

  const currentProviderInfo = status?.providers.find(
    (p) => p.providerName === selectedProvider
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Tab Header */}
      <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-border bg-background px-6">
        <div>
          <h1 className="font-rounded text-title text-text-primary">Settings</h1>
          <p className="text-meta text-text-secondary">
            AI Engine configurations, appearance, and monitoring scope.
          </p>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Active Engine Card */}
        <div className="rounded-md border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xs bg-surface-secondary text-text-primary">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="text-row font-medium text-text-primary">
                  Active Engine:{" "}
                  <span className="font-semibold capitalize">
                    {status?.activeProvider || "Ollama (Local)"}
                  </span>
                </p>
                <p className="text-meta text-text-secondary">
                  Active Model: {status?.activeModel || "llama3.2:3b"}
                </p>
              </div>
            </div>
            <span className="inline-flex items-center rounded-xs bg-tag-safe-bg px-2 py-0.5 text-meta font-medium text-tag-safe-text">
              Active Provider
            </span>
          </div>
        </div>

        {/* AI Provider Foundation (BYOK) Panel */}
        <div className="rounded-md border border-border bg-surface p-5 space-y-5">
          <div>
            <h2 className="text-row font-semibold text-text-primary">
              AI Provider & Credentials (BYOK)
            </h2>
            <p className="mt-0.5 text-meta text-text-secondary">
              Local Ollama runs 100% offline by default. You can connect cloud
              providers with your own API key. Keys are encrypted at rest with
              OS safeStorage.
            </p>
          </div>

          {/* Provider Selection Buttons */}
          <div className="grid grid-cols-5 gap-2">
            {status?.providers.map((p) => {
              const isSelected = selectedProvider === p.providerName;
              return (
                <button
                  key={p.providerName}
                  type="button"
                  onClick={() => handleSelectProvider(p.providerName)}
                  className={`flex flex-col items-start rounded-md border p-3 text-left transition-colors cursor-pointer ${
                    isSelected
                      ? "border-text-primary bg-surface-secondary text-text-primary"
                      : "border-border bg-surface text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
                  }`}
                >
                  <span className="text-row font-medium">{p.displayName}</span>
                  <div className="mt-2 flex items-center gap-1.5">
                    {p.isLocal ? (
                      <span className="rounded-xs bg-tag-unsure-bg px-1.5 py-0.5 text-meta text-tag-unsure-text">
                        Offline Local
                      </span>
                    ) : p.hasKey ? (
                      <span className="rounded-xs bg-tag-safe-bg px-1.5 py-0.5 text-meta text-tag-safe-text">
                        Key Saved
                      </span>
                    ) : (
                      <span className="rounded-xs bg-tag-check-bg px-1.5 py-0.5 text-meta text-tag-check-text">
                        No Key
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Configuration Form for Selected Provider */}
          <div className="rounded-md border border-border bg-background p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-row font-medium text-text-primary">
                Configure {currentProviderInfo?.displayName}
              </span>
              {selectedProvider === "ollama" && (
                <button
                  type="button"
                  onClick={handleRefreshOllama}
                  disabled={refreshingOllama}
                  className="flex items-center gap-1.5 rounded-sm bg-surface border border-btn-secondary-border px-2.5 py-1 text-meta text-text-primary hover:bg-surface-secondary transition-colors cursor-pointer"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${refreshingOllama ? "animate-spin" : ""}`}
                  />
                  <span>Discover Models</span>
                </button>
              )}
            </div>

            {/* Ollama Mode Toggle (local vs remote) */}
            {selectedProvider === "ollama" && (
              <div className="space-y-3">
                <label className="text-meta font-medium text-text-secondary">
                  Connection Mode
                </label>
                <div className="flex rounded-md border border-border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      setOllamaMode("local");
                      setBaseUrlInput("");
                      setTestResult(null);
                    }}
                    className={`flex flex-1 items-center justify-center gap-2 px-4 py-2 text-row transition-colors cursor-pointer ${
                      ollamaMode === "local"
                        ? "bg-surface-secondary text-text-primary font-medium"
                        : "bg-surface text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    <Server className="h-3.5 w-3.5" />
                    <span>Local</span>
                    <span className="text-meta text-text-tertiary">127.0.0.1:11434</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOllamaMode("remote");
                      setTestResult(null);
                    }}
                    className={`flex flex-1 items-center justify-center gap-2 px-4 py-2 text-row transition-colors cursor-pointer border-l border-border ${
                      ollamaMode === "remote"
                        ? "bg-surface-secondary text-text-primary font-medium"
                        : "bg-surface text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    <Globe className="h-3.5 w-3.5" />
                    <span>Remote / Cloud API</span>
                  </button>
                </div>

                {/* Remote Base URL input */}
                {ollamaMode === "remote" && (
                  <div className="space-y-1.5">
                    <label className="text-meta font-medium text-text-secondary">
                      Ollama API Base URL
                    </label>
                    <input
                      type="url"
                      value={baseUrlInput}
                      onChange={(e) => setBaseUrlInput(e.target.value)}
                      placeholder="https://my-ollama-server.example.com:11434"
                      className="w-full rounded-sm border border-border bg-surface px-3 py-1.5 text-row text-text-primary placeholder:text-text-tertiary focus:outline-hidden"
                    />
                    <p className="text-meta text-text-tertiary">
                      Point to any Ollama-compatible endpoint. Your local models
                      will be discovered from this host.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Model Name Input / Dropdown */}
            <div className="space-y-1.5">
              <label className="text-meta font-medium text-text-secondary">
                Model Name
              </label>
              {selectedProvider === "ollama" &&
              currentProviderInfo?.availableModels &&
              currentProviderInfo.availableModels.length > 0 ? (
                <div className="flex gap-2">
                  <select
                    value={modelInput}
                    onChange={(e) => setModelInput(e.target.value)}
                    className="flex-1 rounded-sm border border-border bg-surface px-3 py-1.5 text-row text-text-primary focus:outline-hidden"
                  >
                    {currentProviderInfo.availableModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <input
                  type="text"
                  value={modelInput}
                  onChange={(e) => setModelInput(e.target.value)}
                  placeholder="e.g. llama3.2:3b or gpt-4o-mini"
                  className="w-full rounded-sm border border-border bg-surface px-3 py-1.5 text-row text-text-primary placeholder:text-text-tertiary focus:outline-hidden"
                />
              )}
            </div>

            {/* API Key Input for Cloud Providers */}
            {selectedProvider !== "ollama" && (
              <div className="space-y-1.5">
                <label className="text-meta font-medium text-text-secondary">
                  API Key (Stored in OS Safe Storage)
                </label>
                <div className="relative">
                  <input
                    type={showKey ? "text" : "password"}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder={
                      currentProviderInfo?.hasKey
                        ? "•••••••••••••••• (Key saved securely; enter new key to overwrite)"
                        : "Enter API Key (e.g. sk-...)"
                    }
                    className="w-full rounded-sm border border-border bg-surface pl-3 pr-10 py-1.5 text-row text-text-primary placeholder:text-text-tertiary focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2.5 top-2 text-text-tertiary hover:text-text-primary"
                  >
                    {showKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Probe Feedback Notification */}
            {testResult && (
              <div
                className={`flex items-start gap-2.5 rounded-sm p-3 text-meta ${
                  testResult.success
                    ? "bg-tag-safe-bg text-tag-safe-text"
                    : "bg-tag-danger-bg text-tag-danger-text"
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-semibold">
                    {testResult.success
                      ? `Connection Succeeded (${testResult.latencyMs} ms)`
                      : "Connection Failed"}
                  </p>
                  {testResult.error && (
                    <p className="mt-0.5">{testResult.error}</p>
                  )}
                </div>
              </div>
            )}

            {saveMessage && (
              <div className="flex items-center gap-2 rounded-sm bg-tag-safe-bg p-3 text-meta text-tag-safe-text">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{saveMessage}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing}
                className="rounded-sm bg-surface border border-btn-secondary-border px-3 py-1.5 text-row text-text-primary hover:bg-surface-secondary transition-colors cursor-pointer disabled:opacity-50"
              >
                {testing ? "Testing..." : "Test Connection"}
              </button>
              <button
                type="button"
                onClick={handleSaveAndActivate}
                disabled={saving}
                className="rounded-sm bg-btn-primary-bg px-3 py-1.5 text-row text-btn-primary-text hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 font-medium"
              >
                {saving ? "Saving..." : "Save & Set Active"}
              </button>
            </div>
          </div>
        </div>

        {/* Appearance & Theme Section */}
        <div className="rounded-md border border-border bg-surface p-5 space-y-4">
          <div>
            <h2 className="text-row font-semibold text-text-primary">
              Appearance
            </h2>
            <p className="mt-0.5 text-meta text-text-secondary">
              Select theme mode for Horizon.
            </p>
          </div>
          <div className="flex gap-3">
            {THEMES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setActiveTheme(id);
                  applyTheme(id);
                }}
                className={`flex items-center gap-2 rounded-sm border px-4 py-2 text-row transition-colors cursor-pointer ${
                  activeTheme === id
                    ? "border-text-primary bg-surface-secondary text-text-primary font-medium"
                    : "border-border bg-surface text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Scan Scope & Safety Invariants Summary */}
        <div className="rounded-md border border-border bg-surface p-5 space-y-3">
          <div className="flex items-center gap-2 text-text-primary">
            <ShieldCheck className="h-4 w-4 text-tag-safe-text" />
            <h2 className="text-row font-semibold">Safety & Privacy Rules</h2>
          </div>
          <p className="text-meta text-text-secondary leading-relaxed">
            Horizon strictly enforces trash-only deletion (`trash.ts`). No user
            files are ever permanently deleted. AI prompts send file metadata
            only (paths, sizes, dates, categories), never raw document contents.
          </p>
        </div>
      </main>
    </div>
  );
});
