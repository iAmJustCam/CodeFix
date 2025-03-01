import assert from "assert";
import {
  calculateLevenshteinDistance,
  calculateSimilarityScore,
  findSimilarVariables,
} from "../../../variable-analyzer.js";

describe("Variable Analyzer", () => {
  it("should calculate Levenshtein distance correctly", () => {
    assert.strictEqual(calculateLevenshteinDistance("kitten", "sitting"), 3);
    assert.strictEqual(calculateLevenshteinDistance("testVar", "testValue"), 5);
    assert.strictEqual(calculateLevenshteinDistance("", "abc"), 3);
    assert.strictEqual(calculateLevenshteinDistance("abc", ""), 3);
    assert.strictEqual(calculateLevenshteinDistance("abc", "abc"), 0);
  });

  it("should calculate similarity score between strings", () => {
    assert.strictEqual(calculateSimilarityScore("testVar", "testVar"), 1); // Exact match
    assert.ok(calculateSimilarityScore("testVar", "testValue") < 0.5); // Low similarity
    assert.ok(calculateSimilarityScore("userData", "userDate") > 0.7); // High similarity
    assert.strictEqual(calculateSimilarityScore("", ""), 0); // Empty strings
  });

  it("should find similar variables in a list", () => {
    const variables = [
      { name: "userData", declaration: true },
      { name: "userDate", declaration: true },
      { name: "userInfo", declaration: true },
      { name: "customerData", declaration: true },
      { name: "user", declaration: true },
    ];

    const similar = findSimilarVariables("userData", variables);

    assert.ok(similar.length > 0);
    assert.strictEqual(similar[0].name, "userDate"); // Most similar should be first
    assert.ok(similar[0].similarity > 0.7);
  });
});
