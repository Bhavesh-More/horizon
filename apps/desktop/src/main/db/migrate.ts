import path from "node:path";
import { app } from "electron";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./client";

export function runMigrations() {
  migrate(db, {
    migrationsFolder: path.join(
      app.getAppPath(),
      "src/main/db/migrations"
    ),
  });
}