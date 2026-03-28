import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const rootEnvPath = path.resolve(moduleDir, "../../../.env");

// Load workspace root .env regardless of the current working directory.
dotenv.config({ path: rootEnvPath });
// Also allow local overrides when running from apps/api directly.
dotenv.config();

const envSchema = z.object({
  API_PORT: z.coerce.number().default(4000),
  JWT_SECRET: z.string().min(8).default("change-me-please"),
  GOOGLE_BOOKS_API_KEY: z.string().optional(),
  HUGGING_FACE_API_KEY: z.string().optional(),
  HUGGING_FACE_MODEL_URL: z.string().optional(),
  HUGGING_FACE_PROVIDER: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  USE_IN_MEMORY_DB: z
    .preprocess((value) => {
      if (typeof value === "boolean") {
        return value;
      }
      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "true" || normalized === "1" || normalized === "yes") {
          return true;
        }
        if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "") {
          return false;
        }
      }
      return value;
    }, z.boolean())
    .default(false)
});

export const env = envSchema.parse(process.env);



