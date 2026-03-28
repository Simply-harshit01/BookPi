import { Pool } from "pg";
import { env } from "../config.js";
import { InMemoryDb } from "./mockDb.js";
import { PostgresDb } from "./postgresDb.js";
import type { Repository } from "./repository.js";

let singleton: Repository | null = null;

export function getRepository(): Repository {
  if (singleton) {
    return singleton;
  }

  if (!env.USE_IN_MEMORY_DB && env.DATABASE_URL) {
    const pool = new Pool({
      connectionString: env.DATABASE_URL
    });
    singleton = new PostgresDb(pool);
    return singleton;
  }

  if (!env.DATABASE_URL) {
    console.warn("[api] DATABASE_URL not found. Falling back to in-memory repository.");
  } else if (env.USE_IN_MEMORY_DB) {
    console.warn("[api] USE_IN_MEMORY_DB=true. Falling back to in-memory repository.");
  }

  singleton = new InMemoryDb();
  return singleton;
}
