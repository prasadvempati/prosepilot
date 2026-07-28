import type { GrammarIssue } from "@prosepilot/writing-core";
import { useGrammarStore } from "../hooks/useGrammarStore";

interface SuggestionPanelProps {
  issues: GrammarIssue[];
  originalText: string;
  isChecking: boolean;
  hasChecked: boolean;
  error: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  grammar: "Grammar",
  spelling: "Spelling",
  punctuation: "Punctuation",
  clarity: "Clarity",
  style: "Style",
  tone: "Tone",
  conciseness: "Conciseness",
};

const CATEGORY_COLORS: Record<string, string> = {
  grammar: "bg-rose-50 text-rose-600",
  spelling: "bg-amber-50 text-amber-600",
  punctuation: "bg-blue-50 text-blue-600",
  clarity: "bg-violet-50 text-violet-600",
  style: "bg-indigo-50 text-indigo-600",
  tone: "bg-pink-50 text-pink-600",
  conciseness: "bg-emerald-50 text-emerald-600",
};

export function SuggestionPanel({ issues, originalText, isChecking, hasChecked, error }: SuggestionPanelProps) {
  const { applyIssue, dismissIssue, applyAll, undo, history, voiceProfileId } = useGrammarStore();

  if (isChecking) {
    return (
      <div className="card p-12 flex flex-col items-center justify-center text-center">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-surface-200 rounded-full" />
          <div className="absolute inset-0 w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-sm text-ink-500 mt-6 font-medium">Analyzing your text...</p>
        <p className="text-xs text-ink-300 mt-1">This usually takes 3-5 seconds</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-12 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mb-5">
          <svg className="w-8 h-8 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-ink-900 mb-2">Something went wrong</h3>
        <p className="text-sm text-rose-600 mb-2">{error}</p>
        <p className="text-xs text-ink-300">Check the console for details</p>
      </div>
    );
  }

  if (!originalText.trim()) {
    return (
      <div className="card p-12 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 bg-surface-100 rounded-2xl flex items-center justify-center mb-5">
          <svg className="w-8 h-8 text-ink-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </div>
        <p className="text-sm text-ink-500">Paste or type text to get started</p>
      </div>
    );
  }

  if (!hasChecked) {
    return (
      <div className="card p-12 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mb-5">
          <svg className="w-8 h-8 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-sm text-ink-500">Click <span className="font-semibold text-brand-600">Check Grammar</span> to analyze your text</p>
      </div>
    );
  }

  if (hasChecked && issues.length === 0) {
    return (
      <div className="card p-12 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mb-5">
          <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-ink-900 mb-2">All clear!</h3>
        <p className="text-sm text-ink-500">No issues found in your text</p>
      </div>
    );
  }

  const safeCount = issues.filter((i) => i.safeAuto).length;
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-surface-200 bg-surface-50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-ink-900">
              {issues.length} issue{issues.length !== 1 ? "s" : ""} found
            </h2>
            <div className="flex items-center gap-2">
              {errorCount > 0 && (
                <span className="badge-error">{errorCount} error{errorCount !== 1 ? "s" : ""}</span>
              )}
              {warningCount > 0 && (
                <span className="badge-warning">{warningCount} warning{warningCount !== 1 ? "s" : ""}</span>
              )}
              {voiceProfileId && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-50 text-brand-600 rounded-full text-xs font-medium">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Voice Profile Active
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {history.length > 0 && (
              <button onClick={undo} className="btn-ghost text-xs flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
                Undo
              </button>
            )}
            {safeCount > 0 && (
              <button onClick={applyAll} className="btn-primary text-xs flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Accept All Safe ({safeCount})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Issues List */}
      <div className="max-h-[500px] overflow-y-auto divide-y divide-surface-100">
        {issues.map((issue, index) => {
          const colorClass = CATEGORY_COLORS[issue.category] || "bg-surface-100 text-ink-500";

          return (
            <div
              key={issue.id}
              className="p-4 hover:bg-surface-50 transition-colors animate-in"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex items-start gap-3">
                {/* Category Badge */}
                <div className={`px-2 py-1 rounded-lg text-xs font-medium ${colorClass}`}>
                  {CATEGORY_LABELS[issue.category] || issue.category}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink-700 mb-2">{issue.explanation}</p>

                  <div className="flex items-center gap-2 text-sm">
                    <span className="line-through text-ink-300">{issue.original}</span>
                    <svg className="w-4 h-4 text-ink-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                    <span className="text-emerald-600 font-medium">{issue.replacement}</span>
                  </div>

                  {issue.safeAuto && (
                    <span className="inline-flex items-center gap-1 mt-2 text-xs text-emerald-600">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      Safe auto-fix
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-1">
                  <button
                    onClick={() => applyIssue(issue.id)}
                    className="p-2 rounded-lg hover:bg-emerald-50 text-emerald-600 transition-colors"
                    title="Accept"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => dismissIssue(issue.id)}
                    className="p-2 rounded-lg hover:bg-rose-50 text-rose-500 transition-colors"
                    title="Dismiss"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
