# ProsePilot — Project Context (handoff doc)

Written to brief a fresh Claude Code session on the state of this project. Read this before touching code. Last updated 2026-08-07.

## What ProsePilot is

A commercial, general-purpose writing assistant — grammar/spelling/style checking plus AI rewriting — meant to compete broadly with Grammarly. **Not** limited to any single use case (an earlier iteration was multifamily-property-management-flavored; that framing has been explicitly dropped). The product is **pre-launch**: not publicly released yet. The owner (Subra) has been explicit that this is a future commercial site and changes should be careful, additive, and verified rather than risky — but some iteration speed is acceptable since it isn't live yet.

## Repo layout

```
apps/
  web/          React SPA (marketing site + signed-in tool), built with Vite
  extension/    Chrome/Edge extension (Manifest V3), plain JS, no build step
services/
  api/          Fastify backend — grammar engine, rewrite engine, auth, billing
packages/
  writing-core/ Shared TypeScript types (GrammarIssue, RewriteResult, RewriteTone, etc.)
```

## Deployment

Single Railway service covers **both** `services/api` (Fastify) and the built `apps/web/dist` (served statically via `fastifyStatic` from within the same Fastify app in `services/api/src/index.ts`). One `git push` to `master` triggers `pnpm turbo build`, which builds and deploys both together.

The **extension is not auto-published to the Chrome Web Store** — it's distributed as a static zip (`apps/web/public/prosepilot-extension.zip`) that users manually download and "Load unpacked" in `chrome://extensions`. Since the zip lives inside `apps/web/public/`, it DOES redeploy automatically on every push to `master` — no separate step, as long as the zip file itself is current in the repo. **As of 2026-08-07 the zip is current**: repackaged, `manifest.json` bumped to v1.0.7, commit `881f36f`, contains every fix through this date. If `apps/extension/*.js` changes again later, the zip must be manually rebuilt and re-committed — it does not auto-regenerate from source on build. Rebuild command:
```
cd apps/extension
zip -r prosepilot-extension.zip manifest.json background.js content.js popup.html popup.js icons
cp prosepilot-extension.zip ../web/public/prosepilot-extension.zip
```
(bump `manifest.json`'s `version` field first, commit both files together)

## Grammar-check architecture (backend)

`services/api/src/engine/grammar.ts` — `checkGrammar()` runs a tiered pipeline, merged via `mergeAllIssues()`:
- **Tier 0** — deterministic rule engine (regex-based)
- **Tier 1.5** — local T5-small model via Transformers.js (`localGrammarModel.ts`)
- **Tier 1** — LanguageTool
- **Tier 2** — DeepSeek AI (`callDeepSeekForIssues()`)

Three request modes control which tiers run:
- **`rulesOnly: true`** — rule engine only, nothing else. Legacy option, largely superseded by `localOnly` for document checking but still supported.
- **`localOnly: true`** (added 2026-08-07) — rule engine + local T5 model, no network calls at all (no LanguageTool, no DeepSeek). Built specifically for the document-checker's cost-conscious first pass — see docx.ts section below.
- **Default (`mode: "review"`, neither flag set)** — full pipeline. DeepSeek is called **always**, in parallel with LanguageTool, for `mode: "review"` (used by both the website's Check Grammar button and the extension's explicit "Check Selection"). This is deliberate: DeepSeek catches things rule engines/LanguageTool miss (e.g. "I am not doing good" → should be "well"). For live-typing checks (extension, as-you-type), a `lightweight: true` flag skips DeepSeek entirely for speed.

**DeepSeek result caching** (added 2026-08-07): an in-memory `Map` (`deepSeekCache`), keyed by `computeHash(text)`, 5-minute TTL, capped at 500 entries with insertion-order eviction, checked at the top of `callDeepSeekForIssues()` before building the prompt. Not persisted to disk — stays consistent with the "never stores your writing" privacy promise, but also means it's empty again on every server restart/redeploy. Exists to avoid double-billing DeepSeek when the same text gets checked twice in quick succession.

A `shouldShowIssue(voiceProfile, issue)` function is referenced in `checkGrammar()` (filters issues if a voice profile is set) but its definition was **never located** within `grammar.ts` — it's defined elsewhere. Not currently causing known problems, but worth locating if voice-profile-related filtering ever misbehaves.

## Document (.docx) checking (`services/api/src/engine/docx.ts`)

Rewritten 2026-08-07. Previously had two significant, silent limitations — never reported by the user directly, discovered while investigating an unrelated DeepSeek-cost question:

1. **Hardcapped at the first 10 qualifying paragraphs** regardless of document length — a 50-page document would only ever get its first ~10 paragraphs checked, with no indication to the user that the rest was skipped.
2. Was already using `rulesOnly: true` — meaning it **never called DeepSeek at all** for document uploads. (So document checks weren't a cost driver — they were under-checked, not over-billed.)

Current behavior:
- Paragraph selection uses a **cumulative character budget** (`MAX_DOCX_CHECK_CHARS = 100_000`) instead of a fixed paragraph count — most real documents get checked in full; only extreme outliers hit the cap and stop early (still silent — no user-facing "truncated" indicator yet).
- The 100k-char cap is **per uploaded file**, not global — a user can work around a very large document by manually splitting it into smaller files and uploading each separately, since each upload gets its own fresh budget. (A page is roughly 3,000 characters; a 100-page doc split into 10×10-page files would get fully checked, but uploaded as one file only the first ~33 pages would be checked before the cap.)
- Paragraphs are checked **concurrently** (`mapWithConcurrency`, concurrency = 5) using a **two-pass tiered strategy** per paragraph:
  - **Pass 1** (always, free): `checkGrammar({ ..., localOnly: true })` — rule engine + local model, no network call.
  - **Pass 2** (only if Pass 1 found zero issues): escalate to the full pipeline (`mode: "review"`, no `localOnly`/`rulesOnly`), triggering LanguageTool + DeepSeek in parallel.
  - Rationale: a paragraph the free tiers already found issues in doesn't need the expensive "second opinion" as urgently as one that came back clean — that's where DeepSeek earns its cost, while keeping spend roughly proportional to how much of the document actually needs deeper checking.
  - Each pass has an 8-second timeout (`Promise.race`); a timed-out or errored paragraph is skipped silently (same fallback as before the rewrite).

## Extension architecture (`apps/extension/`)

Three independent UI surfaces, each with separate code paths — a recurring source of "I fixed X but it's not showing up" confusion, because a fix in one surface doesn't touch the others:

1. **`content.js`** — injected into every page. Floating "Pp" icon (bottom-right, appears on field focus) with its own popover. Underlines flagged text inline in `contenteditable` fields (`wrapIssuesInSpans`) or shows a floating numbered badge for `textarea`/`input` fields (`showFloatingIndicator` → `showIssueListPopup`).
2. **`popup.html` / `popup.js`** — the browser toolbar icon's popup. Selection-based: user highlights text, clicks "Check Selection," gets a list of issues with Accept/Reject and an "Accept All Fixes" button. Uses `chrome.scripting.executeScript` via `background.js`, independent of `content.js`'s continuous monitoring.
3. **`background.js`** — service worker mediating between both UI surfaces and the API (`/v1/check`, `/v1/rewrite`).

**Only two grammar modes exist: "Suggest" (highlight + click to accept) and "Off".** Auto-correct mode was **fully removed** (not just disabled) after it repeatedly caused caret-jump, offset-drift, and duplicate-overlapping-edit bugs. Any stored `"auto"` preference in `chrome.storage.local` is migrated to `"suggest"` on load. `applyAutoCorrectToContentEditable()` still exists in `content.js` as dead code (no call sites) — deliberately left in place rather than risk a deletion mistake for zero benefit.

**Rewrite with AI is fully built but disabled.** `REWRITE_FEATURE_ENABLED = false` in both `content.js` and `popup.js` (a one-line kill switch — flip both back to `true` once actually fixed). The backend `/v1/rewrite` route works standalone. The extension UI for it (tone picker, preview, apply) is fully implemented but was hidden because it was reliably timing out in production ("Rewrite timed out. Please try again."). One real bug was found and fixed along the way (client-side `AbortSignal.timeout` was shorter than the server's own internal DeepSeek timeout, causing a false-positive client abort) but this did NOT resolve the actual timeout, and the root cause was never found. **This is the single biggest open item** if Rewrite is wanted back — needs actual diagnosis (Railway logs, network trace), not more timeout-value guessing.

**Persistent "Ignore this word everywhere" feature** — added to both the extension and the website, prompted by a real false-positive (a proper noun, "Elijio," being flagged as a spelling error repeatedly). Distinct from "Skip/Dismiss" (which only dismisses that one instance): Ignore persists (`chrome.storage.local` on the extension, `localStorage` on the website, both keyed `prosepilot_ignored_words`, case-insensitive normalized matching), removes all current occurrences of that word immediately, and filters it out of every future check. Extension: button on both `showSuggestionPopup` (contenteditable) and `showIssueListPopup` (textarea/input) popups. Website: third icon button (eye-slash) in `SuggestionPanel.tsx`, wired through `useGrammarStore.ts`'s `ignoreIssue()` action.

**Distribution zip**: `apps/web/public/prosepilot-extension.zip` — see Deployment section above for current status and rebuild command.

## Website architecture (`apps/web/`)

`App.tsx` is a single component with no client-side router. It renders **either** the signed-in tool view **or** the signed-out marketing landing page at the same `/` route, branching on `isSignedIn` from Clerk. There is no route that shows both — anything that only exists in one branch's DOM (e.g. `#features`/`#pricing` anchors) can never resolve for a user in the other state.

- Header's Features/Pricing nav links are conditionally hidden (`!isSignedIn`) for this reason — they can never resolve for a signed-in user, full stop.
- A persistent "Get the extension" link was added to the always-visible header area (pointing at `/prosepilot-extension.zip`, `download` attribute) so signed-in users can still reach the download, since the original Install buttons live only in the signed-out marketing section.

State management: Zustand (`useGrammarStore.ts`). The editor is a plain controlled `<textarea>` (`Editor.tsx`) — no live DOM manipulation while typing, which matters because it means several extension-specific bug classes (caret jumping, execCommand selection bugs) structurally cannot occur on the website; they only affect `content.js`'s live-DOM-manipulation approach in `contenteditable` fields on third-party pages.

## Bugs found and fixed (chronological, all pushed to `master` unless noted)

1. **Local model offset drift** (`localGrammarModel.ts`) — `diffWords()` ignores whitespace, causing systematic offset miscalculation whenever the T5 model's output whitespace differed from input (e.g. Outlook's leading `\n`). Fixed: switched to `diffWordsWithSpace()`.
2. **Missing Accept/Skip buttons** in the extension's `showIssueListPopup` (textarea/input multi-issue popup). Fixed: added working buttons.
3. **DeepSeek JSON-parse fragility** (`grammar.ts`'s `callDeepSeekForIssues()`) — a bare `JSON.parse(response)` threw on any response wrapped in markdown code fences or with stray prose, and the catch block silently returned `[]`, making a real DeepSeek finding indistinguishable from "found nothing." Root cause of website false negatives ("I am not do good." → "All clear!"). Fixed: regex-extracts the first `[...]` array substring before parsing. **User-confirmed fixed.**
4. **CRITICAL — data loss in "Accept All Fixes"** (`background.js`'s `handleApplyFix`, toolbar popup flow). `execCommand` always inserts at the page's **current active selection**, not at a `Range` object built in code. The active selection was still the user's original (much larger) highlighted selection, so accepting one fix replaced the ENTIRE original selection with just the short replacement — destroying the rest of the user's selected text. Fixed: `sel.removeAllRanges(); sel.addRange(fixRange);` before calling execCommand.
5. **1–2 minute slowness accepting fixes one-by-one** — a full re-check (including the DeepSeek round-trip) was triggered after every single accepted issue. For a paragraph with many issues, that's N full round-trips stacked serially. Fixed: `patchIssueOffsets(acceptedIssue, otherIssues)` — locally shifts or drops (if ambiguous/overlapping) the remaining issues' offsets and re-renders instantly, no network call.
6. **Persistent "Ignore this word everywhere" feature** — see above.
7. **Cursor-jump bug corrupting live typing, round 1** (`getGlobalOffset()`) — fell through to `return 0` whenever the caret's DOM anchor wasn't a text node (routine in Outlook's compose box: empty-paragraph boundaries, or a text node just detached by span unwrap/rewrap mid-typing). Callers couldn't distinguish that `0` from "genuinely at position 0," forcing the caret back to the start of the field mid-sentence (reported live: typing "Greetings Kate," came out as "teng anKate,"). Fixed: return `null` instead of `0`; existing `!== null` guards at call sites handled it correctly.
8. **Cursor-jump bug, round 2** — fix #7 was real but insufficient (user: "the cursor jump is still exists"). Deeper root cause: even with `null` correctly detected, `clearUnderlines`/`wrapIssuesInSpans` were still mutating (`removeChild`/`insertBefore`) the exact DOM node the live caret was anchored to, and the browser's own post-mutation caret placement is unreliable. Fixed by never mutating the specific node/span the live caret currently occupies at all — checked via `activeRange.startContainer === node` / `span.contains(activeRange.startContainer)` before any DOM surgery in both functions. **User-confirmed fixed live** (site + extension, "all clear," no false positive/jump).
9. **`missing_period` false positive** — the rule's regex only excluded lines containing `.!?}"` ANYWHERE, not lines that actually END in comma/colon/semicolon. Caused "Hello Abraham," (a valid salutation) to get a period appended right after the comma. Fixed with a negative lookbehind `(?<![,:;])` before the end-of-line anchor. **User-confirmed fixed live.**
10. **Document-checker 10-paragraph cap + DeepSeek caching + `localOnly` tiering** — see "Document checking" section above. Typechecked clean, not yet independently re-verified in production (hard to test without a large real document upload).
11. **Nav links broken on signed-in view** — see Website architecture section above.

## Known past incident: uncommitted stray changes from a prior Claude Code session

On 2026-08-06, a separate Claude Code session (which had read an earlier version of this document) made substantial changes to `content.js` and `grammar.ts` that were **never committed to git** but were still live in the loaded-unpacked extension (Chrome reads directly from disk, not git state). Most concerning: it removed the caret save/restore logic from `wrapIssuesInSpans` entirely — a regression on the cursor-jump fix above — and changed a DeepSeek offset-validation fallback from `indexOf()` recovery to silently dropping issues. These were reverted (`git show HEAD:path > path`, since `git checkout --` failed with an "Operation not permitted" unlink error on the sandbox mount) before the legitimate Ignore-feature work in the same files was re-applied and committed cleanly.

**Lesson for future sessions**: before trusting the live/loaded state of `apps/extension/` or any `.ts` file, run `git status` first — uncommitted local changes made outside of tracked commits can silently diverge from what this document (or `git log`) describes.

## Known recurring friction (not code bugs)

- A stale `.git/index.lock` recurs periodically in the user's local repo (likely from an interrupted git operation — Ctrl+C mid-commit, terminal closed early, etc.). Fix: `del .git\index.lock` (Windows) as long as no git process is actually running, then retry the git command.
- The assistant's sandbox cannot typecheck/build `.ts`/`.tsx` files (symlink resolution failure on the mounted repo) — only `node --check` works, and only on plain `.js` files. All `.ts` changes need `pnpm typecheck` / `pnpm build` run locally by the user before being fully trusted.
- The assistant's sandbox cannot `git commit` (no git identity configured) and cannot reliably `git checkout --`/`rm` certain files (unlink permission errors on this mount) — actual commits/pushes are always done by the user in their own terminal.
- The assistant's sandbox network is allowlisted and blocks arbitrary outbound requests (e.g. `curl POST` to the live API) — page content can be fetched via `web_fetch` (GET only), but API endpoints can't be exercised directly to verify production behavior. Live-behavior verification has to be done by the user directly on the site, or via a connected browser tool (Claude in Chrome extension, when connected).

## Recurring Bug Classes

These patterns have surfaced multiple times across the codebase. Watch for them when debugging or adding features:

### 1. **Caret/Cursor Position After DOM Edits**
Compute a text offset, mutate the DOM, assume the offset is still valid. It won't be.
- `diffWords()` ignores whitespace, causing systematic offset drift in local corrections (Outlook fix)
- Auto-correct mode's caret jumps (removed entirely due to brittleness)
- `getGlobalOffset()` returning `0` in edge cases but looking valid, forcing caret restore to position 0 mid-sentence
- Even after detecting the ambiguous case correctly, DOM mutation of the exact node the caret is anchored to is itself unreliable — the real fix was avoiding the mutation, not just detecting when offset math would be wrong

**Guard:** Recompute positions AFTER mutations. Never mutate/remove the DOM node the live caret is currently anchored to — check first, defer that node's update if so.

### 2. **Manually-Built Range ≠ Browser's Active Selection**
Code builds a precise `Range` around the target, but `execCommand` only acts on the browser's **actual current selection**.
- Accept-All data-loss bug: replaced entire user selection instead of just the matched fix, because execCommand uses the page's selection, not the Range the code constructed

**Guard:** Always `sel.removeAllRanges(); sel.addRange(fixRange)` before running execCommand.

### 3. **Over-Fetching When Local State Suffices**
Triggering full network round-trips (DeepSeek) after every single fix acceptance instead of locally updating offset arrays.
- Caused 1–2 minute slowness on paragraphs with many issues

**Guard:** Compute local offset patches (`patchIssueOffsets()`) before fetching. Only re-check when necessary.

### 4. **Silent Failures → Empty Results**
Errors caught and silently returned as empty arrays, indistinguishable from "no issues found."
- DeepSeek JSON-parse failures: catch block returned `[]`; website showed "All clear!" for genuinely flawed text
- Document-checker's original 10-paragraph cap: silently stopped, no signal to the user that anything was skipped (still true today with the 100k-char cap — flagged as an open item below)

**Guard:** Separate error states from empty/truncated results. Surface truncation/skip conditions to the user rather than silently dropping them.

### 5. **Three Independent UI Surfaces Without Shared State**
`content.js`, `popup.js`, `background.js` are separate code paths. A fix in one doesn't touch the others.
- Rewrite feature initially only wired in one surface; "not working" reports meant "right fix, wrong UI"

**Guard:** Centralize grammar issues and corrections in `background.js` or a shared store where possible.

### 6. **No Client-Side Routing**
`App.tsx` renders signed-in tool **or** marketing page at the same `/` route, never both.
- Features/Pricing nav links only exist in marketing markup; unreachable after sign-in
- Extension download buttons same; signed-in users had no way to find the extension

**Guard:** Implement React Router with explicit route guards, or keep marketing/app-only elements clearly toggled per branch.

### 7. **No Permanent "Ignore This" Mechanism** (resolved, keep as a pattern to watch)
False positives (e.g., proper nouns like "Elijio") used to get dismissed over and over on every check, with no way to make it permanent.

**Guard:** New false-positive patterns discovered later should be evaluated for whether they're a genuine rule bug (fix the rule, like `missing_period`) vs. a legitimately ambiguous case better served by the existing Ignore feature.

## What's verified vs. not

- **User-confirmed working live in production**: DeepSeek JSON-parse fix, data-loss fix, offset-patching speed fix, Ignore feature (both surfaces), cursor-jump fix round 2, `missing_period` fix.
- **Typechecked clean (`pnpm typecheck`), pushed, not yet independently exercised in production**: document-checker tiering/cap removal (`docx.ts`), DeepSeek caching, `localOnly` mode — hard to verify without a real large-document upload test.
- **Resolved**: extension zip staleness (was stale since Aug 1, repackaged 2026-08-07 as v1.0.7, commit `881f36f`, contains all fixes above).

## Live UI spot-check findings (2026-08-07, prosepilot.io, signed-in Check Grammar flow)

Tested with a deliberately error-riddled sentence. Two real bugs surfaced, both in the local-model (Tier 1.5) suggestions specifically — the rule-engine and DeepSeek-sourced issues in the same test were all correct:

1. **Correctness bug, launch-blocking**: local model corrected `"dont"` → `"do"` (should be `"don't"` — this DROPS THE NEGATION and inverts the sentence's meaning) and `"Its"` → `"It"` (should be `"It's"` — leaves the sentence grammatically broken). Both were tagged **"Safe auto-fix"** and included in the "Accept All Safe" bulk-apply count, meaning a user who clicks Accept All Safe would have their text silently corrupted, not improved. Root cause is likely in the local model's diff-to-issue conversion dropping apostrophes/contractions during edit-distance matching in `localGrammarModel.ts` — worth checking whether contraction handling was considered during the earlier hallucination-suppression pass (item #25 in task history), since this looks like the same failure class (a "safe-looking" edit that isn't actually safe) slipping through in a different way.
2. **Copy/polish bug**: local-model-sourced issues render their raw internal label as the user-facing headline — e.g. `"Local model fix: typo fix (edit distance 1)"` — while rule-engine and DeepSeek issues show a clean human-readable headline (`"Past tense of see is saw"`, `"Two words, not one"`). Inconsistent and looks unfinished next to the polished issues around it. Likely just needs the local-model issue path to generate/use a proper `explanation`/category label instead of a debug string.
3. **Responsive/mobile layout bug**: at a narrow viewport (~579px, confirmed via `window.innerWidth`, representative of a phone or a narrow/split-screen browser window), the tab nav ("Check Grammar / Rewrite / Word Doc / My Voice") does not adapt — labels ugly-wrap mid-word ("Word" / "Doc" and "My" / "Voice" each split across two lines) instead of shrinking to icon-only or a compact form. A hamburger menu icon also appears next to the still-fully-visible tab row (redundant — doesn't replace it), and opening that hamburger menu revealed an **empty panel**, no visible menu items. The "Get the extension" link also disappears at this width with no equivalent access point in the (empty) hamburger menu.

## Adversarial pre-launch stress test (2026-08-07, via direct /v1/check API calls from browser JS console)

Owner (Subra) made an explicit call: do not launch, even as a beta, until known issues are fixed — the concern is a competitor (Grammarly, Ginger, etc.) or an early user deliberately trying to break the checker and publicizing a bad result. Ran ~24 deliberately adversarial test sentences across categories (stacked homophones, non-native English patterns, technical jargon, idioms, pronoun case, subject-verb edge cases, numbers/percentages, British spelling, duplicate words, empty/gibberish input) directly against the live `/v1/check` endpoint (bypassing the UI for speed, using `window.Clerk.session.getToken()` for auth from the browser console).

**Found and fixed**: a second, broader instance of the local-model "safe auto-fix" problem from earlier in this session. `localGrammarModel.ts`'s generic edit-distance safety net was letting through `"there"` → `"the"`, `"the"` → `"them"`, `"at"` → `"a"`, and — most seriously — `"20"` → `"22"` (silently proposing to alter a real percentage in a business sentence), all tagged `safeAuto: true`. Root cause: short, high-frequency function words (articles/prepositions/conjunctions/pronouns) and numbers are exactly the class where a different, equally-valid short word or number sits within 1-2 character edits of the original — edit distance alone can't distinguish "typo fix" from "swapped to a different real word/number with a different meaning" for this class, unlike longer content words. Fixed by adding `HIGH_RISK_SHORT_WORDS` (~40 words) plus a numeric-token check that blocks the generic edit-distance path entirely for these, before it's ever reached — the already-vetted lemma-group (`a`/`an`, `is`/`are`) and contraction (`its`/`it's`) paths are untouched. Verified via isolated logic test (all 4 bug cases now blocked, all previously-correct fixes still pass) and confirmed live in production (re-ran the exact failing sentences post-deploy — all 4 now come back clean or correctly re-routed to DeepSeek instead). Pushed as `2e8d475`.

**Everything else in the adversarial pass came back correct** — stacked homophones (their/there/loose), non-native patterns ("I seen him", "don't know nothing", "have went"), tricky subject-verb agreement ("one of the students who ARE"), pronoun case ("to him and me" not "to he and I"), "irregardless", comma splices, duplicate words ("the the", "plan plan"), and a perfect sentence correctly returning zero issues (no false positive). Empty text returns a clean `400 TEXT_REQUIRED` rather than crashing.

**Not a bug, a product/policy point worth knowing**: British spelling (`colour`→`color`, `organisation's`→`organization's`) gets flagged sometimes and not other times, depending on surrounding sentence context — confirmed via the issue `id` prefix (`ds_`) that this is DeepSeek's own judgment call, not a deterministic rule-engine pattern, so some inconsistency is inherent to how an LLM makes optional stylistic calls. It's never auto-applied (`safeAuto: false` always), and neither flagging-it nor not-flagging-it is factually "wrong" since British spelling isn't an error — but if ProsePilot ever wants to support a dialect/locale setting (or explicitly commit to "always suggest American spelling" / "never flag valid British spelling"), that's a deliberate product decision to make, not something to leave to DeepSeek's inconsistent judgment.

**Not yet tested in this pass**: very long documents/paragraphs (only single-sentence and short multi-sentence inputs tried), mixed-language input, markdown/code snippets embedded in prose, URLs/emails (attempted but blocked by the browser tool's own data-exfiltration safety filter, not a product issue — untested), and the Word Doc upload flow end-to-end with a real adversarial `.docx` file. Worth another pass if continuing this stress-testing effort.

## New feature: "Elevated" rewrite tone with hover-definition glossary (2026-08-07)

Added a 13th tone to the Rewrite feature: **Elevated** — upgrades wordy phrases to a single precise word (GRE-style vocabulary condensation), calibrated to "business-polished" rather than maximal obscurity, with a hover-tooltip glossary so a reader is never stuck on an unfamiliar word. This was a from-scratch feature build this session (not a bug fix), added in response to the user's request after they uploaded a Magoosh GRE vocabulary PDF for inspiration.

**Files touched, end to end:**
- `services/api/src/engine/elevatedVocabulary.ts` (new) — a standalone, append-only array of `{phrase, word, definition}` example pairs, seeded from the Magoosh PDF's business-safe sections (general/basic GRE words, Money Matters, Talkative Words, a few C-words). **This is the file to edit when adding more words later** — nothing else needs to change; `rewriteText()` pulls its few-shot prompt examples from this array automatically. File header has full guidance on what belongs (immediately-placeable-in-business-writing bar) and what doesn't (Halloween vocabulary, political-scandal words, single-letter word-list trivia).
- `packages/writing-core/src/types.ts` / `index.ts` — added `"elevated"` to the `RewriteTone` union, added `ElevatedWordGloss { word, definition }` interface, added optional `elevatedWords?: ElevatedWordGloss[]` to `RewriteResult`.
- `services/api/src/engine/grammar.ts` (`rewriteText()`) — added the `elevated` tone description (built dynamically from `elevatedVocabulary.ts`), and — only when `tone === "elevated"` — appends a glossary-request instruction to the prompt asking DeepSeek to return the rewritten text, then a `---GLOSSARY---` delimiter line, then a JSON array of the words it actually substituted plus plain-English definitions. The response is split on the delimiter before any cleanup, the JSON is parsed defensively (malformed glossary JSON just means no hover tooltips that time — never fails the whole rewrite), and `elevatedWords` is only attached to the result if non-empty.
- `services/api/src/routes/check.ts` — added `"elevated"` to the `validTones` allowlist for `POST /v1/rewrite`.
- `apps/web/src/components/Editor.tsx` — added `{ value: "elevated", label: "Elevated" }` to the `TONES` dropdown.
- `apps/web/src/components/RewritePanel.tsx` — added `renderRewrittenText()`, which matches glossary words against the rewritten text (longest-word-first, word-boundary regex, case-preserving) and wraps matches in a dashed-underline span with a Tailwind hover tooltip showing the definition; falls back to plain text rendering when there's no glossary. Added a small "Hover the underlined words..." hint line, shown only when `elevatedWords` is non-empty.
- `apps/extension/popup.html` + `manifest.json` (bumped to 1.0.8) — added the Elevated option to the extension's own rewrite-tone `<select>` for when the extension's Rewrite feature gets re-enabled (it's currently gated off, see Rewrite section elsewhere in this doc). `apps/web/public/prosepilot-extension.zip` repackaged to match.

**Design decisions made with the user (via AskUserQuestion), for context if revisiting:** calibration = "business-polished" (sharp but always instantly clear on first read, never obscure/archaic just to sound impressive) rather than maximal GRE-tier vocabulary; tone label = "Elevated". The hover-glossary was the user's own follow-up idea specifically to de-risk the "reader might not know this word" concern without dumbing down the vocabulary.

**Not yet done:** typecheck (sandbox has no TypeScript installed for this repo — confirmed again this session, run `pnpm typecheck` locally before pushing), and no live/adversarial testing of this specific tone yet (the adversarial pass earlier in this session covered grammar-check correctness, not the Rewrite feature's new tone). Worth a quick manual pass — try a few real sentences through the Elevated tone live and confirm the hover tooltips render correctly and the glossary JSON parses cleanly — before considering this launch-ready alongside the rest of the app.

**Housekeeping found while working in the repo, unrelated to this feature:** `git status` shows ~145 files under `.agents/skills/clerk-*` with large diffs (all insertions/deletions, no `M` content change worth noting individually — looks like a line-ending/whitespace normalization, not anything either of us edited this session) plus several odd untracked files/dirs at the repo root: `'22'`, `'Hello`, `'It'`, `'do'`, `git`, `master`. These look like debris from an earlier multi-line `git commit -m "..."` message getting mangled by `cmd.exe` (a previously-documented recurring friction — see below) and each word landing as a stray file/directory. **Do not `git add -A` or `git add .`** until these are cleaned up — stage only the specific files listed in this section's file list above, or the commit will pull in unrelated noise.

## Open items / priority order if picking this up

1. **Fix the local-model contraction-dropping bug** (`dont`→`do`, `Its`→`It`) before any public demo — this is the one that actively damages user text under a button labeled "Safe."
2. Fix local-model issue headlines to use human-readable labels instead of raw `"Local model fix: ... (edit distance N)"` strings.
3. Fix or finish the mobile/narrow-viewport nav — either make the hamburger menu actually contain the nav items (and hide the redundant full tab row), or fix the tab labels' wrapping/truncation at that breakpoint. Also make sure "Get the extension" (or an equivalent) is reachable at narrow widths.
4. If Rewrite is wanted back: actually diagnose the `/v1/rewrite` timeout (Railway logs, network trace) rather than re-guessing at timeout values — that's the real unknown blocking `REWRITE_FEATURE_ENABLED = true`.
5. Consider a user-facing indicator when the document-checker's 100k-char cap truncates a large document ("checked 45 of 60 paragraphs"), rather than silently stopping.
6. Consider raising `MAX_DOCX_CHECK_CHARS` now that the tiered pass-2-only-on-clean-paragraph escalation logic bounds DeepSeek spend — the original conservative 100k figure predates that safeguard.
7. Locate `shouldShowIssue()`'s actual definition (referenced in `grammar.ts`, not defined there) in case voice-profile filtering ever needs debugging.
