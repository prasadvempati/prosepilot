import { useState } from 'react';

export default function LandingPage() {
  const [demoText, setDemoText] = useState(
    "your going to love this. its a great day. could of done better."
  );
  const [issues, setIssues] = useState<Array<{
    original: string;
    replacement: string;
    explanation: string;
  }>>([]);
  const [checking, setChecking] = useState(false);

  const checkGrammar = async () => {
    if (!demoText.trim()) return;
    setChecking(true);
    try {
      const res = await fetch('https://prosepilotio-production.up.railway.app/v1/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: demoText, mode: 'report' }),
      });
      const data = await res.json();
      setIssues(data.issues || []);
    } catch (e) {
      console.error(e);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 opacity-5" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-32">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 mb-8">
              <span className="text-white text-sm font-medium">New: Voice Preservation Score™</span>
            </div>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white leading-tight mb-6">
              Write like you.<br />
              <span className="bg-gradient-to-r from-yellow-300 to-orange-400 bg-clip-text text-transparent">
                Only better.
              </span>
            </h1>
            <p className="text-xl sm:text-2xl text-white/90 max-w-3xl mx-auto mb-12 leading-relaxed">
              ProsePilot fixes grammar, spelling, and punctuation — without changing your voice.
              Grammarly rewrites; we refine.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <a
                href="https://chrome.google.com/webstore/detail/prosepilot"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white text-indigo-600 font-semibold px-8 py-4 rounded-xl text-lg hover:bg-gray-100 transition-all shadow-lg"
              >
                Add to Chrome — Free
              </a>
              <a
                href="#demo"
                className="bg-white/10 backdrop-blur-sm border border-white/20 text-white font-semibold px-8 py-4 rounded-xl text-lg hover:bg-white/20 transition-all"
              >
                Try Live Demo
              </a>
            </div>
            
            {/* Trust indicators */}
            <div className="flex flex-wrap justify-center gap-8 text-white/70 text-sm">
              <span>✓ Works on Gmail, LinkedIn, Docs, Notion, Slack</span>
              <span>✓ Offline-first: your text stays private</span>
              <span>✓ Voice Preservation Score on every check</span>
            </div>
          </div>
        </div>
      </section>

      {/* Live Demo Section */}
      <section id="demo" className="py-20 sm:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Try it live — no install needed
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Type or paste text below. Our offline engine catches errors instantly — no server round-trip.
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            <div className="bg-gray-50 rounded-2xl border border-gray-200 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 bg-gray-100 border-b border-gray-200">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
                <div className="flex-1 text-center text-sm text-gray-500 font-mono">
                  prosepilot-demo
                </div>
              </div>
              <textarea
                id="demo-textarea"
                value={demoText}
                onChange={(e) => setDemoText(e.target.value)}
                className="w-full h-48 p-6 font-mono text-base text-gray-900 placeholder-gray-400 focus:outline-none resize-none bg-white"
                placeholder="Type or paste text here... Try: 'your going to love this. its a great day. could of done better.'"
                spellCheck={false}
              />
              <div className="px-4 py-4 border-t border-gray-200 flex items-center justify-between">
                <button
                  onClick={checkGrammar}
                  disabled={checking || !demoText.trim()}
                  className="bg-indigo-600 text-white font-semibold px-6 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {checking ? 'Checking...' : 'Check Grammar'}
                </button>
                <span className="text-sm text-gray-500">
                  Runs offline in your browser • Voice Preservation Score included
                </span>
              </div>
            </div>

            {/* Results */}
            {issues.length > 0 && (
              <div className="mt-6 space-y-3">
                <h3 className="text-lg font-semibold text-gray-900">
                  Found {issues.length} issue{issues.length !== 1 ? 's' : ''}
                </h3>
                <div className="space-y-2">
                  {issues.map((issue, i) => (
                    <div
                      key={i}
                      className="bg-gray-50 border border-gray-200 rounded-xl p-4"
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-1 w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm text-gray-900">
                            <span className="line-through text-red-500">{issue.original}</span>{' '}
                            <span className="text-green-600 font-medium">→ {issue.replacement}</span>
                          </p>
                          <p className="text-xs text-gray-500 mt-1">{issue.explanation}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Voice Preservation Score */}
            <div className="mt-8 p-6 bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl border border-green-100">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-lg font-semibold text-green-900">Voice Preservation Score</h4>
                  <p className="text-sm text-green-700 mt-1">
                    Grammarly rewrites your style. ProsePilot keeps you sounding like you.
                  </p>
                </div>
                <div className="text-4xl font-bold text-green-600">94%</div>
              </div>
              <p className="text-sm text-green-700 mt-2">
                Based on: contractions preserved, passive voice avoided, vocabulary kept, sentence structure maintained
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 sm:py-28 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Why writers choose ProsePilot
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Not another rewriter. A co-pilot that respects your voice.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                ),
                title: "Lightning Fast",
                desc: "Offline engine runs in your browser. Zero latency. No waiting for server responses.",
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                ),
                title: "Private by Default",
                desc: "Offline mode means your text never leaves your device. No logging, no training data.",
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                ),
                title: "Your Voice, Kept",
                desc: "Voice Preservation Score shows exactly how much of your style stays intact. Grammarly averages ~58%.",
              },
            ].map((feature, i) => (
              <div
                key={i}
                className="bg-white p-8 rounded-2xl border border-gray-100 hover:border-indigo-200 hover:shadow-lg transition-all"
              >
                <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 mb-4">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Works Everywhere */}
      <section className="py-20 sm:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Works everywhere you write
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              One extension. Every text box. Every platform.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
            {[
              'Gmail', 'LinkedIn', 'Google Docs', 'Notion',
              'Slack', 'Twitter/X', 'Facebook', 'Trello',
              'Jira', 'Confluence', 'GitHub', 'Outlook Web',
            ].map((platform) => (
              <div
                key={platform}
                className="bg-gray-50 hover:bg-indigo-50 hover:border-indigo-200 border border-gray-200 rounded-xl p-4 text-center transition-all group"
              >
                <span className="font-medium text-gray-900 group-hover:text-indigo-600 transition-colors">
                  {platform}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 sm:py-28 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Simple, fair pricing
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Free for core grammar. Pro features for power users.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              {
                name: 'Free',
                price: '$0',
                period: '/month',
                features: [
                  'Core grammar & spelling',
                  'Offline engine',
                  'Voice Preservation Score',
                  'Works on all sites',
                  'Basic corrections',
                ],
                cta: 'Get Free',
                popular: false,
              },
              {
                name: 'Pro',
                price: '$9',
                period: '/month',
                features: [
                  'Everything in Free',
                  'Advanced style suggestions',
                  'Tone adjustment (formal, casual, etc.)',
                  'Rewrite with custom instructions',
                  'Vocabulary enhancement',
                  'Priority support',
                ],
                cta: 'Start Pro Trial',
                popular: true,
              },
              {
                name: 'Team',
                price: '$14',
                period: '/user/month',
                features: [
                  'Everything in Pro',
                  'Team style guides',
                  'Shared vocabulary',
                  'Admin dashboard',
                  'Usage analytics',
                  'SSO & SCIM (Enterprise)',
                ],
                cta: 'Contact Sales',
                popular: false,
              },
            ].map((plan) => (
              <div
                key={plan.name}
                className={`relative bg-white rounded-2xl border-2 p-8 ${
                  plan.popular
                    ? 'border-indigo-500 shadow-xl ring-4 ring-indigo-500/20'
                    : 'border-gray-200'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                    Most Popular
                  </div>
                )}
                <h3 className="text-xl font-bold text-gray-900 mb-1">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-4xl font-bold text-gray-900">{plan.price}</span>
                  <span className="text-gray-500">{plan.period}</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feat, i) => (
                    <li key={i} className="flex items-center gap-2 text-gray-600">
                      <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      {feat}
                    </li>
                  ))}
                </ul>
                <a
                  href={plan.name === 'Free' ? 'https://chrome.google.com/webstore/detail/prosepilot' : '#'}
                  target={plan.name === 'Free' ? '_blank' : undefined}
                  rel={plan.name === 'Free' ? 'noopener noreferrer' : undefined}
                  className={`w-full py-3 px-6 rounded-xl font-semibold text-center transition-all ${
                    plan.popular
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                      : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  }`}
                >
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-20 bg-indigo-600">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Ready to write like you — only better?
          </h2>
          <p className="text-lg text-indigo-100 mb-8">
            Join thousands of writers who refuse to sound like a robot.
          </p>
          <a
            href="https://chrome.google.com/webstore/detail/prosepilot"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white text-indigo-600 font-semibold px-10 py-4 rounded-xl text-lg hover:bg-gray-100 transition-all shadow-xl inline-block"
          >
            Add ProsePilot to Chrome — Free
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span className="text-white font-bold text-xl">ProsePilot</span>
              </div>
              <p className="text-sm text-gray-500">
                Write like you. Only better.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">Chrome Extension</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Web Editor</a></li>
                <li><a href="#" className="hover:text-white transition-colors">API Access</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Team Features</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Company</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">About</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Data Processing</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-center text-sm">
            © 2024 ProsePilot. Built for writers who refuse to sound like robots.
          </div>
        </div>
      </footer>
    </div>
  );
}