import { Check, X, AlertTriangle, Info, AlertCircle } from "lucide-react";
import type { GrammarIssue } from "@prosepilot/writing-core";
import { useGrammarStore } from "../hooks/useGrammarStore";

interface SuggestionPanelProps {
  issues: GrammarIssue[];
  originalText: string;
  isChecking: boolean;
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

const SEVERITY_ICONS: Record<string, typeof AlertTriangle> = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
  suggestion: Info,
};

const SEVERITY_COLORS: Record<string, string> = {
  error: "text-red-500 bg-red-50",
  warning: "text-amber-500 bg-amber-50",
  info: "text-blue-500 bg-blue-50",
  suggestion: "text-gray-500 bg-gray-50",
};

export function SuggestionPanel({ issues, originalText, isChecking }: SuggestionPanelProps) {
  const { applyIssue, dismissIssue, applyAll, undo, history } = useGrammarStore();

  if (isChecking) {
    return (
      <div className="card p-8 flex flex-col items-center justify-center text-center">
        <div className="w-10 h-10 border-3 border-brand-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm text-gray-600">Analyzing your text...</p>
      </div>
    );
  }

  if (issues.length === 0 && originalText.trim()) {
    return (
      <div className="card p-8 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <Check className="w-6 h-6 text-green-600" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">All clear!</h3>
        <p className="text-sm text-gray-500">No issues found in your text.</p>
      </div>
    );
  }

  if (!originalText.trim()) {
    return (
      <div className="card p-8 flex flex-col items-center justify-center text-center">
        <p className="text-sm text-gray-500">Paste or type text to get started.</p>
      </div>
    );
  }

  const safeCount = issues.filter((i) => i.safeAuto).length;

  return (
    <div className="card">
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">
            {issues.length} issue{issues.length !== 1 ? "s" : ""} found
          </h2>
          <div className="flex gap-2">
            {history.length > 0 && (
              <button onClick={undo} className="btn-ghost text-xs">
                Undo
              </button>
            )}
            {safeCount > 0 && (
              <button onClick={applyAll} className="btn-primary text-xs">
                Accept All Safe ({safeCount})
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-h-[500px] overflow-y-auto">
        {issues.map((issue) => {
          const Icon = SEVERITY_ICONS[issue.severity] || Info;
          const colorClass = SEVERITY_COLORS[issue.severity] || "text-gray-500 bg-gray-50";

          return (
            <div
              key={issue.id}
              className="p-4 border-b border-gray-50 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className={`p-1.5 rounded-lg ${colorClass}`}>
                  <Icon className="w-4 h-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-brand-600">
                      {CATEGORY_LABELS[issue.category] || issue.category}
                    </span>
                    {issue.safeAuto && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
                        Safe auto-fix
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-gray-700 mb-2">{issue.explanation}</p>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-400">Change:</span>
                    <span className="line-through text-gray-500">{issue.original}</span>
                    <span className="text-gray-400">→</span>
                    <span className="text-green-600 font-medium">{issue.replacement}</span>
                  </div>
                </div>

                <div className="flex gap-1">
                  <button
                    onClick={() => applyIssue(issue.id)}
                    className="p-1.5 rounded-lg hover:bg-green-100 text-green-600 transition-colors"
                    title="Accept"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => dismissIssue(issue.id)}
                    className="p-1.5 rounded-lg hover:bg-red-100 text-red-500 transition-colors"
                    title="Dismiss"
                  >
                    <X className="w-4 h-4" />
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
