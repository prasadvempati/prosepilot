/**
 * Test the classify function logic from localGrammarModel.ts
 * This tests the contraction-dropping bug fix verification
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Copied from localGrammarModel.ts for testing
const LEMMA_GROUPS = [
  ["has", "have", "had"],
  ["is", "are", "was", "were", "am", "be", "been", "being"],
  ["do", "does", "did"],
  ["a", "an"],
  ["this", "that", "these", "those"],
  ["here", "there"],
  ["now", "then"],
  ["my", "your", "his", "her", "our", "their"],
  ["me", "you", "him", "her", "us", "them"],
  ["I", "you", "he", "she", "it", "we", "they"],
];

function sameLemmaGroup(a: string, b: string): boolean {
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  return LEMMA_GROUPS.some((g) => g.includes(al) && g.includes(bl));
}

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

function editDistance(a: string, b: string): number {
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  const d: number[][] = Array.from({ length: al.length + 1 }, () => new Array(bl.length + 1).fill(0));
  for (let i = 0; i <= al.length; i++) d[i][0] = i;
  for (let j = 0; j <= bl.length; j++) d[0][j] = j;
  for (let i = 1; i <= al.length; i++) {
    for (let j = 1; j <= bl.length; j++) {
      const cost = al[i - 1] === bl[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && al[i - 1] === bl[j - 2] && al[i - 2] === bl[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);
      }
    }
  }
  return d[al.length][bl.length];
}

interface Classification {
  safe: boolean;
  reason: string;
  category?: "grammar" | "spelling";
  explanation?: string;
}

function classify(original: string, replacement: string): Classification {
  const o = original.trim();
  const r = replacement.trim();

  const expectedContraction = AMBIGUOUS_WORD_FIXES[o.toLowerCase()];
  if (expectedContraction !== undefined) {
    return r.toLowerCase() === expectedContraction
      ? { safe: true, reason: "contraction fix", category: "grammar", explanation: `Missing apostrophe: should be "${expectedContraction}".` }
      : { safe: false, reason: `rejected ambiguous-word fix for "${o}" (only "${expectedContraction}" is trusted here)` };
  }

  if (sameLemmaGroup(o, r)) {
    return { safe: true, reason: "closed-class verb/article agreement", category: "grammar", explanation: "Verb or article agreement." };
  }

  if (HIGH_RISK_SHORT_WORDS.has(o.toLowerCase()) || /^\d+$/.test(o)) {
    return { safe: false, reason: `blocked generic typo-fix for high-risk short word/number "${o}" -> "${r}"` };
  }

  const dist = editDistance(o, r);
  const sameStart = o[0]?.toLowerCase() === r[0]?.toLowerCase();
  const lenDiff = Math.abs(o.length - r.length);
  if (o.length >= 4 && dist <= 2 && sameStart && lenDiff <= 2) {
    return { safe: true, reason: `typo fix (edit distance ${dist})`, category: "spelling", explanation: "Possible misspelling." };
  }
  if (o.length >= 2 && o.length < 4 && dist <= 1 && sameStart) {
    return { safe: true, reason: `typo fix (edit distance ${dist})`, category: "spelling", explanation: "Possible misspelling." };
  }

  return { safe: false, reason: `unrecognized word substitution (edit distance ${dist})` };
}

describe("classify function — contraction-dropping bug cases", () => {
  // These are the exact cases from the bug report that should be REJECTED (safe: false)
  
  it("rejects 'dont' -> 'do' (drops negation)", () => {
    const result = classify("dont", "do");
    assert.equal(result.safe, false, "Should reject 'dont' -> 'do' (negation dropped)");
    assert.ok(result.reason.includes("rejected ambiguous-word fix"));
  });

  it("rejects 'Its' -> 'It' (drops possessive)", () => {
    const result = classify("Its", "It");
    assert.equal(result.safe, false, "Should reject 'Its' -> 'It' (possessive dropped)");
    assert.ok(result.reason.includes("rejected ambiguous-word fix"));
  });

  it("rejects 'cant' -> 'can' (drops negation)", () => {
    const result = classify("cant", "can");
    assert.equal(result.safe, false, "Should reject 'cant' -> 'can'");
  });

  it("rejects 'wont' -> 'won' (drops negation)", () => {
    const result = classify("wont", "won");
    assert.equal(result.safe, false, "Should reject 'wont' -> 'won'");
  });

  it("rejects 'isnt' -> 'is' (drops negation)", () => {
    const result = classify("isnt", "is");
    assert.equal(result.safe, false, "Should reject 'isnt' -> 'is'");
  });

  it("accepts 'dont' -> \"don't\" (correct contraction fix)", () => {
    const result = classify("dont", "don't");
    assert.equal(result.safe, true, "Should accept correct contraction fix");
    assert.equal(result.category, "grammar");
    assert.ok(result.explanation?.includes("don't"));
  });

  it("accepts 'Its' -> \"It's\" (correct contraction fix)", () => {
    const result = classify("Its", "It's");
    assert.equal(result.safe, true, "Should accept correct contraction fix");
    assert.equal(result.category, "grammar");
  });

  it("accepts 'your' -> \"you're\" (correct contraction fix)", () => {
    const result = classify("your", "you're");
    assert.equal(result.safe, true, "Should accept correct contraction fix");
  });

  it("rejects 'their' -> 'there' (wrong word)", () => {
    const result = classify("their", "there");
    assert.equal(result.safe, false, "Should reject 'their' -> 'there'");
  });

  it("rejects 'the' -> 'them' (short word swap)", () => {
    const result = classify("the", "them");
    assert.equal(result.safe, false, "Should reject 'the' -> 'them'");
  });

  it("rejects 'at' -> 'a' (short word swap)", () => {
    const result = classify("at", "a");
    assert.equal(result.safe, false, "Should reject 'at' -> 'a'");
  });

  it("rejects '20' -> '22' (number change)", () => {
    const result = classify("20", "22");
    assert.equal(result.safe, false, "Should reject number changes");
  });

  it("accepts 'teh' -> 'the' (genuine typo)", () => {
    const result = classify("teh", "the");
    assert.equal(result.safe, true, "Should accept genuine typo fix");
    assert.equal(result.category, "spelling");
  });

  it("accepts 'recieve' -> 'receive' (genuine typo)", () => {
    const result = classify("recieve", "receive");
    assert.equal(result.safe, true, "Should accept genuine typo fix");
  });

  it("accepts 'has' -> 'have' (lemma group)", () => {
    const result = classify("has", "have");
    assert.equal(result.safe, true, "Should accept lemma group fix");
    assert.equal(result.category, "grammar");
  });

  it("accepts 'a' -> 'an' (lemma group)", () => {
    const result = classify("a", "an");
    assert.equal(result.safe, true, "Should accept article agreement");
  });
});