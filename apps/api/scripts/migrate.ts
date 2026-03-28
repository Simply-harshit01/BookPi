import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Pool } from "pg";

async function run() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const rootEnvPath = path.resolve(scriptDir, "../../../.env");
  dotenv.config({ path: rootEnvPath });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run migrations.");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationsDir = path.resolve(scriptDir, "../../../db/migrations");
    const files = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();

    for (const file of files) {
      const existing = await client.query("SELECT 1 FROM schema_migrations WHERE version = $1 LIMIT 1", [file]);
      if (existing.rowCount > 0) {
        continue;
      }

      const sql = await readFile(path.join(migrationsDir, file), "utf8");
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`Applied migration: ${file}`);
    }
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback errors when transaction is not active
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
