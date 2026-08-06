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
  grammar: "bg-rose-50 text-rose-600 border-rose-200",
  spelling: "bg-amber-50 text-amber-600 border-amber-200",
  punctuation: "bg-blue-50 text-blue-600 border-blue-200",
  clarity: "bg-violet-50 text-violet-600 border-violet-200",
  style: "bg-indigo-50 text-indigo-600 border-indigo-200",
  tone: "bg-pink-50 text-pink-600 border-pink-200",
  conciseness: "bg-emerald-50 text-emerald-600 border-emerald-200",
};

const CATEGORY_BORDERS: Record<string, string> = {
  grammar: "border-l-rose-500",
  spelling: "border-l-amber-500",
  punctuation: "border-l-blue-500",
  clarity: "border-l-violet-500",
  style: "border-l-indigo-500",
  tone: "border-l-pink-500",
  conciseness: "border-l-emerald-500",
};

export function SuggestionPanel({ issues, originalText, isChecking, hasChecked, error }: SuggestionPanelProps) {
  const { applyIssue, dismissIssue, ignoreIssue, applyAll, undo, history, voiceProfileId } = useGrammarStore();

  if (isChecking) {
    return (
      <div className="card p-12 flex flex-col items-center justify-center text-center">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-surface-200 rounded-full" />
          <div className="absolute inset-0 w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-sm text-ink-700 mt-6 font-semibold">Analyzing your text...</p>
        <p className="text-xs text-ink-400 mt-1">This usually takes 3-5 seconds</p>
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
        <h3 className="text-lg font-bold text-ink-900 mb-2">Something went wrong</h3>
        <p className="text-sm text-rose-600 mb-2">{error}</p>
        <p className="text-xs text-ink-400">Check the console for details</p>
      </div>
    );
  }

  if (!originalText.trim()) {
    return (
      <div className="card p-12 flex flex-col items-center justify-center text-center">
        <div className="w-20 h-20 bg-surface-100 rounded-2xl flex items-center justify-center mb-5">
          <svg className="w-10 h-10 text-ink-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </div>
        <p className="text-ink-700 font-semibold">Paste or type text to get started</p>
      </div>
    );
  }

  if (!hasChecked) {
    return (
      <div className="card p-12 flex flex-col items-center justify-center text-center">
        <div className="w-20 h-20 bg-brand-50 rounded-2xl flex items-center justify-center mb-5">
          <svg className="w-10 h-10 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-ink-700 font-semibold">Click <span className="text-brand-600">Check Grammar</span> to analyze your text</p>
      </div>
    );
  }

  if (hasChecked && issues.length === 0) {
    return (
      <div className="card p-12 flex flex-col items-center justify-center text-center bg-gradient-to-br from-emerald-50/50 to-white">
        <div className="w-20 h-20 bg-emerald-100 rounded-2xl flex items-center justify-center mb-5 animate-bounce-in">
          <svg className="w-10 h-10 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-ink-900 mb-2">All clear!</h3>
        <p className="text-ink-500">No issues found in your text</p>
        <div className="mt-4 flex items-center gap-2 text-sm text-emerald-600 font-medium">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Your writing is looking great
        </div>
      </div>
    );
  }

  const safeCount = issues.filter((i) => i.safeAuto).length;
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-surface-200 bg-surface-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-ink-900">
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
                <span className="badge-glow">
                  <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Voice Profile
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

        {/* Progress bar */}
        <div className="w-full bg-surface-100 rounded-full h-1.5">
          <div 
            className="bg-gradient-to-r from-brand-500 to-emerald-500 h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${((issues.length - safeCount) / Math.max(issues.length, 1)) * 100}%` }}
          />
        </div>
      </div>

      {/* Issues List */}
      <div className="max-h-[500px] overflow-y-auto divide-y divide-surface-100">
        {issues.map((issue, index) => {
          const colorClass = CATEGORY_COLORS[issue.category] || "bg-surface-100 text-ink-500 border-surface-200";
          const borderClass = CATEGORY_BORDERS[issue.category] || "border-l-surface-300";

          return (
            <div
              key={issue.id}
              className={`p-4 hover:bg-surface-25 transition-all duration-200 border-l-4 ${borderClass} animate-in`}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex items-start gap-3">
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink-700 mb-2 leading-relaxed">{issue.explanation}</p>

                  <div className="flex items-center gap-2 text-sm">
                    <span className="px-2 py-0.5 bg-rose-50 text-rose-600 rounded line-through">{issue.original}</span>
                    <svg className="w-4 h-4 text-ink-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 font-medium rounded">{issue.replacement}</span>
                  </div>

                  <div className="flex items-center gap-3 mt-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${colorClass}`}>
                      {CATEGORY_LABELS[issue.category] || issue.category}
                    </span>
                    {issue.safeAuto && (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        Safe auto-fix
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-1 shrink-0">
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
                  <button
                    onClick={() => ignoreIssue(issue.id)}
                    className="p-2 rounded-lg hover:bg-surface-100 text-ink-400 transition-colors"
                    title={`Ignore "${issue.original}" everywhere — won't be flagged again`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21m-6.121-9.121L21 3" />
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
