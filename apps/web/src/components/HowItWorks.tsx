export function HowItWorks() {
  const steps = [
    {
      number: "01",
      title: "Paste your text",
      description: "Drop in an email, report, or any writing. We support up to 100,000 characters.",
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
      color: "from-blue-500 to-blue-600",
      bgColor: "bg-blue-50",
      textColor: "text-blue-600",
    },
    {
      number: "02",
      title: "AI checks everything",
      description: "Grammar, spelling, punctuation, clarity, and tone — all analyzed in seconds.",
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: "from-brand-500 to-brand-600",
      bgColor: "bg-brand-50",
      textColor: "text-brand-600",
    },
    {
      number: "03",
      title: "Fix with one click",
      description: "Accept suggestions individually or all at once. Your text, your voice.",
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      ),
      color: "from-emerald-500 to-emerald-600",
      bgColor: "bg-emerald-50",
      textColor: "text-emerald-600",
    },
  ];

  return (
    <section className="py-24 bg-surface-50 relative overflow-hidden">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 dots-pattern opacity-30" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-0 border border-surface-200 text-sm font-semibold text-ink-700 mb-6 shadow-sm">
            How it works
          </span>
          <h2 className="text-display-lg text-ink-900 mb-4">Better writing in three steps</h2>
          <p className="text-xl text-ink-500 max-w-2xl mx-auto">
            No complex setup. No learning curve. Just paste, check, and fix.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12 relative">
          {/* Connector lines (desktop) */}
          <div className="hidden md:block absolute top-24 left-[20%] right-[20%] h-0.5">
            <div className="w-full h-full bg-gradient-to-r from-blue-300 via-brand-300 to-emerald-300 opacity-40" />
          </div>

          {steps.map((step, i) => (
            <div key={i} className="relative stagger-children" style={{ animationDelay: `${i * 150}ms` }}>
              <div className="text-center">
                {/* Step number circle */}
                <div className="relative inline-flex mb-6">
                  <div className={`w-20 h-20 rounded-2xl ${step.bgColor} flex items-center justify-center ${step.textColor} shadow-sm`}>
                    {step.icon}
                  </div>
                  <div className={`absolute -top-2 -right-2 w-8 h-8 rounded-full bg-gradient-to-br ${step.color} flex items-center justify-center text-white text-xs font-bold shadow-md`}>
                    {step.number}
                  </div>
                </div>

                <h3 className="text-xl font-bold text-ink-900 mb-3">{step.title}</h3>
                <p className="text-ink-500 leading-relaxed max-w-xs mx-auto">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
