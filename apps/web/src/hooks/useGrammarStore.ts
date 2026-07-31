import { create } from "zustand";
import type { GrammarIssue, RewriteResult } from "@prosepilot/writing-core";

const API_BASE = "";

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

  checkGrammar: async () => {
    const { text, voiceProfileId } = get();
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
      set({ issues: data.issues || [], isChecking: false, hasChecked: true, checkError: null });
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
