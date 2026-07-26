import type { CheckRequest, CheckResponse, GrammarIssue, RewriteRequest, RewriteResponse, ProtectedFact } from "@prosepilot/writing-core";
import { extractProtectedFacts, validateFacts, computeHash } from "@prosepilot/writing-core";
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
    console.error("LanguageTool error:", error);
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

  const rules: Array<{ pattern: RegExp; replacement: string; category: GrammarIssue["category"]; rule: string; explanation: string }> = [
    // Space before comma/period/semicolon/colon
    { pattern: /(\w) ,/g, replacement: "$1,", category: "punctuation", rule: "space_before_comma", explanation: "Remove space before comma." },
    { pattern: /(\w) \./g, replacement: "$1.", category: "punctuation", rule: "space_before_period", explanation: "Remove space before period." },
    { pattern: /(\w) ;/g, replacement: "$1;", category: "punctuation", rule: "space_before_semicolon", explanation: "Remove space before semicolon." },
    { pattern: /(\w) :/g, replacement: "$1:", category: "punctuation", rule: "space_before_colon", explanation: "Remove space before colon." },
    // Space before closing quote/bracket
    { pattern: /(\w) \)/g, replacement: "$1)", category: "punctuation", rule: "space_before_paren", explanation: "Remove space before closing parenthesis." },
    // Double spaces
    { pattern: /  +/g, replacement: " ", category: "style", rule: "double_space", explanation: "Remove extra spaces." },
    // Sentence starts with lowercase after period
    { pattern: /([.!?]\s+)([a-z])/g, replacement: "$1$2", category: "punctuation", rule: "lowercase_after_period", explanation: "Sentence should start with a capital letter." },
  ];

  for (const rule of rules) {
    let match;
    rule.pattern.lastIndex = 0;
    while ((match = rule.pattern.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      const fixed = match[0].replace(rule.pattern, rule.replacement);

      // Only add if the fix actually changes something
      if (fixed !== match[0]) {
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

export async function checkGrammar(request: CheckRequest): Promise<CheckResponse> {
  const startTime = Date.now();
  const { text, mode } = request;

  // Tier 0: Rule-based (instant, free)
  const ruleIssues = detectRuleBasedIssues(text);

  // Tier 1: LanguageTool (free, self-hosted)
  const ltIssues = await callLanguageTool(text);

  // Tier 2: DeepSeek for clarity/tone (always run in review mode)
  let aiIssues: GrammarIssue[] = [];
  if (mode === "rewrite" || mode === "report" || mode === "review" || ltIssues.length > 0) {
    aiIssues = await callDeepSeekForIssues(text);
  }

  // Merge: rule-based + LT + AI, deduplicate by offset proximity
  const allIssues = mergeAllIssues(ruleIssues, ltIssues, aiIssues);

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
- Compound words: "fireplace" (not "fire place"), "wide-spread" → "widespread", "no longer operable" → "inoperable"
- Spelling: "leasing" used as adjective → "leased" (past participle)
- Punctuation: semicolons before independent clauses ("LLC; the service")
- Conciseness: "I would like to recommend to have" → "I want to recommend having"
- Verbosity: "We would like to request" → "We want to request"; "no longer operable" → "inoperable"

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
        console.warn(`DeepSeek issue skipped: "${original}" not found in text`);
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
    console.error("DeepSeek check error:", error);
    return [];
  }
}

function mergeAllIssues(ruleIssues: GrammarIssue[], ltIssues: GrammarIssue[], aiIssues: GrammarIssue[]): GrammarIssue[] {
  // Start with rule-based issues (highest priority — always correct)
  const merged = [...ruleIssues];
  const usedPositions = new Set(ruleIssues.map((i) => `${i.startUtf16}-${i.endUtf16}`));

  // Add LT issues that don't overlap with rule-based
  for (const ltIssue of ltIssues) {
    const key = `${ltIssue.startUtf16}-${ltIssue.endUtf16}`;
    if (!usedPositions.has(key)) {
      merged.push(ltIssue);
      usedPositions.add(key);
    }
  }

  // Add AI issues that don't overlap with any existing issue
  for (const aiIssue of aiIssues) {
    const key = `${aiIssue.startUtf16}-${aiIssue.endUtf16}`;
    if (!usedPositions.has(key)) {
      merged.push(aiIssue);
      usedPositions.add(key);
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
