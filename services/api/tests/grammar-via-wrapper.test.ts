process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/prosepilot_test";
process.env.NODE_ENV ??= "development";
process.env.CLERK_SECRET_KEY ??= "";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkGrammar } from "../src/engine/grammar.js";

function rules(issues: Array<{ rule: string }>) {
  return issues.map((i) => i.rule);
}

describe("Grammar Engine — Capitalization", () => {
  it("capitalizes first letter", async () => {
    const r = await checkGrammar({ text: "hello world.", mode: "report", rulesOnly: true });
    assert.ok(r.issues.length > 0);
    assert.equal(r.issues[0].rule, "capitalize_sentence_start");
    assert.equal(r.issues[0].original, "h");
    assert.equal(r.issues[0].replacement, "H");
  });

  it("capitalizes after period", async () => {
    const r = await checkGrammar({ text: "The end. next sentence.", mode: "report", rulesOnly: true });
    assert.ok(rules(r.issues).includes("capitalize_after_period"));
  });

  it("capitalizes after exclamation", async () => {
    const r = await checkGrammar({ text: "Stop! this is important.", mode: "report", rulesOnly: true });
    assert.ok(rules(r.issues).includes("capitalize_after_period"));
  });

  it("capitalizes after question mark", async () => {
    const r = await checkGrammar({ text: "Why? because we said so.", mode: "report", rulesOnly: true });
    assert.ok(rules(r.issues).includes("capitalize_after_period"));
  });

  it("does not flag correct capitalization", async () => {
    const r = await checkGrammar({ text: "Hello world. This is fine.", mode: "report", rulesOnly: true });
    assert.equal(rules(r.issues).includes("capitalize_after_period"), false);
  });
});

describe("Grammar Engine — Punctuation", () => {
  it("removes space before comma", async () => {
    const r = await checkGrammar({ text: "Hello , world", mode: "report", rulesOnly: true });
    assert.ok(rules(r.issues).includes("space_before_comma"));
  });

  it("removes space before period", async () => {
    const r = await checkGrammar({ text: "Hello . world", mode: "report", rulesOnly: true });
    assert.ok(rules(r.issues).includes("space_before_period"));
  });

  it("removes space before semicolon", async () => {
    const r = await checkGrammar({ text: "This is ; that", mode: "report", rulesOnly: true });
    assert.ok(rules(r.issues).includes("space_before_semicolon"));
  });

  it("removes space before colon", async () => {
    const r = await checkGrammar({ text: "Note : this is important", mode: "report", rulesOnly: true });
    assert.ok(rules(r.issues).includes("space_before_colon"));
  });

  it("removes space before closing paren", async () => {
    const r = await checkGrammar({ text: "This (is a test )", mode: "report", rulesOnly: true });
    assert.ok(rules(r.issues).includes("space_before_paren"));
  });

  it("removes double spaces", async () => {
    const r = await checkGrammar({ text: "Hello  world", mode: "report", rulesOnly: true });
    assert.ok(rules(r.issues).includes("double_space"));
  });

  it("converts double period to ellipsis", async () => {
    const r = await checkGrammar({ text: "Wait.. really?", mode: "report", rulesOnly: true });
    assert.ok(rules(r.issues).includes("double_period"));
    const issue = r.issues.find((i) => i.rule === "double_period");
    assert.equal(issue?.original, "..");
    assert.equal(issue?.replacement, "...");
  });

  it("adds missing period", async () => {
    const r = await checkGrammar({ text: "This is a sentence", mode: "report", rulesOnly: true });
    assert.ok(rules(r.issues).includes("missing_period"));
  });

  it("does not flag sentence ending with period", async () => {
    const r = await checkGrammar({ text: "This is a sentence.", mode: "report", rulesOnly: true });
    assert.equal(rules(r.issues).includes("missing_period"), false);
  });

  it("does not flag sentence ending with ?", async () => {
    const r = await checkGrammar({ text: "Is this a question?", mode: "report", rulesOnly: true });
    assert.equal(rules(r.issues).includes("missing_period"), false);
  });

  it("does not flag sentence ending with !", async () => {
    const r = await checkGrammar({ text: "This is important!", mode: "report", rulesOnly: true });
    assert.equal(rules(r.issues).includes("missing_period"), false);
  });

  it("adds comma after introductory clause", async () => {
    const r = await checkGrammar({ text: "If we can fix this The problem goes away", mode: "report", rulesOnly: true });
    assert.ok(rules(r.issues).includes("comma_after_conditional"));
  });
});

describe("Grammar Engine — Word Forms", () => {
  it("fixes gerund after possessive", async () => {
    const r = await checkGrammar({ text: "Per our discussing the timeline", mode: "report", rulesOnly: true });
    assert.ok(rules(r.issues).includes("gerund_to_noun"));
    const issue = r.issues.find((i) => i.rule === "gerund_to_noun");
    assert.equal(issue?.replacement, "our discussion");
  });

  it("fixes 'the discussing'", async () => {
    const r = await checkGrammar({ text: "The discussing was productive", mode: "report", rulesOnly: true });
    assert.ok(rules(r.issues).includes("gerund_to_noun"));
  });

  it("fixes 'foods' → 'food'", async () => {
    const r = await checkGrammar({ text: "We ordered the foods", mode: "report", rulesOnly: true });
    assert.ok(rules(r.issues).includes("uncountable_noun"));
    const issue = r.issues.find((i) => i.rule === "uncountable_noun");
    assert.equal(issue?.replacement, "food");
  });

  it("fixes 'informations'", async () => {
    const r = await checkGrammar({ text: "The informations are accurate", mode: "report", rulesOnly: true });
    assert.ok(rules(r.issues).includes("uncountable_noun"));
  });

  it("fixes 'advices'", async () => {
    const r = await checkGrammar({ text: "She gave good advices", mode: "report", rulesOnly: true });
    assert.ok(rules(r.issues).includes("uncountable_noun"));
  });

  it("fixes 'equipments'", async () => {
    const r = await checkGrammar({ text: "The equipments are new", mode: "report", rulesOnly: true });
    assert.ok(rules(r.issues).includes("uncountable_noun"));
  });

  it("fixes 'furnitures'", async () => {
    const r = await checkGrammar({ text: "The furnitures arrived", mode: "report", rulesOnly: true });
    assert.ok(rules(r.issues).includes("uncountable_noun"));
  });

  it("fixes missing object pronoun", async () => {
    const r = await checkGrammar({ text: "They finished on time", mode: "report", rulesOnly: true });
    assert.ok(rules(r.issues).includes("missing_object_pronoun"));
  });

  it("fixes adjective-noun order", async () => {
    const r = await checkGrammar({ text: "We need an upgrade premium", mode: "report", rulesOnly: true });
    assert.ok(rules(r.issues).includes("adjective_noun_order"));
    const issue = r.issues.find((i) => i.rule === "adjective_noun_order");
    assert.equal(issue?.replacement, "premium upgrade");
  });

  it("fixes proper noun capitalization", async () => {
    const r = await checkGrammar({ text: "We use Prosepilot daily", mode: "report", rulesOnly: true });
    assert.ok(rules(r.issues).includes("proper_noun_capitalization"));
  });
});

describe("Grammar Engine — Edge Cases", () => {
  it("handles empty string", async () => {
    const r = await checkGrammar({ text: "", mode: "report", rulesOnly: true });
    assert.ok(Array.isArray(r.issues));
    assert.ok(typeof r.updatedHash === "string");
    assert.equal(r.issues.length, 0);
  });

  it("handles single character", async () => {
    const r = await checkGrammar({ text: "x", mode: "report", rulesOnly: true });
    assert.ok(r.issues.length > 0);
  });

  it("handles very long text (100K chars)", async () => {
    const longText = "word ".repeat(20_000);
    const r = await checkGrammar({ text: longText, mode: "report", rulesOnly: true });
    assert.ok(Array.isArray(r.issues));
    assert.equal(r.usage.characterCount, longText.length);
  });

  it("handles unicode and emoji", async () => {
    const r = await checkGrammar({ text: "Hello 🌍! This is a test with ñ and ü.", mode: "report", rulesOnly: true });
    assert.ok(Array.isArray(r.issues));
  });

  it("all issues have valid category", async () => {
    const r = await checkGrammar({ text: "hello world. this is a test.", mode: "report", rulesOnly: true });
    const valid = ["grammar", "spelling", "punctuation", "clarity", "style", "tone", "conciseness"];
    for (const issue of r.issues) {
      assert.ok(valid.includes(issue.category));
    }
  });

  it("all issues have valid severity", async () => {
    const r = await checkGrammar({ text: "hello world. this is a test.", mode: "report", rulesOnly: true });
    const valid = ["error", "warning", "info", "suggestion"];
    for (const issue of r.issues) {
      assert.ok(valid.includes(issue.severity));
    }
  });

  it("all issues have valid confidence", async () => {
    const r = await checkGrammar({ text: "hello world. this is a test.", mode: "report", rulesOnly: true });
    for (const issue of r.issues) {
      assert.ok(issue.confidence >= 0 && issue.confidence <= 1);
    }
  });

  it("all issue IDs are unique", async () => {
    const r = await checkGrammar({ text: "hello world. this is a test. another sentence here.", mode: "report", rulesOnly: true });
    const ids = r.issues.map((i) => i.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("sourceHash consistent for same input", async () => {
    const r1 = await checkGrammar({ text: "Hello world.", mode: "report", rulesOnly: true });
    const r2 = await checkGrammar({ text: "Hello world.", mode: "report", rulesOnly: true });
    assert.equal(r1.updatedHash, r2.updatedHash);
  });

  it("sourceHash differs for different input", async () => {
    const r1 = await checkGrammar({ text: "Hello world.", mode: "report", rulesOnly: true });
    const r2 = await checkGrammar({ text: "Goodbye world.", mode: "report", rulesOnly: true });
    assert.notEqual(r1.updatedHash, r2.updatedHash);
  });
});

describe("Grammar Engine — Usage Tracking", () => {
  it("returns correct characterCount", async () => {
    const r = await checkGrammar({ text: "Hello world.", mode: "report", rulesOnly: true });
    assert.equal(r.usage.characterCount, 12);
  });

  it("returns correct issueCount", async () => {
    const r = await checkGrammar({ text: "hello world. this is a test.", mode: "report", rulesOnly: true });
    assert.equal(r.usage.issueCount, r.issues.length);
  });

  it("returns checkMode", async () => {
    const r = await checkGrammar({ text: "Hello world.", mode: "report", rulesOnly: true });
    assert.equal(r.usage.checkMode, "report");
  });

  it("returns latencyMs as number", async () => {
    const r = await checkGrammar({ text: "Hello world.", mode: "report", rulesOnly: true });
    assert.equal(typeof r.usage.latencyMs, "number");
    assert.ok(r.usage.latencyMs >= 0);
  });

  it("returns engineTier as 'rule'", async () => {
    const r = await checkGrammar({ text: "Hello world.", mode: "report", rulesOnly: true });
    assert.equal(r.usage.engineTier, "rule");
  });
});
