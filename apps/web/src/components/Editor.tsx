import { useCallback } from "react";

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
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-ink-700">Your text</span>
          {text.trim() && (
            <span className="badge-info">
              {wordCount} words
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={handlePaste} 
            className="btn-ghost text-xs flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Paste
          </button>
          <button 
            onClick={() => onChange("")} 
            className="btn-ghost text-xs"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Editor Area */}
      <div className="relative flex-1 min-h-[400px]">
        <textarea
          value={text}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Paste or type your text here..."
          className="editor-textarea p-6"
        />
        
        {/* Empty state */}
        {!text.trim() && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-surface-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-ink-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <p className="text-ink-500 text-sm">Paste your text to get started</p>
              <p className="text-ink-300 text-xs mt-1">Ctrl+V to paste</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-surface-200 bg-surface-50">
        <div className="flex items-center justify-between">
          {/* Stats */}
          <div className="flex items-center gap-4 text-xs text-ink-500">
            <span>{charCount.toLocaleString()} characters</span>
            <span className="text-surface-300">•</span>
            <span className={charCount > 100000 ? "text-error" : ""}>
              {charCount > 100000 ? "Over limit" : `${(100000 - charCount).toLocaleString()} remaining`}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {mode === "rewrite" && (
              <select className="input text-sm py-2 w-auto">
                {TONES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            )}

            {mode === "check" ? (
              <button
                onClick={onCheck}
                disabled={!text.trim() || isChecking}
                className="btn-primary flex items-center gap-2"
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
                className="btn-primary flex items-center gap-2"
              >
                {isRewriting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Rewriting...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Rewrite
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
