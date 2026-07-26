/**
 * Calculate UTF-16 offsets for text ranges.
 * JavaScript strings use UTF-16 encoding, so we need consistent offset handling.
 */

export interface TextRange {
  start: number;
  end: number;
}

/**
 * Convert a 0-indexed character range to UTF-16 offset range.
 */
export function toUtf16Range(text: string, charStart: number, charEnd: number): TextRange {
  let utf16Start = 0;
  let utf16End = 0;
  let charIndex = 0;

  for (let i = 0; i < text.length; i++) {
    if (charIndex === charStart) utf16Start = i;
    if (charIndex === charEnd) {
      utf16End = i;
      return { start: utf16Start, end: utf16End };
    }

    // surrogate pair check
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) i++; // skip low surrogate
    charIndex++;
  }

  // reached end of string
  if (charIndex === charEnd) utf16End = text.length;
  return { start: utf16Start, end: utf16End };
}

/**
 * Extract text at a UTF-16 offset range.
 */
export function extractRange(text: string, range: TextRange): string {
  return text.slice(range.start, range.end);
}

/**
 * Apply a list of sorted, non-overlapping replacements to text.
 * Replacements should be applied from end to start to preserve offsets.
 */
export function applyReplacements(
  text: string,
  replacements: Array<{ start: number; end: number; replacement: string }>
): string {
  // Sort by start position descending (apply from end)
  const sorted = [...replacements].sort((a, b) => b.start - a.start);

  let result = text;
  for (const { start, end, replacement } of sorted) {
    result = result.slice(0, start) + replacement + result.slice(end);
  }

  return result;
}

/**
 * Compute a simple hash of text for staleness detection.
 */
export async function computeHash(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return "sha256:" + hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
