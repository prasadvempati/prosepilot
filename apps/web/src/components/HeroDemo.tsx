import { useState, useEffect } from "react";

const DEMO_STEPS = [
  {
    text: "Their going to the store tomorrow",
    issues: [
      { word: "Their", replacement: "They're", type: "error" },
    ],
  },
  {
    text: "Their going to the store tomorrow",
    fixed: "They're going to the store tomorrow",
    issues: [
      { word: "tomorrow", replacement: "tomorrow.", type: "punctuation" },
    ],
  },
  {
    text: "They're going to the store tomorrow",
    fixed: "They're going to the store tomorrow.",
    done: true,
  },
];

export function HeroDemo() {
  const [step, setStep] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [isTyping, setIsTyping] = useState(true);
  const [showFix, setShowFix] = useState(false);

  useEffect(() => {
    const currentStep = DEMO_STEPS[step];
    if (!currentStep) {
      // Loop back
      setTimeout(() => {
        setStep(0);
        setDisplayText("");
        setIsTyping(true);
        setShowFix(false);
      }, 3000);
      return;
    }

    if (isTyping) {
      // Type out the text character by character
      let i = 0;
      const typeInterval = setInterval(() => {
        if (i <= currentStep.text.length) {
          setDisplayText(currentStep.text.slice(0, i));
          i++;
        } else {
          clearInterval(typeInterval);
          setIsTyping(false);
          // Show the fix after a pause
          setTimeout(() => {
            setShowFix(true);
            setTimeout(() => {
              setStep(step + 1);
              setIsTyping(true);
              setShowFix(false);
            }, 2000);
          }, 1000);
        }
      }, 50);

      return () => clearInterval(typeInterval);
    }
  }, [step, isTyping]);

  const currentStep = DEMO_STEPS[step];
  const displayFixed = showFix && currentStep?.fixed;

  return (
    <div className="relative w-full max-w-lg mx-auto">
      {/* Mock browser window */}
      <div className="card-glass overflow-hidden shadow-float">
        {/* Browser chrome */}
        <div className="flex items-center gap-2 px-4 py-3 bg-surface-100/80 border-b border-surface-200/50">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-rose-400" />
            <div className="w-3 h-3 rounded-full bg-amber-400" />
            <div className="w-3 h-3 rounded-full bg-emerald-400" />
          </div>
          <div className="flex-1 mx-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-0 rounded-lg text-xs text-ink-400">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              prosepilot.io
            </div>
          </div>
        </div>

        {/* Editor content */}
        <div className="p-6 min-h-[180px] bg-surface-0">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
            <span className="text-xs font-medium text-ink-400">Grammar Check</span>
          </div>
          
          <div className="relative">
            <p className="text-lg leading-relaxed text-ink-900 font-mono">
              {displayText}
              {isTyping && <span className="typing-cursor" />}
            </p>
            
            {/* Show fix overlay */}
            {displayFixed && (
              <div className="absolute inset-0 bg-white/90 backdrop-blur-sm rounded-lg flex items-center justify-center animate-scale-in">
                <div className="flex items-center gap-3">
                  <span className="text-lg text-ink-300 line-through">{currentStep?.text}</span>
                  <svg className="w-5 h-5 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  <span className="text-lg text-emerald-600 font-semibold">{currentStep?.fixed}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-surface-50 border-t border-surface-200/50">
          <div className="flex items-center gap-2">
            {currentStep?.done ? (
              <div className="flex items-center gap-2 text-emerald-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-medium">All clear!</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-brand-600">
                <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium">Checking...</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="badge-success">1 fix</span>
          </div>
        </div>
      </div>

      {/* Floating badges */}
      <div className="absolute -top-4 -right-4 animate-float">
        <div className="bg-emerald-500 text-white px-3 py-1.5 rounded-full text-xs font-semibold shadow-lg flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Fixed
        </div>
      </div>
      
      <div className="absolute -bottom-3 -left-3 animate-float" style={{ animationDelay: "1s" }}>
        <div className="bg-brand-500 text-white px-3 py-1.5 rounded-full text-xs font-semibold shadow-lg flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Instant
        </div>
      </div>
    </div>
  );
}
