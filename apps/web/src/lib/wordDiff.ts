/**
 * Lightweight word-level diff between two strings.
 * Returns an array of DiffPart objects indicating whether each word was
 * kept, added, or removed — enough to render an inline diff
 * without pulling in a full diff library.
 */

export type DiffKind = "kept" | "added" | "removed";

export interface DiffPart {
  value: string;
  kind: DiffKind;
}

// Tokenise on word boundaries while preserving whitespace and punctuation as
// separate tokens so re-joining reconstructs the original text exactly.
function tokenise(text: string): string[] {
  // Match runs of non-whitespace OR runs of whitespace.
  return text.match(/\S+|\s+/g) ?? [];
}

/**
 * Compute a word-level LCS-based diff.
 *
 * This is O(n*m) in the worst case but fast enough for typical prose
 * (< 5 000 words).  For very long documents the caller should fall back
 * to a streaming diff, but that's not a realistic use-case for ProsePilot
 * rewrites.
 */
export function wordDiff(original: string, rewritten: string): DiffPart[] {
  const a = tokenise(original);
  const b = tokenise(rewritten);

  // Build the LCS table.
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to produce the diff.
  const parts: DiffPart[] = [];
  let i = n;
  let j = m;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      parts.push({ value: a[i - 1], kind: "kept" });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      parts.push({ value: b[j - 1], kind: "added" });
      j--;
    } else {
      parts.push({ value: a[i - 1], kind: "removed" });
      i--;
    }
  }

  parts.reverse();
  return parts;
}
