import { useState } from "react";
import { SignedIn, SignedOut, SignUpButton } from "@clerk/clerk-react";
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
    <div className="min-h-screen bg-surface-50">
      <Header />

      <SignedOut>
        {/* Hero Section */}
        <section className="relative overflow-hidden">
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-b from-brand-50/50 via-transparent to-transparent" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-brand-400/10 rounded-full blur-3xl" />
          
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
            <div className="text-center max-w-3xl mx-auto">
              {/* Eyebrow */}
              <div className="animate-in inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-50 border border-brand-100 mb-8">
                <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
                <span className="text-sm font-medium text-brand-700">Powered by AI, not rules</span>
              </div>

              {/* Headline */}
              <h1 className="animate-in-delay-1 text-display-xl text-ink-900 mb-6">
                Write with{" "}
                <span className="gradient-text">confidence</span>
              </h1>

              {/* Subheadline */}
              <p className="animate-in-delay-2 text-xl text-ink-500 mb-10 max-w-2xl mx-auto leading-relaxed">
                Fix grammar, clarity, and tone instantly. ProsePilot understands context 
                and suggests improvements that make your writing shine.
              </p>

              {/* CTA */}
              <div className="animate-in-delay-3 flex flex-col sm:flex-row gap-4 justify-center">
                <SignUpButton mode="modal">
                  <button className="btn-primary text-base px-8 py-3.5 shadow-glow hover:shadow-glow-lg">
                    Start writing better
                  </button>
                </SignUpButton>
                <a href="#pricing" className="btn-secondary text-base px-8 py-3.5">
                  See pricing
                </a>
              </div>

              {/* Social proof */}
              <div className="animate-in-delay-3 mt-12 flex items-center justify-center gap-8 text-sm text-ink-500">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-success" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Free to start</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-success" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>No credit card required</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-success" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Works everywhere</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-display-lg text-ink-900 mb-4">Everything you need to write better</h2>
              <p className="text-xl text-ink-500 max-w-2xl mx-auto">
                Simple, powerful tools that help you communicate more effectively.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  icon: (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ),
                  title: "Grammar & Spelling",
                  description: "Catch errors instantly with AI that understands context, not just rules.",
                },
                {
                  icon: (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  ),
                  title: "Clarity & Tone",
                  description: "Make your writing clearer and adjust tone for any audience.",
                },
                {
                  icon: (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  ),
                  title: "AI Rewrite",
                  description: "Rewrite entire paragraphs with a click. Professional, casual, or concise.",
                },
              ].map((feature, i) => (
                <div
                  key={i}
                  className={`card p-8 animate-in-delay-${i + 1}`}
                >
                  <div className="w-12 h-12 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center mb-5">
                    {feature.icon}
                  </div>
                  <h3 className="text-lg font-semibold text-ink-900 mb-2">{feature.title}</h3>
                  <p className="text-ink-500 leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <Pricing />

        {/* Footer */}
        <footer className="py-12 bg-surface-50 border-t border-surface-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-brand-400 to-brand-600 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <span className="font-semibold text-ink-900">ProsePilot</span>
              </div>
              <p className="text-sm text-ink-500">© 2024 ProsePilot. Write with confidence.</p>
            </div>
          </div>
        </footer>
      </SignedOut>

      <SignedIn>
        {/* Editor Interface */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Tab Switcher */}
          <div className="flex items-center gap-1 p-1 bg-surface-100 rounded-xl w-fit mb-6">
            <button
              onClick={() => setTab("check")}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                tab === "check"
                  ? "bg-surface-0 text-brand-600 shadow-sm"
                  : "text-ink-500 hover:text-ink-700"
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Check Grammar
              </span>
            </button>
            <button
              onClick={() => setTab("rewrite")}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                tab === "rewrite"
                  ? "bg-surface-0 text-brand-600 shadow-sm"
                  : "text-ink-500 hover:text-ink-700"
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Rewrite
              </span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Editor */}
            <div className="card p-0 overflow-hidden">
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

            {/* Results */}
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
        </main>
      </SignedIn>
    </div>
  );
}
