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
    throw new Error("DATABASE_URL is required to seed data.");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const books = [
      {
        id: "seed-1",
        title: "Project Hail Mary",
        authors: ["Andy Weir"],
        genres: ["Science Fiction"],
        summary: "A lone astronaut must save humanity through clever science and impossible choices.",
        rating: 4.6,
        mature: false
      },
      {
        id: "seed-2",
        title: "The Night Circus",
        authors: ["Erin Morgenstern"],
        genres: ["Fantasy"],
        summary: "A duel between two magicians plays out inside a mesmerizing nocturnal circus.",
        rating: 4.2,
        mature: false
      },
      {
        id: "seed-3",
        title: "The Silent Patient",
        authors: ["Alex Michaelides"],
        genres: ["Thriller"],
        summary: "A woman refuses to speak after a shocking crime, and one therapist searches for why.",
        rating: 4.1,
        mature: true
      }
    ];

    for (const book of books) {
      await client.query(
        `INSERT INTO books_cache (book_id, title, authors, genres, summary, rating, mature, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (book_id)
         DO UPDATE SET
           title = EXCLUDED.title,
           authors = EXCLUDED.authors,
           genres = EXCLUDED.genres,
           summary = EXCLUDED.summary,
           rating = EXCLUDED.rating,
           mature = EXCLUDED.mature,
           updated_at = NOW()`,
        [book.id, book.title, book.authors, book.genres, book.summary, book.rating, book.mature]
      );
    }

    await client.query("COMMIT");
    console.log("Seed completed.");
  } catch (error) {
    await client.query("ROLLBACK");
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
