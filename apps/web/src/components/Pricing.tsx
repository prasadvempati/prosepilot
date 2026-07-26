import { SignedIn, SignedOut, SignInButton, SignUpButton } from "@clerk/clerk-react";

export function Pricing() {
  const handleCheckout = async () => {
    try {
      const res = await fetch("/v1/billing/checkout", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error("Checkout error:", err);
    }
  };

  return (
    <section id="pricing" className="py-24 bg-white relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-brand-50 rounded-full blur-3xl opacity-50 -translate-y-1/2 translate-x-1/2" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-50 border border-brand-100 text-sm font-medium text-brand-700 mb-6">
            Simple pricing
          </span>
          <h2 className="text-display-lg text-ink-900 mb-4">Start free, upgrade when ready</h2>
          <p className="text-xl text-ink-500 max-w-2xl mx-auto">
            No hidden fees. No credit card required. Just better writing.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Free Plan */}
          <div className="card p-8 relative">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-ink-900 mb-2">Free</h3>
              <p className="text-sm text-ink-500">Perfect for trying out ProsePilot</p>
            </div>
            <div className="mb-8">
              <span className="text-5xl font-bold text-ink-900">$0</span>
              <span className="text-ink-500 ml-2">forever</span>
            </div>
            <ul className="space-y-4 mb-8">
              {[
                "Grammar & spelling checks",
                "Up to 5,000 characters per check",
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
            <SignedOut>
              <SignUpButton mode="modal">
                <button className="w-full btn-secondary py-3">
                  Get started free
                </button>
              </SignUpButton>
            </SignedOut>
            <SignedIn>
              <button className="w-full btn-secondary py-3" disabled>
                Current plan
              </button>
            </SignedIn>
          </div>

          {/* Pro Plan */}
          <div className="card p-8 relative border-2 border-brand-500 shadow-glow">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <span className="px-4 py-1.5 bg-brand-500 text-white text-sm font-semibold rounded-full">
                Most popular
              </span>
            </div>
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-ink-900 mb-2">Pro</h3>
              <p className="text-sm text-ink-500">For professionals who write daily</p>
            </div>
            <div className="mb-8">
              <span className="text-5xl font-bold text-ink-900">$5</span>
              <span className="text-ink-500 ml-2">/month</span>
            </div>
            <ul className="space-y-4 mb-8">
              {[
                "Everything in Free",
                "Unlimited characters",
                "Advanced AI rewrite (12 tones)",
                "Priority support",
                "Chrome & Edge extensions",
                "Custom terminology",
              ].map((feature, i) => (
                <li key={i} className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-brand-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-ink-700">{feature}</span>
                </li>
              ))}
            </ul>
            <SignedIn>
              <button
                onClick={handleCheckout}
                className="w-full btn-primary py-3"
              >
                Upgrade to Pro
              </button>
            </SignedIn>
            <SignedOut>
              <SignInButton mode="modal">
                <button className="w-full btn-primary py-3">
                  Sign in to upgrade
                </button>
              </SignInButton>
            </SignedOut>
          </div>
        </div>

        {/* Team pricing */}
        <div className="mt-12 text-center">
          <div className="inline-flex items-center gap-4 px-6 py-4 rounded-2xl bg-surface-50 border border-surface-200">
            <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div className="text-left">
              <p className="font-medium text-ink-900">Teams of 2-20?</p>
              <p className="text-sm text-ink-500">$4/user/month with volume discounts</p>
            </div>
            <a href="mailto:support@prosepilot.io" className="btn-secondary text-sm whitespace-nowrap">
              Contact sales
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
