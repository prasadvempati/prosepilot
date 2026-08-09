# ProsePilot — Project Context (handoff doc)

Written to brief a fresh Claude Code session on the state of this project. Read this before touching code. Last updated 2026-08-08.

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

## New: signed-in users now land on the home/marketing page first (2026-08-07)

Previously `App.tsx` had no client-side router — it rendered strictly `{isSignedIn && <ToolView/>}` / `{!isSignedIn && <MarketingLandingPage/>}`, so a signed-in visitor was always dropped straight into the editor with no way to see the marketing/home page again. The user explicitly asked for prosepilot.io to always show the home page first and require clicking "Start Writing" to enter the editor, for both signed-in and signed-out visitors.

**Files touched:**
- `apps/web/src/components/LandingPage.tsx` (new) — the entire marketing page (hero, social proof, how-it-works, features, browser extensions, privacy, pricing, footer) extracted verbatim out of `App.tsx` into its own component, parameterized by `isSignedIn` and `onStartWriting`. Signed-out visitors still get the original `SignUpButton`/`SignInButton` hero CTA; signed-in visitors get a single "Start Writing" button that calls `onStartWriting`.
- `apps/web/src/App.tsx` — added `const [view, setView] = useState<"home" | "tool">("home")`. The editor/tool `<main>` now renders only when `isSignedIn && view === "tool"`; `<LandingPage>` renders whenever `!isSignedIn || view === "home"`. The header logo's `onLogoClick` now does `setView("home")` instead of the old `setTab("check") + reset()` — deliberately does **not** wipe the draft in progress, so navigating home and back preserves whatever the user was writing (matches normal SaaS behavior — most products don't discard your work when you click the logo). Removed now-unused imports (`SignInButton`, `SignUpButton`, `Pricing`, `HeroDemo`, `HowItWorks`, `SocialProof` all moved into `LandingPage.tsx`) and the now-unused `reset` destructure (the store still exports `reset`, just nothing in `App.tsx` calls it anymore).
- `apps/web/src/components/Header.tsx` — added a `showMarketingNav` prop (defaults to `true`). The Features/Pricing anchor links used to be gated on `!isSignedIn` under the old assumption that they only ever existed in the DOM when signed out; now that a signed-in user can also be on the home view, that's no longer true, so `App.tsx` computes `showMarketingNav = !isSignedIn || view === "home"` and passes it through.
- `apps/web/src/components/Pricing.tsx` — added optional `isSignedIn`/`onStartWriting` props. The Free tier's CTA used to be a plain `<a href="/signup">` (a dead link in this router-less SPA); when a signed-in visitor sees pricing on the home view, that tier now renders a "Go to editor" button calling `onStartWriting` instead. Every other tier (Coming soon / Contact sales) is unchanged regardless of auth state.

**Not yet done:** sandbox has no `tsc` available (confirmed again this session), so verification was esbuild-based syntax/JSX parsing on all four touched files (all passed cleanly) rather than a full type-check — run `pnpm typecheck` locally before pushing, same as every other feature in this log. No live click-through test yet of the new home→Start Writing→editor→logo→home round trip.

## Fixed: extension was checking Outlook's search bar as if it were the email body (2026-08-08)

User reported (with a screenshot) that the purple "N issue(s)" popup was appearing anchored below Outlook's top search bar instead of near the email body — and that a grammar issue ("d" -> "D", capitalize first word) was being flagged there. This traced to `findEditables()` in `apps/extension/content.js`: it scans the page (including shadow DOMs, for Outlook compatibility) with a broad selector list — `[contenteditable]`, `textarea`, `input[type='text']`, `input:not([type])`, `[role='textbox']` — filtered only by `isVisible()` and `isLargeEnough()` (offsetHeight > 40px). Outlook's search bar is large enough and matches one of those selectors, so it was being monitored and checked exactly like a genuine compose box — the popup positioning code (`showIssueListPopup`, using `el.getBoundingClientRect()`) was working correctly; `el` was just the wrong element. Not a positioning bug — a targeting bug.

**Fix:** added `isSearchBox(el)` to `content.js` and wired it into `findEditables()`'s filter (`!isSearchBox(el)` alongside the existing `isVisible`/`isLargeEnough` checks). Checks `type="search"`, ARIA roles (`searchbox`, `search`, `combobox`), `aria-label`/`placeholder`/`name`/`id` containing "search", and a `role="search"` landmark ancestor (walked up to 5 levels — search bars are shallow). Deliberately signal-based rather than an Outlook-specific selector, so it should hold up for Gmail's search bar and other webmail providers too, and survive Outlook's own DOM structure changing.

**Shipped as extension v1.0.9** — `manifest.json` bumped, `apps/web/public/prosepilot-extension.zip` repackaged with the fix (same rebuild command as documented above). Existing already-monitored elements from a page that was open before this update won't retroactively un-monitor the search bar until the page is reloaded — acceptable, this only affects already-installed extension instances until they update and the page next loads.

## New vocabulary batch: 25 more words added, list now samples per-request (2026-08-08)

User uploaded a second vocabulary source, `GRE-800-cafetadris.com_.pdf` (Barron's 800 Essential Words for GRE), asking for more words in the Elevated tone. Scanned all 35 pages, filtered to the same business-safe bar as before (immediately placeable in a report/email/proposal, not archaic/literary/themed), and added 25 new entries to `services/api/src/engine/elevatedVocabulary.ts`: forestall, formidable, untenable, substantiate, supersede, rescind, stipulate, intractable, recalcitrant, extraneous, perfunctory, disparage, inadvertently, pervasive, precarious, ostentatious, circuitous, juxtapose, reticent, substantive, compendium, exigency, tangential, copious, onerous.

**New exclusion rule added to the file's own guidance** (for future additions, mine or otherwise): skip words whose main use is describing a *person's character* unflatteringly (indolent, glib, garrulous, obdurate, etc.) even if they're common GRE-list entries — dropping one of those into a rewritten business email risks landing as an unintended personal insult. Words that describe a claim, decision, or situation critically (egregious, disparage, ostentatious) are still fine, since they don't point at a specific person the same way.

**List now past the 40-entry threshold flagged in the file's own prior comment** (55 total). Implemented the sampling it called for: `sampleVocabularyExamples(count)` in `elevatedVocabulary.ts` (a bounded partial Fisher-Yates pick, not a full shuffle) is now what `rewriteText()` in `grammar.ts` calls — 25 per request — instead of mapping the full array into the prompt every time. Keeps DeepSeek prompt size roughly constant as the vocabulary bank keeps growing; each rewrite now draws from a random slice rather than the complete list, which is fine since these are illustrative few-shot examples, not a fixed feature set the model must exhaustively offer.

**Not yet done:** same as every feature in this log — sandbox has no `tsc`, verified via esbuild syntax parse only (both files clean), run `pnpm typecheck` locally before pushing. No live test yet of the new words actually surfacing in a real Elevated-tone rewrite.

## New check-prompt rules sourced from two external writing guides (2026-08-08)

User linked two pages and asked for their writing rules to be extracted into the app: digital.gov's "Writing for understanding" (the federal plain-language guide) and a proof-reading-service.com article on nouns/pronouns/articles for academic writing. Fetched both, pulled out the rules that are (a) concrete/testable rather than vague style advice and (b) safe to apply to general business writing (not academic-paper-specific), and folded them into `checkGrammar()`'s DeepSeek prompt in `services/api/src/engine/grammar.ts` (`callDeepSeekForIssues()`).

**Added to the DeepSeek prompt's "SPECIFIC PATTERNS TO CHECK" list:**
- Sharpened the existing PASSIVE VOICE line with digital.gov's actual detection heuristic (a "to be" form + past participle, often with "by ___" naming the real actor) and an explicit note not to confuse passive voice with past tense.
- HIDDEN VERBS / NOMINALIZATIONS (digital.gov): "conduct an analysis of" → "analyze"; "responsible for management of" → "manage".
- AMBIGUOUS PRONOUN ANTECEDENT (proof-reading-service.com): flags genuine two-way ambiguity only, e.g. "When the editor contacted the author, they declined" — who declined?
- ARTICLE CHOICE, A vs AN by sound not spelling ("a European study", "an MRI", "an hour") and A/AN vs THE for first-vs-subsequent mention.
- VAGUE NOUN PLACEHOLDERS ("thing", "stuff", "issue" → the specific noun the context implies) and OVERLONG NOUN STRINGS (add a preposition/hyphen when 3+ stacked nouns get hard to parse) — both from the proofreading article's noun-precision section.
- A "DO NOT FLAG" line for singular "they" with unknown/unspecified-gender antecedents ("If a participant withdraws, they will be replaced") — the proofreading article explicitly endorses this as correct modern usage, and it's a classic false-positive risk for grammar checkers that predate that norm; added defensively so ProsePilot doesn't regress into flagging it.

**Added to the deterministic regex rule set** (the safe, always-correct-regardless-of-context tier): `evidences` → `evidence` (uncountable noun), matching the existing `informations`/`advices`/`equipments` pattern — this was the one uncountable-noun example the proofreading article used that wasn't already covered.

**Deliberately NOT added:** digital.gov's present-tense-over-future/conditional guidance. That guidance is written for government policy/instructional documents describing what a document itself does ("this section tells you..." vs "...would satisfy..."), not general business correspondence — flagging ordinary future tense ("I will send the report Friday") as a style problem would be a false positive in the overwhelming majority of ProsePilot's actual use cases (emails, proposals), so it was left out rather than generalized past what the source actually supports. Also left `localGrammarModel.ts` (the small local-model tier) untouched — all of these new rules are inherently contextual/ambiguous (that's exactly why they went into the DeepSeek prompt, which has actual language understanding, rather than a blind regex), and the local model's own documented scope is narrow, unambiguous, always-safe fixes only (see its `HIGH_RISK_SHORT_WORDS` comment).

**Not yet done:** same as always — sandbox has no `tsc`, verified via esbuild syntax parse only, run `pnpm typecheck` locally before pushing. No live test yet of these new patterns actually firing on real DeepSeek output (they're prompt guidance, not deterministic, so DeepSeek's actual adherence is worth spot-checking on a few real sentences).

## Purdue OWL rules added to check prompt (2026-08-08)

User asked for a "webcrawl" to find sources to improve the app's English-language checking. The Firecrawl extension wasn't installed in this session (no `firecrawl_*` tools connected) — noted that limitation, and also flagged that Firecrawl's tools (crawl/map/scrape one specific site) aren't actually built for open-ended "find sources on a topic" discovery anyway; that's a `WebSearch` job. Used `WebSearch` to shortlist real sources (filtering out SEO-listicle/affiliate sites with no actual rule content — firstsiteguide, bubblecow, purewrite, etc.), presented the shortlist, and the user picked **Purdue OWL** (owl.purdue.edu) as the next source to mine — the standard free/authoritative English grammar reference.

Fetched 8 Purdue OWL grammar subpages (adjective-vs-adverb common errors, prepositions, that-vs-which, reflexive pronouns, pronoun case, commonly confused verbs, verb tense consistency, writing numbers) and added 9 new rules to the same "SPECIFIC PATTERNS TO CHECK" list in `callDeepSeekForIssues()`'s prompt in `services/api/src/engine/grammar.ts`:

- Adjective vs. adverb after action verbs ("performed good" → "performed well"), with an explicit carve-out for linking/sense verbs ("feel good" stays correct).
- Preposition collocations ("depend of" → "depend on", "discuss about" → "discuss").
- Restrictive vs. nonrestrictive clauses, i.e. that vs. which (with/without commas).
- Reflexive pronoun overuse ("contact Sarah or myself" → "...or me") — a very common professional-email hypercorrection.
- Pronoun case in compound structures ("Bob and me are attending" → "Bob and I", "sent to Jane and I" → "...Jane and me") — likewise a frequent hypercorrection in business writing.
- Verb tense consistency within one time frame (kept deliberately simple — the source page's full treatment of perfect/progressive tense sequencing is much deeper than is safe to compress into prompt guidance, so only the core "don't shift tense for the same time frame" rule was carried over).
- Commonly confused verb pairs: lie/lay, sit/set, rise/raise.
- Numbers: never start a sentence with a numeral; keep number formatting consistent within a series (all spelled out or all numerals, not mixed).

All of these went into the DeepSeek prompt (contextual judgment calls, same as last round), none into the deterministic regex tier or `localGrammarModel.ts` — same reasoning as before: these all require reading the sentence to apply correctly, which is exactly what the regex/local-model tiers are deliberately scoped to avoid.

**Not yet done:** sandbox has no `tsc`, verified via esbuild syntax parse only, run `pnpm typecheck` locally before pushing. No live test yet of these specific new patterns firing on real text.

**Follow-up, same session:** user asked "is this enough or is there more to add" — answered honestly: this is prompt engineering (instructions given to DeepSeek per-request), not literal model training, and there's a real ceiling where a longer rule list risks diluting reliability on the rules that matter most, not just free upside. While checking for genuine remaining gaps (not just guessing), found a confirmed one: `localGrammarModel.ts`'s `AMBIGUOUS_WORD_FIXES`/`HIGH_RISK_SHORT_WORDS` comments explicitly say its/your/their/whose confusion is "left for DeepSeek (full sentence context...) instead of guessed at here" — but the DeepSeek prompt never actually had explicit guidance for that word class. Closed that gap: added an ITS/IT'S, YOUR/YOU'RE, THEIR/THEY'RE, WHOSE/WHO'S rule to the same prompt list, explicitly noted as "AI-only, not safe to regex-auto-fix" to match the reasoning already established in `localGrammarModel.ts`. User declined the other two candidates offered (comma splices, parallel structure in lists) for now — those remain open items below if picked up later.

## Open items / priority order if picking this up

1. **Fix the local-model contraction-dropping bug** (`dont`→`do`, `Its`→`It`) before any public demo — this is the one that actively damages user text under a button labeled "Safe."
2. Fix local-model issue headlines to use human-readable labels instead of raw `"Local model fix: ... (edit distance N)"` strings.
3. Fix or finish the mobile/narrow-viewport nav — either make the hamburger menu actually contain the nav items (and hide the redundant full tab row), or fix the tab labels' wrapping/truncation at that breakpoint. Also make sure "Get the extension" (or an equivalent) is reachable at narrow widths.
4. If Rewrite is wanted back: actually diagnose the `/v1/rewrite` timeout (Railway logs, network trace) rather than re-guessing at timeout values — that's the real unknown blocking `REWRITE_FEATURE_ENABLED = true`.
5. Consider a user-facing indicator when the document-checker's 100k-char cap truncates a large document ("checked 45 of 60 paragraphs"), rather than silently stopping.
6. Consider raising `MAX_DOCX_CHECK_CHARS` now that the tiered pass-2-only-on-clean-paragraph escalation logic bounds DeepSeek spend — the original conservative 100k figure predates that safeguard.
7. Locate `shouldShowIssue()`'s actual definition (referenced in `grammar.ts`, not defined there) in case voice-profile filtering ever needs debugging.
8. Check-prompt rule candidates the user explicitly declined to add on 2026-08-08 (not urgent, but real, confirmed-missing gaps if the check prompt gets revisited): comma splices/run-on sentences ("I went to the store, I bought milk" needs a period or semicolon, not just a comma), and parallel structure in lists ("requires typing, filing, and to answer phones" — mismatched verb forms, common in bullet-pointed requirements/résumé-style writing).

## Check-prompt token cost addressed (2026-08-09)

Follow-up to the previous entry: after adding 35 total rule bullets to `callDeepSeekForIssues()`'s prompt across two sessions, flagged an honest cost/latency number — the "SPECIFIC PATTERNS TO CHECK" block alone was ~9,900 characters (~2,476 tokens) sent on every single check call. User pushed back on just naming the problem: "why don't you fix this." Two real things were done, not just documented:

1. **Confirmed the prompt structure already benefits from DeepSeek's automatic caching, at zero code cost.** DeepSeek's API caches repeated prompt prefixes on disk automatically (no opt-in, no headers) — cache-hit input tokens price at roughly 1/50th of a cache miss. Re-read `callDeepSeekForIssues(text: string)` and confirmed it takes only `text` as a parameter — nothing from `mode`/`language`/`documentType`/`voiceProfile` is interpolated anywhere before `${text}`, so the entire prompt prefix (system message + full rules block) is byte-for-byte identical on every call across the whole app. That's close to the ideal case for the automatic discount to already be doing most of the real cost reduction, with no code change required. Added a code comment directly above the prompt in `grammar.ts` warning future editors not to add per-request variables above the text block, since that would silently fragment the prefix and kill the cache-hit rate.
2. **Actually cut the raw token count too**, since the cache-hit price isn't zero and shorter prompts also mean less prefill latency. Tightened the prose across all 35 rule bullets — removed redundant `Category "X".` tags (the model already gets the category enum in the schema instructions, and older established bullets never repeated it either), cut one human-only explanatory aside (the its/it's rule's "this is deliberately AI-only, not safe to regex-fix" sentence, which explained the rule to a future maintainer, not to the model — moved into a real code comment instead, where it costs nothing at runtime), and shortened repeated phrasing. Every concrete example was kept — no coverage was cut, per the project's established "vague heuristics measurably hurt reliability" lesson. Measured before/after: 9,904 → 6,792 characters (~2,476 → ~1,698 tokens), about a 31% reduction in the block itself.

**Not yet done:** no live A/B test confirming DeepSeek's cache-hit rate in production (would need Railway log/billing visibility into `cache_hit_tokens` in the API response, which isn't currently logged). Verified via esbuild syntax parse only — run `pnpm typecheck` locally before pushing.

## NMU Writing Center source checked, one rule added (2026-08-09)

User pointed at `https://nmu.edu/writingcenter/parts-speech`. Fetched it — it's a parts-of-speech glossary table (verb/noun/adjective/adverb/article/pronoun/preposition/conjunction/interjection, one example sentence each), not a common-mistake/fix resource like Purdue OWL or digital.gov. Said so directly rather than force-extracting rules that aren't there. One row was a genuine exception: correlative conjunctions (either/or, neither/nor, not only/but also) must be paired correctly. Confirmed with user, then added a 36th rule bullet to the same `SPECIFIC PATTERNS TO CHECK` list in `callDeepSeekForIssues()`'s prompt in `grammar.ts`: flags mismatched pairs ("neither...or"→"neither...nor") and a missing "also" in "not only...but". Verified via esbuild syntax parse only.

## Landing page + pricing repositioned after ProWritingAid competitive review (2026-08-09)

User asked to check prowritingaid.com for design patterns, then clarified the actual ask: not to copy their look, but to identify what they do differently strategically and where ProsePilot can be better — with an explicit "no copyright strike" constraint. Nothing from their site's text, images, or code was copied; the changes below are original copy and a standard, unprotectable UI pattern (progressive disclosure), based on general positioning ideas (audience specificity, outcome-first messaging, leading with the strongest differentiator).

Findings: ProWritingAid targets one narrow audience (novelists) and frames everything around that person's outcome ("finish the book you keep starting"), not a feature list. Their pricing page leads with 3 simple tiers and hides the detailed comparison grid below the fold. They show outcome-based social proof (real published book covers). None of that suits ProsePilot's actual audience (business/professional writers) — copying their fiction-writer mechanics (streak gamification, "craft journey" framing) would be wrong for this audience. But three structural lessons transfer directly:

1. Hero subhead was generic ("Fix grammar, improve clarity, and match your tone — all in one place. The writing assistant that works where you do.") — rewrote to name the actual differentiators: real-time correction inside Outlook/Gmail/Docs, and the privacy promise, both pulled into the first thing a visitor reads. New copy: "Catch errors before you hit send — right inside Outlook, Gmail, and Google Docs. Nothing you write is ever stored or used to train AI."
2. The Privacy section ("Your writing stays yours") was buried between Browser Extensions and Pricing, near the bottom of the page. For ProsePilot's likely audience (business writers handling client/resident data, e.g. multifamily property management), "never stored, never trained on" is closer to a compliance concern than a generic trust footnote — reordered `LandingPage.tsx` so it's the second section, right after the hero, ahead of Social Proof/How It Works/Features.
3. `Pricing.tsx`'s "Compare every detail" grid (6-column table, 3 usage-limit rows + 7 feature sections, all 5 tiers) rendered unconditionally above the fold — a dense spec sheet before a visitor even decides if they're interested. Added a `useState` toggle ("Compare every detail" / "Hide full comparison" with a chevron) so the grid is collapsed by default; the 5 tier cards (which already have outcome-oriented taglines like "For professionals who write daily") are what a first-time visitor sees, with the granular table one click away for anyone who wants it.

Verified both files with esbuild (`--bundle --loader:.tsx=tsx`, external deps stubbed) — no syntax/JSX errors.

## Removed fabricated testimonials, fake stats, and false SOC 2 badge (2026-08-09)

User asked about the "What our users say" section from a screenshot — investigated `SocialProof.tsx` and confirmed all of it was fabricated placeholder content: 3 hardcoded fake testimonials (Sarah Chen, Marcus Rodriguez, Emily Watson — no such people exist anywhere in the codebase/DB), a stats bar (50,000+ issues fixed, 2,000+ documents checked, 4.8 rating) that was static strings not backed by any real data source, and a "SOC 2 Compliant" trust badge with zero evidence a SOC 2 audit has ever been completed. Flagged the SOC 2 badge as materially more serious than the fake testimonials/stats — it's not marketing embellishment, it's a false certification claim (real SOC 2 requires a completed third-party audit; typical cost researched at ~$25K-$80K+ first year for a startup, several months, for reference if this is revisited later). User confirmed: remove the SOC 2 badge, and remove the fake testimonials/stats entirely (not replace with real data, since none exists yet — an honest landing page with no social proof beats a dishonest one with fake proof).

Rewrote `SocialProof.tsx` to keep only the two trust-badge claims that are actually true today (Zero data retention, No credit card required), with a code comment documenting why the removed content was dishonest and warning not to restore fabricated testimonials/stats later. Also flagged (not yet acted on, since not asked): "Zero data retention" is close but not fully precise given Voice Profile (opt-in) stores statistical style patterns, not raw text — worth revisiting the wording so it can't read as contradicting the Privacy section's own copy.

Verified via esbuild (`--bundle --loader:.tsx=tsx`) and grepped the live JSX output (excluding the explanatory comment) to confirm no fake names/numbers remain.

User pointed at `https://writingcenter.unc.edu/tips-and-tools/editing-and-proofreading/`. This page is a guide to the human proofreading *process* (get distance from the draft, read backwards, isolate sentences, proofread for one error type at a time) — not a catalog of grammar error patterns. Said so directly. The your/you're and there/their examples it uses to illustrate what spell-checkers miss were already covered by the its/it's rule added earlier this session, so no new ground there. One genuinely new, addable item: the page's style section flags gendered job-title nouns (fireman, chairman, mailman, stewardess) as worth catching in professional writing. Confirmed with user, then added a 37th rule bullet — GENDERED JOB TITLES — with a short, non-controversial swap list (fireman→firefighter, chairman→chairperson/chair, mailman→mail carrier, policeman→police officer, stewardess→flight attendant). Verified via esbuild syntax parse only.

## YouTube video had no transcript; substituted a written British Council source (2026-08-09)

User linked `https://www.youtube.com/watch?v=nKBzVyJD4x4` ("Writing workshop: 10 common writing errors and how to fix them", British Council | English, 49 min). Checked the transcript panel, the "..." menu, and the full page's accessibility tree via the Chrome extension — no transcript is offered for this upload. Manually transcribing 49 minutes of audio via screenshots isn't practical or reliable, so said so directly instead of guessing at content. Found and substituted a written British Council resource covering the same territory: `https://www.britishcouncil.org.tw/en/english/exam-preparation/ielts-tips/20-common-mistakes/writing` — a genuine wrong→right list of 10 items. Of those 10, five were already covered by existing rules or too narrow/informal for this checker (a "nowadays" typo, "besides" used as a connector, "extinct" used as a verb, "describe about" — already covered by the existing PREPOSITION COLLOCATIONS example, and one purely stylistic/calque-translation note too subjective to encode). Presented the other five as candidates; user picked three, declined one (compound age modifiers, e.g. "a 60 years old man" → "a 60-year-old man" — real and arguably relevant to property-age references, but left out for now). Added three new rule bullets (38-40) to `callDeepSeekForIssues()`'s prompt in `grammar.ts`:

- CONTRAST VS ADDITIVE TRANSITIONS: "on the other hand"/"however"/"in contrast" must introduce a genuinely opposing idea, not another supporting point.
- ADVERB MISUSED TO MODIFY A NOUN: "a dramatically increase" → "a dramatic increase" (or "increased dramatically").
- ARTICLE WITH COUNTRY/PLACE NAMES: no "the" before most country names ("in the Japan" → "in Japan"), except abbreviated/plural place names ("the U.K.", "the Philippines").

Verified via esbuild syntax parse only.

## Chrome install links point at the live Chrome Web Store listing; Edge shows "Coming soon" (2026-08-09)

Verified extension store status directly via the Chrome Web Store Developer Dashboard and Microsoft Partner Center (logged in as the user, screenshots reviewed in-session — not assumed). Chrome: ProsePilot is **Published — public**, v1.0.6, item ID `gafofglaaopdifodogfifofndmogghfi`, live since 2026-07-28. Edge: still **In review** in Partner Center, submitted 2026-07-29, not yet public.

Previously, every "Get the extension" / "Install for Chrome" / "Install for Edge" link on the site (`Header.tsx` x2, `LandingPage.tsx` x2) pointed at a static `/prosepilot-extension.zip` in `apps/web/public/` — a frozen sideload snapshot that never auto-updates; every manager who installed it would need to manually re-download and reload it in `chrome://extensions` after any extension-side (content.js/popup.html/manifest.json) change. Backend/grammar-prompt changes were never affected by this — the extension calls the live production API, so those propagate instantly regardless of install method.

Changed all four links to `https://chromewebstore.google.com/detail/prosepilot/gafofglaaopdifodogfifofndmogghfi` (Chrome), which gets Chrome's built-in silent auto-update — no manager action needed on future extension-shell updates, once published through the store rather than sideloaded. The "Install for Edge" button in `LandingPage.tsx` was changed from a zip download link to a disabled "Edge — Coming soon" placeholder (not linked to the unpublished listing or the old zip) until Microsoft's review clears; swap it to the real Edge Add-ons URL at that point. The helper text below the buttons was also updated to reflect that Chrome now auto-updates rather than instructing users to manually load an unpacked zip.

## v1.0.9 package submitted to Chrome Web Store for review (2026-08-09)

The published Chrome listing was 3 versions behind the repo (live: v1.0.6; repo: v1.0.9 — missing the cursor-jump fix, the Accept-All data-loss fix, the persistent Ignore-word button, the Elevated rewrite tone, and an Outlook search-bar fix). Confirmed the existing `apps/web/public/prosepilot-extension.zip` was already byte-identical to the current `apps/extension/` source (diffed manifest.json/content.js/background.js/popup.js/popup.html — no differences), so it was copied out as the upload artifact rather than rebuilt.

User uploaded it via the Developer Dashboard's Package tab. First submit attempt failed with "A justification for host permission use is required" (new `host_permissions` entries for `api.languagetool.org` and `prosepilot.io` vs. the published version's permission set, which Google requires a written explanation for). Added a justification on the Privacy practices tab explaining the LanguageTool fast-pass check and the ProsePilot backend/auth-handoff calls. Resubmitted — Google's dashboard confirmed: "Your item has been submitted and is currently going through a compliance review," expected up to a few business days. Do not unpublish the item while this is pending — Google's own dialog warns unpublishing does not cancel the review and blocks resubmission until it completes.

Also encountered (and backed out of) the separate "Verified CRX uploads" opt-in dialog on the Package tab — unrelated to normal review submission, requires generating a self-managed signing keypair and pasting the public key in PEM format; losing that key would permanently block future updates without contacting Chrome Web Store support. Not needed for this or any normal update; left un-opted-in.

Next: once Google's review completes (approve or reject), update this doc with the outcome. If approved, v1.0.9 becomes the live version for everyone who installed via the Chrome Web Store link (see previous section) with no action needed from them.

## Fixed: underlines never appeared in Outlook's new "cloud.microsoft" compose editor (2026-08-10, v1.0.10)

User reported ProsePilot wasn't underlining a misspelling ("Grammer") while testing in the new Outlook Web UI at `cloud.microsoft/mail/...` (Microsoft's newer Loop-based compose surface, distinct from the classic `outlook.office.com` OWA editor this extension had been tested against before). Diagnosed via the extension's own console logs (user pasted them directly, not guessed): the check pipeline worked correctly end-to-end — `checkText()` correctly identified "grammer" as a spelling issue every time — but `wrapIssuesInSpans()` then logged `Could not find text node containing: "grammer"` and silently gave up, so no underline was ever rendered. Root cause: `wrapIssuesInSpans()`'s node-search only ever checked whether a flagged phrase existed inside a *single* DOM text node (`node.textContent.indexOf(issue.original)`); it had no fallback for a match that spans two or more adjacent text nodes. Outlook's Loop-based editor fragments its contenteditable into many small text nodes (13 nodes for a 2-line, 45-character email in the reported case) — enough fragmentation that even a single 7-letter word can land split across a node boundary.

Fix in `content.js`: added a fallback path that only runs when the existing single-node fast path fails to find a match (so Gmail/LinkedIn/Slack/plain-textarea behavior, which was already working, is unchanged). `mergeNodesForMatch()` searches the *joined* text across all of an element's text nodes for the issue's matched phrase, locates which run of consecutive text nodes together contain it, verifies they share the same parent and that none of them is the node the live caret is anchored to (same caret-jump-prevention rule the rest of this file already follows), then merges just that run into a single plain text node — visually a no-op, since adjacent text nodes under the same parent render identically merged or not. The existing single-node wrap logic then runs unchanged against the merged node. Extracted `createUnderlineSpan()` and `wrapNodeAtIndex()` as shared helpers so the fast path and the new fallback don't duplicate the span-creation/styling code.

Verified via `node --check` (syntax only — this is plain JS with no build step, so there's no typecheck/bundler step to run the way there is for the .ts/.tsx files). Bumped `manifest.json` to **v1.0.10**. This landed *after* v1.0.9 was already submitted to the Chrome Web Store and is mid-review (see previous section) — v1.0.9 in review does not include this fix. Once that review resolves, v1.0.10 (or later) needs its own separate package upload/submission to actually ship this fix to Chrome Web Store users. For now it only exists in the repo and in the user's local "Load unpacked" dev copy (extension ID `mnpmjdacolkglhmmbelekiohpbagcgbn`, distinct from the Web Store's `gafofglaaopdifodogfifofndmogghfi`) — reload it from `edge://extensions` (or `chrome://extensions`) to pick up the fix there.

## v1.0.10's fix didn't actually work; two real root causes found and fixed properly (2026-08-10, v1.0.11)

After reloading v1.0.10, the user retested in Outlook and the console logs (pasted directly by the user, not guessed at) showed `wrapIssuesInSpans` was **still** failing with `Could not find text node containing: "Grammer"` — the merge-adjacent-nodes fix from the previous entry didn't hold. Root cause of the miss: `mergeNodesForMatch()` only merged text nodes that shared the exact same immediate parent element, and correctly *refused* to merge across different parents (to avoid corrupting formatting) — but Outlook's Loop-based editor apparently wraps individual word-fragments in their own separate `<span>` elements, so "Gram" and "mer" can each have a *different* parent. The fix bailed out safely instead of wrapping, reproducing the original silent-failure symptom.

Fixed properly this time using the native DOM Range API instead of manual node merging: `wrapCrossNodeMatch()` (replaces `mergeNodesForMatch()`) locates the exact (node, offset) start/end boundary points of the match across the joined text of every text node in the element, builds a `Range` spanning those boundaries, and uses `range.deleteContents()` + `range.insertNode(span)` to replace exactly that range with the underline span — `Range` correctly handles crossing arbitrary element boundaries where manual node splicing can't. Same caret-safety check as before (skip if the live caret is anchored to any node in the affected range).

Separately, and unrelated to the above: the user also spotted ProsePilot popping up a "1 issue" floating badge anchored near Outlook's search bar, checking a stray character, and later grammar-checking the literal text "manage add-ins" (Outlook's own Settings menu label) as if it were user-typed content. Root cause: `findEditables()`'s element-matching used the CSS selector `"[contenteditable]"`, which matches *any* value of that attribute — including `contenteditable="false"` (which explicitly means "not editable," used deliberately by Outlook's newer Loop-based UI to mark read-only chrome/menu text sitting inside an otherwise-editable ancestor region) and `contenteditable="inherit"` (needs to resolve up the ancestor chain to know if it's really editable — a plain attribute-value selector can't do that resolution). Fixed by checking the element's native `isContentEditable` boolean property (which correctly resolves both cases) before accepting any `[contenteditable]`-matched candidate, rather than trusting the raw attribute value. This is a general fix, not Outlook-specific — should also help on any other site that uses `contenteditable="false"` islands inside editable regions, which is a fairly common accessibility/editor pattern (Outlook's isn't the only editor that does this).

Verified via `node --check` (syntax only, same as before — no build step for this plain-JS extension). Bumped `manifest.json` to **v1.0.11**. Same distribution caveat as v1.0.10: this only exists in the repo and the user's local "Load unpacked" dev copy until it's packaged and separately submitted to the Chrome Web Store (v1.0.9 is still mid-review there, unrelated to this fix) — reload from `edge://extensions` to pick up locally.

Verified via esbuild syntax parse of both files only (external component imports mocked out). Note: the `prosepilot-extension.zip` static file itself was left in place in `apps/web/public/` (nothing currently links to it after this change) rather than deleted, in case it's still useful as a manual fallback — worth deleting later if unused.

## Grammar rule added: MISSING LINKING VERB (2026-08-10)

While testing the Outlook fixes above, the user typed "My book on the table." and asked why ProsePilot didn't catch the missing "is". Checked the console logs the user pasted — the check pipeline itself was working (issues were being found and rendered for other things in the same session), so this wasn't an extension bug. Checked `grammar.ts`'s prompt directly: the existing MISSING AUXILIARY VERB rule only covers passive-voice constructions missing was/were/is/are before a past participle ("work orders completed"→"were completed") — a sentence with no verb at all (a bare subject + prepositional phrase, no participle present) doesn't match that pattern's shape, so the model had no explicit instruction to catch it.

Added a new rule bullet distinct from the existing one:

- MISSING LINKING VERB: a subject with no verb at all connecting it to a location, description, or state — "My book on the table"→"My book is on the table"; "The report ready"→"The report is ready".

Verified via esbuild (`grammar.ts`, format=esm, syntax parse only — same as always, this isn't a substitute for `pnpm typecheck`). Per standing instruction, pushed directly since this is a core grammar-engine correction (no need to ask each time for this category — other categories still get reported before pushing).
