# Floating "Pp" Icon — Design Spec

**Date:** 2026-07-30
**Status:** Approved
**Approach:** Extend existing Chrome/Edge extension (v1.0.6)

---

## Overview

Add a floating "Pp" icon that appears on any text field across the web. Users click it to select between three grammar correction modes: Auto, Suggestive, or No correction. This brings the Grammarly-like experience to ProsePilot's browser extension.

---

## The Icon

- **Position:** Fixed bottom-right corner (20px from edges)
- **Size:** 40x40px circle
- **Background:** Purple gradient (#6366f1 → #8b5cf6)
- **Label:** "Pp" in white, 14px bold, centered
- **Shadow:** `0 2px 8px rgba(99, 102, 241, 0.3)`
- **Idle state:** opacity 0.7
- **Hover state:** opacity 1.0, scale 1.05
- **Entry animation:** Gentle pulse every 5 seconds, max 3 times on first load

---

## Appear/Disappear Logic

| Event | Action |
|-------|--------|
| User focuses `input`, `textarea`, or `contenteditable` | Show icon |
| User clicks outside all text fields | Hide icon (300ms delay) |
| Current page is prosepilot.io | Never show (avoid double-detection) |
| Extension disabled via popup | Never show |

---

## Click Behavior — Mode Selector Popover

Clicking the icon opens a small popover above it (180px wide, dark background):

```
┌─────────────────────────┐
│  Grammar Mode            │
│  ─────────────────────  │
│  🟢 Auto-correct         │
│  🟡 Suggest corrections  │
│  🔴 No correction        │
└─────────────────────────┘
```

- **Auto-correct:** Green dot indicator
- **Suggest corrections:** Yellow dot indicator
- **No correction:** Red dot indicator
- Selected mode has filled radio button
- Clicking a mode selects it and closes popover
- Mode persists across sessions via `chrome.storage.local`

---

## Mode Behaviors

### Auto-correct Mode
1. User types in any text field
2. After 500ms of inactivity (debounce), send text to `/v1/check` API
3. If issues found, apply all safe fixes automatically (replace text in field)
4. Show brief toast: "✓ 3 corrections applied" (fades after 2 seconds)
5. User can Ctrl+Z to undo (browser native undo for input fields)
6. Re-check after each auto-correction cycle

### Suggest Corrections Mode
1. User types in any text field
2. After 500ms of inactivity, send text to `/v1/check` API
3. Overlay wavy underlines on the text (via contenteditable overlay or background highlight)
4. Underline colors by category:
   - Red: spelling errors
   - Blue: grammar errors
   - Yellow: style suggestions
5. **Hover** on underlined text → tooltip appears:
   ```
   ┌──────────────────────────┐
   │ Did you mean:            │
   │ "correction text"        │
   │ [Accept]  [Ignore]       │
   └──────────────────────────┘
   ```
6. **Click Accept** → text replaced, underline removed
7. **Click Ignore** → underline removed for that issue
8. Toast: "✓ 2 corrections applied" on accept

### No Correction Mode
1. Icon shows red dot, reduced opacity (0.4)
2. No API calls made
3. No underlines shown
4. Clicking icon still opens popover to switch modes

---

## Technical Implementation

### Files to modify:
- `apps/extension/content.js` — add floating icon, mode selector, mode-aware checking
- `apps/extension/manifest.json` — no changes needed (already has required permissions)
- `apps/extension/popup.js` — add mode toggle as alternative access point

### New code structure in content.js:

```
FloatingIcon class:
  - createElement() — creates the "Pp" button
  - show() / hide() — visibility control
  - openPopover() / closePopover() — mode selector
  - setMode(mode) — updates chrome.storage and UI

ModeManager class:
  - constructor(mode) — loads saved mode
  - onTextChange(text, field) — routes to correct handler
  - autoCorrect(text, field) — debounce, check, apply
  - suggestCorrections(text, field) — debounce, check, overlay
  - noCorrection() — no-op
```

### API integration:
- Reuse existing `checkGrammar()` function from content.js
- Endpoint: `https://prosepilot.io/v1/check`
- Mode: `review` for all three modes
- Debounce: 500ms after last keystroke

### Storage:
- Key: `prosepilot_grammar_mode`
- Values: `"auto"`, `"suggest"`, `"none"`
- Default: `"suggest"` (most user-friendly)

### Exclusions:
- Never show on `prosepilot.io` domains
- Never show on `chrome://` pages
- Never show on `about:` pages

---

## Edge Cases

1. **Field has no value** → don't show icon
2. **Multiple text fields on page** → icon appears for whichever is focused
3. **User switches between fields** → icon stays, re-checks new field
4. **API call fails** → silently fail, no error shown to user
5. **User undoes auto-correction** → re-check on next typing pause
6. **Page navigates** → content script re-injects, icon reappears on focus

---

## Testing Checklist

- [ ] Icon appears on Gmail compose field
- [ ] Icon appears on Outlook web compose
- [ ] Icon appears on Google Docs
- [ ] Icon appears on Notion
- [ ] Icon appears on any `<textarea>` or `<input>`
- [ ] Auto mode fixes grammar after 500ms pause
- [ ] Suggest mode shows underlines and tooltips
- [ ] No correction mode disables all checking
- [ ] Mode persists after browser restart
- [ ] Icon hidden on prosepilot.io
- [ ] Ctrl+Z works after auto-correction
