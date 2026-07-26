import { useCallback } from "react";
import { ClipboardPaste, RotateCcw } from "lucide-react";

interface EditorProps {
  text: string;
  onChange: (text: string) => void;
  onCheck: () => void;
  onRewrite: () => void;
  isChecking: boolean;
  isRewriting: boolean;
  mode: "check" | "rewrite";
}

const TONES = [
  { value: "professional", label: "Professional" },
  { value: "executive", label: "Executive" },
  { value: "concise", label: "Concise" },
  { value: "diplomatic", label: "Diplomatic" },
  { value: "formal", label: "Formal" },
  { value: "affirmative", label: "Affirmative" },
  { value: "friendly", label: "Friendly" },
  { value: "confident", label: "Confident" },
  { value: "empathetic", label: "Empathetic" },
  { value: "persuasive", label: "Persuasive" },
  { value: "casual", label: "Casual" },
  { value: "firm", label: "Firm" },
];

export function Editor({ text, onChange, onCheck, onRewrite, isChecking, isRewriting, mode }: EditorProps) {
  const handlePaste = useCallback(async () => {
    try {
      const clipText = await navigator.clipboard.readText();
      onChange(clipText);
    } catch {
      // Clipboard API not available or denied
    }
  }, [onChange]);

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const charCount = text.length;

  return (
    <div className="card">
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Your Text</h2>
          <div className="flex items-center gap-2">
            <button onClick={handlePaste} className="btn-ghost text-xs flex items-center gap-1">
              <ClipboardPaste className="w-3.5 h-3.5" />
              Paste
            </button>
            <button onClick={() => onChange("")} className="btn-ghost text-xs">
              Clear
            </button>
          </div>
        </div>
      </div>

      <div className="p-4">
        <textarea
          value={text}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Paste or type your text here..."
          className="w-full h-64 p-4 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm leading-relaxed"
        />

        <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
          <span>{wordCount} words | {charCount.toLocaleString()} characters</span>
          <span className={charCount > 100000 ? "text-red-500" : ""}>
            {charCount > 100000 ? "Over limit" : `${(100000 - charCount).toLocaleString()} remaining`}
          </span>
        </div>
      </div>

      <div className="p-4 border-t border-gray-100">
        {mode === "rewrite" && (
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Tone</label>
            <select className="input text-sm">
              {TONES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex gap-2">
          {mode === "check" ? (
            <button
              onClick={onCheck}
              disabled={!text.trim() || isChecking}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {isChecking ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Check Grammar
                </>
              )}
            </button>
          ) : (
            <button
              onClick={onRewrite}
              disabled={!text.trim() || isRewriting}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {isRewriting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Rewriting...
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4" />
                  Rewrite
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
