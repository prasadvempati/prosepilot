import { Show, SignInButton, UserButton } from "@clerk/react";

export function Header() {
  return (
    <header className="sticky top-0 z-50 glass border-b border-surface-200/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <a href="/" className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-brand-400 to-brand-600 rounded-xl flex items-center justify-center shadow-sm">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <span className="text-lg font-semibold text-ink-900 tracking-tight">ProsePilot</span>
          </a>

          {/* Nav */}
          <nav className="hidden md:flex items-center gap-1">
            <a href="#features" className="btn-ghost text-sm">Features</a>
            <a href="#pricing" className="btn-ghost text-sm">Pricing</a>
          </nav>

          {/* Auth */}
          <div className="flex items-center gap-3">
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button className="btn-ghost text-sm">Sign in</button>
              </SignInButton>
            </Show>
            <Show when="signed-in">
              <UserButton 
                appearance={{
                  elements: {
                    avatarBox: "w-9 h-9"
                  }
                }}
              />
            </Show>
          </div>
        </div>
      </div>
    </header>
  );
}
