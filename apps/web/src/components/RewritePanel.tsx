import { Copy, Replace } from "lucide-react";
import type { RewriteResult, ProtectedFact } from "@prosepilot/writing-core";

interface RewritePanelProps {
  result: RewriteResult | null;
  isRewriting: boolean;
  originalText: string;
}

export function RewritePanel({ result, isRewriting }: RewritePanelProps) {
  if (isRewriting) {
    return (
      <div className="card p-8 flex flex-col items-center justify-center text-center">
        <div className="w-10 h-10 border-3 border-brand-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm text-gray-600">Rewriting your text...</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="card p-8 flex flex-col items-center justify-center text-center">
        <p className="text-sm text-gray-500">Select a tone and click Rewrite to get started.</p>
      </div>
    );
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(result.rewritten);
  };

  return (
    <div className="card">
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Rewritten Text</h2>
          <div className="flex items-center gap-1.5">
            {result.factMismatch && (
              <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">
                Facts changed
              </span>
            )}
            <span className="text-[10px] px-2 py-0.5 bg-brand-100 text-brand-700 rounded-full font-medium capitalize">
              {result.tone}
            </span>
          </div>
        </div>
      </div>

      <div className="p-4">
        <div className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
          {result.rewritten}
        </div>

        {result.factsProtected.length > 0 && (
          <div className="mt-3 p-3 bg-gray-50 rounded-lg">
            <p className="text-xs font-medium text-gray-600 mb-1">Protected Facts</p>
            <div className="flex flex-wrap gap-1.5">
              {result.factsProtected.map((fact: ProtectedFact, i: number) => (
                <span
                  key={i}
                  className="text-[10px] px-2 py-0.5 bg-white border border-gray-200 rounded-full text-gray-600"
                >
                  {fact.value}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-gray-100 flex gap-2">
        <button onClick={handleCopy} className="btn-secondary flex-1 flex items-center justify-center gap-2 text-sm">
          <Copy className="w-4 h-4" />
          Copy
        </button>
        <button className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm">
          <Replace className="w-4 h-4" />
          Replace
        </button>
      </div>
    </div>
  );
}
