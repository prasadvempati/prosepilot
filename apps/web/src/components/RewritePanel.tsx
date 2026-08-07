import { useState } from "react";
import type { ReactNode } from "react";
import type { RewriteResult, ProtectedFact, ElevatedWordGloss } from "@prosepilot/writing-core";

interface RewritePanelProps {
  result: RewriteResult | null;
  isRewriting: boolean;
  originalText: string;
  onReplace: (newText: string) => void;
  error?: string | null;
}

// Escapes a string for safe use inside a RegExp literal.
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Renders rewritten text as plain string segments, except where an "elevated" vocabulary word
// (from the DeepSeek-supplied glossary) appears — those get wrapped in a dashed-underline span
// with a hover tooltip showing the definition. Matching is done against the surface text (not
// re-derived from the glossary word) so the original casing/punctuation is preserved exactly.
function renderRewrittenText(text: string, glossary?: ElevatedWordGloss[]): ReactNode {
  if (!glossary || glossary.length === 0) return text;

  // Longest-word-first so e.g. "paucity" doesn't get partially matched inside a longer glossary
  // entry that happens to contain it as a substring.
  const sorted = [...glossary]
    .filter((g) => g.word.trim().length > 0)
    .sort((a, b) => b.word.length - a.word.length);
  if (sorted.length === 0) return text;

  const definitionByLower = new Map(sorted.map((g) => [g.word.toLowerCase(), g.definition]));
  const pattern = sorted.map((g) => escapeRegExp(g.word)).join("|");
  const regex = new RegExp(`\\b(?:${pattern})\\b`, "gi");
  const parts = text.split(regex);
  const matches = text.match(regex) ?? [];

  const nodes: ReactNode[] = [];
  parts.forEach((part, i) => {
    nodes.push(part);
    const match = matches[i];
    if (match) {
      const definition = definitionByLower.get(match.toLowerCase());
      if (definition) {
        nodes.push(
          <span key={`gloss-${i}`} className="relative inline-block group">
            <span className="border-b border-dashed border-brand-400 text-brand-700 font-medium cursor-help">
              {match}
            </span>
            <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 hidden group-hover:block w-max max-w-[220px] whitespace-normal text-center rounded-lg bg-ink-900 text-white text-xs leading-snug px-2.5 py-1.5 shadow-lg z-10">
              {definition}
              <span className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-4 border-transparent border-t-ink-900" />
            </span>
          </span>
        );
      } else {
        nodes.push(match);
      }
    }
  });

  return nodes;
}

export function RewritePanel({ result, isRewriting, onReplace, error }: RewritePanelProps) {
  const [copied, setCopied] = useState(false);
  if (isRewriting) {
    return (
      <div className="card p-12 flex flex-col items-center justify-center text-center">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-surface-200 rounded-full" />
          <div className="absolute inset-0 w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-sm text-ink-700 mt-6 font-semibold">Rewriting your text...</p>
        <p className="text-xs text-ink-400 mt-1">Adjusting tone and clarity</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-12 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p className="text-ink-700 font-semibold mb-1">Rewrite failed</p>
        <p className="text-ink-400 text-sm">{error}</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="card p-12 flex flex-col items-center justify-center text-center">
        <div className="w-20 h-20 bg-brand-50 rounded-2xl flex items-center justify-center mb-5">
          <svg className="w-10 h-10 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </div>
        <p className="text-ink-700 font-semibold">Select a tone and click Rewrite</p>
        <p className="text-ink-400 text-sm mt-1">We'll adjust your text while keeping your voice</p>
      </div>
    );
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(result.rewritten);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-surface-200 bg-surface-0">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-ink-900">Rewritten Text</h2>
          <div className="flex items-center gap-2">
            {result.factMismatch && (
              <span className="badge-warning">
                <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Facts changed
              </span>
            )}
            <span className="badge-info capitalize">
              {result.tone}
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        <div className="text-sm leading-relaxed text-ink-700 whitespace-pre-wrap p-4 bg-surface-50 rounded-xl border border-surface-200">
          {renderRewrittenText(result.rewritten, result.elevatedWords)}
        </div>

        {result.elevatedWords && result.elevatedWords.length > 0 && (
          <p className="text-xs text-ink-400 mt-2 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Hover the underlined words for a plain-English definition.
          </p>
        )}

        {result.factsProtected.length > 0 && (
          <div className="mt-4 p-4 bg-surface-50 rounded-xl border border-surface-200">
            <p className="text-xs font-semibold text-ink-600 mb-2 uppercase tracking-wide">Protected Facts</p>
            <div className="flex flex-wrap gap-2">
              {result.factsProtected.map((fact: ProtectedFact, i: number) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-white border border-surface-200 rounded-full text-sm text-ink-700 font-medium"
                >
                  <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {fact.value}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-5 py-4 border-t border-surface-200 bg-surface-0 flex gap-3">
        <button onClick={handleCopy} className="btn-secondary flex-1 flex items-center justify-center gap-2 text-sm">
          {copied ? (
            <>
              <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy
            </>
          )}
        </button>
        <button onClick={() => onReplace(result.rewritten)} className="btn-glow flex-1 flex items-center justify-center gap-2 text-sm">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Replace
        </button>
      </div>
    </div>
  );
}
