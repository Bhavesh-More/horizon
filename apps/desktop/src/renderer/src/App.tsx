import { useState, useEffect, useTransition } from "react";
import {
  Archive,
  Clock3,
  HardDriveDownload,
  LayoutGrid,
  Layers3,
  LifeBuoy,
  Files,
  ScanSearch,
  Settings2,
  Sparkles,
} from "lucide-react";
import { OverviewTab } from "./components/OverviewTab";
import { DuplicatesTab } from "./components/DuplicatesTab";
import { UnusedFilesTab } from "./components/UnusedFilesTab";
import { LargeFilesTab } from "./components/LargeFilesTab";
import { SettingsTab } from "./components/SettingsTab";
import { ForecastTab } from "./components/ForecastTab";
import { AssistantTab } from "./components/AssistantTab";
import { RecommendationRecord } from "@horizon/shared-types";

const TABS = [
  { label: "Overview", icon: LayoutGrid },
  { label: "Duplicates", icon: ScanSearch },
  { label: "Unused Files", icon: Layers3 },
  { label: "Large Files", icon: HardDriveDownload },
  { label: "Forecast", icon: Files },
  { label: "Assistant", icon: Sparkles },
  { label: "Archive", icon: Archive },
  { label: "Activity", icon: Clock3 },
  { label: "Settings", icon: Settings2 },
] as const;

export default function App() {
  const [activeTab, setActiveTab] = useState<string>("Overview");
  const [, startTransition] = useTransition();

  const handleSelectTab = (label: string) => {
    startTransition(() => {
      setActiveTab(label);
    });
  };

  const handleReviewRecommendation = (recommendation: RecommendationRecord) => {
    const tabByTarget = {
      duplicates: "Duplicates",
      unused: "Unused Files",
      large_files: "Large Files",
      forecast: "Forecast",
      overview: "Overview",
    } as const;

    handleSelectTab(tabByTarget[recommendation.targetTab]);
  };

  // Global ⌘1-⌘9 / Ctrl+1-9 keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key >= "1" && e.key <= "9") {
        const index = parseInt(e.key, 10) - 1;
        if (index >= 0 && index < TABS.length) {
          e.preventDefault();
          startTransition(() => {
            setActiveTab(TABS[index].label);
          });
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="flex h-screen bg-background text-text-primary overflow-hidden">
      {/* Sidebar Navigation */}
      <aside className="flex w-[240px] shrink-0 flex-col border-r border-border bg-surface px-2 pb-2 pt-10">
        <div className="flex items-center gap-2 px-3 pb-6">
          <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-btn-primary-bg text-btn-primary-text">
            <LifeBuoy className="h-3.5 w-3.5" aria-hidden="true" />
          </div>
          <span className="font-rounded text-row font-semibold text-text-primary">
            Horizon
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {TABS.map(({ label, icon: Icon }) => {
            const isActive = activeTab === label;
            return (
              <button
                key={label}
                type="button"
                onClick={() => handleSelectTab(label)}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-left text-row transition-colors cursor-pointer ${
                  isActive
                    ? "bg-surface-secondary text-text-primary font-medium"
                    : "text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        {/* Global Disk Summary Sidebar Footer */}
        <div className="px-2 pt-4">
          <div className="rounded-md border border-border bg-background p-3">
            <p className="text-meta font-medium text-text-secondary">
              System Storage
            </p>
            <div className="mt-2 h-2 rounded-xs bg-storage-free overflow-hidden">
              <div className="h-2 w-[72%] rounded-xs bg-storage-used" />
            </div>
            <p className="mt-2 text-meta-emphasis text-text-primary">
              184 GB used
            </p>
            <p className="text-meta text-text-secondary">72 GB free</p>
          </div>
        </div>
      </aside>

      {/* Main Tab Content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className={activeTab === "Overview" ? "h-full flex flex-col" : "hidden"}>
          <OverviewTab onNavigateToTab={handleSelectTab} />
        </div>
        <div className={activeTab === "Duplicates" ? "h-full flex flex-col" : "hidden"}>
          <DuplicatesTab />
        </div>
        <div className={activeTab === "Unused Files" ? "h-full flex flex-col" : "hidden"}>
          <UnusedFilesTab />
        </div>
        <div className={activeTab === "Large Files" ? "h-full flex flex-col" : "hidden"}>
          <LargeFilesTab />
        </div>
        <div className={activeTab === "Forecast" ? "h-full flex flex-col" : "hidden"}>
          <ForecastTab onNavigateToTab={handleSelectTab} />
        </div>
        <div className={activeTab === "Assistant" ? "h-full flex flex-col" : "hidden"}>
          <AssistantTab
            onReviewRecommendation={handleReviewRecommendation}
            onOpenSettings={() => handleSelectTab("Settings")}
          />
        </div>
        <div className={activeTab === "Settings" ? "h-full flex flex-col" : "hidden"}>
          <SettingsTab />
        </div>
        {activeTab !== "Overview" &&
          activeTab !== "Duplicates" &&
          activeTab !== "Unused Files" &&
          activeTab !== "Large Files" &&
          activeTab !== "Forecast" &&
          activeTab !== "Assistant" &&
          activeTab !== "Settings" && (
            <div className="flex h-full flex-col">
            <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-border bg-background px-6">
              <div>
                <h1 className="font-rounded text-title text-text-primary">
                  {activeTab}
                </h1>
                <p className="text-meta text-text-secondary">
                  Phase 1 Scan & Index active · Select Overview to run scans
                </p>
              </div>
            </header>
            <main className="flex-1 p-6">
              <div className="flex h-full items-center justify-center rounded-lg border border-border bg-surface p-8 text-center">
                <div>
                  <p className="text-row font-semibold text-text-primary">
                    {activeTab} Tab
                  </p>
                  <p className="mt-1 max-w-sm text-meta text-text-secondary">
                    This tab will be built in the upcoming Phase of the Horizon
                    build plan.
                  </p>
                </div>
              </div>
            </main>
          </div>
        )}
      </div>
    </div>
  );
}
