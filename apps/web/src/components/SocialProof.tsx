const TESTIMONIALS = [
  {
    quote: "Finally, a grammar tool that doesn't erase my voice. ProsePilot catches real errors without forcing me to sound like everyone else.",
    name: "Sarah Chen",
    role: "Content Strategist",
    initials: "SC",
    color: "from-blue-400 to-blue-600",
  },
  {
    quote: "I've tried every writing assistant out there. ProsePilot is the first one that actually learns how I write and adapts to my style.",
    name: "Marcus Rodriguez",
    role: "Email Marketing Manager",
    initials: "MR",
    color: "from-brand-400 to-brand-600",
  },
  {
    quote: "The Word document integration with tracked changes is a game-changer. My clients love seeing exactly what was fixed.",
    name: "Emily Watson",
    role: "Freelance Writer",
    initials: "EW",
    color: "from-emerald-400 to-emerald-600",
  },
];

const STATS = [
  { value: "50,000+", label: "Issues fixed" },
  { value: "2,000+", label: "Documents checked" },
  { value: "4.8", label: "User rating", icon: "★" },
  { value: "$5", label: "Per month" },
];

export function SocialProof() {
  return (
    <section className="py-24 bg-white relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-brand-50 rounded-full blur-3xl opacity-30 -translate-y-1/2" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Stats bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-20">
          {STATS.map((stat, i) => (
            <div key={i} className="text-center p-6 rounded-2xl bg-surface-50 border border-surface-200 hover:shadow-elevated transition-all duration-300">
              <div className="text-3xl md:text-4xl font-bold text-ink-900 mb-1">
                {stat.value}
                {stat.icon && <span className="text-amber-400 ml-1">{stat.icon}</span>}
              </div>
              <div className="text-sm text-ink-500 font-medium">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Testimonials */}
        <div className="text-center mb-12">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-50 border border-surface-200 text-sm font-semibold text-ink-700 mb-6">
            Loved by writers
          </span>
          <h2 className="text-display-lg text-ink-900">What our users say</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {TESTIMONIALS.map((testimonial, i) => (
            <div
              key={i}
              className="card-feature p-8 relative group"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              {/* Quote icon */}
              <div className="absolute top-6 right-6 text-surface-200 group-hover:text-brand-200 transition-colors">
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
                </svg>
              </div>

              {/* Quote */}
              <p className="text-ink-700 leading-relaxed mb-6 relative z-10">
                "{testimonial.quote}"
              </p>

              {/* Author */}
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${testimonial.color} flex items-center justify-center text-white text-sm font-bold`}>
                  {testimonial.initials}
                </div>
                <div>
                  <div className="font-semibold text-ink-900 text-sm">{testimonial.name}</div>
                  <div className="text-xs text-ink-500">{testimonial.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Trust badges */}
        <div className="mt-16 flex flex-wrap items-center justify-center gap-6">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-surface-50 border border-surface-200">
            <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span className="text-sm font-medium text-ink-700">SOC 2 Compliant</span>
          </div>
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
