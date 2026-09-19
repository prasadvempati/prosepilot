import { useState } from "react";

export interface WritingGoals {
  audience: "general" | "executive" | "technical" | "academic" | "customer";
  intent: "inform" | "persuade" | "instruct" | "apologize" | "thank";
  formality: "casual" | "neutral" | "formal";
}

interface WritingGoalsDialogProps {
  goals: WritingGoals;
  onSave: (goals: WritingGoals) => void;
  onClose: () => void;
}

const AUDIENCE_OPTIONS: { value: WritingGoals["audience"]; label: string; desc: string }[] = [
  { value: "general", label: "General", desc: "Everyday readers" },
  { value: "executive", label: "Executive", desc: "Leadership / C-suite" },
  { value: "technical", label: "Technical", desc: "Engineers / developers" },
  { value: "academic", label: "Academic", desc: "Professors / researchers" },
  { value: "customer", label: "Customer", desc: "External clients" },
];

const INTENT_OPTIONS: { value: WritingGoals["intent"]; label: string; icon: string }[] = [
  { value: "inform", label: "Inform", icon: "ℹ️" },
  { value: "persuade", label: "Persuade", icon: "🎯" },
  { value: "instruct", label: "Instruct", icon: "📋" },
  { value: "apologize", label: "Apologize", icon: "🙏" },
  { value: "thank", label: "Thank", icon: "💝" },
];

const FORMALITY_OPTIONS: { value: WritingGoals["formality"]; label: string; desc: string }[] = [
  { value: "casual", label: "Casual", desc: "Friendly, conversational" },
  { value: "neutral", label: "Neutral", desc: "Balanced, professional" },
  { value: "formal", label: "Formal", desc: "Business-appropriate" },
];

export function WritingGoalsDialog({ goals, onSave, onClose }: WritingGoalsDialogProps) {
  const [draft, setDraft] = useState<WritingGoals>({ ...goals });

  const update = <K extends keyof WritingGoals>(key: K, value: WritingGoals[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-ink-900/30 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative w-full max-w-md bg-surface-0 rounded-2xl shadow-xl border border-surface-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-surface-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-ink-900">Writing Goals</h2>
              <p className="text-xs text-ink-400 mt-0.5">Tailor suggestions to your context</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-ink-400 hover:text-ink-600 hover:bg-surface-100 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Audience */}
          <fieldset>
            <legend className="text-xs font-semibold text-ink-600 uppercase tracking-wide mb-2">Audience</legend>
            <div className="grid grid-cols-2 gap-2">
              {AUDIENCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => update("audience", opt.value)}
                  className={`px-3 py-2 rounded-lg border text-left text-sm transition-all ${
                    draft.audience === opt.value
                      ? "border-brand-300 bg-brand-50 text-brand-700"
                      : "border-surface-200 bg-surface-50 text-ink-600 hover:border-surface-300"
                  }`}
                >
                  <span className="font-medium block">{opt.label}</span>
                  <span className="text-xs opacity-70">{opt.desc}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {/* Intent */}
          <fieldset>
            <legend className="text-xs font-semibold text-ink-600 uppercase tracking-wide mb-2">Intent</legend>
            <div className="flex flex-wrap gap-2">
              {INTENT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => update("intent", opt.value)}
                  className={`px-3 py-1.5 rounded-full border text-sm font-medium transition-all ${
                    draft.intent === opt.value
                      ? "border-brand-300 bg-brand-50 text-brand-700"
                      : "border-surface-200 bg-surface-50 text-ink-600 hover:border-surface-300"
                  }`}
                >
                  <span className="mr-1">{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Formality */}
          <fieldset>
            <legend className="text-xs font-semibold text-ink-600 uppercase tracking-wide mb-2">Formality</legend>
            <div className="flex gap-2">
              {FORMALITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => update("formality", opt.value)}
                  className={`flex-1 px-3 py-2 rounded-lg border text-center text-sm transition-all ${
                    draft.formality === opt.value
                      ? "border-brand-300 bg-brand-50 text-brand-700"
                      : "border-surface-200 bg-surface-50 text-ink-600 hover:border-surface-300"
                  }`}
                >
                  <span className="font-medium block">{opt.label}</span>
                  <span className="text-xs opacity-70">{opt.desc}</span>
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-surface-200 bg-surface-50 flex justify-end gap-3">
          <button onClick={onClose} className="btn-ghost text-sm">
            Cancel
          </button>
          <button
            onClick={() => { onSave(draft); onClose(); }}
            className="btn-glow text-sm"
          >
            Apply Goals
          </button>
        </div>
      </div>
    </div>
  );
}

export const DEFAULT_GOALS: WritingGoals = {
  audience: "general",
  intent: "inform",
  formality: "neutral",
};
