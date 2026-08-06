import { create } from "zustand";
import type { GrammarIssue, RewriteResult } from "@prosepilot/writing-core";

const API_BASE = "";

// Words/phrases the user has told us to stop flagging (e.g. a proper noun like "Elijio"
// that isn't actually a spelling mistake). Persisted in localStorage — the web equivalent
// of the extension's chrome.storage.local — so once ignored, a word never gets flagged
// again on this browser, not just for the current check.
const IGNORED_WORDS_KEY = "prosepilot_ignored_words";

function normalizeWord(text: string): string {
  return (text || "").trim().toLowerCase();
}

function loadIgnoredWords(): Set<string> {
  try {
    const raw = localStorage.getItem(IGNORED_WORDS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveIgnoredWords(words: Set<string>) {
  try {
    localStorage.setItem(IGNORED_WORDS_KEY, JSON.stringify(Array.from(words)));
  } catch {
    // Storage unavailable (private browsing quota, etc.) — the word stays ignored for
    // this session via in-memory state, it just won't persist across a reload.
  }
}

let tokenGetter: (() => Promise<string | null>) | null = null;

export function setTokenGetter(getter: () => Promise<string | null>) {
  tokenGetter = getter;
}

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (tokenGetter) {
    const token = await tokenGetter();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

interface GrammarStore {
  text: string;
  setText: (text: string) => void;
  issues: GrammarIssue[];
  isChecking: boolean;
  hasChecked: boolean;
  checkError: string | null;
  voiceProfileId: string | null;
  setVoiceProfileId: (id: string | null) => void;
  checkGrammar: () => Promise<void>;

  // Rewrite
  tone: string;
  setTone: (tone: string) => void;
  rewriteResult: RewriteResult | null;
  isRewriting: boolean;
  rewriteError: string | null;
  rewriteText: () => Promise<void>;

  // Apply/dismiss — client-side offset recalculation, no API call
  applyIssue: (issueId: string) => void;
  dismissIssue: (issueId: string) => void;
  applyAll: () => void;
  undo: () => void;
  history: string[];

  // Ignore — like dismiss, but permanent (persisted) and applies to every occurrence of
  // the word, not just the one clicked.
  ignoredWords: Set<string>;
  ignoreIssue: (issueId: string) => void;
}

/**
 * After applying a fix, recalculate offsets for all remaining issues.
 * Issues that don't overlap with the fix stay valid.
 * Issues after the fix shift by the delta (replacement length - original length).
 */
function recalculateOffsets(
  issues: GrammarIssue[],
  appliedIssue: GrammarIssue,
  replacement: string
): GrammarIssue[] {
  const delta = replacement.length - (appliedIssue.endUtf16 - appliedIssue.startUtf16);
  const fixEnd = appliedIssue.endUtf16;

  return issues
    .filter((i) => i.id !== appliedIssue.id)
    .map((issue) => {
      // Skip issues that start after the fix — shift them
      if (issue.startUtf16 >= fixEnd) {
        return {
          ...issue,
          startUtf16: issue.startUtf16 + delta,
          endUtf16: issue.endUtf16 + delta,
        };
      }
      // Skip issues that end before the fix — no change
      if (issue.endUtf16 <= appliedIssue.startUtf16) {
        return issue;
      }
      // Overlapping issue — remove it (offsets are unreliable)
      return null;
    })
    .filter((i): i is GrammarIssue => i !== null);
}

export const useGrammarStore = create<GrammarStore>((set, get) => ({
  text: "",
  setText: (text) => set({ text }),
  issues: [],
  isChecking: false,
  hasChecked: false,
  checkError: null,
  voiceProfileId: null,
  setVoiceProfileId: (id) => set({ voiceProfileId: id }),

  tone: "professional",
  setTone: (tone) => set({ tone }),
  rewriteResult: null,
  isRewriting: false,
  rewriteError: null,

  history: [],

  ignoredWords: loadIgnoredWords(),

  checkGrammar: async () => {
    const { text, voiceProfileId, ignoredWords } = get();
    if (!text.trim()) return;

    set({ isChecking: true, issues: [], checkError: null, hasChecked: false });

    try {
      const headers = await authHeaders();
      const response = await fetch(`${API_BASE}/v1/check`, {
        method: "POST",
        headers,
        body: JSON.stringify({ text, mode: "review", voiceProfileId }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.message || `Server error ${response.status}`);
      }

      const data = await response.json();
      // Drop anything the user has told us to stop flagging (e.g. a proper noun that
      // isn't actually a spelling mistake) — applies to every future check.
      const filtered = (data.issues || []).filter(
        (i: GrammarIssue) => !ignoredWords.has(normalizeWord(i.original))
      );
      set({ issues: filtered, isChecking: false, hasChecked: true, checkError: null });
    } catch (error: any) {
      set({
        isChecking: false,
        hasChecked: true,
        checkError: error.message || "Failed to check grammar. Please try again.",
      });
    }
  },

  rewriteText: async () => {
    const { text, tone } = get();
    if (!text.trim()) return;

    set({ isRewriting: true, rewriteResult: null, rewriteError: null });

    try {
      const headers = await authHeaders();
      const response = await fetch(`${API_BASE}/v1/rewrite`, {
        method: "POST",
        headers,
        body: JSON.stringify({ text, tone }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.message || `Server error ${response.status}`);
      }

      const data = await response.json();
      set({ rewriteResult: data.result, isRewriting: false, rewriteError: null });
    } catch (error: any) {
      set({
        isRewriting: false,
        rewriteError: error.message || "Failed to rewrite. Please try again.",
      });
    }
  },

  applyIssue: (issueId) => {
    const { text, issues, history } = get();
    const issue = issues.find((i) => i.id === issueId);
    if (!issue) return;

    const newText = text.slice(0, issue.startUtf16) + issue.replacement + text.slice(issue.endUtf16);
    const updatedIssues = recalculateOffsets(issues, issue, issue.replacement);

    set({
      text: newText,
      issues: updatedIssues,
      history: [...history, text],
    });
  },

  dismissIssue: (issueId) => {
    set((state) => ({
      issues: state.issues.filter((i) => i.id !== issueId),
    }));
  },

  ignoreIssue: (issueId) => {
    const { issues, ignoredWords } = get();
    const issue = issues.find((i) => i.id === issueId);
    if (!issue) return;

    const normalized = normalizeWord(issue.original);
    const updatedIgnored = new Set(ignoredWords);
    updatedIgnored.add(normalized);
    saveIgnoredWords(updatedIgnored);

    // Drop every OTHER occurrence of this same word from the current results too, not
    // just the one the user clicked.
    const remainingIssues = issues.filter((i) => normalizeWord(i.original) !== normalized);

    set({ issues: remainingIssues, ignoredWords: updatedIgnored });
  },

  applyAll: () => {
    const { text, issues, history } = get();
    let newText = text;
    let currentIssues = [...issues];

    // Apply from end to start to preserve offsets
    const sorted = [...currentIssues].sort((a, b) => b.startUtf16 - a.startUtf16);
    for (const issue of sorted) {
      if (issue.safeAuto) {
        newText = newText.slice(0, issue.startUtf16) + issue.replacement + newText.slice(issue.endUtf16);
        currentIssues = currentIssues.filter((i) => i.id !== issue.id);
      }
    }

    set({
      text: newText,
      issues: currentIssues,
      history: [...history, text],
    });
  },

  undo: () => {
    const { history } = get();
    if (history.length === 0) return;

    const previousText = history[history.length - 1];
    set({
      text: previousText,
      history: history.slice(0, -1),
      issues: [],
      hasChecked: false,
    });
  },
}));
