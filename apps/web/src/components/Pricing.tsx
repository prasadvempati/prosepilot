const tiers = [
  {
    name: "Free",
    tagline: "Try it out, no strings attached",
    price: "$0",
    priceSub: "/month",
    cta: { text: "Get started free", href: "/signup", style: "btn-secondary" as const },
    highlight: false,
    features: {
      charsPerCheck: "10,000",
      monthlyLimit: "10,000 chars",
      checksPerDay: "10",
    },
  },
  {
    name: "Student",
    tagline: "For learners and academics",
    price: "$5",
    priceSub: "/month",
    cta: { text: "Coming soon", href: "", style: "btn-secondary" as const, disabled: true },
    highlight: false,
    features: {
      charsPerCheck: "10,000",
      monthlyLimit: "500,000 chars",
      checksPerDay: "50",
    },
  },
  {
    name: "Individual",
    tagline: "For professionals who write daily",
    price: "$7",
    priceSub: "/month",
    cta: { text: "Coming soon", href: "", style: "btn-glow" as const, disabled: true },
    highlight: true,
    features: {
      charsPerCheck: "100,000",
      monthlyLimit: "Unlimited",
      checksPerDay: "Unlimited",
    },
  },
  {
    name: "Team",
    tagline: "For teams of 2-10 users",
    price: "$12",
    priceSub: "/user/mo",
    cta: { text: "Contact sales", href: "mailto:support@prosepilot.io", style: "btn-secondary" as const },
    highlight: false,
    features: {
      charsPerCheck: "100,000",
      monthlyLimit: "Shared pool",
      checksPerDay: "Unlimited",
    },
  },
  {
    name: "Enterprise",
    tagline: "11+ users, custom needs",
    price: "$15",
    priceSub: "/user/mo",
    cta: { text: "Contact sales", href: "mailto:support@prosepilot.io", style: "btn-secondary" as const },
    highlight: false,
    features: {
      charsPerCheck: "100,000",
      monthlyLimit: "Shared pool + overage",
      checksPerDay: "Unlimited",
    },
  },
];

const comparisonRows = [
  { label: "Chars per check", values: ["10,000", "10,000", "100,000", "100,000", "100,000"] },
  { label: "Monthly char limit", values: ["10,000", "500,000", "Unlimited", "Shared pool", "Shared pool + overage"] },
  { label: "Checks per day", values: ["10", "50", "Unlimited", "Unlimited", "Unlimited"] },
];

const comparisonSections = [
  {
    heading: "Core Writing Tools",
    rows: [
      { label: "Grammar & spelling", values: [true, true, true, true, true] },
      { label: "Passive voice detection", values: [true, true, true, true, true] },
      { label: "Word document check", values: [true, true, true, true, true] },
    ],
  },
  {
    heading: "Browser Extensions",
    rows: [
      { label: "Chrome + Edge support", values: [true, true, true, true, true] },
      { label: "Outlook support", values: [true, true, true, true, true] },
    ],
  },
  {
    heading: "AI Rewrite",
    rows: [
      { label: "AI rewrite tones", values: ["-", "Basic (3)", "All 12", "All 12", "All 12 + custom"] },
    ],
  },
  {
    heading: "Voice Profile & Terminology",
    rows: [
      { label: "Voice Profile", values: ["-", "-", true, true, true] },
      { label: "Custom terminology", values: ["-", "-", true, true, true] },
    ],
  },
  {
    heading: "Team & Admin",
    rows: [
      { label: "Team dashboard", values: ["-", "-", "-", true, true] },
      { label: "Shared usage pool", values: ["-", "-", "-", true, true] },
      { label: "Admin controls", values: ["-", "-", "-", true, true] },
    ],
  },
  {
    heading: "Enterprise & Support",
    rows: [
      { label: "SSO / SAML", values: ["-", "-", "-", "-", true] },
      { label: "API access", values: ["-", "-", "-", "-", true] },
      { label: "Dedicated support", values: ["-", "-", "-", "-", true] },
      { label: "Priority support", values: ["-", "-", true, true, true] },
    ],
  },
  {
    heading: "Privacy & Data",
    rows: [
      { label: "Data retention", values: ["None", "None", "None", "None", "None"] },
      { label: "AI training", values: ["Never", "Never", "Never", "Never", "Never"] },
    ],
  },
];

function CellValue({ value }: { value: string | boolean }) {
  if (typeof value === "boolean") {
    return value ? (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-600">
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      </span>
    ) : (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-surface-200 text-ink-400">
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </span>
    );
  }
  return <span className="text-sm text-ink-700">{value}</span>;
}

export function Pricing() {
  return (
    <section id="pricing" className="py-24 bg-surface-50 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-brand-100 rounded-full blur-3xl opacity-40 -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-purple-100 rounded-full blur-3xl opacity-30 translate-y-1/2 -translate-x-1/2" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-100/80 border border-brand-200 text-sm font-semibold text-brand-700 mb-6 backdrop-blur-sm">
            Simple, transparent pricing
          </span>
          <h2 className="text-display-lg text-ink-900 mb-4">Every limit, up front</h2>
          <p className="text-xl text-ink-500 max-w-2xl mx-auto">
            No hidden fees. No surprise charges. Compare every tier below.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 max-w-7xl mx-auto mb-20">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`card-glass p-6 relative group hover:shadow-elevated transition-all duration-300 ${
                tier.highlight ? "border-2 border-brand-500 shadow-glow-brand" : ""
              }`}
            >
              {tier.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-3 py-1 bg-gradient-to-r from-brand-500 to-purple-500 text-white text-xs font-bold rounded-full shadow-lg">
                    Most popular
                  </span>
                </div>
              )}
              <div className="mb-4">
                <h3 className="text-lg font-bold text-ink-900">{tier.name}</h3>
                <p className="text-xs text-ink-500 mt-1">{tier.tagline}</p>
              </div>
              <div className="mb-6">
                <span className="text-4xl font-bold text-ink-900">{tier.price}</span>
                <span className="text-ink-500 text-sm ml-1">{tier.priceSub}</span>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-500">Chars / check</span>
                  <span className="font-semibold text-ink-900">{tier.features.charsPerCheck}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-500">Monthly limit</span>
                  <span className="font-semibold text-ink-900">{tier.features.monthlyLimit}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-500">Checks / day</span>
                  <span className="font-semibold text-ink-900">{tier.features.checksPerDay}</span>
                </div>
              </div>

              <div className="pt-4 border-t border-surface-200">
                {tier.cta.href ? (
                  <a
                    href={tier.cta.href}
                    className={`w-full ${tier.cta.style} py-2.5 text-center block text-sm`}
                    // @ts-expect-error disabled prop on anchor
                    disabled={tier.cta.disabled}
                  >
                    {tier.cta.text}
                  </a>
                ) : (
                  <button className={`w-full ${tier.cta.style} py-2.5 text-sm`} disabled={tier.cta.disabled}>
                    {tier.cta.text}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h3 className="text-2xl font-bold text-ink-900 mb-2">Compare every detail</h3>
            <p className="text-ink-500">The full picture &mdash; no fine print, no surprises</p>
          </div>

          <div className="card-glass overflow-hidden border border-surface-200 rounded-2xl">
            <div className="grid grid-cols-6 gap-0 border-b border-surface-200 bg-surface-100/50 sticky top-0 z-10">
              <div className="p-4 text-sm font-semibold text-ink-700">Feature</div>
              {tiers.map((tier) => (
                <div
                  key={tier.name}
                  className={`p-4 text-center text-sm font-semibold text-ink-700 ${
                    tier.highlight ? "bg-brand-50/50" : ""
                  }`}
                >
                  {tier.name}
                </div>
              ))}
            </div>

            <div className="border-b border-surface-200">
              <div className="px-4 py-2.5 bg-surface-100/30">
                <span className="text-xs font-bold uppercase tracking-wider text-ink-400">Usage limits</span>
              </div>
              {comparisonRows.map((row, i) => (
                <div key={i} className="grid grid-cols-6 gap-0 border-b border-surface-100 last:border-b-0">
                  <div className="p-4 text-sm text-ink-700">{row.label}</div>
                  {row.values.map((val, j) => (
                    <div
                      key={j}
                      className={`p-4 text-center ${tiers[j].highlight ? "bg-brand-50/30" : ""}`}
                    >
                      <CellValue value={val} />
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {comparisonSections.map((section) => (
              <div key={section.heading} className="border-b border-surface-200 last:border-b-0">
                <div className="px-4 py-2.5 bg-surface-100/30">
                  <span className="text-xs font-bold uppercase tracking-wider text-ink-400">{section.heading}</span>
                </div>
                {section.rows.map((row, i) => (
                  <div key={i} className="grid grid-cols-6 gap-0 border-b border-surface-100 last:border-b-0">
                    <div className="p-4 text-sm text-ink-700">{row.label}</div>
                    {row.values.map((val, j) => (
                      <div
                        key={j}
                        className={`p-4 text-center ${tiers[j].highlight ? "bg-brand-50/30" : ""}`}
                      >
                        <CellValue value={val} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 text-center">
          <p className="text-sm text-ink-500 max-w-2xl mx-auto">
            All plans include real-time grammar checking, browser extensions, and no data is ever used for AI training.
            Need more than 10 users? <a href="mailto:support@prosepilot.io" className="text-brand-600 font-semibold hover:underline">Contact sales</a> for volume pricing and custom setup.
          </p>
        </div>
      </div>
    </section>
  );
}
