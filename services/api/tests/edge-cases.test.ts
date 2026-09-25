/**
 * Test edge cases for the classify function
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const AMBIGUOUS_WORD_FIXES: Record<string, string> = {
  its: "it's",
  your: "you're",
  their: "they're",
  whose: "who's",
  dont: "don't",
  cant: "can't",
  wont: "won't",
  isnt: "isn't",
  wasnt: "wasn't",
  werent: "weren't",
  hasnt: "hasn't",
  havent: "haven't",
  hadnt: "hadn't",
  wouldnt: "wouldn't",
  shouldnt: "shouldn't",
  couldnt: "couldn't",
  mustnt: "mustn't",
  neednt: "needn't",
  shant: "shan't",
  hes: "he's",
  shes: "she's",
  thats: "that's",
  whats: "what's",
  theres: "there's",
  heres: "here's",
  lets: "let's",
  whos: "who's",
};

const HIGH_RISK_SHORT_WORDS = new Set([
  "a", "an", "the",
  "at", "by", "of", "on", "in", "to", "up", "off", "out", "for", "from", "with", "into", "onto", "over", "under",
  "and", "but", "or", "nor", "so", "yet", "if", "as",
  "i", "he", "him", "his", "she", "her", "we", "us", "our", "they", "them", "their",
  "you", "your", "it", "its", "this", "that", "these", "those",
  "who", "what", "when", "where", "why", "how", "which",
  "there", "here", "then", "than",
]);

function classify(original: string, replacement: string): { safe: boolean; reason: string } {
  const o = original.trim();
  const r = replacement.trim();

  const expectedContraction = AMBIGUOUS_WORD_FIXES[o.toLowerCase()];
  if (expectedContraction !== undefined) {
    return r.toLowerCase() === expectedContraction
      ? { safe: true, reason: "contraction fix" }
      : { safe: false, reason: `rejected ambiguous-word fix for "${o}" (only "${expectedContraction}" is trusted here)` };
  }

  if (HIGH_RISK_SHORT_WORDS.has(o.toLowerCase()) || /^\d+$/.test(o)) {
    return { safe: false, reason: `blocked generic typo-fix for high-risk short word/number "${o}" -> "${r}"` };
  }

  return { safe: false, reason: "unrecognized" };
}

describe("classify edge cases", () => {
  it("rejects \"It's\" -> \"It\" (drops possessive from already-correct form)", () => {
    const result = classify("It's", "It");
    assert.equal(result.safe, false, "Should reject dropping possessive from It's");
    console.log("Reason:", result.reason);
  });

  it("rejects \"it's\" -> \"it\" (lowercase)", () => {
    const result = classify("it's", "it");
    assert.equal(result.safe, false, "Should reject dropping possessive from it's");
    console.log("Reason:", result.reason);
  });

  it("rejects \"don't\" -> \"do\" (drops negation from already-correct form)", () => {
    const result = classify("don't", "do");
    assert.equal(result.safe, false, "Should reject dropping negation from don't");
    console.log("Reason:", result.reason);
  });

  it("rejects \"you're\" -> \"your\" (wrong direction)", () => {
    const result = classify("you're", "your");
    assert.equal(result.safe, false, "Should reject wrong direction");
    console.log("Reason:", result.reason);
  });
});