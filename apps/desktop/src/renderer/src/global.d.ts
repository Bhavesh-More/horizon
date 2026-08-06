export {};
declare global {
  interface Window {
    horizon: {
      ping: () => Promise<"pong">;
    };
  }
}
