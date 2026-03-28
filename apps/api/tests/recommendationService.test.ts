import assert from "node:assert/strict";
import test from "node:test";
import { rankBooksByDynamicTitles } from "../src/services/recommenderV2.js";

test("filters mature books when allowMatureContent is false", () => {
  const recommendations = rankBooksByDynamicTitles(
    [
      {
        bookId: "1",
        title: "Clean Book",
        authors: ["A"],
        genres: ["Fantasy"],
        mature: false
      },
      {
        bookId: "2",
        title: "Mature Book",
        authors: ["B"],
        genres: ["Fantasy"],
        mature: true
      }
    ],
    ["Clean Book", "Mature Book"],
    10,
    false
  );

  assert.equal(recommendations.length, 1);
  assert.equal(recommendations[0]?.bookId, "1");
});
