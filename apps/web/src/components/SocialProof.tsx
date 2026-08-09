// NOTE (2026-08-09): This component previously rendered 3 fabricated testimonials (fake names/
// quotes/roles), a fabricated stats bar ("50,000+ issues fixed", "4.8 rating", etc. — static
// strings, not backed by any real data source), and a "SOC 2 Compliant" trust badge with no
// actual SOC 2 audit behind it. The testimonials/stats were removed as dishonest placeholder
// content; the SOC 2 badge was removed because displaying it without a completed third-party
// audit is a false certification claim, not just marketing embellishment. Replace the section
// below with real testimonials/stats once they exist — don't restore fabricated ones.
export function SocialProof() {
  return (
    <section className="py-16 bg-white relative overflow-hidden">
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Trust badges — only claims that are actually true today. "Zero data retention" is
            close but not fully precise: Voice Profile (opt-in) stores statistical style
            patterns, not raw text, per the Privacy section copy above. Worth revisiting this
            wording so it can't be read as contradicting that section. */}
        <div className="flex flex-wrap items-center justify-center gap-6">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-surface-50 border border-surface-200">
            <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-medium text-ink-700">Zero data retention</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-surface-50 border border-surface-200">
            <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            <span className="text-sm font-medium text-ink-700">No credit card required</span>
          </div>
        </div>
      </div>
    </section>
  );
}
