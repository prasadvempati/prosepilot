import { useState } from "react";
import { Show, SignInButton, SignUpButton } from "@clerk/react";
import { Editor } from "./components/Editor";
import { SuggestionPanel } from "./components/SuggestionPanel";
import { RewritePanel } from "./components/RewritePanel";
import { DocumentChecker } from "./components/DocumentChecker";
import { Header } from "./components/Header";
import { Pricing } from "./components/Pricing";
import { useGrammarStore } from "./hooks/useGrammarStore";

type Tab = "check" | "rewrite" | "document";

export default function App() {
  const [tab, setTab] = useState<Tab>("check");
  const { issues, isChecking, hasChecked, checkError, text, setText, checkGrammar, rewriteText, rewriteResult, isRewriting } = useGrammarStore();

  return (
    <div className="min-h-screen bg-surface-50">
      <Header />

      {/* Editor - visible when signed in */}
      <Show when="signed-in">
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
            <button
              onClick={() => setTab("document")}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                tab === "document"
                  ? "bg-surface-0 text-brand-600 shadow-sm"
                  : "text-ink-500 hover:text-ink-700"
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Word Doc
              </span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Editor - hidden when document tab is active */}
            {tab !== "document" && (
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
            )}

            {/* Results */}
            <div className={tab === "document" ? "lg:col-span-2" : ""}>
              {tab === "check" ? (
                <SuggestionPanel
                  issues={issues}
                  originalText={text}
                  isChecking={isChecking}
                  hasChecked={hasChecked}
                  error={checkError}
                />
              ) : tab === "rewrite" ? (
                <RewritePanel
                  result={rewriteResult}
                  isRewriting={isRewriting}
                  originalText={text}
                />
              ) : (
                <DocumentChecker />
              )}
            </div>
          </div>
        </main>
      </Show>

      {/* Landing page - visible when signed out */}
      <Show when="signed-out">
        <div className="relative overflow-hidden">
          {/* Hero */}
          <section className="relative pt-24 pb-32 px-4 sm:px-6 lg:px-8">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-50 via-surface-50 to-purple-50" />
            <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-brand-100 rounded-full blur-3xl opacity-30 -translate-y-1/2 translate-x-1/3" />
            <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-purple-100 rounded-full blur-3xl opacity-30 translate-y-1/2 -translate-x-1/3" />
            
            <div className="relative max-w-5xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-50 border border-brand-100 text-sm font-medium text-brand-700 mb-8 animate-fadeIn">
                <span className="w-2 h-2 bg-brand-500 rounded-full animate-pulse" />
                Your Writing Co-Pilot
              </div>
              
              <h1 className="text-display-xl text-ink-900 mb-6 animate-slideUp">
                Write with{" "}
                <span className="bg-gradient-to-r from-brand-500 to-purple-500 bg-clip-text text-transparent">
                  confidence
                </span>
              </h1>
              
              <p className="text-xl text-ink-500 max-w-2xl mx-auto mb-10 animate-slideUp" style={{ animationDelay: "100ms" }}>
                Fix grammar, improve clarity, and match your tone — all in one place. 
                The writing assistant that works where you do.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slideUp" style={{ animationDelay: "200ms" }}>
                <SignUpButton mode="modal">
                  <button className="btn-primary text-base px-8 py-3.5 shadow-glow">
                    Start writing free
                    <svg className="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                </SignUpButton>
                <SignInButton mode="modal">
                  <button className="btn-secondary text-base px-8 py-3.5">
                    Sign in
                  </button>
                </SignInButton>
              </div>
              
              <p className="mt-6 text-sm text-ink-400 animate-slideUp" style={{ animationDelay: "300ms" }}>
                No credit card required · Free forever for basic use
              </p>
            </div>
          </section>

          {/* Features */}
          <section id="features" className="py-24 bg-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-16">
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-100 border border-surface-200 text-sm font-medium text-ink-600 mb-6">
                  Features
                </span>
                <h2 className="text-display-lg text-ink-900 mb-4">Everything you need to write better</h2>
                <p className="text-xl text-ink-500 max-w-2xl mx-auto">
                  Powerful grammar checking and rewriting tools, designed for professionals.
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
                    description: "Catch errors instantly with AI-powered detection that understands context, not just rules."
                  },
                  {
                    icon: (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    ),
                    title: "Smart Rewrite",
                    description: "Adjust tone, clarity, and formality with one click. Professional, casual, or anywhere in between."
                  },
                  {
                    icon: (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    ),
                    title: "Browser Extension",
                    description: "Works everywhere you write — Gmail, Slack, Google Docs, LinkedIn, and more."
                  }
                ].map((feature, i) => (
                  <div key={i} className="card p-8 text-center hover:shadow-elevated transition-shadow duration-300">
                    <div className="w-12 h-12 bg-brand-50 rounded-xl flex items-center justify-center text-brand-600 mx-auto mb-5">
                      {feature.icon}
                    </div>
                    <h3 className="text-lg font-semibold text-ink-900 mb-3">{feature.title}</h3>
                    <p className="text-ink-500 leading-relaxed">{feature.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Pricing */}
          <Pricing />

          {/* Footer */}
          <footer className="py-12 bg-surface-50 border-t border-surface-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-brand-400 to-brand-600 rounded-lg flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </div>
                  <span className="font-semibold text-ink-900">ProsePilot</span>
                </div>
                <p className="text-sm text-ink-400">
                  © 2026 ProsePilot. Built for professionals who write.
                </p>
              </div>
            </div>
          </footer>
        </div>
      </Show>
    </div>
  );
}
