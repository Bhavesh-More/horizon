export {};
declare global {
  interface Window {
    horizon: {
      ping: () => Promise<string>;
    };
  }
}
