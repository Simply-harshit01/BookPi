import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import dotenv from "dotenv";
import { Pool } from "pg";

type WeightKey =
  | "bias"
  | "genreMatch"
  | "favoriteTitleMatch"
  | "dislikedTitleMatch"
  | "lastReadSimilarity"
  | "likeDecay"
  | "saveDecay"
  | "dislikeDecay"
  | "popularityPrior";

type WeightVector = Record<WeightKey, number>;

interface TrainingRow {
  x: number[];
  y: number;
}

const FEATURE_KEYS: WeightKey[] = [
  "bias",
  "genreMatch",
  "favoriteTitleMatch",
  "dislikedTitleMatch",
  "lastReadSimilarity",
  "likeDecay",
  "saveDecay",
  "dislikeDecay",
  "popularityPrior"
];

async function run() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const rootEnvPath = path.resolve(scriptDir, "../../../.env");
  dotenv.config({ path: rootEnvPath });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to train weights.");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const impressions = await pool.query(
      `SELECT user_id, book_id, impression_at
       FROM recommendation_impressions
       ORDER BY impression_at DESC
       LIMIT 20000`
    );

    const preferences = await pool.query(
      `SELECT user_id, last_read, favorite_genres, favorite_books, disliked_books
       FROM user_preferences`
    );

    const feedback = await pool.query(
      `SELECT user_id, book_id, action, event_ts
       FROM user_feedback_events
       ORDER BY event_ts DESC
       LIMIT 50000`
    );

    const books = await pool.query(
      `SELECT book_id, title, genres
       FROM books_cache`
    );

    if (impressions.rowCount === 0) {
      console.log("No impressions available. Skipping training.");
      return;
    }

    const prefMap = new Map<string, { lastRead: string; favoriteGenres: string[]; favoriteBooks: string[]; dislikedBooks: string[] }>();
    for (const row of preferences.rows) {
      prefMap.set(row.user_id, {
        lastRead: row.last_read ?? "",
        favoriteGenres: row.favorite_genres ?? [],
        favoriteBooks: row.favorite_books ?? [],
        dislikedBooks: row.disliked_books ?? []
      });
    }

    const bookMap = new Map<string, { title: string; genres: string[] }>();
    for (const row of books.rows) {
      bookMap.set(row.book_id, {
        title: row.title ?? "",
        genres: row.genres ?? []
      });
    }

    const feedbackMap = new Map<string, { action: string; ts: string }[]>();
    for (const row of feedback.rows) {
      const key = `${row.user_id}:${row.book_id}`;
      const list = feedbackMap.get(key) ?? [];
      list.push({ action: row.action, ts: row.event_ts.toISOString() });
      feedbackMap.set(key, list);
    }

    const popularity = await pool.query(
      `WITH imp AS (
         SELECT book_id, COUNT(*)::float AS impressions
         FROM recommendation_impressions
         GROUP BY book_id
       ),
       pos AS (
         SELECT book_id, COUNT(*)::float AS positives
         FROM user_feedback_events
         WHERE action IN ('click', 'like', 'save', 'mark_read')
         GROUP BY book_id
       )
       SELECT imp.book_id, COALESCE(pos.positives, 0) / GREATEST(imp.impressions, 1) AS engagement
       FROM imp
       LEFT JOIN pos ON pos.book_id = imp.book_id`
    );

    const popularityMap = new Map<string, number>();
    for (const row of popularity.rows) {
      popularityMap.set(row.book_id, Number(row.engagement ?? 0));
    }

    const dataset: TrainingRow[] = [];
    for (const impression of impressions.rows) {
      const pref = prefMap.get(impression.user_id);
      const book = bookMap.get(impression.book_id);
      if (!pref || !book || !book.title) {
        continue;
      }

      const key = `${impression.user_id}:${impression.book_id}`;
      const events = feedbackMap.get(key) ?? [];
      const label = events.some((event) => event.action === "click" || event.action === "like" || event.action === "save" || event.action === "mark_read")
        ? 1
        : 0;

      const lowerTitle = book.title.toLowerCase();
      const genreMatches = (book.genres ?? [])
        .map((genre) => String(genre).toLowerCase())
        .filter((genre) => pref.favoriteGenres.map((g) => g.toLowerCase()).includes(genre)).length;
      const favoriteTitleMatch = pref.favoriteBooks.some((fav) => lowerTitle.includes(fav.toLowerCase())) ? 1 : 0;
      const dislikedTitleMatch = pref.dislikedBooks.some((bad) => lowerTitle.includes(bad.toLowerCase())) ? 1 : 0;
      const lastReadSimilarity = pref.lastRead && lowerTitle.includes((pref.lastRead.split(" ")[0] ?? "").toLowerCase()) ? 1 : 0;

      let likeDecay = 0;
      let saveDecay = 0;
      let dislikeDecay = 0;
      for (const event of events) {
        const days = Math.max(0, (Date.now() - new Date(event.ts).getTime()) / (1000 * 60 * 60 * 24));
        const decay = Math.exp(-days / 30);
        if (event.action === "like") likeDecay += decay;
        if (event.action === "save" || event.action === "mark_read") saveDecay += decay;
        if (event.action === "dislike") dislikeDecay += decay;
      }

      dataset.push({
        y: label,
        x: [1, genreMatches, favoriteTitleMatch, dislikedTitleMatch, lastReadSimilarity, likeDecay, saveDecay, dislikeDecay, popularityMap.get(impression.book_id) ?? 0]
      });
    }

    if (dataset.length < 200) {
      console.log(`Not enough training rows (${dataset.length}). Skipping.`);
      return;
    }

    const weights = trainLogistic(dataset);
    const learned: WeightVector = {
      bias: weights[0],
      genreMatch: weights[1],
      favoriteTitleMatch: weights[2],
      dislikedTitleMatch: weights[3],
      lastReadSimilarity: weights[4],
      likeDecay: weights[5],
      saveDecay: weights[6],
      dislikeDecay: weights[7],
      popularityPrior: weights[8]
    };

    const outputPath = path.resolve(scriptDir, "../data/learned_weights.json");
    await readFile(outputPath, "utf8").catch(() => "");
    await writeFile(outputPath, `${JSON.stringify(learned, null, 2)}\n`, "utf8");
    console.log(`Weights updated: ${outputPath}`);
  } finally {
    await pool.end();
  }
}

function trainLogistic(rows: TrainingRow[]): number[] {
  const dims = FEATURE_KEYS.length;
  const weights = new Array<number>(dims).fill(0);
  const lr = 0.03;
  const lambda = 0.0005;
  const epochs = 180;

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const grad = new Array<number>(dims).fill(0);
    for (const row of rows) {
      const z = dot(weights, row.x);
      const p = 1 / (1 + Math.exp(-z));
      const error = p - row.y;
      for (let i = 0; i < dims; i += 1) {
        grad[i] += error * row.x[i];
      }
    }

    for (let i = 0; i < dims; i += 1) {
      const reg = i === 0 ? 0 : lambda * weights[i];
      weights[i] -= (lr / rows.length) * (grad[i] + reg);
    }
  }

  return weights;
}

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    sum += a[i] * b[i];
  }
  return sum;
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
