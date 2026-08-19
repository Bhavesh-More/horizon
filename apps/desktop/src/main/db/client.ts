import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import * as schema from "./schema";

let sqlite: Database.Database;

if (app?.getPath) {
  try {
    const userDataDir = app.getPath("userData");
    fs.mkdirSync(userDataDir, { recursive: true });
    const dbPath = path.join(userDataDir, "horizon.db");
    sqlite = new Database(dbPath);
  } catch {
    sqlite = new Database(":memory:");
  }
} else {
  sqlite = new Database(":memory:");
}

export const db = drizzle(sqlite, { schema });

export function closeDatabase() {
  sqlite.close();
}
