# Local (Instant) Spellcheck — Scope

Written after the Outlook investigation (2026-08-13): ProsePilot's underline now renders correctly in Outlook, but only ~2s after the user stops typing — that's the floor for a check that has to round-trip to our API. Microsoft's own Editor is instant because it's a local dictionary lookup with zero network call. This doc scopes a second, local, in-extension spelling tier to close that gap. **Not started — scope only, no code written yet.**

## Goal

Underline obvious misspellings within roughly 50–150ms of typing, entirely client-side, no network call. This tier runs *alongside* the existing remote check (LanguageTool + DeepSeek), not instead of it.

## Non-goals (v1)

- No grammar, style, or tone checking in this tier — those need context/AI and stay on the remote tier as-is.
- Not a replacement for the remote check. The remote tier still owns everything it does today; this only fills the "why is nothing happening yet" gap in the first couple seconds.

## Architecture

**Where the dictionary lives:** the background service worker, loaded once — not in `content.js`. `content_scripts` runs `all_frames: true` on `<all_urls>`, so a multi-MB dictionary parsed per-frame (Outlook alone can have several frames) would waste memory and startup time repeatedly. Load it once in the background, keep it resident.

**How content.js uses it:** send the changed word(s) to the background via `chrome.runtime.sendMessage` (same pattern already used for `checkInline`), get back `{word, misspelled, suggestions[]}`. This is an in-process message pass, not a network call — sub-5ms in practice.

**Debounce:** this tier doesn't need the existing 300ms `DEBOUNCE_MS` (that exists to avoid hammering the API). A local-only pass can debounce much shorter, ~100ms, since there's no round-trip cost to amortize.

**Rendering:** reuse the existing `wrapIssuesInSpans` / `renderUnderlines` pipeline as-is — shape a local-tier match into the same issue object (`{id, category: "spelling", original, replacement, confidence, startUtf16}`) the remote tier already produces, so no second rendering path is needed. `renderUnderlines` already calls `clearUnderlines(el)` before drawing, so when the remote result lands a couple seconds later it naturally supersedes the local-tier underline — no explicit reconciliation logic required for the common case (same word flagged by both). Genuinely divergent results (rare — remote tier's real-word-in-wrong-context catches) simply replace the local guess when they arrive, same as today.

## Library / dictionary choice

| Option | Bundle size | Suggestion quality | Notes |
|---|---|---|---|
| **nspell** (recommended) | ~2–4MB (en_US aff/dic) | High — real Hunspell-format affix rules | Pure JS, no WASM, actively maintained, same dictionaries Firefox/LibreOffice use |
| SymSpell + frequency list | ~1–2MB | Good, faster init | Lighter if bundle size becomes a real complaint |
| Hand-rolled Set + edit-distance | <1MB | Weak (no affix/morphology awareness) | Only worth it if size is the overriding constraint |

Start with nspell; fall back to SymSpell only if the install-size increase is a problem in practice.

## Known risk: MV3 service worker eviction

Chrome unloads idle MV3 service workers after ~30s. A resident dictionary gets dropped with it, so the first lookup after an idle period pays a one-time reload cost (dictionary parse, likely a few hundred ms). Acceptable as a known limitation for v1 — not worth building a keep-alive ping just to avoid it.

## Phased effort estimate

1. **Spike** — pick library, get dictionary loading + one lookup working in isolation: 0.5–1 day
2. **Wiring** — message-passing API + `content.js` dual-tier integration (short debounce, reuse render pipeline): 1 day
3. **Polish** — optional visual distinction between "local guess" and "confirmed by remote" underline styling: 0.5 day
4. **Cross-editor testing** — Outlook (Loop editor), Gmail, plain textarea/input, WebForms-style apps (YottaReal): 0.5–1 day

**Total: ~2.5–3.5 focused days.**

## Decisions (resolved 2026-08-13)

1. **Extension size (~2–4MB added):** approved.
2. **Spelling-only in v1, grammar stays on the AI engine:** approved — no change to how grammar/tone is checked.
3. **nspell as the library:** no objection, going with the recommendation.
4. **Does this reduce AI/DeepSeek usage?** No — decided against it. The remote AI check still runs on every check in parallel with the local tier, unchanged from today. The local tier only fixes *latency* for misspellings; it does not skip or gate the AI call, so grammar coverage never gets worse (the alternative — skipping the AI call when text "looks clean" — was rejected because it risks missing grammar-only mistakes with no misspelled words, e.g. "their going to the store").

Scope is final — ready to build when Subra says go.
