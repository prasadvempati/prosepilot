import { useState } from "react";
import { SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/react";

interface HeaderProps {
  // Called instead of the normal "/" navigation when a signed-in user clicks the logo.
  // Without this, the logo was a plain <a href="/"> — since App.tsx has no client-side
  // router, "/" always re-renders whatever App.tsx currently shows, so clicking it just did a
  // full page reload back to where you already were (a jarring flicker, not real navigation).
  // Signed-out users keep the normal link behavior — "/" is a real, different page for them
  // (the marketing site) so a reload there is fine/expected.
  onLogoClick?: () => void;
  // Whether the marketing nav (Features/Pricing anchors) should show. These anchors only
  // exist in the DOM when the landing page is actually rendered — true for every signed-out
  // visitor, and also true for a signed-in visitor who is currently on the home view (they
  // land there first now, before clicking "Start Writing"). Defaults to true so existing
  // signed-out callers behave exactly as before if this prop is omitted.
  showMarketingNav?: boolean;
}

export function Header({ onLogoClick, showMarketingNav = true }: HeaderProps = {}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isSignedIn } = useAuth();

  return (
    <header className="sticky top-0 z-50 glass border-b border-surface-200/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <a
            href="/"
            onClick={(e) => {
              if (isSignedIn && onLogoClick) {
                e.preventDefault();
                onLogoClick();
              }
            }}
            className="flex items-center gap-3 group"
          >
            <div className="w-9 h-9 bg-gradient-to-br from-brand-400 to-brand-600 rounded-xl flex items-center justify-center shadow-sm group-hover:shadow-glow transition-shadow duration-300">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <span className="text-lg font-bold text-ink-900 tracking-tight">ProsePilot</span>
          </a>

          {/* Desktop Nav — Features/Pricing anchors only exist in the DOM when the landing page
              is actually rendered (see showMarketingNav prop doc above), so gate on that rather
              than on isSignedIn directly. */}
          {showMarketingNav && (
            <nav className="hidden md:flex items-center gap-1">
              <a href="/#features" className="btn-ghost text-sm">Features</a>
              <a href="/#pricing" className="btn-ghost text-sm">Pricing</a>
            </nav>
          )}

          {/* Auth */}
          <div className="flex items-center gap-3">
            {/* Always visible regardless of sign-in state — the Chrome/Edge install buttons
                only exist in the signed-out marketing section below, so a signed-in user
                previously had no way to reach the extension download at all. Points at the
                Chrome Web Store listing (auto-updates) rather than the static zip. */}
            <a
              href="https://chromewebstore.google.com/detail/prosepilot/gafofglaaopdifodogfifofndmogghfi"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost text-sm hidden sm:flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Get the extension
            </a>
            {!isSignedIn && (
              <>
                <SignInButton mode="modal">
                  <button className="btn-ghost text-sm hidden sm:block">Sign in</button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button className="btn-primary text-sm px-4 py-2">Get started free</button>
                </SignUpButton>
              </>
            )}
            {isSignedIn && (
              <UserButton 
                appearance={{
                  elements: {
                    avatarBox: "w-9 h-9"
                  }
                }}
              />
            )}

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden btn-icon"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-surface-200/50 animate-slide-up">
            <div className="flex flex-col gap-2">
              {showMarketingNav && (
                <>
                  <a href="/#features" className="btn-ghost text-sm justify-start" onClick={() => setMobileMenuOpen(false)}>Features</a>
                  <a href="/#pricing" className="btn-ghost text-sm justify-start" onClick={() => setMobileMenuOpen(false)}>Pricing</a>
                </>
              )}
              {!isSignedIn && (
                <SignInButton mode="modal">
                  <button className="btn-ghost text-sm justify-start" onClick={() => setMobileMenuOpen(false)}>Sign in</button>
                </SignInButton>
              )}
              {/* The "Get the extension" link in the header bar is hidden below the sm
                  breakpoint (`hidden sm:flex`), and a signed-in user has nothing else in
                  this marketing nav — without this, the mobile menu opened to a completely
                  empty panel below ~640px, which looked broken. */}
              {isSignedIn && (
                <a
                  href="https://chromewebstore.google.com/detail/prosepilot/gafofglaaopdifodogfifofndmogghfi"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost text-sm justify-start flex items-center gap-1.5"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Get the extension
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
