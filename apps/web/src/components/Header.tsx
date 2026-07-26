export function Header() {
  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <span className="text-xl font-bold text-brand-600">ProsePilot</span>
          </div>

          {/* Nav */}
          <nav className="hidden md:flex items-center gap-6">
            <a href="#" className="text-sm text-gray-600 hover:text-gray-900">Features</a>
            <a href="#" className="text-sm text-gray-600 hover:text-gray-900">Pricing</a>
            <a href="#" className="text-sm text-gray-600 hover:text-gray-900">Docs</a>
          </nav>

          {/* Auth */}
          <div className="flex items-center gap-3">
            <button className="btn-ghost text-sm">Sign In</button>
            <button className="btn-primary text-sm">Get Started Free</button>
          </div>
        </div>
      </div>
    </header>
  );
}
