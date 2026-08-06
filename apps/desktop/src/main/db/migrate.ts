import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./client";

export function runMigrations() {
  migrate(db, {
    migrationsFolder: path.join(__dirname, "migrations"),
  });
}