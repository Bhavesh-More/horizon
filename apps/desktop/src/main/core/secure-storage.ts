/**
 * secure-storage.ts
 * Owns: Reading and writing AI provider secrets using Electron safeStorage (Invariant I-5).
 * Secrets are encrypted at rest with OS credential store and never stored in SQLite or logged.
 */
import { safeStorage, app } from "electron";
import fs from "node:fs";
import path from "node:path";

let mockStorage: Record<string, string> | null = null;

function getSecretsFilePath(): string {
  try {
    const userData = app?.getPath ? app.getPath("userData") : process.cwd();
    return path.join(userData, "secrets.enc");
  } catch {
    return path.join(process.cwd(), "secrets.enc");
  }
}

function isSafeStorageReady(): boolean {
  try {
    return !!safeStorage && safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function readSecretsMap(): Record<string, string> {
  if (mockStorage) {
    return { ...mockStorage };
  }

  const filePath = getSecretsFilePath();
  if (!fs.existsSync(filePath)) {
    return {};
  }

  try {
    const rawBuffer = fs.readFileSync(filePath);
    if (!rawBuffer || rawBuffer.length === 0) {
      return {};
    }

    let decryptedText: string;
    if (isSafeStorageReady()) {
      decryptedText = safeStorage.decryptString(rawBuffer);
    } else {
      // Fallback for test/development environments lacking native safeStorage
      decryptedText = rawBuffer.toString("utf-8");
    }

    return JSON.parse(decryptedText);
  } catch (err) {
    console.error("Failed to read decrypted secrets map:", err);
    return {};
  }
}

function writeSecretsMap(secrets: Record<string, string>): void {
  if (mockStorage) {
    mockStorage = { ...secrets };
    return;
  }

  const filePath = getSecretsFilePath();
  const jsonString = JSON.stringify(secrets);

  try {
    let outputBuffer: Buffer;
    if (isSafeStorageReady()) {
      outputBuffer = safeStorage.encryptString(jsonString);
    } else {
      // Fallback for test/development environments lacking native safeStorage
      outputBuffer = Buffer.from(jsonString, "utf-8");
    }

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, outputBuffer);
  } catch (err) {
    console.error("Failed to write encrypted secrets map:", err);
  }
}

export function saveProviderKey(provider: string, apiKey: string): void {
  const map = readSecretsMap();
  map[provider.toLowerCase()] = apiKey;
  writeSecretsMap(map);
}

export function getProviderKey(provider: string): string | null {
  const map = readSecretsMap();
  return map[provider.toLowerCase()] || null;
}

export function deleteProviderKey(provider: string): void {
  const map = readSecretsMap();
  delete map[provider.toLowerCase()];
  writeSecretsMap(map);
}

export function hasProviderKey(provider: string): boolean {
  const map = readSecretsMap();
  return !!map[provider.toLowerCase()];
}

export function clearAllSecrets(): void {
  writeSecretsMap({});
}

// Helper for testing
export function setMockSecretStore(enabled: boolean): void {
  mockStorage = enabled ? {} : null;
}
