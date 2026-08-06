import { useEffect, useState } from "react";
import { Button } from "@horizon/ui";

export default function App() {
  const [pong, setPong] = useState<string>("…");

  useEffect(() => {
    window.horizon.ping().then(setPong);
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold">Horizon</h1>
      <p className="text-muted">IPC checkpoint: {pong}</p>
      <Button onClick={() => window.horizon.ping().then(setPong)}>
        Ping main process
      </Button>
    </div>
  );
}
