import path from "node:path";
import fs from "node:fs";
import { app } from "electron";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./client";

export function runMigrations() {
  // In dev (electron-vite): app.getAppPath() is the project root, migrations are at src/main/db/migrations
  // In prod (packaged):      __dirname is inside the asar, migrations are bundled alongside compiled JS
  const candidates = [
    path.join(app.getAppPath(), "src/main/db/migrations"),       // dev mode
    path.join(__dirname, "migrations"),                           // prod (same dir as compiled db/)
    path.join(__dirname, "../db/migrations"),                     // alt prod layout
  ];

  const migrationsFolder = candidates.find((p) => fs.existsSync(p));

  if (!migrationsFolder) {
    console.error("Migration folder not found. Tried:", candidates);
    return;
  }

  try {
    migrate(db, { migrationsFolder });
  } catch (err) {
    console.error("Drizzle migration error:", err);
  }
}