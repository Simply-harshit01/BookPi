import assert from "node:assert/strict";
import test from "node:test";
import { scoreCandidates, selectDiverseTopCandidates } from "../src/services/candidateScoring.js";

test("scoreCandidates favors genre and quality alignment", () => {
  const scored = scoreCandidates(
    [
      {
        reason: "A",
        book: {
          bookId: "1",
          title: "Deep Work",
          authors: ["Cal Newport"],
          genres: ["Self-Help", "Business"],
          summary: "Focus and productivity systems for meaningful output and sustained concentration.",
          rating: 4.4,
          ratingCount: 800,
          publishedDate: "2016-01-01",
          mature: false
        }
      },
      {
        reason: "B",
        book: {
          bookId: "2",
          title: "RFID Design",
          authors: ["X"],
          genres: ["Computers", "Engineering"],
          summary: "Technical patterns for RFID systems and protocol implementation details.",
          rating: 3.1,
          ratingCount: 18,
          publishedDate: "2008-01-01",
          mature: false
        }
      }
    ],
    {
      favoriteGenres: ["self-help", "business"],
      semanticKeywords: ["productivity", "focus", "mindset"]
    }
  );

  assert.equal(scored[0]?.book.bookId, "1");
});

test("selectDiverseTopCandidates avoids highly redundant picks", () => {
  const selected = selectDiverseTopCandidates(
    [
      {
        reason: "r1",
        preLlmScore: 0.95,
        genreMatch: 1,
        keywordSimilarity: 0.9,
        ratingScore: 0.8,
        popularityScore: 0.8,
        recencyScore: 0.7,
        book: {
          bookId: "1",
          title: "Atomic Habits",
          authors: ["James Clear"],
          genres: ["Self-Help"],
          summary: "Habit systems and behavior change for long term self improvement.",
          mature: false
        }
      },
      {
        reason: "r2",
        preLlmScore: 0.93,
        genreMatch: 1,
        keywordSimilarity: 0.89,
        ratingScore: 0.8,
        popularityScore: 0.8,
        recencyScore: 0.7,
        book: {
          bookId: "2",
          title: "The Power of Habit",
          authors: ["Charles Duhigg"],
          genres: ["Self-Help"],
          summary: "Habit loops and behavior change based on neuroscience and routines.",
          mature: false
        }
      },
      {
        reason: "r3",
        preLlmScore: 0.9,
        genreMatch: 0.9,
        keywordSimilarity: 0.6,
        ratingScore: 0.7,
        popularityScore: 0.8,
        recencyScore: 0.6,
        book: {
          bookId: "3",
          title: "Start With Why",
          authors: ["Simon Sinek"],
          genres: ["Business"],
          summary: "Leadership, purpose and decision making for organizations and individuals.",
          mature: false
        }
      }
    ],
    2
  );

  assert.equal(selected.length, 2);
  assert.equal(selected[0]?.book.bookId, "1");
  assert.equal(selected[1]?.book.bookId, "3");
});
