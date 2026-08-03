// Local (in-process) small-model grammar tier — Stage 2 of the "improve speed the way
// Grammarly does, without copying their tech" plan: using an existing small pretrained
// open-source model (Xenova/grammar-synthesis-small, T5-small based, ONNX, via
// @huggingface/transformers) instead of training anything ourselves.
//
// CRITICAL SAFETY NOTE:
// This model returns a full rewritten sentence, not a list of issues. Validated testing
// showed it sometimes hallucinates — e.g. it once "corrected" "The tenant have not paid
// rent" into "The landlord has not paid the rent", silently swapping tenant for landlord,
// and on another test it turned "a book" into "an ice cream" on repeated/redundant input.
// That is unacceptable in a leasing/property-management tool, whether auto-applied or
// merely suggested. This module therefore NEVER trusts the model's output directly. It
// diffs the model's output against the original text word-by-word and ONLY returns a
// change at all if it matches a narrow, defensible "this is definitely just a grammar/
// spelling fix" pattern:
//   1. A closed-class verb/article agreement swap (has/have/had, is/are/was/were, a/an, etc.)
//   2. A short edit-distance spelling fix (same starting letter, small Damerau-Levenshtein
//      distance) — catches "wen"->"when", "teh"->"the", "offical"->"official", etc.
// Anything else (a real word substituted for a different word, an insertion, a deletion)
// is silently dropped — not returned as a suggestion, not shown to the user at all. DeepSeek
// already covers the "worth a second look" suggestion tier more reliably; this model is only
// trusted for its narrow, high-confidence auto-apply fixes.

import type { GrammarIssue } from "@prosepilot/writing-core";
import { computeHash } from "@prosepilot/writing-core";
import { randomUUID } from "crypto";
import { diffWordsWithSpace } from "diff";

const MODEL_ID = "Xenova/grammar-synthesis-small";

// Lazy-loaded singleton — the model is ~250MB and takes ~30-45s to load on first use,
// so we load it once per server process, not per-request.
let pipelinePromise: Promise<any> | null = null;
async function getPipeline() {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { pipeline } = await import("@huggingface/transformers");
      return pipeline("text2text-generation", MODEL_ID);
    })();
  }
  return pipelinePromise;
}

/** Preload the model at server startup so the first real request isn't the one
 * that pays the ~30-45s load cost. Call this once, e.g. from index.ts, and don't
 * await it there — just fire it and let it warm up in the background. */
export function warmUpLocalModel(): void {
  getPipeline().catch(() => {
    // Swallow — if warmup fails, the first real call will retry and surface the error there.
  });
}

// --- Damerau-Levenshtein edit distance (transposition-aware, catches "teh"->"the") ---
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

// Closed-class lemma groups — swapping WITHIN a group is always a grammatical
// agreement fix (verb form / article choice), never a meaning change.
const LEMMA_GROUPS = [
  ["has", "have", "had"],
  ["is", "are", "was", "were", "am", "be", "been", "being"],
  ["do", "does", "did"],
  ["a", "an"],
];
function sameLemmaGroup(a: string, b: string): boolean {
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  return LEMMA_GROUPS.some((g) => g.includes(al) && g.includes(bl));
}

interface Classification {
  safe: boolean;
  reason: string;
}

function classify(original: string, replacement: string): Classification {
  const o = original.trim();
  const r = replacement.trim();
  if (sameLemmaGroup(o, r)) return { safe: true, reason: "closed-class verb/article agreement" };

  const dist = editDistance(o, r);
  const sameStart = o[0]?.toLowerCase() === r[0]?.toLowerCase();
  const lenDiff = Math.abs(o.length - r.length);
  if (dist <= 2 && sameStart && lenDiff <= 2 && o.length >= 2) {
    return { safe: true, reason: `typo fix (edit distance ${dist})` };
  }

  return { safe: false, reason: `unrecognized word substitution (edit distance ${dist})` };
}

/** Diff the model's rewritten sentence against the original, and turn each changed
 * span into a GrammarIssue with a correct startUtf16/endUtf16 into the ORIGINAL text.
 * Only spans that pass classify() as "safe" are returned at all — anything the model
 * isn't confident about is dropped entirely rather than surfaced as a suggestion (see
 * inline comment below for why). */
function diffToIssues(original: string, corrected: string, sourceHash: string): GrammarIssue[] {
  if (original === corrected) return [];

  // Must use diffWordsWithSpace, NOT diffWords. diffWords ignores whitespace when
  // comparing (by design, for readable diffs) — but the model's generated output almost
  // never preserves the original's exact leading/trailing whitespace (Outlook compose
  // boxes commonly start with a leading newline). With plain diffWords, that dropped
  // whitespace silently fails to advance originalOffset, so every offset computed after
  // it is wrong by however many whitespace characters were trimmed — e.g. reporting
  // "has" at index 2 when it's really at index 4. diffWordsWithSpace treats whitespace
  // as a real, counted token, so offsets stay exact. (Found via a live case where this
  // tier and the rule engine both flagged the same "has"->"have" fix but at different
  // startUtf16 values, which also defeated the merge step's exact-position dedup.)
  const parts = diffWordsWithSpace(original, corrected);
  const issues: GrammarIssue[] = [];
  let originalOffset = 0;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (!part.added && !part.removed) {
      // Unchanged text — advances our position in the original string.
      originalOffset += part.value.length;
      continue;
    }

    if (part.removed) {
      const removedText = part.value;
      const start = originalOffset;
      const end = originalOffset + removedText.length;
      originalOffset = end;

      const next = parts[i + 1];
      const addedText = next && next.added ? next.value : "";
      if (next && next.added) i++; // consume the paired "added" chunk

      const fromTrim = removedText.trim();
      const toTrim = addedText.trim();
      if (!fromTrim || !toTrim) continue; // pure whitespace change or deletion — not worth surfacing

      const { safe, reason } = classify(fromTrim, toTrim);
      // Only ever surface the model's high-confidence, narrowly-scoped fixes. Anything it's
      // NOT sure about gets silently dropped rather than shown as a suggestion — testing
      // showed this small model can hallucinate wildly on edge cases (e.g. "a book" ->
      // "an ice cream" on repeated/redundant input), and DeepSeek already covers the
      // "worth a second look" suggestion tier more reliably. Better to say nothing than
      // to show a nonsensical suggestion that erodes trust in the tool, even if it's
      // technically never auto-applied.
      if (!safe) continue;

      issues.push({
        id: `local_${randomUUID().slice(0, 8)}`,
        category: "grammar",
        rule: "local_model_safe_fix",
        startUtf16: start,
        endUtf16: end,
        original: removedText,
        replacement: addedText,
        confidence: 0.9,
        safeAuto: true,
        severity: "info",
        explanation: `Local model fix: ${reason}`,
        sourceHash,
      });
    }
    // Pure insertions (no paired removal) are never surfaced at all — same reasoning as
    // above, and insertions in particular have no "original" span to safety-check against.
  }

  return issues;
}

/** Run the local small-model grammar tier on `text` and return GrammarIssue[] in the
 * same shape as the other tiers (rule engine / LanguageTool / DeepSeek), ready to merge.
 * Never throws — returns [] on any failure so a model hiccup can't break a request. */
export async function checkWithLocalModel(text: string): Promise<GrammarIssue[]> {
  if (!text || !text.trim()) return [];
  try {
    const generator = await getPipeline();
    const output = await generator(text, { max_new_tokens: Math.min(200, text.length + 50) });
    const corrected = output?.[0]?.generated_text;
    if (typeof corrected !== "string" || !corrected.trim()) return [];

    const sourceHash = await computeHash(text);
    return diffToIssues(text, corrected, sourceHash);
  } catch (error) {
    // Model unavailable/failed — fail silent, same pattern as the other tiers.
    return [];
  }
}
