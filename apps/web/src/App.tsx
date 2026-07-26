import { useState } from "react";
import { Editor } from "./components/Editor";
import { SuggestionPanel } from "./components/SuggestionPanel";
import { RewritePanel } from "./components/RewritePanel";
import { Header } from "./components/Header";
import { useGrammarStore } from "./hooks/useGrammarStore";

type Tab = "check" | "rewrite";

export default function App() {
  const [tab, setTab] = useState<Tab>("check");
  const { issues, isChecking, text, setText, checkGrammar, rewriteText, rewriteResult, isRewriting } = useGrammarStore();

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tab Switcher */}
        <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
          <button
            onClick={() => setTab("check")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === "check"
                ? "bg-white text-brand-600 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Check Grammar
          </button>
          <button
            onClick={() => setTab("rewrite")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === "rewrite"
                ? "bg-white text-brand-600 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Rewrite
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Editor */}
          <div>
            <Editor
              text={text}
              onChange={setText}
              onCheck={() => checkGrammar()}
              onRewrite={() => rewriteText()}
              isChecking={isChecking}
              isRewriting={isRewriting}
              mode={tab}
            />
          </div>

          {/* Right: Results */}
          <div>
            {tab === "check" ? (
              <SuggestionPanel
                issues={issues}
                originalText={text}
                isChecking={isChecking}
              />
            ) : (
              <RewritePanel
                result={rewriteResult}
                isRewriting={isRewriting}
                originalText={text}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
