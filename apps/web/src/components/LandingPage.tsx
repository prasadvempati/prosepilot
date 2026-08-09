import { SignInButton, SignUpButton } from "@clerk/react";
import { Pricing } from "./Pricing";
import { HeroDemo } from "./HeroDemo";
import { HowItWorks } from "./HowItWorks";
import { SocialProof } from "./SocialProof";

interface LandingPageProps {
  // Whether the visitor is signed in. Signed-out visitors get the original sign-up/sign-in
  // CTAs; signed-in visitors (who land here first now, before entering the editor) get a
  // single "Start Writing" button instead — they don't need to create an account again.
  isSignedIn: boolean;
  // Called when a signed-in visitor clicks "Start Writing" (hero button or the pricing
  // table's free-tier CTA) — takes them into the editor. Unused when signed out, where
  // SignUpButton/SignInButton handle the equivalent action via Clerk's modal.
  onStartWriting: () => void;
}

// The marketing/home page. Historically this only rendered for signed-out visitors — App.tsx
// showed the editor directly to anyone signed in. Per user request, signed-in visitors should
// also land here first and explicitly click "Start Writing" to enter the editor, rather than
// always being dropped straight into the textbox. Extracted into its own component so App.tsx
// can render it for both audiences with only the CTA behavior differing.
export function LandingPage({ isSignedIn, onStartWriting }: LandingPageProps) {
  return (
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
                Catch errors before you hit send — right inside Outlook, Gmail, and Google Docs.
                Nothing you write is ever stored or used to train AI.
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-4 animate-slide-up" style={{ animationDelay: "300ms" }}>
                {isSignedIn ? (
                  <button onClick={onStartWriting} className="btn-glow text-base px-8 py-4 shadow-glow-brand">
                    Start writing
                    <svg className="w-4 h-4 ml-2 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                ) : (
                  <>
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
                  </>
                )}
              </div>

              {!isSignedIn && (
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
              )}
            </div>

            {/* Right: Demo */}
            <div className="animate-slide-up" style={{ animationDelay: "400ms" }}>
              <HeroDemo />
            </div>
          </div>
        </div>
      </section>

      {/* Privacy — moved up from below Browser Extensions. This is one of ProsePilot's real
          structural advantages (real-time correction that's never stored or trained on), which
          matters far more to business/professional writers handling client or resident data
          than a generic "trust us" footer note would suggest — so it runs right after the hero,
          before the reader even reaches features. */}
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

      {/* Browser Extensions */}
      <section className="py-24 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-50 border border-surface-200 text-sm font-semibold text-ink-700 mb-6">
            Browser Extensions
          </span>
          <h2 className="text-display-lg text-ink-900 mb-4">Write better, everywhere you write</h2>
          <p className="text-xl text-ink-500 max-w-2xl mx-auto mb-12">
            Install ProsePilot on Chrome or Edge for real-time grammar checking in Outlook, Gmail, Google Docs, and any website.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {/* Points at the live Chrome Web Store listing (published 2026-07-28) instead of the
                static /prosepilot-extension.zip sideload file. Store installs get Chrome's
                built-in silent auto-update — no manual re-download/reload needed by users ever
                again, unlike the zip which was frozen at whatever version was downloaded. */}
            <a
              href="https://chromewebstore.google.com/detail/prosepilot/gafofglaaopdifodogfifofndmogghfi"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-brand-500 to-brand-600 text-white rounded-xl font-semibold text-lg shadow-lg shadow-brand-500/25 hover:shadow-xl hover:shadow-brand-500/30 hover:-translate-y-0.5 transition-all"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15l-5-5 1.41-1.41L11 14.17l7.59-7.59L20 8l-9 9z" fill="currentColor"/>
              </svg>
              Install for Chrome
            </a>
            {/* Edge listing is still "In review" in Microsoft Partner Center (submitted
                2026-07-29) — not live yet, so this is a disabled placeholder rather than a link
                to the unpublished listing or the old zip. Swap to the real Edge Add-ons URL once
                Microsoft approves it. */}
            <span
              className="inline-flex items-center gap-3 px-8 py-4 bg-surface-50 border-2 border-surface-200 text-ink-400 rounded-xl font-semibold text-lg cursor-not-allowed"
              title="Edge extension is pending Microsoft review"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 19.5h20L12 2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                <circle cx="12" cy="14" r="3" fill="currentColor"/>
              </svg>
              Edge — Coming soon
            </span>
          </div>
          <p className="mt-6 text-sm text-ink-400">
            Chrome installs and updates automatically from the Chrome Web Store. Edge support is on the way.
          </p>
        </div>
      </section>

      {/* Pricing */}
      <Pricing isSignedIn={isSignedIn} onStartWriting={onStartWriting} />

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
  );
}
