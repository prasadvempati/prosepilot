export function Pricing() {
  return (
    <section id="pricing" className="py-24 bg-surface-50 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-brand-100 rounded-full blur-3xl opacity-40 -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-purple-100 rounded-full blur-3xl opacity-30 translate-y-1/2 -translate-x-1/2" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-100/80 border border-brand-200 text-sm font-semibold text-brand-700 mb-6 backdrop-blur-sm">
            Simple pricing
          </span>
          <h2 className="text-display-lg text-ink-900 mb-4">Start free, upgrade when ready</h2>
          <p className="text-xl text-ink-500 max-w-2xl mx-auto">
            No hidden fees. No credit card required. Just better writing.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {/* Student Plan */}
          <div className="card-glass p-8 relative group hover:shadow-elevated transition-all duration-300">
            <div className="mb-6">
              <h3 className="text-lg font-bold text-ink-900 mb-2">Student</h3>
              <p className="text-sm text-ink-500">For learners and academics</p>
            </div>
            <div className="mb-8">
              <span className="text-5xl font-bold text-ink-900">$5</span>
              <span className="text-ink-500 ml-2">/month</span>
            </div>
            <ul className="space-y-4 mb-8">
              {[
                "10,000 characters per check",
                "50 checks per day",
                "Grammar & spelling checks",
                "Basic rewrite suggestions",
                "Browser extension",
              ].map((feature, i) => (
                <li key={i} className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-ink-700">{feature}</span>
                </li>
              ))}
            </ul>
            <button className="w-full btn-secondary py-3" disabled>
              Coming soon
            </button>
          </div>

          {/* Individual Plan */}
          <div className="card-glass p-8 relative border-2 border-brand-500 shadow-glow-brand group hover:shadow-glow-lg transition-all duration-300">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <span className="px-4 py-1.5 bg-gradient-to-r from-brand-500 to-purple-500 text-white text-sm font-bold rounded-full shadow-lg">
                Most popular
              </span>
            </div>
            <div className="mb-6">
              <h3 className="text-lg font-bold text-ink-900 mb-2">Individual</h3>
              <p className="text-sm text-ink-500">For professionals who write daily</p>
            </div>
            <div className="mb-8">
              <span className="text-5xl font-bold text-ink-900">$7</span>
              <span className="text-ink-500 ml-2">/month</span>
            </div>
            <ul className="space-y-4 mb-8">
              {[
                "100,000 characters per check",
                "Unlimited checks",
                "Advanced AI rewrite (12 tones)",
                "Chrome & Edge extensions",
                "Custom terminology",
                "Priority support",
              ].map((feature, i) => (
                <li key={i} className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-brand-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-ink-700">{feature}</span>
                </li>
              ))}
            </ul>
            <button className="w-full btn-glow py-3" disabled>
              Coming soon
            </button>
          </div>

          {/* Team Plan */}
          <div className="card-glass p-8 relative group hover:shadow-elevated transition-all duration-300">
            <div className="mb-6">
              <h3 className="text-lg font-bold text-ink-900 mb-2">Team</h3>
              <p className="text-sm text-ink-500">For teams of 2-10 users</p>
            </div>
            <div className="mb-8">
              <span className="text-5xl font-bold text-ink-900">$12</span>
              <span className="text-ink-500 ml-2">/user/mo</span>
            </div>
            <ul className="space-y-4 mb-8">
              {[
                "Shared usage pool",
                "Admin dashboard",
                "Priority support",
                "Everything in Individual",
                "Team billing",
              ].map((feature, i) => (
                <li key={i} className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-ink-700">{feature}</span>
                </li>
              ))}
            </ul>
            <a href="mailto:support@prosepilot.io" className="w-full btn-secondary py-3 text-center block">
              Contact sales
            </a>
          </div>
        </div>

        {/* Enterprise section */}
        <div className="mt-16 text-center">
          <div className="inline-flex flex-col sm:flex-row items-center gap-4 sm:gap-6 px-6 sm:px-8 py-5 sm:py-6 rounded-2xl bg-surface-0 border border-surface-200 shadow-sm">
            <div className="w-12 h-12 bg-brand-100 rounded-xl flex items-center justify-center shrink-0">
              <svg className="w-6 h-6 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div className="text-left">
              <p className="font-bold text-ink-900">Enterprise (11+ users)</p>
              <p className="text-sm text-ink-500">$15/user/mo + $0.50 per 100K chars overage &middot; SSO, API access, dedicated support</p>
            </div>
            <a href="mailto:support@prosepilot.io" className="btn-secondary text-sm whitespace-nowrap shrink-0">
              Contact sales
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
