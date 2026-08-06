import { safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

const secretsPath = () =>
  path.join(app.getPath("userData"), "secrets.enc");

export function saveSecret(value: string) {
  const encrypted = safeStorage.encryptString(value);
  fs.writeFileSync(secretsPath(), encrypted);
}

export function readSecret(): string | null {
  if (!fs.existsSync(secretsPath())) return null;
  const encrypted = fs.readFileSync(secretsPath());
  return safeStorage.decryptString(encrypted);
}
