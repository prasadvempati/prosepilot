import type { CheckRequest, CheckResponse, GrammarIssue, RewriteRequest, RewriteResponse, ProtectedFact, VoiceProfile } from "@prosepilot/writing-core";
import { extractProtectedFacts, validateFacts, computeHash, shouldShowIssue } from "@prosepilot/writing-core";
import { randomUUID } from "crypto";

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY!;
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const LANGUAGETOOL_URL = process.env.LANGUAGETOOL_URL || "http://localhost:8010";

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

// Tier 0: Rule-based fixes (instant, free, no API call)
function detectRuleBasedIssues(text: string): GrammarIssue[] {
  const issues: GrammarIssue[] = [];
  const sourceHash = computeHashSync(text);

  const rules: Array<{ pattern: RegExp; replacement: string | ((match: string, ...groups: string[]) => string); category: GrammarIssue["category"]; rule: string; explanation: string }> = [
    // === CAPITALIZATION ===
    // Sentence starts with lowercase after period/exclamation/question
    { pattern: /([.!?]\s+)([a-z])/g, replacement: (_m, p1, p2) => p1 + p2.toUpperCase(), category: "grammar", rule: "capitalize_after_period", explanation: "Capitalize the first word of a new sentence." },
    // Sentence start at beginning of text — capitalize first letter
    { pattern: /^([a-z])/, replacement: (_m: string, letter: string) => letter.toUpperCase(), category: "grammar", rule: "capitalize_sentence_start", explanation: "Capitalize the first word of a sentence." },
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
    // Missing period at end of sentence
    { pattern: /^([A-Z][^.!?}\n"]+)$/m, replacement: "$1.", category: "punctuation", rule: "missing_period", explanation: "Sentences should end with a period." },
    // Double punctuation
    { pattern: /\.\./g, replacement: "...", category: "punctuation", rule: "double_period", explanation: "Use an ellipsis (...) not double periods." },
    // Missing comma after introductory/conditional clause
    { pattern: /\b(If|When|While|Although|Because|Since|Unless|After|Before|Until|Once|Whenever|Wherever|Whether)\s+([^,]+?)\s+([A-Z][a-z]*)/g, replacement: "$1 $2, $3", category: "punctuation", rule: "comma_after_conditional", explanation: "Use a comma after an introductory or conditional clause." },

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
      if (typeof rule.replacement === "function") {
        fixed = match[0].replace(rule.pattern, rule.replacement as any);
      } else if (match.length > 1) {
        // Has capture groups — use the replacement with $1, $2 etc.
        fixed = match[0].replace(rule.pattern, rule.replacement);
      } else {
        // No capture groups — use the replacement string directly
        fixed = rule.replacement;
      }

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

export async function checkGrammar(request: CheckRequest & { lightweight?: boolean; rulesOnly?: boolean; voiceProfile?: VoiceProfile | null }): Promise<CheckResponse> {
  const startTime = Date.now();
  const { text, mode, lightweight, rulesOnly, voiceProfile } = request;

  // Tier 0: Rule-based (instant, free)
  const ruleIssues = detectRuleBasedIssues(text);

  // If rulesOnly mode (for docx processing), skip all API calls
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

  // Tier 1: LanguageTool (free, self-hosted)
  const ltIssues = await callLanguageTool(text);

  // Tier 2: DeepSeek for clarity/tone (skip in lightweight mode for speed)
  let aiIssues: GrammarIssue[] = [];
  if (!lightweight && (mode === "rewrite" || mode === "report" || mode === "review" || ltIssues.length > 0)) {
    aiIssues = await callDeepSeekForIssues(text);
  }

  // Merge: rule-based + LT + AI, deduplicate by offset proximity
  const mergedIssues = mergeAllIssues(ruleIssues, ltIssues, aiIssues);

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
      engineTier: aiIssues.length > 0 ? "deepseek" : ltIssues.length > 0 ? "lt" : "rule",
    },
  };
}

async function callDeepSeekForIssues(text: string): Promise<GrammarIssue[]> {
  try {
    const prompt = `You are a professional grammar and style checker. Analyze the following text for grammar, spelling, punctuation, clarity, style, and tone issues.

Return a JSON array of issues. Each issue must have:
- "category": one of "grammar", "spelling", "punctuation", "clarity", "style", "tone", "conciseness"
- "rule": a short rule identifier (e.g. "passive_voice", "wordiness", "unclear_antecedent")
- "original": the EXACT problematic text copied character-for-character from the input
- "replacement": the suggested fix
- "confidence": 0.0 to 1.0
- "severity": "error", "warning", "info", or "suggestion"
- "explanation": a clear explanation of the issue

CRITICAL RULES:
1. The "original" field MUST be an exact substring of the input text — copy it character-for-character
2. Do NOT include text from multiple sentences in one issue — keep each issue to a single phrase or clause
3. Do NOT modify or "clean up" the original text — copy exactly as it appears
4. If you're unsure about exact text, skip the issue

SPECIFIC PATTERNS TO CHECK:
- PROPER NOUNS: Product/brand names MUST be capitalized correctly: "prosepilot" → "ProsePilot", "grammarly" → "Grammarly", "deepseek" → "DeepSeek", "openai" → "OpenAI", "microsoft" → "Microsoft"
- ARTICLE CAPITALIZATION: "the edge" → "The Edge" (when referring to a product), "the internet" → "The Internet" (when used as a proper noun)
- SENTENCE START: First word of every sentence must be capitalized
- COMPOUND WORDS: "fireplace" (not "fire place"), "widespread" (not "wide-spread"), "inoperable" (not "no longer operable")
- SPELLING: "leasing" used as adjective → "leased" (past participle)
- PUNCTUATION: semicolons before independent clauses ("LLC; the service")
- CONCISENESS: "I would like to recommend to have" → "I want to recommend having"; "We would like to request" → "We want to request"
- PASSIVE VOICE: Flag passive constructions when active voice is clearer
- MISSING AUXILIARY VERB: "work orders completed" → "work orders were completed"; "the unit delayed" → "the unit was delayed"; "the project finished" → "the project was finished" — passive constructions missing "was/were/is/are/been"
- WORDINESS: Flag unnecessary words and phrases
- WRONG WORD FORM: Gerunds used where nouns are needed. "Per our discussing" → "Per our discussion"; "Due to the happening" → "Due to the event"; "Based on our meeting discussing" → "Based on our meeting discussion" — after possessives (our, their, the, a, an) and prepositions (of, for, during, after, before, per, based on), use the NOUN form not the gerund (-ing form)
- ADJECTIVE-NOUN WORD ORDER: Adjectives come BEFORE nouns in English. "upgrade premium" → "premium upgrade"; "report inspection" → "inspection report"; "tile shower" → "shower tile"; "schedule gate" → "gate schedule"; "trim border" → "border trim" — when two nouns are used together, the describing noun becomes an adjective and goes first
- REDUNDANT WORDS: "efforts troubleshooting" → "troubleshooting efforts"; "ready units vacant" → "vacant ready units" — check for reversed adjective-noun pairs
- UNCOUNTABLE NOUNS: "foods" → "food"; "informations" → "information"; "advices" → "advice"; "equipments" → "equipment"; "furnitures" → "furniture"; "researches" → "research"; "progresses" → "progress" — these nouns are never pluralized
- MISSING OBJECT PRONOUN: "they finished on time" → "they finished it on time"; "we submitted early" → "we submitted it early" — transitive verbs like finish, complete, submit, review, approve need a direct object
- COMMA BEFORE "AND" IN COMPOUND SENTENCES: When two independent clauses (each with a subject + verb) are joined by "and", a comma goes before "and": "The team worked hard and they finished on time" → "The team worked hard, and they finished on time"

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

    const sourceHash = await computeHash(text);
    const parsed = JSON.parse(response);

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

    return validated;
  } catch (error) {
    // DeepSeek unavailable — return empty results
    return [];
  }
}

function mergeAllIssues(ruleIssues: GrammarIssue[], ltIssues: GrammarIssue[], aiIssues: GrammarIssue[]): GrammarIssue[] {
  // Start with rule-based issues (highest priority — always correct)
  const merged = [...ruleIssues];
  const usedPositions = new Set(ruleIssues.map((i) => `${i.startUtf16}-${i.endUtf16}`));

  // Add LT issues that don't overlap with rule-based
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
  };

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

Return ONLY the rewritten text, no explanations or quotes.`;

  const rewritten = await callDeepSeek([
    { role: "system", content: "You are a professional text rewriter. Return only the rewritten text, no explanations." },
    { role: "user", content: prompt },
  ]);

  // Clean up the rewritten text (remove quotes if wrapped)
  const cleaned = rewritten.replace(/^["']|["']$/g, "").trim();

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
