import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import { app } from "electron";
import * as schema from "./schema";

const dbPath = path.join(app.getPath("userData"), "horizon.db");
const sqlite = new Database(dbPath);
export const db = drizzle(sqlite, { schema });

export function closeDatabase() {
	sqlite.close();
}
