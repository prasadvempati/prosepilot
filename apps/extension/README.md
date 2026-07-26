# ProsePilot Chrome Extension

Your Writing Co-Pilot — Fix grammar, clarity, and tone instantly on any website.

## Features

- **Text Selection**: Select any text on a webpage, click the floating ProsePilot button
- **Context Menu**: Right-click selected text → "Check grammar with ProsePilot"
- **Grammar Checking**: Powered by ProsePilot API (DeepSeek AI)
- **Instant Fixes**: See issues and apply fixes directly

## Installation

1. Open `chrome://extensions/` in Chrome
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `apps/extension` directory
5. Pin ProsePilot to your toolbar

## Usage

1. Select text on any webpage
2. Click the ProsePilot floating button (or right-click → "Check grammar")
3. Review suggestions in the popup
4. Click to apply fixes

## Development

The extension communicates with the ProsePilot API at `https://prosepilot.io`.

## TODO

- [ ] Inline fix suggestions (show fixes directly on the page)
- [ ] Auto-fix on blur (check grammar when leaving a text field)
- [ ] User login/sync with ProsePilot account
- [ ] Custom rules and terminology
- [ ] Dark mode
