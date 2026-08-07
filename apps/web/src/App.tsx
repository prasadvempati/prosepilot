import { useState, useEffect } from "react";
import { useAuth } from "@clerk/react";
import { Editor } from "./components/Editor";
import { SuggestionPanel } from "./components/SuggestionPanel";
import { RewritePanel } from "./components/RewritePanel";
import { DocumentChecker } from "./components/DocumentChecker";
import { VoiceProfilePanel } from "./components/VoiceProfilePanel";
import { Header } from "./components/Header";
import { LandingPage } from "./components/LandingPage";
import { useGrammarStore, setTokenGetter } from "./hooks/useGrammarStore";

// Chrome extension ID for externally_connectable messaging.
// Replace with the published extension's ID (found in chrome://extensions when developer mode is on).
const EXTENSION_ID = import.meta.env.VITE_CHROME_EXTENSION_ID || "YOUR_EXTENSION_ID_HERE";

type Tab = "check" | "rewrite" | "document" | "voice";

export default function App() {
  const { getToken, isSignedIn } = useAuth();

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
  // Signed-in users now land on the home/marketing page first, same as signed-out visitors,
  // and have to explicitly click "Start Writing" to enter the editor — previously isSignedIn
  // alone decided which of the two was shown, so a returning signed-in user was always dropped
  // straight into the textbox with no way back to a home view.
  const [view, setView] = useState<"home" | "tool">("home");
  const { issues, isChecking, hasChecked, checkError, text, setText, checkGrammar, rewriteText, rewriteResult, isRewriting, rewriteError, tone, setTone } = useGrammarStore();

  // Features/Pricing anchors only exist in the DOM when LandingPage is actually rendered.
  const showMarketingNav = !isSignedIn || view === "home";

  return (
    <div className="min-h-screen bg-surface-50">
      <Header
        onLogoClick={() => setView("home")}
        showMarketingNav={showMarketingNav}
      />

      {/* Editor - visible once a signed-in user has clicked "Start Writing" */}
      {isSignedIn && view === "tool" && (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Tab Switcher. overflow-x-auto + flex-shrink-0/whitespace-nowrap on each button
              instead of the old bare `w-fit` row: at narrow widths (phones, split-screen
              windows, or Chrome's side panel eating into the viewport) the four labels
              didn't fit on one line and wrapped mid-word ("Word" / "Doc" on separate
              lines). Now the row scrolls horizontally instead of breaking the labels. */}
          <div className="flex items-center gap-1 p-1 bg-surface-100 rounded-xl w-fit max-w-full overflow-x-auto mb-6">
            <button
              onClick={() => setTab("check")}
              className={`flex-shrink-0 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                tab === "check"
                  ? "bg-surface-0 text-brand-600 shadow-sm"
                  : "text-ink-500 hover:text-ink-700"
              }`}
            >
              <span className="flex items-center gap-2 whitespace-nowrap">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Check Grammar
              </span>
            </button>
            <button
              onClick={() => setTab("rewrite")}
              className={`flex-shrink-0 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                tab === "rewrite"
                  ? "bg-surface-0 text-brand-600 shadow-sm"
                  : "text-ink-500 hover:text-ink-700"
              }`}
            >
              <span className="flex items-center gap-2 whitespace-nowrap">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Rewrite
              </span>
            </button>
            <button
              onClick={() => setTab("document")}
              className={`flex-shrink-0 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                tab === "document"
                  ? "bg-surface-0 text-brand-600 shadow-sm"
                  : "text-ink-500 hover:text-ink-700"
              }`}
            >
              <span className="flex items-center gap-2 whitespace-nowrap">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Word Doc
              </span>
            </button>
            <button
              onClick={() => setTab("voice")}
              className={`flex-shrink-0 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                tab === "voice"
                  ? "bg-surface-0 text-brand-600 shadow-sm"
                  : "text-ink-500 hover:text-ink-700"
              }`}
            >
              <span className="flex items-center gap-2 whitespace-nowrap">
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
      )}

      {/* Home/marketing page - visible when signed out, and for signed-in users until they
          click "Start Writing" (view stays "home" by default even after sign-in). */}
      {(!isSignedIn || view === "home") && (
        <LandingPage isSignedIn={!!isSignedIn} onStartWriting={() => setView("tool")} />
      )}
    </div>
  );
}
