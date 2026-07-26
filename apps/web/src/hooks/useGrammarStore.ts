import { create } from "zustand";
import type { GrammarIssue, RewriteResult } from "@prosepilot/writing-core";

const API_BASE = "";

interface GrammarStore {
  text: string;
  setText: (text: string) => void;
  issues: GrammarIssue[];
  isChecking: boolean;
  hasChecked: boolean;
  checkError: string | null;
  checkGrammar: () => Promise<void>;

  // Rewrite
  tone: string;
  setTone: (tone: string) => void;
  rewriteResult: RewriteResult | null;
  isRewriting: boolean;
  rewriteError: string | null;
  rewriteText: () => Promise<void>;

  // Apply/dismiss
  applyIssue: (issueId: string) => void;
  dismissIssue: (issueId: string) => void;
  applyAll: () => void;
  undo: () => void;
  history: string[];
}

export const useGrammarStore = create<GrammarStore>((set, get) => ({
  text: "",
  setText: (text) => set({ text }),
  issues: [],
  isChecking: false,
  hasChecked: false,
  checkError: null,

  tone: "professional",
  setTone: (tone) => set({ tone }),
  rewriteResult: null,
  isRewriting: false,
  rewriteError: null,

  history: [],

  checkGrammar: async () => {
    const { text } = get();
    if (!text.trim()) return;

    set({ isChecking: true, issues: [], checkError: null, hasChecked: false });

    try {
      const response = await fetch(`${API_BASE}/v1/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, mode: "review" }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.message || `Server error ${response.status}`);
      }

      const data = await response.json();
      set({ issues: data.issues || [], isChecking: false, hasChecked: true, checkError: null });
    } catch (error: any) {
      console.error("Grammar check error:", error);
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
      const response = await fetch(`${API_BASE}/v1/rewrite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, tone }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.message || `Server error ${response.status}`);
      }

      const data = await response.json();
      set({ rewriteResult: data.result, isRewriting: false, rewriteError: null });
    } catch (error: any) {
      console.error("Rewrite error:", error);
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
    set({
      text: newText,
      issues: issues.filter((i) => i.id !== issueId),
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

    // Apply from end to start to preserve offsets
    const sorted = [...issues].sort((a, b) => b.startUtf16 - a.startUtf16);
    for (const issue of sorted) {
      if (issue.safeAuto) {
        newText = newText.slice(0, issue.startUtf16) + issue.replacement + newText.slice(issue.endUtf16);
      }
    }

    set({
      text: newText,
      issues: issues.filter((i) => !i.safeAuto),
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
    });
  },
}));
