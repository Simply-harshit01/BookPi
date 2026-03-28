import assert from "node:assert/strict";
import test from "node:test";
import {
  extractSemanticKeywords,
  filterCandidatesByGenre,
  filterCandidatesByQuality
} from "../src/services/candidateGeneration.js";

test("extractSemanticKeywords adds mapped and genre keywords", () => {
  const keywords = extractSemanticKeywords(
    ["The Secret", "Rework", "The Kite Runner"],
    ["Self-help", "Biography"]
  );

  assert.ok(keywords.includes("motivation"));
  assert.ok(keywords.includes("startup"));
  assert.ok(keywords.includes("law of attraction"));
});

test("filterCandidatesByGenre removes technical books", () => {
  const filtered = filterCandidatesByGenre(
    [
      {
        book: {
          bookId: "1",
          title: "Atomic Habits",
          authors: ["James Clear"],
          genres: ["Self-Help"],
          summary: "A practical framework for improving every day habits through small consistent changes.",
          mature: false
        }
      },
      {
        book: {
          bookId: "2",
          title: "RFID Design",
          authors: ["X"],
          genres: ["Computers", "Engineering"],
          summary: "Technical design patterns for RFID protocol architecture and systems implementation.",
          mature: false
        }
      }
    ],
    ["self-help", "non-fiction", "biography"]
  );

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.book.title, "Atomic Habits");
});

test("filterCandidatesByQuality removes books without usable description", () => {
  const filtered = filterCandidatesByQuality(
    [
      {
        score: 1,
        book: {
          bookId: "1",
          title: "Deep Work",
          authors: ["Cal Newport"],
          genres: ["Self-Help"],
          summary:
            "Rules for focused success in a distracted world, with practical systems for concentration and high-value output.",
          rating: 4.3,
          ratingCount: 1000,
          mature: false
        }
      },
      {
        score: 5,
        book: {
          bookId: "2",
          title: "Short Desc",
          authors: ["X"],
          genres: ["Self-Help"],
          summary: "Too short.",
          rating: 4.8,
          ratingCount: 20,
          mature: false
        }
      }
    ]
  );

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.book.title, "Deep Work");
});
