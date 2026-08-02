// Local (in-process) small-model grammar tier — prototype, NOT wired into the live
// /v1/check pipeline yet. See conversation notes: this is Stage 2 of the "improve
// speed the way Grammarly does, without copying their tech" plan — using an existing
// small pretrained open-source model (Xenova/grammar-synthesis-small, T5-small based,
// ONNX, via @huggingface/transformers) instead of training anything ourselves.
//
// CRITICAL SAFETY NOTE — read before wiring this into checkGrammar():
// This model returns a full rewritten sentence, not a list of issues. Validated testing
// showed it sometimes hallucinates — e.g. it once "corrected" "The tenant have not paid
// rent" into "The landlord has not paid the rent", silently swapping tenant for landlord.
// That is unacceptable to auto-apply in a leasing/property-management tool. This module
// therefore NEVER trusts the model's output directly. It diffs the model's output against
// the original text word-by-word and only marks a change safeAuto:true if it matches a
// narrow, defensible "this is definitely just a grammar/spelling fix" pattern:
//   1. A closed-class verb/article agreement swap (has/have/had, is/are/was/were, a/an, etc.)
//   2. A short edit-distance spelling fix (same starting letter, small Damerau-Levenshtein
//      distance) — catches "wen"->"when", "teh"->"the", "offical"->"official", etc.
// Anything else (a real word substituted for a different word, an insertion, a deletion)
// is still returned as an issue, but with safeAuto:false, confidence lowered, so it only
// ever surfaces as a review-first suggestion — exactly like DeepSeek's issues today.
//
// This mirrors why DeepSeek issues are always safeAuto:false server-side: AI-sourced
// rewrites can be wrong, and only deterministic, narrowly-scoped changes get to bypass
// human review in Auto mode.

import type { GrammarIssue } from "@prosepilot/writing-core";
import { computeHash } from "@prosepilot/writing-core";
import { randomUUID } from "crypto";
import { diffWords } from "diff";

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
 * Only spans that pass classify() as "safe" get safeAuto:true; everything else is
 * still surfaced (for Suggest mode / review), just never auto-applied. */
function diffToIssues(original: string, corrected: string, sourceHash: string): GrammarIssue[] {
  if (original === corrected) return [];

  const parts = diffWords(original, corrected);
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
      if (!fromTrim) continue; // pure whitespace change — not worth surfacing

      const { safe, reason } = toTrim ? classify(fromTrim, toTrim) : { safe: false, reason: "deletion" };

      issues.push({
        id: `local_${randomUUID().slice(0, 8)}`,
        category: "grammar",
        rule: safe ? "local_model_safe_fix" : "local_model_suggestion",
        startUtf16: start,
        endUtf16: end,
        original: removedText,
        replacement: addedText || "",
        confidence: safe ? 0.9 : 0.5,
        safeAuto: safe,
        severity: safe ? "info" : "suggestion",
        explanation: safe ? `Local model fix: ${reason}` : `Local model suggestion (not auto-applied): ${reason}`,
        sourceHash,
      });
    } else if (part.added) {
      // Pure insertion with no paired removal (e.g. the model added a missing word).
      // Insertions are never auto-applied — no "original" span to anchor/verify against.
      const toTrim = part.value.trim();
      if (!toTrim) continue;
      issues.push({
        id: `local_${randomUUID().slice(0, 8)}`,
        category: "grammar",
        rule: "local_model_suggestion",
        startUtf16: originalOffset,
        endUtf16: originalOffset,
        original: "",
        replacement: part.value,
        confidence: 0.4,
        safeAuto: false,
        severity: "suggestion",
        explanation: "Local model suggests inserting text here (not auto-applied)",
        sourceHash,
      });
    }
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
