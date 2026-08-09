import type { CheckRequest, CheckResponse, GrammarIssue, RewriteRequest, RewriteResponse, ProtectedFact, VoiceProfile, ElevatedWordGloss } from "@prosepilot/writing-core";
import { extractProtectedFacts, validateFacts, computeHash, shouldShowIssue } from "@prosepilot/writing-core";
import { sampleVocabularyExamples } from "./elevatedVocabulary.js";
import { randomUUID } from "crypto";
import { checkWithLocalModel } from "./localGrammarModel.js";

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY!;
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const LANGUAGETOOL_URL = process.env.LANGUAGETOOL_URL || "http://localhost:8010";

// --- DeepSeek result cache ---
// checkGrammar's "review" mode calls DeepSeek unconditionally on every check (deliberate —
// it catches things the rule engine/LanguageTool miss), which means cost scales directly
// with request volume. DeepSeek announced a "significant" API price increase (Aug 2026,
// exact new rates not yet published), so avoiding pointless re-billing for text that was
// just checked matters more than it used to. This cache is purely in-memory, capped, and
// short-lived — it is NOT persisted to disk or a database, so it stays consistent with the
// "your writing is never stored" privacy promise on the marketing site. It only helps when
// the exact same text is re-submitted (re-clicking Check Grammar without changes, re-opening
// the same selection, etc.) — any edit changes the hash and falls through to a real check.
const DEEPSEEK_CACHE_MAX = 500;
const DEEPSEEK_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const deepSeekCache = new Map<string, { issues: GrammarIssue[]; expiresAt: number }>();

function getCachedDeepSeekIssues(hash: string): GrammarIssue[] | null {
  const entry = deepSeekCache.get(hash);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    deepSeekCache.delete(hash);
    return null;
  }
  return entry.issues;
}

function setCachedDeepSeekIssues(hash: string, issues: GrammarIssue[]) {
  if (deepSeekCache.size >= DEEPSEEK_CACHE_MAX) {
    // Map preserves insertion order — evicting the first key evicts the oldest entry.
    // Simple bounded cap, no need for a full LRU implementation at this scale.
    const oldestKey = deepSeekCache.keys().next().value;
    if (oldestKey !== undefined) deepSeekCache.delete(oldestKey);
  }
  deepSeekCache.set(hash, { issues, expiresAt: Date.now() + DEEPSEEK_CACHE_TTL_MS });
}

// --- LanguageTool Integration ---

interface LTMatch {
  message: string;
  replacements: Array<{ value: string }>;
  offset: number;
  length: number;
  rule: { id: string; category: { id: string } };
  context?: { text: string };
  "pre-context"?: string;
  "post-context"?: string;
}

async function callLanguageTool(text: string): Promise<GrammarIssue[]> {
  // Skip if LanguageTool URL is not configured or points to localhost (not deployed on Railway)
  if (!process.env.LANGUAGETOOL_URL || LANGUAGETOOL_URL === "http://localhost:8010") {
    return [];
  }
  try {
    const response = await fetch(`${LANGUAGETOOL_URL}/v2/check`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ text, language: "en-US" }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return [];

    const data = await response.json() as { matches?: LTMatch[] };
    const sourceHash = await computeHash(text);

    return (data.matches || []).map((match: LTMatch) => {
      const category = mapLTCategory(match.rule.category.id);
      const confidence = match.replacements.length > 0 ? 0.95 : 0.7;

      return {
        id: `lt_${randomUUID().slice(0, 8)}`,
        category,
        rule: match.rule.id,
        startUtf16: match.offset,
        endUtf16: match.offset + match.length,
        original: text.slice(match.offset, match.offset + match.length),
        replacement: match.replacements[0]?.value || text.slice(match.offset, match.offset + match.length),
        confidence,
        safeAuto: isSafeAuto(category, confidence, match.replacements.length),
        severity: mapLTSeverity(match.rule.category.id),
        explanation: match.message,
        sourceHash,
      };
    });
  } catch (error) {
    // LanguageTool unavailable — fall through to other tiers
    return [];
  }
}

function mapLTCategory(categoryId: string): GrammarIssue["category"] {
  if (categoryId.includes("SPELL")) return "spelling";
  if (categoryId.includes("GRAMMAR")) return "grammar";
  if (categoryId.includes("PUNCT")) return "punctuation";
  if (categoryId.includes("STYLE")) return "style";
  if (categoryId.includes("TYPO")) return "spelling";
  return "grammar";
}

function mapLTSeverity(categoryId: string): GrammarIssue["severity"] {
  if (categoryId.includes("TYPO") || categoryId.includes("MISSPELL")) return "error";
  if (categoryId.includes("GRAMMAR")) return "warning";
  return "info";
}

function isSafeAuto(category: GrammarIssue["category"], confidence: number, replacementCount: number): boolean {
  if (confidence < 0.9) return false;
  if (replacementCount > 1) return false;
  if (category === "clarity" || category === "tone" || category === "style") return false;
  return true;
}

// --- DeepSeek Integration ---

async function callDeepSeek(messages: Array<{ role: string; content: string }>, model = "deepseek-chat"): Promise<string> {
  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      max_tokens: 4096,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek API error: ${response.status}`);
  }

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content || "";
}

// --- Grammar Check Engine ---

// Preserves the matched text's capitalization pattern when substituting in a canonical
// (lowercase) contraction spelling — e.g. "Dont" -> "Don't", "DONT" -> "DON'T", "dont" ->
// "don't". Used by the missing-apostrophe-contraction rules below.
function applyContractionCase(matched: string, canonical: string): string {
  if (matched === matched.toUpperCase()) return canonical.toUpperCase();
  if (matched[0] === matched[0]?.toUpperCase()) return canonical[0].toUpperCase() + canonical.slice(1);
  return canonical;
}

// Tier 0: Rule-based fixes (instant, free, no API call)
function detectRuleBasedIssues(text: string): GrammarIssue[] {
  const issues: GrammarIssue[] = [];
  const sourceHash = computeHashSync(text);

  const rules: Array<{ pattern: RegExp; replacement: string | ((match: string, ...groups: string[]) => string); category: GrammarIssue["category"]; rule: string; explanation: string }> = [
    // === CAPITALIZATION ===
    // Sentence starts with lowercase after period/exclamation/question
    { pattern: /([.!?]\s+)([a-z])/g, replacement: (_m, p1, p2) => p1 + p2.toUpperCase(), category: "grammar", rule: "capitalize_after_period", explanation: "Capitalize the first word of a new sentence." },
    // Sentence start at beginning of text — capitalize first letter. Tolerates leading
    // whitespace/newlines before the first word: contentEditable extraction (e.g. Outlook's
    // compose box) can produce text with a leading "\n" from an empty first line, which
    // defeated the old strict ^([a-z]) anchor and silently skipped this fix entirely.
    { pattern: /^(\s*)([a-z])/g, replacement: (_m: string, ws: string, letter: string) => ws + letter.toUpperCase(), category: "grammar", rule: "capitalize_sentence_start", explanation: "Capitalize the first word of a sentence." },

    // === SUBJECT-VERB AGREEMENT (deterministic, unambiguous cases only) ===
    // "has" only agrees with he/she/it/singular nouns — it is NEVER correct after I/you/we/they,
    // so this is a safe, always-correct fix (unlike general subject-verb agreement, which needs
    // real parsing). Matched via lookbehind so only "has" itself is replaced — the pronoun's own
    // capitalization (handled by the rules above) stays a separate, non-overlapping edit.
    { pattern: /(?<=\b(?:i|you|we|they)\s)has\b/gi, replacement: "have", category: "grammar", rule: "subject_verb_agreement", explanation: "Use 'have', not 'has', with I/you/we/they." },
    // Product/brand names — Prosepilot → ProsePilot
    { pattern: /\bProsepilot\b/g, replacement: "ProsePilot", category: "spelling", rule: "proper_noun_capitalization", explanation: "Proper noun 'ProsePilot' should be capitalized correctly." },
    { pattern: /\bGrammarly\b/gi, replacement: "Grammarly", category: "spelling", rule: "proper_noun_capitalization", explanation: "Proper noun 'Grammarly' should be capitalized correctly." },
    { pattern: /\bMicrosoft\b/gi, replacement: "Microsoft", category: "spelling", rule: "proper_noun_capitalization", explanation: "Proper noun 'Microsoft' should be capitalized correctly." },
    { pattern: /\bGoogle\b/gi, replacement: "Google", category: "spelling", rule: "proper_noun_capitalization", explanation: "Proper noun 'Google' should be capitalized correctly." },
    { pattern: /\bOpenai\b/g, replacement: "OpenAI", category: "spelling", rule: "proper_noun_capitalization", explanation: "Proper noun 'OpenAI' should be capitalized correctly." },
    { pattern: /\bDeepseek\b/g, replacement: "DeepSeek", category: "spelling", rule: "proper_noun_capitalization", explanation: "Proper noun 'DeepSeek' should be capitalized correctly." },
    // "the edge" → "The Edge" (Microsoft Edge product)
    { pattern: /\bthe edge\b/gi, replacement: "The Edge", category: "grammar", rule: "proper_noun_article", explanation: "'The Edge' is a proper noun (product name) and should be capitalized." },

    // === PUNCTUATION ===
    // Space before comma/period/semicolon/colon
    { pattern: /(\w) ,/g, replacement: "$1,", category: "punctuation", rule: "space_before_comma", explanation: "Remove space before comma." },
    { pattern: /(\w) \./g, replacement: "$1.", category: "punctuation", rule: "space_before_period", explanation: "Remove space before period." },
    { pattern: /(\w) ;/g, replacement: "$1;", category: "punctuation", rule: "space_before_semicolon", explanation: "Remove space before semicolon." },
    { pattern: /(\w) :/g, replacement: "$1:", category: "punctuation", rule: "space_before_colon", explanation: "Remove space before colon." },
    // Space before closing quote/bracket
    { pattern: /(\w) \)/g, replacement: "$1)", category: "punctuation", rule: "space_before_paren", explanation: "Remove space before closing parenthesis." },
    // Double spaces
    { pattern: /  +/g, replacement: " ", category: "style", rule: "double_space", explanation: "Remove extra spaces." },
    // Missing period at end of sentence. The negative lookbehind excludes lines that
    // already end in a comma, colon, or semicolon — e.g. an email salutation like
    // "Hello Abraham," is correctly terminated for its purpose and should never get a
    // period appended right after the comma ("Hello Abraham,."). The base character
    // class only ever checked for . ! ? } " anywhere in the line, not what the line
    // actually ends with, which is what let this false positive through.
    { pattern: /^([A-Z][^.!?}\n"]+)(?<![,:;])$/gm, replacement: "$1.", category: "punctuation", rule: "missing_period", explanation: "Sentences should end with a period." },
    // Double punctuation
    { pattern: /\.\./g, replacement: "...", category: "punctuation", rule: "double_period", explanation: "Use an ellipsis (...) not double periods." },
    // Missing comma after introductory/conditional clause
    { pattern: /\b(If|When|While|Although|Because|Since|Unless|After|Before|Until|Once|Whenever|Wherever|Whether)\s+([^,]+?)\s+([A-Z][a-z]*)/g, replacement: "$1 $2, $3", category: "punctuation", rule: "comma_after_conditional", explanation: "Use a comma after an introductory or conditional clause." },

    // === MISSING APOSTROPHE IN CONTRACTIONS (unambiguous cases only) ===
    // Found via a live bug: the local small-model tier (localGrammarModel.ts) was observed
    // "fixing" the typo "dont" into "do" instead of "don't" — silently DROPPING THE NEGATION
    // and inverting the sentence's meaning ("I dont want to loose this" -> "I do want to
    // lose this"), while still being tagged "Safe auto-fix". The model's small-edit-distance
    // safety heuristic can't tell "restore the apostrophe" apart from "delete two letters",
    // and both look equally "safe" by that metric alone.
    //
    // These specific words have NO valid standalone English reading without the apostrophe
    // (unlike e.g. "its", which is a legitimate possessive on its own — that ambiguous case
    // is handled separately, in localGrammarModel.ts's classify(), not here) — so restoring
    // the apostrophe is always correct, deterministically, without needing any model at all.
    // This also fixes the bug directly: mergeAllIssues() gives the rule engine priority over
    // the local model at the same text span, so once this rule fires on "dont", the local
    // model's wrong "dont"->"do" suggestion at that same span is dropped by the merge dedup
    // rather than shown alongside (or instead of) the correct fix.
    { pattern: /\bdont\b/gi, replacement: (m: string) => applyContractionCase(m, "don't"), category: "grammar", rule: "missing_apostrophe_contraction", explanation: "Missing apostrophe: should be \"don't\"." },
    { pattern: /\bcant\b/gi, replacement: (m: string) => applyContractionCase(m, "can't"), category: "grammar", rule: "missing_apostrophe_contraction", explanation: "Missing apostrophe: should be \"can't\"." },
    { pattern: /\bwont\b/gi, replacement: (m: string) => applyContractionCase(m, "won't"), category: "grammar", rule: "missing_apostrophe_contraction", explanation: "Missing apostrophe: should be \"won't\"." },
    { pattern: /\bisnt\b/gi, replacement: (m: string) => applyContractionCase(m, "isn't"), category: "grammar", rule: "missing_apostrophe_contraction", explanation: "Missing apostrophe: should be \"isn't\"." },
    { pattern: /\barent\b/gi, replacement: (m: string) => applyContractionCase(m, "aren't"), category: "grammar", rule: "missing_apostrophe_contraction", explanation: "Missing apostrophe: should be \"aren't\"." },
    { pattern: /\bwasnt\b/gi, replacement: (m: string) => applyContractionCase(m, "wasn't"), category: "grammar", rule: "missing_apostrophe_contraction", explanation: "Missing apostrophe: should be \"wasn't\"." },
    { pattern: /\bwerent\b/gi, replacement: (m: string) => applyContractionCase(m, "weren't"), category: "grammar", rule: "missing_apostrophe_contraction", explanation: "Missing apostrophe: should be \"weren't\"." },
    { pattern: /\bdoesnt\b/gi, replacement: (m: string) => applyContractionCase(m, "doesn't"), category: "grammar", rule: "missing_apostrophe_contraction", explanation: "Missing apostrophe: should be \"doesn't\"." },
    { pattern: /\bdidnt\b/gi, replacement: (m: string) => applyContractionCase(m, "didn't"), category: "grammar", rule: "missing_apostrophe_contraction", explanation: "Missing apostrophe: should be \"didn't\"." },
    { pattern: /\bhasnt\b/gi, replacement: (m: string) => applyContractionCase(m, "hasn't"), category: "grammar", rule: "missing_apostrophe_contraction", explanation: "Missing apostrophe: should be \"hasn't\"." },
    { pattern: /\bhavent\b/gi, replacement: (m: string) => applyContractionCase(m, "haven't"), category: "grammar", rule: "missing_apostrophe_contraction", explanation: "Missing apostrophe: should be \"haven't\"." },
    { pattern: /\bhadnt\b/gi, replacement: (m: string) => applyContractionCase(m, "hadn't"), category: "grammar", rule: "missing_apostrophe_contraction", explanation: "Missing apostrophe: should be \"hadn't\"." },
    { pattern: /\bwouldnt\b/gi, replacement: (m: string) => applyContractionCase(m, "wouldn't"), category: "grammar", rule: "missing_apostrophe_contraction", explanation: "Missing apostrophe: should be \"wouldn't\"." },
    { pattern: /\bcouldnt\b/gi, replacement: (m: string) => applyContractionCase(m, "couldn't"), category: "grammar", rule: "missing_apostrophe_contraction", explanation: "Missing apostrophe: should be \"couldn't\"." },
    { pattern: /\bshouldnt\b/gi, replacement: (m: string) => applyContractionCase(m, "shouldn't"), category: "grammar", rule: "missing_apostrophe_contraction", explanation: "Missing apostrophe: should be \"shouldn't\"." },
    { pattern: /\bshant\b/gi, replacement: (m: string) => applyContractionCase(m, "shan't"), category: "grammar", rule: "missing_apostrophe_contraction", explanation: "Missing apostrophe: should be \"shan't\"." },
    { pattern: /\byoure\b/gi, replacement: (m: string) => applyContractionCase(m, "you're"), category: "grammar", rule: "missing_apostrophe_contraction", explanation: "Missing apostrophe: should be \"you're\"." },
    { pattern: /\btheyre\b/gi, replacement: (m: string) => applyContractionCase(m, "they're"), category: "grammar", rule: "missing_apostrophe_contraction", explanation: "Missing apostrophe: should be \"they're\"." },
    { pattern: /\bweve\b/gi, replacement: (m: string) => applyContractionCase(m, "we've"), category: "grammar", rule: "missing_apostrophe_contraction", explanation: "Missing apostrophe: should be \"we've\"." },
    { pattern: /\bwhats\b/gi, replacement: (m: string) => applyContractionCase(m, "what's"), category: "grammar", rule: "missing_apostrophe_contraction", explanation: "Missing apostrophe: should be \"what's\"." },
    { pattern: /\bthats\b/gi, replacement: (m: string) => applyContractionCase(m, "that's"), category: "grammar", rule: "missing_apostrophe_contraction", explanation: "Missing apostrophe: should be \"that's\"." },

    // === WORD FORM ERRORS ===
    // Gerund after possessive/preposition — should be noun
    { pattern: /\bour discussing\b/gi, replacement: "our discussion", category: "grammar", rule: "gerund_to_noun", explanation: "Use the noun form 'discussion' after a possessive, not the gerund 'discussing'." },
    { pattern: /\btheir discussing\b/gi, replacement: "their discussion", category: "grammar", rule: "gerund_to_noun", explanation: "Use the noun form 'discussion' after a possessive, not the gerund 'discussing'." },
    { pattern: /\bthe discussing\b/gi, replacement: "the discussion", category: "grammar", rule: "gerund_to_noun", explanation: "Use the noun form 'discussion' after 'the', not the gerund 'discussing'." },
    { pattern: /\ba discussing\b/gi, replacement: "a discussion", category: "grammar", rule: "gerund_to_noun", explanation: "Use the noun form 'discussion' after 'a', not the gerund 'discussing'." },
    { pattern: /\bduring discussing\b/gi, replacement: "during the discussion", category: "grammar", rule: "gerund_to_noun", explanation: "Use 'during the discussion', not 'during discussing'." },
    { pattern: /\bper our discussing\b/gi, replacement: "Per our discussion", category: "grammar", rule: "gerund_to_noun", explanation: "Use the noun form 'discussion' after 'our', not the gerund 'discussing'." },

    // === UNCOUNTABLE NOUNS ===
    { pattern: /\bfoods\b/gi, replacement: "food", category: "grammar", rule: "uncountable_noun", explanation: "'Food' is typically uncountable. Use 'food' not 'foods'." },
    { pattern: /\binformations\b/gi, replacement: "information", category: "grammar", rule: "uncountable_noun", explanation: "'Information' is uncountable. Use 'information' not 'informations'." },
    { pattern: /\badvices\b/gi, replacement: "advice", category: "grammar", rule: "uncountable_noun", explanation: "'Advice' is uncountable. Use 'advice' not 'advices'." },
    { pattern: /\bequipments\b/gi, replacement: "equipment", category: "grammar", rule: "uncountable_noun", explanation: "'Equipment' is uncountable. Use 'equipment' not 'equipments'." },
    { pattern: /\bfurnitures\b/gi, replacement: "furniture", category: "grammar", rule: "uncountable_noun", explanation: "'Furniture' is uncountable. Use 'furniture' not 'furnitures'." },
    { pattern: /\bstaffs\b/gi, replacement: "staff", category: "grammar", rule: "uncountable_noun", explanation: "'Staff' is typically uncountable. Use 'staff' not 'staffs'." },
    { pattern: /\bhomeworks\b/gi, replacement: "homework", category: "grammar", rule: "uncountable_noun", explanation: "'Homework' is uncountable. Use 'homework' not 'homeworks'." },
    { pattern: /\bmails\b/g, replacement: "mail", category: "grammar", rule: "uncountable_noun", explanation: "'Mail' is typically uncountable. Use 'mail' not 'mails'." },
    { pattern: /\bprogresses\b/gi, replacement: "progress", category: "grammar", rule: "uncountable_noun", explanation: "'Progress' is uncountable. Use 'progress' not 'progresses'." },
    { pattern: /\bresearches\b/gi, replacement: "research", category: "grammar", rule: "uncountable_noun", explanation: "'Research' is uncountable. Use 'research' not 'researches'." },
    { pattern: /\bevidences\b/gi, replacement: "evidence", category: "grammar", rule: "uncountable_noun", explanation: "'Evidence' is uncountable. Use 'evidence' not 'evidences'." },

    // === MISSING OBJECT PRONOUN ===
    // "they finished on time" → "they finished it on time"
    { pattern: /\b(finished|completed|submitted|reviewed|approved|processed|resolved|addressed|handled|finished up|wrapped up) (on time|early|late|before|after|today|yesterday|this week|last week|this month|next week)\b/gi, replacement: "$1 it $2", category: "grammar", rule: "missing_object_pronoun", explanation: "This verb typically needs a direct object. Add 'it' to clarify what was finished." },

    // === ADJECTIVE-NOUN WORD ORDER ===
    // Common reversed pairs in property management
    { pattern: /\bupgrade premium\b/gi, replacement: "premium upgrade", category: "style", rule: "adjective_noun_order", explanation: "Adjective before noun: 'premium upgrade' not 'upgrade premium'." },
    { pattern: /\breport inspection\b/gi, replacement: "inspection report", category: "style", rule: "adjective_noun_order", explanation: "Adjective before noun: 'inspection report' not 'report inspection'." },
    { pattern: /\binspection site visit\b/gi, replacement: "site visit inspection", category: "style", rule: "adjective_noun_order", explanation: "Reorder: 'site visit inspection' not 'inspection site visit'." },
    { pattern: /\btile shower\b/gi, replacement: "shower tile", category: "style", rule: "adjective_noun_order", explanation: "Adjective before noun: 'shower tile' not 'tile shower'." },
    { pattern: /\bschedule gate\b/gi, replacement: "gate schedule", category: "style", rule: "adjective_noun_order", explanation: "Adjective before noun: 'gate schedule' not 'schedule gate'." },
    { pattern: /\btrim border\b/gi, replacement: "border trim", category: "style", rule: "adjective_noun_order", explanation: "Adjective before noun: 'border trim' not 'trim border'." },
    { pattern: /\blist units\b/gi, replacement: "unit list", category: "style", rule: "adjective_noun_order", explanation: "Adjective before noun: 'unit list' not 'list units'." },
    { pattern: /\bcondition exterior\b/gi, replacement: "exterior condition", category: "style", rule: "adjective_noun_order", explanation: "Adjective before noun: 'exterior condition' not 'condition exterior'." },
    { pattern: /\breadiness unit\b/gi, replacement: "unit readiness", category: "style", rule: "adjective_noun_order", explanation: "Adjective before noun: 'unit readiness' not 'readiness unit'." },
    { pattern: /\bupdates progress\b/gi, replacement: "progress updates", category: "style", rule: "adjective_noun_order", explanation: "Adjective before noun: 'progress updates' not 'updates progress'." },
  ];

  for (const rule of rules) {
    let match;
    rule.pattern.lastIndex = 0;
    while ((match = rule.pattern.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      // Compute replacement using the pattern's replacement string/function
      let fixed: string;
      // Save lastIndex before replace — String.replace() with a global regex resets lastIndex to 0
      const savedLastIndex = rule.pattern.lastIndex;
      if (typeof rule.replacement === "function") {
        fixed = match[0].replace(rule.pattern, rule.replacement as any);
      } else if (match.length > 1) {
        // Has capture groups — use the replacement with $1, $2 etc.
        fixed = match[0].replace(rule.pattern, rule.replacement);
      } else {
        // No capture groups — use the replacement string directly
        fixed = rule.replacement;
      }
      // Restore lastIndex after replace (which resets it to 0 for global regexes)
      rule.pattern.lastIndex = savedLastIndex;

      // Only add if the fix actually changes something
      if (fixed && fixed !== match[0]) {
        issues.push({
          id: `rule_${randomUUID().slice(0, 8)}`,
          category: rule.category,
          rule: rule.rule,
          startUtf16: start,
          endUtf16: end,
          original: match[0],
          replacement: fixed,
          confidence: 0.99,
          safeAuto: true,
          severity: "info",
          explanation: rule.explanation,
          sourceHash,
        });
      }
    }
  }

  return issues;
}

function computeHashSync(text: string): string {
  // Quick synchronous hash for rule-based issues
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `sha256:${Math.abs(hash).toString(16).padStart(8, "0")}`;
}

export async function checkGrammar(request: CheckRequest & { lightweight?: boolean; rulesOnly?: boolean; localOnly?: boolean; voiceProfile?: VoiceProfile | null }): Promise<CheckResponse> {
  const startTime = Date.now();
  const { text, mode, lightweight, rulesOnly, localOnly, voiceProfile } = request;

  // Tier 0: Rule-based (instant, free)
  const ruleIssues = detectRuleBasedIssues(text);

  // If rulesOnly mode, skip everything else — rule engine's regex fixes only.
  if (rulesOnly) {
    const filteredIssues = voiceProfile
      ? ruleIssues.filter(issue => shouldShowIssue(voiceProfile, issue))
      : ruleIssues;
    const latencyMs = Date.now() - startTime;
    const sourceHash = await computeHash(text);
    return {
      issues: filteredIssues,
      updatedHash: sourceHash,
      usage: {
        characterCount: text.length,
        issueCount: filteredIssues.length,
        checkMode: mode,
        latencyMs,
        engineTier: "rule",
      },
    };
  }

  // If localOnly mode (used by the document checker's first pass, per-paragraph), run the
  // two free/in-process tiers — rule engine + local small model — and stop there, without
  // touching LanguageTool or DeepSeek at all. The caller decides whether to escalate a given
  // paragraph to the full pipeline based on whether this pass found anything: a paragraph
  // the free tiers already fixed doesn't need DeepSeek's "second opinion" as urgently as one
  // that came back looking clean, which is exactly where DeepSeek earns its cost (catching
  // things rule-based/pattern matching can't).
  if (localOnly) {
    const localModelIssues = await checkWithLocalModel(text);
    const merged = mergeAllIssues(ruleIssues, localModelIssues, [], []);
    const filteredIssues = voiceProfile
      ? merged.filter(issue => shouldShowIssue(voiceProfile, issue))
      : merged;
    const latencyMs = Date.now() - startTime;
    const sourceHash = await computeHash(text);
    return {
      issues: filteredIssues,
      updatedHash: sourceHash,
      usage: {
        characterCount: text.length,
        issueCount: filteredIssues.length,
        checkMode: mode,
        latencyMs,
        engineTier: localModelIssues.length > 0 ? "local-model" : "rule",
      },
    };
  }

  // Tier 1.5: local small-model grammar pass (Xenova/grammar-synthesis-small, in-process,
  // no network call). Runs in EVERY mode, including lightweight — this is what makes the
  // extension's fast-pass actually smart instead of just rule engine + LT. It's fast
  // (~150-300ms warm) and its own internal diff/safety-filter (see localGrammarModel.ts)
  // means only narrow, deterministic-looking fixes come back safeAuto:true; anything it's
  // not certain about (including meaning-changing hallucinations observed in testing, e.g.
  // "tenant" -> "landlord") comes back safeAuto:false, same treatment as DeepSeek below.
  const localModelPromise = checkWithLocalModel(text);

  // Tier 1: LanguageTool (free, self-hosted) + Tier 2: DeepSeek (clarity/tone/grammar AI pass).
  // These two calls don't depend on each other's results whenever DeepSeek is going to run
  // unconditionally (mode "rewrite"/"report"/"review" — which covers every mode the extension's
  // inline checker and rewrite/report features actually send), so run them in parallel instead
  // of back-to-back. This is a pure latency win with no change in what gets returned: the only
  // case that still needs LT's result BEFORE deciding whether to call DeepSeek is the narrower
  // "call DeepSeek only if LT found something" branch, which is preserved exactly as before.
  let ltIssues: GrammarIssue[];
  let aiIssues: GrammarIssue[] = [];
  const alwaysCallsDeepSeek = !lightweight && (mode === "rewrite" || mode === "report" || mode === "review");
  if (alwaysCallsDeepSeek) {
    [ltIssues, aiIssues] = await Promise.all([callLanguageTool(text), callDeepSeekForIssues(text)]);
  } else {
    ltIssues = await callLanguageTool(text);
    if (!lightweight && ltIssues.length > 0) {
      aiIssues = await callDeepSeekForIssues(text);
    }
  }
  const localModelIssues = await localModelPromise;

  // Merge: rule-based + local model + LT + AI, deduplicate by offset proximity
  const mergedIssues = mergeAllIssues(ruleIssues, localModelIssues, ltIssues, aiIssues);

  // Voice profile filtering: remove style deviations that match user's habits
  const allIssues = voiceProfile
    ? mergedIssues.filter(issue => shouldShowIssue(voiceProfile, issue))
    : mergedIssues;

  const latencyMs = Date.now() - startTime;
  const sourceHash = await computeHash(text);

  return {
    issues: allIssues,
    updatedHash: sourceHash,
    usage: {
      characterCount: text.length,
      issueCount: allIssues.length,
      checkMode: mode,
      latencyMs,
      engineTier: aiIssues.length > 0 ? "deepseek" : ltIssues.length > 0 ? "lt" : localModelIssues.length > 0 ? "local-model" : "rule",
    },
  };
}

async function callDeepSeekForIssues(text: string): Promise<GrammarIssue[]> {
  try {
    // Computed up front (not just for tagging issues, as before) so we can check the cache
    // before spending a DeepSeek call at all.
    const sourceHash = await computeHash(text);
    const cached = getCachedDeepSeekIssues(sourceHash);
    if (cached) return cached;

    // COST NOTE (2026-08-09): everything in this prompt up to the `${text}` interpolation is
    // 100% static — no mode/language/documentType/voiceProfile is mixed in above this point.
    // That's deliberate: DeepSeek's API automatically caches repeated prompt prefixes on disk
    // (no code/config needed), and cache-hit input tokens price at roughly 1/50th of a cache
    // miss. Because this prefix is byte-for-byte identical on every single check call across
    // the whole app, it's a near-ideal case for that automatic discount. If you add a variable
    // (e.g. `${language}`) anywhere before the SPECIFIC PATTERNS block or the text-to-check
    // marker, you fragment the prefix and silently kill the cache-hit rate for everyone — put
    // new per-request variation AFTER the text block instead, or accept the cost tradeoff
    // consciously. The rule bullets below are intentionally terse (no restated category tags,
    // no human-facing "why we added this" asides) to keep the static block itself smaller —
    // but every concrete example stays, since vague wording measurably hurts rule-following
    // (see PROJECT_CONTEXT.md for prior incidents).
    const prompt = `You are a professional grammar and style checker. Analyze the following text for grammar, spelling, punctuation, clarity, style, and tone issues.

Return a JSON array of issues. Each issue must have:
- "category": one of "grammar", "spelling", "punctuation", "clarity", "style", "tone", "conciseness"
- "rule": a short rule identifier (e.g. "passive_voice", "wordiness", "unclear_antecedent")
- "original": the EXACT problematic text copied character-for-character from the input
- "replacement": the suggested fix
- "confidence": 0.0 to 1.0
- "severity": "error", "warning", "info", or "suggestion"
- "explanation": ONE short clause, max ~10 words, stating just why it's wrong (not the fix itself — keep it brief, this is shown in a small popup)

CRITICAL RULES:
1. The "original" field MUST be an exact substring of the input text — copy it character-for-character
2. Do NOT include text from multiple sentences in one issue — keep each issue to a single phrase or clause
3. Do NOT modify or "clean up" the original text — copy exactly as it appears
4. If you're unsure about exact text, skip the issue

SPECIFIC PATTERNS TO CHECK:
- TYPOS IN COMMON WORDS: simple typos in common words — missing/extra/transposed letters — e.g. "wen"→"when", "somone"→"someone", "teh"→"the", "recieve"→"receive". Infer the most contextually PROBABLE intended word, not the nearest dictionary match in isolation (don't "correct" "wen" to the name "Wen").
- SUBJECT-VERB AGREEMENT: verb must agree with subject in person/number — "he go"→"he goes", "someone open"→"someone opens", "I has"→"I have", "they was"→"they were". Third-person singular (he/she/it/someone/anyone/the tenant) takes -s/-es.
- DO NOT FLAG: singular "they/them/their" for unknown/unspecified gender ("If a participant withdraws, they will be replaced") — correct modern English, not an agreement error.
- PROPER NOUNS: "prosepilot"→"ProsePilot", "grammarly"→"Grammarly", "deepseek"→"DeepSeek", "openai"→"OpenAI", "microsoft"→"Microsoft"
- ARTICLE CAPITALIZATION: "the edge"→"The Edge" (product name), "the internet"→"The Internet" (proper noun)
- SENTENCE START: first word of every sentence capitalized
- COMPOUND WORDS: "fireplace" not "fire place", "widespread" not "wide-spread", "inoperable" not "no longer operable"
- SPELLING: "leasing" used as adjective → "leased" (past participle)
- PUNCTUATION: semicolons before independent clauses ("LLC; the service")
- CONCISENESS: "I would like to recommend to have"→"I want to recommend having"; "We would like to request"→"We want to request"
- PASSIVE VOICE: a form of "to be" (is/are/was/were/been/being) + past participle, often with "by ___" naming the actual doer — "The report was reviewed by the manager"→"The manager reviewed the report". Don't confuse with past tense ("The manager reviewed the report" is active).
- HIDDEN VERBS (NOMINALIZATIONS): a verb turned into a noun needing a second, weaker verb — "conduct an analysis of"→"analyze"; "make a decision about"→"decide"; "responsible for management of"→"manage". Common endings: -tion, -sion, -ment, -ance. Flag when the direct verb reads more naturally.
- AMBIGUOUS PRONOUN ANTECEDENT: a pronoun (it/they/this/that) that could refer to more than one noun in the sentence — "When the editor contacted the author, they declined" (who declined?) → name the specific noun. Only flag genuine two-way ambiguity.
- ARTICLE CHOICE, A vs AN: choose by SOUND not spelling — "a European study" (y-sound), "an hour" (silent h), "an MRI" (vowel sound), "a university" (y-sound). Only flag clear mismatches like "an European" or "a hour".
- ARTICLE CHOICE, A/AN vs THE: "a/an" on first mention, "the" after — "We propose a new process. The process will..." not the reverse. Only flag unambiguous mismatches.
- VAGUE NOUN PLACEHOLDERS: "thing"/"stuff"/"issue"/"aspect" where a specific noun is clearly implied — "Fix the thing with the report"→"Fix the formatting error in the report". Only flag when the specific noun is obvious, never a guess.
- OVERLONG NOUN STRINGS: 3+ stacked nouns with no linking word — "patient outcomes improvement initiative metrics"→"metrics for the patient-outcomes improvement initiative". Only flag genuinely ambiguous stacks, not normal compounds like "grammar checker".
- MISSING AUXILIARY VERB: "work orders completed"→"work orders were completed"; "the unit delayed"→"the unit was delayed" — passive constructions missing was/were/is/are/been
- MISSING LINKING VERB: a subject with no verb at all connecting it to a location, description, or state — "My book on the table"→"My book is on the table"; "The report ready"→"The report is ready". Distinct from MISSING AUXILIARY VERB above (that's a passive past-participle missing its auxiliary; this is a sentence with no verb whatsoever).
- WORDINESS: flag unnecessary words and phrases
- WRONG WORD FORM: gerunds used where nouns are needed — "Per our discussing"→"Per our discussion"; "Due to the happening"→"Due to the event" — after possessives/prepositions (our, the, of, for, per, based on), use the noun form not -ing
- ADJECTIVE-NOUN WORD ORDER: adjectives come before nouns — "upgrade premium"→"premium upgrade"; "report inspection"→"inspection report"; "tile shower"→"shower tile"
- REDUNDANT WORDS: "efforts troubleshooting"→"troubleshooting efforts"; "ready units vacant"→"vacant ready units" — reversed adjective-noun pairs
- UNCOUNTABLE NOUNS: "foods"→"food"; "informations"→"information"; "advices"→"advice"; "equipments"→"equipment"; "furnitures"→"furniture"; "researches"→"research" — never pluralized
- MISSING OBJECT PRONOUN: "they finished on time"→"they finished it on time" — transitive verbs (finish, complete, submit, review, approve) need a direct object
- COMMA BEFORE "AND" IN COMPOUND SENTENCES: two independent clauses joined by "and" need a comma before it — "The team worked hard and they finished on time"→"...hard, and they finished..."
- ADJECTIVE VS ADVERB AFTER ACTION VERBS: adverb after action verbs — "The team performed good"→"performed well." Adjective after linking/sense verbs is correct — "I feel good," "This looks good" — do NOT flag those.
- PREPOSITION COLLOCATIONS: fixed verb+preposition pairs — "depend of"→"depend on"; "consist in"→"consist of"; "discuss about"→"discuss" (redundant "about"); "explain me"→"explain to me".
- RESTRICTIVE VS NONRESTRICTIVE (that vs which): "that" with no comma when the clause is necessary to identify the noun — "the report that I sent yesterday" (implies other reports exist). "which" with a comma for extra, non-essential detail — "the report, which I sent yesterday,". Only flag clear cases.
- REFLEXIVE PRONOUN OVERUSE: "myself/himself/herself/themselves" where plain "me/him/her/them" is correct — reflexive only right when subject and object are the same person. "Contact Sarah or myself"→"Contact Sarah or me".
- PRONOUN CASE IN COMPOUND STRUCTURES: pick the case you'd use if the other person weren't there — "Bob and me are attending"→"Bob and I are attending" (you'd say "I am attending"); "sent it to Jane and I"→"sent it to Jane and me" (you'd say "sent it to me").
- VERB TENSE CONSISTENCY: don't shift tense between clauses describing the same time frame — "The instructor explains the diagram to students who asked questions"→"...students who ask questions." Only flag clearly unintentional shifts.
- COMMONLY CONFUSED VERB PAIRS: lie (recline: lie, lay, has lain) vs lay (put down: lay, laid, has laid) — "I need to lay down"→"I need to lie down"; sit vs set — "set the table" not "sit the table"; rise vs raise — "prices rose" not "prices raised" (raise needs an object).
- NUMBERS AT SENTENCE START: never start a sentence with a numeral — "6% of respondents agreed"→"Six percent of respondents agreed."
- INCONSISTENT NUMBER FORMATTING IN A SERIES: all spelled out or all numerals, not mixed — "two apples, 6 oranges, and 3 bananas"→"two apples, six oranges, and three bananas".
- ITS/IT'S, YOUR/YOU'RE, THEIR/THEY'RE, WHOSE/WHO'S: context decides which is right — "its"=possessive, "it's"="it is/has"; "your"=possessive, "you're"="you are"; "their"=possessive, "they're"="they are"; "whose"=possessive, "who's"="who is/has". "The company lost it's license"→"its license"; "Your the best candidate"→"You're the best candidate".
- CORRELATIVE CONJUNCTIONS: paired connectors must match — either...or, neither...nor, not only...but also. "Neither the manager or the tenant agreed"→"...nor the tenant agreed"; "Not only was the unit late but over budget"→"...but also over budget".
- GENDERED JOB TITLES: prefer gender-neutral job nouns in professional writing — "fireman"→"firefighter"; "chairman"→"chairperson"/"chair"; "mailman"→"mail carrier"; "policeman"→"police officer"; "stewardess"→"flight attendant".
- CONTRAST VS ADDITIVE TRANSITIONS: "on the other hand"/"however"/"in contrast" must introduce a genuinely contrasting idea, not another supporting point — "Rent is up 5%. On the other hand, occupancy also improved" (both are good news, not a contrast) → "In addition, occupancy also improved". Only flag when the two ideas clearly don't oppose each other.
- ADVERB MISUSED TO MODIFY A NOUN: adverbs modify verbs/adjectives, not nouns — "a dramatically increase"→"a dramatic increase" (adjective+noun) or "increased dramatically" (verb+adverb).
- ARTICLE WITH COUNTRY/PLACE NAMES: no "the" before most country names — "in the Japan"→"in Japan"; "many people in the Texas"→"in Texas". Exception: abbreviated or plural/collective place names keep "the" — "the U.K.", "the U.S.A.", "the Philippines".

Be AGGRESSIVE about finding issues. Even small improvements count. Return issues for EVERY mistake you find, no matter how minor.

Only return issues you are confident about. Return an empty array if the text is clean.

Text to check:
"""
${text}
"""

Return ONLY the JSON array, no other text.`;

    const response = await callDeepSeek([
      { role: "system", content: "You are a grammar checking engine. Return only valid JSON arrays." },
      { role: "user", content: prompt },
    ]);

    // sourceHash was already computed above (before the cache check) — reused here for
    // tagging issues, same as before.

    // DeepSeek is told "Return ONLY the JSON array, no other text" but LLMs are unreliable
    // about following that literally — it can wrap the array in a ```json ... ``` markdown
    // fence, or add a stray sentence before/after it. A bare JSON.parse(response) throws on
    // any of that, which the catch below then silently turns into "found 0 issues" — visually
    // identical to DeepSeek genuinely finding nothing, even when it correctly identified real
    // errors. Pull out the first [...] array substring instead of trusting the response is
    // already clean JSON.
    const arrayMatch = response.match(/\[[\s\S]*\]/);
    const jsonCandidate = arrayMatch ? arrayMatch[0] : response;

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonCandidate);
    } catch (parseError) {
      // Don't log the response itself — DeepSeek's output can echo back user text. Length
      // alone is enough to confirm in Railway logs that this path is firing instead of
      // silently guessing why a check found 0 AI issues.
      console.warn(`[grammar] DeepSeek response failed JSON.parse (response length: ${response.length})`);
      return [];
    }

    if (!Array.isArray(parsed)) return [];

    // Validate and fix offsets — DeepSeek often returns wrong offsets
    const validated: GrammarIssue[] = [];
    for (const item of parsed) {
      const original = item.original || "";
      const replacement = item.replacement || "";
      if (!original || !replacement || original === replacement) continue;

      let start = item.startUtf16 || 0;
      let end = item.endUtf16 || 0;

      // Check if offset is valid: text.slice(start, end) should match original
      const actualAtOffset = text.slice(start, end);
      if (actualAtOffset === original) {
        // Offset is correct
        validated.push({
          id: `ds_${randomUUID().slice(0, 8)}`,
          category: item.category || "grammar",
          rule: item.rule || "ai_suggestion",
          startUtf16: start,
          endUtf16: end,
          original,
          replacement,
          confidence: item.confidence || 0.8,
          safeAuto: false,
          severity: item.severity || "suggestion",
          explanation: item.explanation || "",
          sourceHash,
        });
        continue;
      }

      // Offset is wrong — search for the original text in the document
      const foundIndex = text.indexOf(original);
      if (foundIndex === -1) {
        // Original text not found at all — skip this issue
        // Skip silently — do not log user text
        continue;
      }

      // Found it — use the correct offset
      validated.push({
        id: `ds_${randomUUID().slice(0, 8)}`,
        category: item.category || "grammar",
        rule: item.rule || "ai_suggestion",
        startUtf16: foundIndex,
        endUtf16: foundIndex + original.length,
        original,
        replacement,
        confidence: item.confidence || 0.8,
        safeAuto: false,
        severity: item.severity || "suggestion",
        explanation: item.explanation || "",
        sourceHash,
      });
    }

    setCachedDeepSeekIssues(sourceHash, validated);
    return validated;
  } catch (error) {
    // DeepSeek unavailable — return empty results
    return [];
  }
}

function mergeAllIssues(ruleIssues: GrammarIssue[], localModelIssues: GrammarIssue[], ltIssues: GrammarIssue[], aiIssues: GrammarIssue[]): GrammarIssue[] {
  // Start with rule-based issues (highest priority — always correct)
  const merged = [...ruleIssues];
  const usedPositions = new Set(ruleIssues.map((i) => `${i.startUtf16}-${i.endUtf16}`));

  // Add local-model issues that don't overlap with rule-based. Priority right after the
  // rule engine: its safeAuto:true fixes have already passed the narrow safety filter in
  // localGrammarModel.ts, and its safeAuto:false suggestions are still worth surfacing
  // ahead of LT/DeepSeek noise at the same position.
  for (const localIssue of localModelIssues) {
    const posKey = `${localIssue.startUtf16}-${localIssue.endUtf16}`;
    if (!usedPositions.has(posKey)) {
      merged.push(localIssue);
      usedPositions.add(posKey);
    }
  }

  // Add LT issues that don't overlap with anything already placed
  for (const ltIssue of ltIssues) {
    const posKey = `${ltIssue.startUtf16}-${ltIssue.endUtf16}`;
    if (!usedPositions.has(posKey)) {
      merged.push(ltIssue);
      usedPositions.add(posKey);
    }
  }

  // Add AI issues that don't overlap with any existing issue
  for (const aiIssue of aiIssues) {
    const posKey = `${aiIssue.startUtf16}-${aiIssue.endUtf16}`;
    if (!usedPositions.has(posKey)) {
      merged.push(aiIssue);
      usedPositions.add(posKey);
    }
  }

  return merged.sort((a, b) => a.startUtf16 - b.startUtf16);
}

// --- Rewrite Engine ---

export async function rewriteText(request: RewriteRequest): Promise<RewriteResponse> {
  const startTime = Date.now();
  const { text, tone, customInstruction, length } = request;

  // Extract protected facts
  const facts = extractProtectedFacts(text);
  const factList = facts.map((f) => `- ${f.type}: "${f.value}"`).join("\n");

  const lengthInstruction = length === "shorter"
    ? "Make the text shorter and more concise."
    : length === "longer"
      ? "Expand the text with more detail."
      : "Keep approximately the same length.";

  const toneDescriptions: Record<string, string> = {
    professional: "Clear, competent, and business-appropriate",
    executive: "Authoritative, strategic, suitable for leadership audiences",
    concise: "Brief and to-the-point, no unnecessary words",
    diplomatic: "Tactful and considerate, softening potentially negative messages",
    formal: "Standard formal business English, no contractions",
    affirmative: "Positive and encouraging, emphasizing what can be done",
    friendly: "Warm and approachable, conversational but professional",
    confident: "Assertive and self-assured, decisive language",
    empathetic: "Understanding and supportive, acknowledging feelings",
    persuasive: "Compelling and convincing, building toward a call to action",
    casual: "Relaxed and informal, suitable for internal team communication",
    firm: "Direct and clear about expectations, while remaining respectful",
    // "Elevated" swaps wordy phrases for a single precise word (the way GRE vocabulary
    // condenses a whole clause into one term) but is deliberately capped at "business-polished"
    // rather than maximal vocabulary — the goal is a reader thinking "sharp," never "what does
    // that word mean." Concrete example pairs are given directly in the description (rather than
    // a vague "use elevated language" instruction) because that's the same lesson learned from
    // the local grammar model's short-word bug this pass: vague heuristics drift, concrete
    // examples don't. The examples themselves live in elevatedVocabulary.ts — a standalone,
    // append-only list — specifically so adding more words later never requires touching this
    // prompt-building logic. The list is now well past 40 entries, so we send a bounded random
    // sample (25) per request rather than the whole thing, to keep prompt size roughly constant
    // as the vocabulary bank keeps growing (see sampleVocabularyExamples() in elevatedVocabulary.ts).
    elevated: `Upgrade wordy phrases to a single, precise word wherever a natural one exists. Examples:\n${sampleVocabularyExamples(25).map((e) => `- "${e.phrase}" -> "${e.word}"`).join("\n")}\nEvery substitution must still be instantly clear to a business reader on first read — never reach for an obscure, archaic, or overly literary word just to sound impressive, and never force a substitution that doesn't fit naturally. If no common precise word exists for a phrase, leave it as clear, professional prose rather than straining for one.`,
  };

  // "Elevated" also asks the model to hand back a small glossary of the words it introduced,
  // so the UI can show a hover definition instead of just hoping the reader already knows the
  // word. GLOSSARY_DELIMITER is a marker unlikely to appear in normal prose — everything after
  // it in the response is treated as the glossary payload, everything before is the rewrite.
  const GLOSSARY_DELIMITER = "---GLOSSARY---";
  const glossaryInstruction = tone === "elevated"
    ? `

After the rewritten text, on its own line, write exactly: ${GLOSSARY_DELIMITER}
Then, on the following line, output a JSON array (and nothing else) listing every word or short phrase you upgraded to a more precise word, in exactly this form:
[{"word": "defray", "definition": "help pay for"}]
Use "word" exactly as it appears in your rewritten text above (matching case). Keep each "definition" to 3-6 plain, everyday words — assume the reader has never seen the word before. If you made no vocabulary substitutions, output an empty array: []`
    : "";

  const prompt = `Rewrite the following text in a ${tone} tone.
Tone description: ${toneDescriptions[tone] || tone}
${customInstruction ? `Additional instruction: ${customInstruction}` : ""}
${lengthInstruction}

CRITICAL: You MUST preserve ALL of the following protected facts exactly as they appear. Do NOT change, rephrase, or omit any of these:
${factList}

If a fact doesn't fit naturally, keep it verbatim. Never invent new facts.

Original text:
"""
${text}
"""
${glossaryInstruction}

${tone === "elevated" ? `Return the rewritten text, then the ${GLOSSARY_DELIMITER} block exactly as instructed above. Nothing else.` : "Return ONLY the rewritten text, no explanations or quotes."}`;

  const rewritten = await callDeepSeek([
    { role: "system", content: "You are a professional text rewriter. Return only the rewritten text, no explanations." },
    { role: "user", content: prompt },
  ]);

  // Split off the glossary block (elevated tone only) before doing any further cleanup, so the
  // quote-stripping/trim below only ever touches the actual rewritten prose.
  let rawRewritten = rewritten;
  let elevatedWords: ElevatedWordGloss[] | undefined;
  if (tone === "elevated" && rewritten.includes(GLOSSARY_DELIMITER)) {
    const [beforeGlossary, afterGlossary] = rewritten.split(GLOSSARY_DELIMITER);
    rawRewritten = beforeGlossary;
    try {
      const parsed = JSON.parse(afterGlossary.trim());
      if (Array.isArray(parsed)) {
        elevatedWords = parsed.filter(
          (entry): entry is ElevatedWordGloss =>
            entry && typeof entry.word === "string" && typeof entry.definition === "string"
        );
      }
    } catch {
      // Model didn't return valid JSON for the glossary — not worth failing the whole rewrite
      // over a formatting hiccup on a "nice to have" feature. The rewrite itself is unaffected
      // since we already split it off above; the UI just won't show hover definitions this time.
    }
  }

  // Clean up the rewritten text (remove quotes if wrapped)
  const cleaned = rawRewritten.replace(/^["']|["']$/g, "").trim();

  // Validate facts are preserved
  const factValidation = validateFacts(facts, cleaned);

  const latencyMs = Date.now() - startTime;

  return {
    result: {
      original: text,
      rewritten: cleaned,
      tone,
      factsProtected: facts,
      factMismatch: !factValidation.match,
      meaningSimilarity: 0.9, // TODO: implement proper similarity check
      ...(elevatedWords && elevatedWords.length > 0 ? { elevatedWords } : {}),
    },
    usage: {
      characterCount: text.length,
      issueCount: 0,
      checkMode: "rewrite",
      latencyMs,
      engineTier: "deepseek",
    },
  };
}

// --- Fact Validation ---

export async function validateFactsEndpoint(original: string, rewritten: string): Promise<{
  match: boolean;
  missingFacts: ProtectedFact[];
  changedFacts: Array<{ original: ProtectedFact; rewritten: ProtectedFact }>;
}> {
  const originalFacts = extractProtectedFacts(original);
  const rewrittenFacts = extractProtectedFacts(rewritten);

  const missing: ProtectedFact[] = [];
  const changed: Array<{ original: ProtectedFact; rewritten: ProtectedFact }> = [];

  for (const fact of originalFacts) {
    if (!rewritten.includes(fact.value)) {
      // Check if it was changed (not just removed)
      const corresponding = rewrittenFacts.find(
        (rf) => rf.type === fact.type && Math.abs(rf.startIndex - fact.startIndex) < 20
      );
      if (corresponding) {
        changed.push({ original: fact, rewritten: corresponding });
      } else {
        missing.push(fact);
      }
    }
  }

  return {
    match: missing.length === 0 && changed.length === 0,
    missingFacts: missing,
    changedFacts: changed,
  };
}
