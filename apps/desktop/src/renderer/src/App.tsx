import { useEffect, useState } from "react";
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
import { Button } from "@horizon/ui";

export default function App() {
  const [pong, setPong] = useState<string>("…");

  useEffect(() => {
    window.horizon.ping().then(setPong);
  }, []);

  const tabs = [
    { label: "Overview", icon: LayoutGrid, active: true },
    { label: "Duplicates", icon: ScanSearch },
    { label: "Unused Files", icon: Layers3 },
    { label: "Large Files", icon: HardDriveDownload },
    { label: "Forecast", icon: Files },
    { label: "Assistant", icon: Sparkles },
    { label: "Archive", icon: Archive },
    { label: "Activity", icon: Clock3 },
    { label: "Settings", icon: Settings2 },
  ];

  return (
    <div className="flex h-screen bg-background text-text-primary">
      <aside className="flex w-[240px] shrink-0 flex-col border-r border-border bg-surface px-2 pb-2 pt-10">
        <div className="flex items-center gap-2 px-3 pb-6">
          <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-btn-primary-bg text-btn-primary-text">
            <LifeBuoy className="h-3.5 w-3.5" aria-hidden="true" />
          </div>
          <span className="font-rounded text-row text-text-primary">Horizon</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {tabs.map(({ label, icon: Icon, active }) => (
            <button
              key={label}
              type="button"
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-left text-row transition-colors ${
                active
                  ? "bg-surface-secondary text-text-primary"
                  : "text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="px-2 pt-4">
          <div className="rounded-md border border-border bg-background p-3">
            <p className="text-meta text-text-secondary">Storage</p>
            <div className="mt-2 h-2 rounded-xs bg-storage-free">
              <div className="h-2 w-[78%] rounded-xs bg-storage-used" />
            </div>
            <p className="mt-2 text-meta-emphasis text-text-primary">211.8 GB used</p>
            <p className="text-meta text-text-secondary">33.3 GB free</p>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[72px] items-center justify-between border-b border-border bg-background px-6">
          <div>
            <h1 className="font-rounded text-title text-text-primary">Overview</h1>
            <p className="text-meta text-text-secondary">
              Phase 0 scaffold · IPC checkpoint: {pong}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-md border border-border bg-surface px-3 py-2 text-meta text-text-secondary">
              18.37 GB reclaimable
            </div>
            <Button onClick={() => window.horizon.ping().then(setPong)}>
              Ping main process
            </Button>
          </div>
        </header>

        <main className="flex-1 p-6">
          <section className="flex h-full flex-col justify-between rounded-lg border border-border bg-surface p-6">
            <div className="space-y-3">
              <p className="text-row text-text-primary">Renderer shell scaffold</p>
              <p className="max-w-xl text-meta text-text-secondary">
                The Phase 0 foundation now has the fixed desktop chrome that
                later tabs will reuse: sidebar, persistent top bar, and an
                empty content surface.
              </p>
            </div>

            <div className="rounded-md border border-border bg-surface-secondary p-4">
              <p className="text-meta text-text-secondary">
                The main-process ping currently returns a zod-validated &quot;pong&quot;.
              </p>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
