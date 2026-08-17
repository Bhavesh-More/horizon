import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import * as schema from "./schema";

const userDataDir = app?.getPath ? app.getPath("userData") : "/tmp";
fs.mkdirSync(userDataDir, { recursive: true });
const dbPath = path.join(userDataDir, "horizon.db");
const sqlite = new Database(dbPath);
export const db = drizzle(sqlite, { schema });

export function closeDatabase() {
	sqlite.close();
}
