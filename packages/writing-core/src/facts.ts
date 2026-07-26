import type { ProtectedFact } from "./types.js";

// Regex patterns for protected fact extraction
const PATTERNS: Array<{ type: ProtectedFact["type"]; regex: RegExp }> = [
  // Currency: $1,234.56, $1,234, USD 1234, etc.
  { type: "currency", regex: /\$[\d,]+(?:\.\d{2})?(?:\s*(?:USD|EUR|GBP|CAD|AUD))?/g },
  { type: "currency", regex: /\b(?:USD|EUR|GBP|CAD|AUD)\s*[\d,]+(?:\.\d{2})?\b/g },

  // Percentages: 15%, 15.5%, etc.
  { type: "percentage", regex: /\b\d+(?:\.\d+)?%\b/g },

  // Dates: January 1, 2026; 01/01/2026; 2026-01-01; Jan 1, 2026
  { type: "date", regex: /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/g },
  { type: "date", regex: /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g },
  { type: "date", regex: /\b\d{4}-\d{2}-\d{2}\b/g },
  { type: "date", regex: /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}\b/g },

  // URLs
  { type: "url", regex: /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g },

  // Emails
  { type: "email", regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g },

  // Phone numbers: (555) 123-4567, 555-123-4567, +1-555-123-4567
  { type: "phone", regex: /(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g },

  // Unit numbers: Unit 123, Apt 4B, #101
  { type: "unit", regex: /\b(?:Unit|Apt|Apartment|Suite|Ste|Room|Rm|#)\s*[\w\d-]+\b/gi },

  // Work order IDs: WO-12345, WO#12345, Work Order 12345
  { type: "id", regex: /\b(?:WO|Work\s*Order|#)\s*[\w\d-]+\b/gi },

  // Dimensions: 1,234 sq ft, 1200 sqft, 3BR/2BA
  { type: "unit", regex: /\b\d[\d,]*\s*(?:sq\.?\s*(?:ft|foot|feet)|sqft)\b/gi },
  { type: "unit", regex: /\b\d+\s*(?:BR|BA|bed|bath|bedroom|bathroom)s?\b/gi },
];

/**
 * Extract protected facts from text.
 * These facts must be preserved during rewriting.
 */
export function extractProtectedFacts(text: string): ProtectedFact[] {
  const facts: ProtectedFact[] = [];
  const seen = new Set<string>();

  for (const { type, regex } of PATTERNS) {
    const pattern = new RegExp(regex.source, regex.flags);
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const value = match[0];
      const key = `${type}:${value}`;

      if (!seen.has(key)) {
        seen.add(key);
        facts.push({
          type,
          value,
          startIndex: match.index,
          endIndex: match.index + value.length,
        });
      }
    }
  }

  // Sort by position in text
  return facts.sort((a, b) => a.startIndex - b.startIndex);
}

/**
 * Validate that all protected facts from original exist in rewritten text.
 */
export function validateFacts(
  originalFacts: ProtectedFact[],
  rewrittenText: string
): { match: boolean; missing: ProtectedFact[] } {
  const missing: ProtectedFact[] = [];

  for (const fact of originalFacts) {
    if (!rewrittenText.includes(fact.value)) {
      missing.push(fact);
    }
  }

  return {
    match: missing.length === 0,
    missing,
  };
}
