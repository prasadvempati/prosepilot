import { useState, useEffect } from "react";
import { Show, SignInButton, SignUpButton, useAuth } from "@clerk/react";
import { Editor } from "./components/Editor";
import { SuggestionPanel } from "./components/SuggestionPanel";
import { RewritePanel } from "./components/RewritePanel";
import { DocumentChecker } from "./components/DocumentChecker";
import { VoiceProfilePanel } from "./components/VoiceProfilePanel";
import { Header } from "./components/Header";
import { Pricing } from "./components/Pricing";
import { HeroDemo } from "./components/HeroDemo";
import { HowItWorks } from "./components/HowItWorks";
import { SocialProof } from "./components/SocialProof";
import { useGrammarStore, setTokenGetter } from "./hooks/useGrammarStore";

// Chrome extension ID for externally_connectable messaging.
// Replace with the published extension's ID (found in chrome://extensions when developer mode is on).
const EXTENSION_ID = import.meta.env.VITE_CHROME_EXTENSION_ID || "YOUR_EXTENSION_ID_HERE";

type Tab = "check" | "rewrite" | "document" | "voice";

export default function App() {
  const { getToken } = useAuth();

  useEffect(() => {
    setTokenGetter(() => getToken());
  }, [getToken]);

  // Push Clerk token to the Chrome extension so it can authenticate API calls.
  // Uses two channels for broad compatibility:
  //   1. chrome.runtime.sendMessage via externally_connectable (preferred)
  //   2. window.postMessage fallback (works even without externally_connectable)
  useEffect(() => {
    if (!getToken) return;

    let cancelled = false;

    const pushToken = async () => {
      try {
        const token = await getToken();
        if (cancelled || !token) return;

        // Method 1: externally_connectable (requires the web origin in manifest's matches)
        if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage(EXTENSION_ID, {
            action: "setClerkToken",
            token,
          }).catch(() => { /* extension not installed or ID mismatch — fallback below */ });
        }

        // Method 2: postMessage (picked up by content.js listener)
        window.postMessage({ type: "CLERK_TOKEN_HANDOFF", token }, "https://prosepilot.io");
      } catch {
        // getToken failed (user signed out mid-flight) — silent
      }
    };

    pushToken();
    // Clerk JWTs live ~60 s; refresh at 50 s to avoid edge expiry
    const interval = setInterval(pushToken, 50_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [getToken]);
  const [tab, setTab] = useState<Tab>("check");
  const { issues, isChecking, hasChecked, checkError, text, setText, checkGrammar, rewriteText, rewriteResult, isRewriting, rewriteError, tone, setTone } = useGrammarStore();

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
            <button
              onClick={() => setTab("voice")}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                tab === "voice"
                  ? "bg-surface-0 text-brand-600 shadow-sm"
                  : "text-ink-500 hover:text-ink-700"
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                My Voice
              </span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Editor - hidden when document/voice tab is active */}
            {tab !== "document" && tab !== "voice" && (
              <div className="card p-0 overflow-hidden">
                <Editor
                  text={text}
                  onChange={setText}
                  onCheck={() => checkGrammar()}
                  onRewrite={() => rewriteText()}
                  isChecking={isChecking}
                  isRewriting={isRewriting}
                  mode={tab}
                  tone={tone}
                  onToneChange={setTone}
                />
              </div>
            )}

            {/* Results */}
            <div className={tab === "document" || tab === "voice" ? "lg:col-span-2" : ""}>
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
                  onReplace={(newText) => setText(newText)}
                  error={rewriteError}
                />
              ) : tab === "document" ? (
                <DocumentChecker />
              ) : (
                <VoiceProfilePanel />
              )}
            </div>
          </div>
        </main>
      </Show>

      {/* Landing page - visible when signed out */}
      <Show when="signed-out">
        <div className="relative overflow-hidden">
          {/* Hero */}
          <section className="relative pt-20 pb-32 px-4 sm:px-6 lg:px-8 bg-animated-gradient">
            {/* Decorative elements */}
            <div className="absolute top-20 right-10 w-72 h-72 bg-brand-200 rounded-full blur-3xl opacity-40 animate-float" />
            <div className="absolute bottom-10 left-10 w-96 h-96 bg-purple-200 rounded-full blur-3xl opacity-30 animate-float" style={{ animationDelay: "2s" }} />
            
            <div className="relative max-w-7xl mx-auto">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                {/* Left: Copy */}
                <div className="text-center lg:text-left">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-100/80 border border-brand-200 text-sm font-semibold text-brand-700 mb-6 animate-slide-up backdrop-blur-sm">
                    <span className="w-2 h-2 bg-brand-500 rounded-full animate-pulse" />
                    Your Writing Co-Pilot
                  </div>
                  
                  <h1 className="text-display-xl text-ink-900 mb-6 animate-slide-up" style={{ animationDelay: "100ms" }}>
                    Write with{" "}
                    <span className="gradient-text">
                      confidence
                    </span>
                  </h1>
                  
                  <p className="text-xl text-ink-500 max-w-xl mb-10 leading-relaxed animate-slide-up" style={{ animationDelay: "200ms" }}>
                    Fix grammar, improve clarity, and match your tone — all in one place. 
                    The writing assistant that works where you do.
                  </p>
                  
                  <div className="flex flex-col sm:flex-row items-center gap-4 animate-slide-up" style={{ animationDelay: "300ms" }}>
                    <SignUpButton mode="modal">
                      <button className="btn-glow text-base px-8 py-4 shadow-glow-brand">
                        Start writing free
                        <svg className="w-4 h-4 ml-2 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      </button>
                    </SignUpButton>
                    <SignInButton mode="modal">
                      <button className="btn-secondary text-base px-8 py-4">
                        Sign in
                      </button>
                    </SignInButton>
                  </div>
                  
                  <div className="mt-8 flex flex-wrap items-center gap-6 justify-center lg:justify-start animate-slide-up" style={{ animationDelay: "400ms" }}>
                    <div className="flex items-center gap-2 text-sm text-ink-500">
                      <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      No credit card required
                    </div>
                    <div className="flex items-center gap-2 text-sm text-ink-500">
                      <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Free forever for basic use
                    </div>
                  </div>
                </div>

                {/* Right: Demo */}
                <div className="animate-slide-up" style={{ animationDelay: "400ms" }}>
                  <HeroDemo />
                </div>
              </div>
            </div>
          </section>

          {/* Social Proof */}
          <SocialProof />

          {/* How It Works */}
          <HowItWorks />

          {/* Features */}
          <section id="features" className="py-24 bg-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-16">
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-50 border border-surface-200 text-sm font-semibold text-ink-700 mb-6">
                  Features
                </span>
                <h2 className="text-display-lg text-ink-900 mb-4">Everything you need to write better</h2>
                <p className="text-xl text-ink-500 max-w-2xl mx-auto">
                  Powerful grammar checking and rewriting tools, designed for professionals.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 stagger-children">
                {[
                  {
                    icon: (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ),
                    title: "Grammar & Spelling",
                    description: "Catch errors instantly with AI-powered detection that understands context.",
                    color: "from-rose-500 to-rose-600",
                    bgColor: "bg-rose-50",
                    textColor: "text-rose-600",
                  },
                  {
                    icon: (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    ),
                    title: "Smart Rewrite",
                    description: "Adjust tone, clarity, and formality with one click.",
                    color: "from-brand-500 to-brand-600",
                    bgColor: "bg-brand-50",
                    textColor: "text-brand-600",
                  },
                  {
                    icon: (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    ),
                    title: "Word Doc Support",
                    description: "Upload .docx files and download with tracked changes.",
                    color: "from-blue-500 to-blue-600",
                    bgColor: "bg-blue-50",
                    textColor: "text-blue-600",
                  },
                  {
                    icon: (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    ),
                    title: "Voice Profile",
                    description: "Teach ProsePilot your style — it learns how YOU write.",
                    color: "from-emerald-500 to-emerald-600",
                    bgColor: "bg-emerald-50",
                    textColor: "text-emerald-600",
                  },
                ].map((feature, i) => (
                  <div key={i} className="card-feature p-6 text-center group">
                    <div className={`w-14 h-14 ${feature.bgColor} rounded-2xl flex items-center justify-center ${feature.textColor} mx-auto mb-5 group-hover:scale-110 transition-transform duration-300`}>
                      {feature.icon}
                    </div>
                    <h3 className="text-lg font-bold text-ink-900 mb-2">{feature.title}</h3>
                    <p className="text-ink-500 text-sm leading-relaxed">{feature.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Privacy */}
          <section className="py-20 bg-surface-50">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="card-glass p-10 md:p-14 relative overflow-hidden">
                {/* Background decoration */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-100 rounded-full blur-3xl opacity-40 -translate-y-1/2 translate-x-1/2" />
                
                <div className="relative flex flex-col md:flex-row items-start gap-10">
                  <div className="flex-shrink-0">
                    <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center shadow-sm">
                      <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-ink-900 mb-3">Your writing stays yours</h2>
                    <p className="text-ink-500 leading-relaxed mb-5 max-xl">
                      ProsePilot never uses your text to train AI models. Your writing is sent to our grammar engine for real-time checking and never stored. If you enable Voice Profile, we store statistical patterns about your style — not your text — to personalize future checks.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-semibold">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        No data training
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-semibold">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        You own your voice profile
                      </span>
                    </div>
                  </div>
                </div>
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
                  <div className="w-8 h-8 bg-gradient-to-br from-brand-400 to-brand-600 rounded-lg flex items-center justify-center shadow-sm">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </div>
                  <span className="font-bold text-ink-900">ProsePilot</span>
                </div>
                <div className="flex items-center gap-6 text-sm text-ink-500">
                  <a href="/privacy.html" className="hover:text-ink-700 transition-colors">Privacy</a>
                  <a href="mailto:support@prosepilot.io" className="hover:text-ink-700 transition-colors">Support</a>
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
