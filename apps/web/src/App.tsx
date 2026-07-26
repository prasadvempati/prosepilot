import { useState } from "react";
import { SignedIn, SignedOut, SignInButton, SignUpButton } from "@clerk/clerk-react";
import { Editor } from "./components/Editor";
import { SuggestionPanel } from "./components/SuggestionPanel";
import { RewritePanel } from "./components/RewritePanel";
import { Header } from "./components/Header";
import { Pricing } from "./components/Pricing";
import { useGrammarStore } from "./hooks/useGrammarStore";

type Tab = "check" | "rewrite";

export default function App() {
  const [tab, setTab] = useState<Tab>("check");
  const { issues, isChecking, hasChecked, checkError, text, setText, checkGrammar, rewriteText, rewriteResult, isRewriting } = useGrammarStore();

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <SignedOut>
          {/* Landing / Sign-up Page */}
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <div className="max-w-md mx-auto">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                Your Writing Co-Pilot
              </h2>
              <p className="text-gray-600 mb-8">
                Fix grammar, clarity, and tone instantly. Powered by AI, not rules.
              </p>
              <div className="flex flex-col gap-3">
                <SignInButton mode="modal">
                  <button className="w-full px-6 py-3 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-700 transition-colors">
                    Sign In
                  </button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button className="w-full px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors">
                    Create Free Account
                  </button>
                </SignUpButton>
              </div>
              <p className="text-sm text-gray-500 mt-4">
                Free for individuals. $5/mo for teams.
              </p>
            </div>
          </div>

          <Pricing />
        </SignedOut>

        <SignedIn>
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
                  hasChecked={hasChecked}
                  error={checkError}
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
        </SignedIn>
      </main>
    </div>
  );
}
