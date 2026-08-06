import { useEffect, useState } from "react";
import { Button } from "@horizon/ui";

export default function App() {
  const [pong, setPong] = useState<string>("…");

  useEffect(() => {
    window.horizon.ping().then(setPong);
  }, []);

  return (
    <div className="min-h-screen bg-background p-8 text-text-primary">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 rounded-lg border border-border bg-surface p-8">
        <div className="space-y-2">
          <h1 className="font-rounded text-title text-text-primary">Horizon</h1>
          <p className="text-meta text-text-secondary">
            IPC checkpoint: {pong}
          </p>
        </div>

        <div className="rounded-md border border-border bg-surface-secondary p-4">
          <p className="text-row text-text-primary">
            The renderer is now using the shared token-driven Tailwind setup.
          </p>
        </div>

        <Button onClick={() => window.horizon.ping().then(setPong)}>
          Ping main process
        </Button>
      </div>
    </div>
  );
}
