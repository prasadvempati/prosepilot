// ProsePilot Inline Grammar Checker — Content Script
// Runs on every page, finds editable elements, checks grammar as you type
// Now with floating "Pp" icon and 3 grammar modes

// Listen for Clerk token handoff from the web app.
// This runs OUTSIDE the IIFE so it fires even when the content script early-returns
// on prosepilot.io, enabling the token bridge without injecting grammar-check UI.
//
// `var` (not `let`) + a window-level guard flag: unpacked-extension reloads (and some
// SPA navigations) cause Chrome to re-inject this same script into a tab that already
// has a live copy running. A top-level `let` would throw "already declared" on the
// second injection and permanently break the whole script for that page — `var`
// re-declares silently without resetting the current value, and the guard stops the
// message listener from being registered twice.
var clerkToken;
if (!window.__prosepilot_bridge_installed) {
  window.__prosepilot_bridge_installed = true;
  clerkToken = null;
  window.addEventListener("message", (event) => {
    if (event.origin !== "https://prosepilot.io") return;
    if (event.data?.type === "CLERK_TOKEN_HANDOFF" && event.data?.token) {
      clerkToken = event.data.token;
      chrome.storage.local.set({ prosepilot_clerk_token: event.data.token });
      chrome.runtime.sendMessage({ action: "setClerkToken", token: event.data.token });
    }
  });
}

(function () {
  "use strict";

  const API_BASE = "https://prosepilot.io";
  const DEBOUNCE_MS = 300;
  const MIN_TEXT_LENGTH = 10;
  // Local spellcheck tier's debounce — no network round trip to amortize (see
  // handleSpellcheckLocal in background.js), so it can react much faster than the AI tier's
  // DEBOUNCE_MS while still coalescing rapid keystrokes into one message pass.
  const LOCAL_DEBOUNCE_MS = 120;
  const STORAGE_KEY = "prosepilot_grammar_mode";
  const DISABLED_KEY = "prosepilot_disabled";
  const IGNORED_WORDS_KEY = "prosepilot_ignored_words";
  const MAX_CHECK_LENGTH = 100000; // 100K chars max per grammar check

  // Kill switch: Rewrite is currently timing out in production (server-side, not yet root
  // caused) and the user asked to hide it from view until it's actually fixed and verified,
  // rather than leaving a visibly-broken feature live on a commercial product. Flip back to
  // true once the timeout issue is resolved and tested — no other code needs to change.
  const REWRITE_FEATURE_ENABLED = false;

  // Tones the /v1/rewrite backend accepts (mirrors RewriteTone in packages/writing-core/src/types.ts,
  // minus "custom" — custom instructions need a text input, left for a later iteration).
  const REWRITE_TONES = [
    { id: "professional", label: "Professional", desc: "Clear and polished for work" },
    { id: "concise", label: "Concise", desc: "Trim it down to the essentials" },
    { id: "diplomatic", label: "Diplomatic", desc: "Soften a sensitive message" },
    { id: "friendly", label: "Friendly", desc: "Warm and approachable" },
    { id: "firm", label: "Firm", desc: "Direct, no room for pushback" },
    { id: "formal", label: "Formal", desc: "Buttoned-up, no contractions" },
    { id: "confident", label: "Confident", desc: "Assertive, decisive tone" },
    { id: "persuasive", label: "Persuasive", desc: "Make the case more compelling" },
    { id: "empathetic", label: "Empathetic", desc: "Lead with understanding" },
    { id: "casual", label: "Casual", desc: "Relaxed, conversational" },
    { id: "affirmative", label: "Affirmative", desc: "Lean positive and encouraging" },
    { id: "executive", label: "Executive", desc: "Short, high-level summary tone" },
  ];

  // Skip grammar-check UI on ProsePilot's own site
  if (window.location.hostname.includes("prosepilot.io")) return;

  // Prevent double-injection (Edge may inject content scripts twice)
  if (window.__prosepilot_loaded) return;
  window.__prosepilot_loaded = true;

  // Track which elements we're monitoring
  const monitored = new WeakSet();
  // Track current issues per element. `let`, not `const` — WeakMap has no .clear()/iteration
  // support by design (that's the whole point of "weak"), so the "disable" handler below can't
  // empty an existing WeakMap; it drops the reference and assigns a fresh one instead.
  let issueMap = new WeakMap();
  // Local (instant, offline spellcheck-only) tier's issues per element — kept separate from
  // issueMap (the AI/LanguageTool tier) so the two independently-timed checks never clobber
  // each other's results. See docs/local-spellcheck-scope.md and renderMerged() below.
  let localIssueMap = new WeakMap();
  // Track active popup
  let activePopup = null;
  // Track current mode. Auto-correct mode was removed (too many bug classes came from
  // live-editing text without an explicit user action — caret jumps, offset drift, duplicate
  // overlapping edits). Only "suggest" (highlight + click to accept) and "none" exist now.
  let currentMode = "suggest";
  // Words/phrases the user has told us to stop flagging (e.g. a proper noun like "Elijio"
  // that isn't actually a spelling mistake). Persisted across sessions and pages — once
  // ignored, never flagged again anywhere, not just the field it was ignored in.
  let ignoredWords = new Set();
  // Track focused element
  let focusedElement = null;
  // Flag to prevent feedback loop from MutationObserver during underline rendering
  let isRenderingUnderlines = false;
  // Flag to prevent MutationObserver from re-checking during auto-correct
  let isAutoCorrecting = false;
  // Cache last checked text per element to skip redundant API calls
  const lastCheckedText = new WeakMap();
  // Flag to stop checks when extension context is invalidated
  let isExtensionAlive = true;
  // Interval ID for periodic scan — must be stored so it can be cleared
  let periodicScanIntervalId = null;
  // MutationObserver for detecting new editable elements — stored for cleanup
  let bodyObserver = null;

  // ==================== MODE MANAGER ====================

  let isDisabled = false;

  async function loadMode() {
    try {
      const result = await chrome.storage.local.get([STORAGE_KEY, DISABLED_KEY]);
      // Migrate anyone with the old "auto" preference already saved (from before Auto-correct
      // was removed) to "suggest" rather than leaving it as a dead, unhandled value.
      if (result[STORAGE_KEY] === "auto") {
        currentMode = "suggest";
        chrome.storage.local.set({ [STORAGE_KEY]: "suggest" }).catch(() => {});
      } else {
        currentMode = result[STORAGE_KEY] || "suggest";
      }
      isDisabled = !!result[DISABLED_KEY];
    } catch {
      currentMode = "suggest";
      isDisabled = false;
    }
  }

  async function saveMode(mode) {
    currentMode = mode;
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: mode });
    } catch {
      // Storage unavailable
    }
  }

  // ==================== IGNORED WORDS ====================

  function normalizeWord(text) {
    return (text || "").trim().toLowerCase();
  }

  function isIgnored(text) {
    return ignoredWords.has(normalizeWord(text));
  }

  async function loadIgnoredWords() {
    try {
      const result = await chrome.storage.local.get(IGNORED_WORDS_KEY);
      const arr = Array.isArray(result[IGNORED_WORDS_KEY]) ? result[IGNORED_WORDS_KEY] : [];
      ignoredWords = new Set(arr);
    } catch {
      ignoredWords = new Set();
    }
  }

  async function addIgnoredWord(text) {
    const normalized = normalizeWord(text);
    if (!normalized) return;
    ignoredWords.add(normalized);
    try {
      await chrome.storage.local.set({ [IGNORED_WORDS_KEY]: Array.from(ignoredWords) });
    } catch {
      // Storage write failed — the word still stays ignored for the rest of this page's
      // session via the in-memory Set, it just won't persist across a reload.
    }
  }

  // ==================== FLOATING ICON ====================

  let floatingIcon = null;
  let popover = null;
  let rewritePopover = null;
  let pulseCount = 0;
  let pulseTimerId = null;
  // Guards against firing a second rewrite request while one is already in flight
  let rewriteInFlight = false;

  function createFloatingIcon() {
    if (floatingIcon) return;

    floatingIcon = document.createElement("div");
    floatingIcon.id = "prosepilot-floating-icon";
    floatingIcon.innerHTML = `
      <div style="
        position:fixed;bottom:24px;right:24px;z-index:2147483647;
        width:44px;height:44px;border-radius:50%;
        background:linear-gradient(135deg,#6366f1,#8b5cf6);
        color:white;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        font-size:15px;font-weight:700;cursor:pointer;
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 3px 12px rgba(99,102,241,0.4);
        opacity:0;transform:scale(0.8);transition:all 0.3s cubic-bezier(0.34,1.56,0.64,1);
        pointer-events:none;user-select:none;
      " id="prosepilot-icon-btn">
        Pp
      </div>
    `;

    document.body.appendChild(floatingIcon);
    const btn = floatingIcon.querySelector("#prosepilot-icon-btn");

    // Hover effects
    btn.addEventListener("mouseenter", () => {
      btn.style.transform = "scale(1.1)";
      btn.style.opacity = "1";
      btn.style.boxShadow = "0 4px 16px rgba(99,102,241,0.5)";
    });
    btn.addEventListener("mouseleave", () => {
      if (!popover) {
        btn.style.transform = "scale(1)";
        btn.style.opacity = "0.7";
        btn.style.boxShadow = "0 3px 12px rgba(99,102,241,0.4)";
      }
    });

    // Click to open popover
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (popover) {
        closePopover();
      } else {
        openPopover();
      }
    });
  }

  function showIcon() {
    if (!floatingIcon) createFloatingIcon();
    const btn = floatingIcon.querySelector("#prosepilot-icon-btn");
    floatingIcon.style.display = "block";
    requestAnimationFrame(() => {
      btn.style.opacity = "0.7";
      btn.style.transform = "scale(1)";
      btn.style.pointerEvents = "auto";
    });

    // Pulse animation (first 3 times only)
    if (pulseCount < 3) {
      pulseCount++;
      if (pulseTimerId) clearTimeout(pulseTimerId);
      btn.style.animation = "prosepilot-pulse 2s ease-in-out 1";
      pulseTimerId = setTimeout(() => {
        btn.style.animation = "";
        pulseTimerId = null;
      }, 2000);
    }
  }

  function hideIcon() {
    if (!floatingIcon) return;
    const btn = floatingIcon.querySelector("#prosepilot-icon-btn");
    btn.style.opacity = "0";
    btn.style.transform = "scale(0.8)";
    btn.style.pointerEvents = "none";
    closePopover();
  }

  // ==================== POPOVER (MODE SELECTOR) ====================

  function openPopover() {
    closePopover();

    popover = document.createElement("div");
    popover.id = "prosepilot-popover";

    const modes = [
      { id: "suggest", label: "Suggest corrections", color: "#f59e0b", dot: "#f59e0b", desc: "Highlight errors, click to fix" },
      { id: "none", label: "No correction", color: "#ef4444", dot: "#ef4444", desc: "Grammar checking off" },
    ];

    const modesHtml = modes
      .map(
        (m) => `
      <div class="prosepilot-mode-option" data-mode="${m.id}" style="
        display:flex;align-items:center;gap:10px;padding:10px 12px;
        border-radius:8px;cursor:pointer;transition:background 0.15s;
        ${currentMode === m.id ? "background:rgba(99,102,241,0.08);" : ""}
      ">
        <div style="
          width:10px;height:10px;border-radius:50%;flex-shrink:0;
          background:${currentMode === m.id ? m.dot : "transparent"};
          border:2px solid ${m.dot};
        "></div>
        <div>
          <div style="font-size:13px;font-weight:500;color:#1f2937;">${m.label}</div>
          <div style="font-size:11px;color:#6b7280;">${m.desc}</div>
        </div>
      </div>
    `
      )
      .join("");

    popover.innerHTML = `
      <div style="
        position:fixed;bottom:80px;right:24px;z-index:2147483647;
        background:white;border:1px solid #e5e7eb;border-radius:12px;
        padding:8px;box-shadow:0 8px 30px rgba(0,0,0,0.12);
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        width:220px;
        animation:prosepilot-popover-in 0.2s cubic-bezier(0.34,1.56,0.64,1);
      ">
        <div style="padding:8px 12px 6px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">
          Grammar Mode
        </div>
        ${modesHtml}
        ${REWRITE_FEATURE_ENABLED ? `
        <div style="border-top:1px solid #e5e7eb;margin:4px 0;"></div>
        <div class="prosepilot-mode-option" id="prosepilot-rewrite-open" style="
          display:flex;align-items:center;gap:10px;padding:10px 12px;
          border-radius:8px;cursor:pointer;transition:background 0.15s;
        ">
          <div style="
            width:10px;height:10px;flex-shrink:0;
            display:flex;align-items:center;justify-content:center;
            font-size:12px;line-height:1;
          ">&#10024;</div>
          <div>
            <div style="font-size:13px;font-weight:500;color:#1f2937;">Rewrite with AI</div>
            <div style="font-size:11px;color:#6b7280;">Change tone: professional, concise, diplomatic...</div>
          </div>
        </div>
        ` : ""}
        <div style="border-top:1px solid #e5e7eb;margin:4px 0;"></div>
        <div class="prosepilot-mode-option" id="prosepilot-turnoff" style="
          display:flex;align-items:center;gap:10px;padding:10px 12px;
          border-radius:8px;cursor:pointer;transition:background 0.15s;
        ">
          <div style="
            width:10px;height:10px;border-radius:50%;flex-shrink:0;
            background:transparent;border:2px solid #9ca3af;
          "></div>
          <div>
            <div style="font-size:13px;font-weight:500;color:#6b7280;">Turn off ProsePilot</div>
            <div style="font-size:11px;color:#9ca3af;">Stop all grammar checking</div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(popover);

    // Mode click handlers
    popover.querySelectorAll(".prosepilot-mode-option").forEach((opt) => {
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        const mode = opt.dataset.mode;
        saveMode(mode);
        closePopover();
        // Clear lastCheckedText so text is re-checked with new mode
        if (focusedElement) lastCheckedText.delete(focusedElement);
        // Re-check current element with new mode
        if (focusedElement) {
          triggerCheck(focusedElement);
        }
      });

      // Hover effect
      opt.addEventListener("mouseenter", () => {
        if (currentMode !== opt.dataset.mode) {
          opt.style.background = "#f3f4f6";
        }
      });
      opt.addEventListener("mouseleave", () => {
        if (currentMode !== opt.dataset.mode) {
          opt.style.background = "transparent";
        }
      });
    });

    // Open the rewrite tone picker
    const rewriteOpenBtn = popover.querySelector("#prosepilot-rewrite-open");
    if (rewriteOpenBtn) {
      rewriteOpenBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!focusedElement) {
          showToast("Click into a text field first, then try Rewrite.", "info");
          return;
        }
        closePopover();
        openRewritePopover();
      });
      rewriteOpenBtn.addEventListener("mouseenter", () => { rewriteOpenBtn.style.background = "#f3f4f6"; });
      rewriteOpenBtn.addEventListener("mouseleave", () => { rewriteOpenBtn.style.background = "transparent"; });
    }

    // Turn off ProsePilot
    const turnOffBtn = popover.querySelector("#prosepilot-turnoff");
    if (turnOffBtn) {
      turnOffBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        chrome.storage.local.set({ [DISABLED_KEY]: true });
        isDisabled = true;
        closePopover();
        // Clear all underlines on the current element
        if (focusedElement) clearUnderlines(focusedElement);
        showToast("ProsePilot turned off. Re-enable from the extension icon.", "info");
      });
      turnOffBtn.addEventListener("mouseenter", () => { turnOffBtn.style.background = "#f3f4f6"; });
      turnOffBtn.addEventListener("mouseleave", () => { turnOffBtn.style.background = "transparent"; });
    }

  // Close on click outside — use persistent listener removed on close
  document.addEventListener("click", closePopoverOnOutside);
}

  function closePopover() {
    if (popover) {
      popover.remove();
      popover = null;
      document.removeEventListener("click", closePopoverOnOutside);
    }
  }

  function closePopoverOnOutside(e) {
    if (popover && !popover.contains(e.target)) {
      closePopover();
    }
  }

  // ==================== REWRITE (TONE PICKER + PREVIEW) ====================

  function openRewritePopover() {
    closeRewritePopover();

    rewritePopover = document.createElement("div");
    rewritePopover.id = "prosepilot-rewrite-popover";

    const tonesHtml = REWRITE_TONES
      .map(
        (t) => `
      <div class="prosepilot-rewrite-tone" data-tone="${t.id}" style="
        display:flex;align-items:center;gap:10px;padding:9px 12px;
        border-radius:8px;cursor:pointer;transition:background 0.15s;
      ">
        <div>
          <div style="font-size:13px;font-weight:500;color:#1f2937;">${t.label}</div>
          <div style="font-size:11px;color:#6b7280;">${t.desc}</div>
        </div>
      </div>
    `
      )
      .join("");

    rewritePopover.innerHTML = `
      <div style="
        position:fixed;bottom:80px;right:24px;z-index:2147483647;
        background:white;border:1px solid #e5e7eb;border-radius:12px;
        padding:8px;box-shadow:0 8px 30px rgba(0,0,0,0.12);
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        width:240px;max-height:70vh;overflow-y:auto;
        animation:prosepilot-popover-in 0.2s cubic-bezier(0.34,1.56,0.64,1);
      ">
        <div class="prosepilot-rewrite-back" style="
          display:flex;align-items:center;gap:6px;padding:8px 12px;margin-bottom:2px;
          border-radius:8px;cursor:pointer;color:#6366f1;font-size:12px;font-weight:600;
        ">&larr; Back</div>
        <div style="padding:2px 12px 6px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">
          Rewrite tone
        </div>
        ${tonesHtml}
      </div>
    `;

    document.body.appendChild(rewritePopover);

    const backBtn = rewritePopover.querySelector(".prosepilot-rewrite-back");
    backBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeRewritePopover();
      openPopover();
    });
    backBtn.addEventListener("mouseenter", () => { backBtn.style.background = "#f3f4f6"; });
    backBtn.addEventListener("mouseleave", () => { backBtn.style.background = "transparent"; });

    rewritePopover.querySelectorAll(".prosepilot-rewrite-tone").forEach((opt) => {
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        const tone = opt.dataset.tone;
        closeRewritePopover();
        startRewrite(tone);
      });
      opt.addEventListener("mouseenter", () => { opt.style.background = "#f3f4f6"; });
      opt.addEventListener("mouseleave", () => { opt.style.background = "transparent"; });
    });

    document.addEventListener("click", closeRewritePopoverOnOutside);
  }

  function closeRewritePopover() {
    if (rewritePopover) {
      rewritePopover.remove();
      rewritePopover = null;
      document.removeEventListener("click", closeRewritePopoverOnOutside);
    }
  }

  function closeRewritePopoverOnOutside(e) {
    if (rewritePopover && !rewritePopover.contains(e.target)) {
      closeRewritePopover();
    }
  }

  async function startRewrite(tone) {
    if (rewriteInFlight) return;
    const el = focusedElement;
    if (!el) {
      showToast("Click into a text field first, then try Rewrite.", "info");
      return;
    }

    const text = getElementText(el);
    if (!text || text.trim().length < MIN_TEXT_LENGTH) {
      showToast("Write a bit more before rewriting.", "info");
      return;
    }

    rewriteInFlight = true;
    showToast("Rewriting...", "info");

    const response = await rewriteTextRequest(text, tone);

    rewriteInFlight = false;

    if (!response || response.error) {
      showToast(response?.error || "Rewrite failed. Please try again.", "error");
      return;
    }

    showRewritePreview(el, tone, response);
  }

  async function rewriteTextRequest(text, tone) {
    if (!isExtensionAlive) return { error: "Extension not available. Please reload the page." };
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          { action: "rewriteText", text, tone, token: clerkToken },
          (response) => {
            if (chrome.runtime.lastError) {
              const msg = chrome.runtime.lastError.message || "";
              if (msg.includes("Extension context invalidated") || msg.includes("Receiving end does not exist")) {
                isExtensionAlive = false;
                resolve({ error: "Extension was reloaded — please refresh this page." });
                return;
              }
              resolve({ error: "Rewrite failed. Please try again." });
              return;
            }
            resolve(response || { error: "No response from ProsePilot." });
          }
        );
      } catch (e) {
        isExtensionAlive = false;
        resolve({ error: "Extension not available. Please reload the page." });
      }
    });
  }

  function showRewritePreview(el, tone, response) {
    hidePopup();

    const result = response.result;
    if (!result || typeof result.rewritten !== "string") {
      showToast("Rewrite failed. Please try again.", "error");
      return;
    }

    const toneLabel = (REWRITE_TONES.find((t) => t.id === tone) || {}).label || tone;
    const warningHtml = result.factMismatch
      ? `<div style="
          background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;
          border-radius:8px;padding:8px 10px;font-size:11px;margin-bottom:10px;line-height:1.4;
        ">&#9888; This rewrite may have changed a name, date, or number. Review carefully before applying.</div>`
      : "";

    const popup = document.createElement("div");
    popup.className = "prosepilot-popup";
    popup.innerHTML = `
      <div style="
        position:fixed;z-index:2147483647;
        background:white;border:1px solid #e5e7eb;border-radius:10px;
        padding:14px;box-shadow:0 8px 30px rgba(0,0,0,0.15);
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        font-size:13px;width:360px;max-height:70vh;
        bottom:80px;right:24px;
        display:flex;flex-direction:column;
      ">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-shrink:0;">
          <span style="color:#6366f1;font-weight:600;text-transform:uppercase;font-size:10px;letter-spacing:0.5px;">Rewrite &middot; ${escapeHtml(toneLabel)}</span>
          <button class="prosepilot-close" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:18px;padding:0;line-height:1;">&times;</button>
        </div>
        ${warningHtml}
        <div style="
          overflow-y:auto;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;
          padding:10px;margin-bottom:10px;white-space:pre-wrap;line-height:1.5;color:#065f46;
        ">${escapeHtml(result.rewritten)}</div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <button class="prosepilot-rewrite-apply" style="
            flex:1;padding:8px 12px;border:none;border-radius:6px;
            background:#059669;color:white;font-size:12px;font-weight:500;cursor:pointer;
          ">Apply</button>
          <button class="prosepilot-rewrite-discard" style="
            flex:1;padding:8px 12px;border:none;border-radius:6px;
            background:#f3f4f6;color:#374151;font-size:12px;font-weight:500;cursor:pointer;
          ">Discard</button>
        </div>
      </div>
    `;

    document.body.appendChild(popup);
    activePopup = popup;

    popup.querySelector(".prosepilot-close").addEventListener("click", hidePopup);
    popup.querySelector(".prosepilot-rewrite-discard").addEventListener("click", hidePopup);
    popup.querySelector(".prosepilot-rewrite-apply").addEventListener("click", () => {
      setElementText(el, result.rewritten);
      lastCheckedText.set(el, result.rewritten);
      hidePopup();
      showToast("✓ Rewrite applied");
      // Re-check the new text so any remaining grammar issues still get flagged
      setTimeout(() => { triggerCheck(el); triggerLocalCheck(el); }, 300);
    });

    setTimeout(() => {
      document.addEventListener("click", (e) => {
        if (activePopup && !activePopup.contains(e.target)) {
          hidePopup();
        }
      }, { once: true });
    }, 10);
  }

  // ==================== INJECT ANIMATIONS ====================

  function injectStyles() {
    if (document.getElementById("prosepilot-styles")) return;
    const style = document.createElement("style");
    style.id = "prosepilot-styles";
    style.textContent = `
      @keyframes prosepilot-pulse {
        0%, 100% { box-shadow: 0 3px 12px rgba(99,102,241,0.4); }
        50% { box-shadow: 0 3px 20px rgba(99,102,241,0.7), 0 0 0 8px rgba(99,102,241,0.1); }
      }
      @keyframes prosepilot-popover-in {
        from { opacity: 0; transform: translateY(8px) scale(0.95); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes prosepilot-toast-in {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .prosepilot-underline {
        text-decoration-style: wavy;
        text-underline-offset: 3px;
        cursor: pointer;
        background: rgba(99,102,241,0.06);
        border-radius: 2px;
        padding: 0 1px;
        transition: background 0.15s;
      }
      .prosepilot-underline:hover {
        background: rgba(99,102,241,0.15);
      }
    `;
    document.head.appendChild(style);
  }

  // ==================== TOAST NOTIFICATIONS ====================

  let toastTimerId = null;
  let toastFadeTimerId = null;

  function showToast(message, type = "success") {
    if (toastTimerId) clearTimeout(toastTimerId);
    if (toastFadeTimerId) clearTimeout(toastFadeTimerId);

    const existing = document.getElementById("prosepilot-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "prosepilot-toast";
    const bgColor = type === "success" ? "#059669" : type === "info" ? "#6366f1" : "#ef4444";
    const safeMessage = escapeHtml(String(message));
    toast.innerHTML = `
      <div style="
        position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:2147483647;
        background:${bgColor};color:white;
        padding:10px 20px;border-radius:8px;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        font-size:13px;font-weight:500;
        box-shadow:0 4px 12px rgba(0,0,0,0.15);
        animation:prosepilot-toast-in 0.3s ease-out;
      ">
        ${safeMessage}
      </div>
    `;
    document.body.appendChild(toast);
    toastTimerId = setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.3s";
      toastFadeTimerId = setTimeout(() => {
        toast.remove();
        toastFadeTimerId = null;
      }, 300);
      toastTimerId = null;
    }, 2500);
  }

  // ==================== FIND EDITABLE ELEMENTS ====================

  function findEditables() {
    // Just "[contenteditable]" (bare attribute-presence) covers every value including
    // 'true'/''/'plaintext-only' — no need to list those separately.
    const selectors = [
      "[contenteditable]",
      "textarea",
      "input[type='text']",
      "input:not([type])",
      "[role='textbox']",
    ];
    const elements = [];
    const seen = new Set();

    // Recursively search shadow DOMs
    function searchRoot(root) {
      for (const sel of selectors) {
        root.querySelectorAll(sel).forEach((el) => {
          if (seen.has(el)) return;
          seen.add(el);
          // The "[contenteditable]" selector above matches ANY value of the attribute,
          // including contenteditable="false" (explicitly NOT editable — used to mark a
          // read-only UI "island" inside an editable ancestor) and contenteditable="inherit"
          // (needs to actually resolve up the ancestor chain to know if it's really
          // editable). Outlook's newer Loop-based UI ("cloud.microsoft") marks chrome like
          // settings-menu items this way, and without this check ProsePilot was picking up
          // and grammar-checking that UI text as if the user had typed it (e.g. the
          // "Manage add-ins" menu label). The native `isContentEditable` boolean property
          // resolves the inheritance chain correctly and reports false for "false" — the
          // raw attribute-presence selector can't do either.
          if (el.hasAttribute("contenteditable") && !el.isContentEditable) return;
          // readOnly (and its cousin disabled) means the user literally cannot type into
          // this field — found via a real bug report: a searchable-but-not-editable "DBA"
          // dropdown (the user can only pick from a list, not type free text) was getting
          // grammar-checked as if its display value were prose the user had written. Any
          // field the user can't type into by definition never contains user-authored text,
          // so there's nothing for ProsePilot to legitimately check.
          if ((el.tagName === "INPUT" || el.tagName === "TEXTAREA") && (el.readOnly || el.disabled)) return;
          // A file-upload input's value is always security-masked by the browser as
          // "C:\fakepath\<filename>" (that literal string, regardless of the real OS) — found
          // via a real bug report: a custom file-upload widget's "selected filename" display
          // input mirrors that masked value, and ProsePilot was grammar-checking the fake path
          // itself (flagging "fakepath" as a spelling error). This value can never be prose the
          // user typed, so skip any field whose current value matches that pattern.
          if (el.tagName === "INPUT" && /^[A-Za-z]:\\fakepath\\/i.test(el.value || "")) return;
          if (!monitored.has(el) && isVisible(el) && isLargeEnough(el) && !isSearchBox(el)) {
            elements.push(el);
          }
        });
      }
      // Recurse into shadow roots
      root.querySelectorAll("*").forEach((el) => {
        if (el.shadowRoot) searchRoot(el.shadowRoot);
      });
    }

    searchRoot(document);
    return elements;
  }

  // Excludes search boxes (Outlook's mail search bar, Gmail's search bar, etc.) from being
  // treated as a checkable text field. These are large, real `input`/`role="textbox"` elements
  // that pass isVisible()/isLargeEnough() just like a genuine compose box does, so without this
  // check the extension would run grammar checks against whatever the user types into a search
  // bar and pop the issue list up right below it — confusing, since the user has no reason to
  // expect ProsePilot to be checking their search query. Uses several independent signals
  // (type="search", common ARIA roles/labels, a `role="search"` landmark ancestor) rather than
  // hardcoding Outlook-specific selectors, so this holds up across webmail providers and survives
  // their DOM structure changing.
  function isSearchBox(el) {
    const type = (el.getAttribute("type") || "").toLowerCase();
    if (type === "search") return true;

    const role = (el.getAttribute("role") || "").toLowerCase();
    if (role === "searchbox" || role === "search" || role === "combobox") return true;

    const label = `${el.getAttribute("aria-label") || ""} ${el.getAttribute("placeholder") || ""} ${el.getAttribute("name") || ""} ${el.id || ""}`.toLowerCase();
    if (/\bsearch\b/.test(label)) return true;

    // ARIA authoring practice for search landmarks is <form role="search">/<div role="search">
    // wrapping the input — walk up a bounded number of ancestors (search bars are shallow) so we
    // don't accidentally exclude something because a distant, unrelated ancestor happens to have
    // role="search" somewhere far up the tree.
    let ancestor = el.parentElement;
    for (let depth = 0; ancestor && depth < 5; depth++, ancestor = ancestor.parentElement) {
      if ((ancestor.getAttribute("role") || "").toLowerCase() === "search") return true;
    }

    return false;
  }

  function isVisible(el) {
    const style = getComputedStyle(el);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0" &&
      el.offsetWidth > 0
    );
  }

  function isLargeEnough(el) {
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      return el.rows >= 2 || el.offsetHeight > 40;
    }
    return el.offsetHeight > 40;
  }

  function getElementText(el) {
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      return el.value;
    }

    // Strategy 1: Try innerText (most reliable for contentEditable — gives rendered text)
    let raw = "";
    try {
      raw = el.innerText || "";
    } catch (e) { /* fallback below */ }

    // Strategy 2: If innerText empty, try textContent
    if (!raw || raw.trim().length === 0) {
      try {
        raw = el.textContent || "";
      } catch (e) { return ""; }
    }

    // Strategy 3: If still empty, walk into shadow roots
    if (!raw || raw.trim().length === 0) {
      try {
        const textNodes = collectTextNodes(el);
        for (const node of textNodes) raw += node.textContent;
      } catch (e) { return ""; }
    }

    if (!raw || raw.trim().length === 0) return "";

    // Remove Outlook signature: everything after "--" or "—" on its own line
    const dashIdx = raw.search(/^\s*--\s*$/m);
    if (dashIdx !== -1) raw = raw.substring(0, dashIdx);
    const emDashIdx = raw.search(/^\s*—\s*$/m);
    if (emDashIdx !== -1) raw = raw.substring(0, emDashIdx);

    return raw;
  }

  function setElementText(el, newText) {
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      el.value = newText;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.selectionStart = Math.min(start, newText.length);
      el.selectionEnd = Math.min(end, newText.length);
    } else {
      // For contentEditable: save caret position, replace text, restore caret
      const textNodes = [];
      for (const node of collectTextNodes(el)) {
        if (node.textContent.match(/^\s*--/) || node.textContent.match(/^\s*—/)) break;
        if (node.textContent.trim().length > 0) textNodes.push(node);
      }

      if (textNodes.length === 0) return;

      let currentText = textNodes.map((n) => n.textContent).join("");
      if (currentText === newText) return;

      // Save caret offset relative to user text
      let savedOffset = currentText.length; // default: end of text
      try {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          // Calculate offset from start of first text node
          const firstNode = textNodes[0];
          const startRange = document.createRange();
          startRange.setStart(firstNode, 0);
          startRange.setEnd(range.startContainer, range.startOffset);
          savedOffset = startRange.toString().length;
        }
      } catch (e) { /* fallback to end */ }

      // Replace: put all new text in first node, clear the rest
      textNodes[0].textContent = newText;
      for (let i = 1; i < textNodes.length; i++) {
        textNodes[i].textContent = "";
      }
      el.normalize();

      // Restore caret — find the text node and offset in the new text
      try {
        const restored = findNodeAtOffset(el, Math.min(savedOffset, newText.length));
        if (restored.node) {
          const sel = window.getSelection();
          const range = document.createRange();
          range.setStart(restored.node, restored.offset);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } catch (e) { /* caret restore failed silently */ }

      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  // Recursive text node finder — crosses shadow DOM boundaries
  function walkAllTextNodes(el, yieldFn) {
    const stack = [el];
    while (stack.length) {
      const node = stack.pop();
      if (node.shadowRoot) {
        for (let i = node.shadowRoot.childNodes.length - 1; i >= 0; i--) stack.push(node.shadowRoot.childNodes[i]);
      }
      if (node.nodeType === Node.TEXT_NODE) {
        if (yieldFn(node)) return node;
      } else if (node.childNodes) {
        for (let i = node.childNodes.length - 1; i >= 0; i--) stack.push(node.childNodes[i]);
      }
    }
    return null;
  }

  // Collect ALL text nodes under el (crossing shadow DOM)
  function collectTextNodes(el) {
    const nodes = [];
    const walk = (n) => {
      if (n.shadowRoot) { for (const c of n.shadowRoot.childNodes) walk(c); }
      if (n.nodeType === Node.TEXT_NODE) { nodes.push(n); return; }
      if (n.childNodes) { for (const c of n.childNodes) walk(c); }
    };
    walk(el);
    return nodes;
  }

  function findFirstTextNode(el) {
    return walkAllTextNodes(el, (n) => n.textContent.trim().length > 0);
  }

  function applyAutoCorrectToContentEditable(el, issues) {
    // Surgical replacement: find each issue by UTF-16 offset and replace only that text
    // This preserves Outlook's formatting (bold, links, signature, etc.)
    const text = getElementText(el);
    if (!text) return false;

    const autoIssues = issues
      // "missing_period" fires on ANY line that looks sentence-shaped but has no trailing
      // punctuation — including the line the user is still actively typing. Auto-applying
      // it mid-keystroke inserts a period into text that isn't finished yet, corrupting
      // what the user types next. Leave it for Suggest mode / manual review instead.
      //
      // safeAuto: the API marks every AI (DeepSeek) suggestion safeAuto:false on purpose —
      // AI offsets/rewrites can be wrong or based on already-corrupted text, so the server
      // is telling the client not to apply them without review. Only rule-engine issues
      // (regex-based, deterministic) come back safeAuto:true. Honor that.
      .filter((i) => i.safeAuto === true && i.confidence >= 0.85 && i.category !== "style" && i.category !== "tone" && i.rule !== "missing_period" && i.replacement && i.original !== i.replacement)
      .filter((i) => i.startUtf16 !== null && i.startUtf16 !== undefined);

    if (autoIssues.length === 0) return false;

    // Save the caret's character offset (if the user is actively focused in this field)
    // BEFORE mutating the DOM. Replacing a text node the live selection is anchored to
    // silently invalidates the browser's cursor, causing it to jump elsewhere and the
    // next keystrokes to land in the wrong place. We restore it after editing, below.
    let caretOffset = null;
    const hadFocus = document.activeElement === el || el.contains(document.activeElement);
    if (hadFocus) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (el.contains(range.startContainer)) {
          caretOffset = getGlobalOffset(el, range.startContainer, range.startOffset);
        }
      }
    }

    // Sort by offset descending (end-to-start to preserve positions)
    const sorted = [...autoIssues].sort((a, b) => b.startUtf16 - a.startUtf16);

    let applied = 0;
    let caretDelta = 0; // net character shift to apply to the saved caret offset
    for (const issue of sorted) {
      const idx = issue.startUtf16;
      // Verify the text matches
      if (idx < 0 || idx + issue.original.length > text.length) continue;
      if (text.substring(idx, idx + issue.original.length) !== issue.original) continue;

      // Find the text node and offset for this position
      const { node: startNode, offset: startOff } = findNodeAtOffset(el, idx);
      const { node: endNode, offset: endOff } = findNodeAtOffset(el, idx + issue.original.length);
      if (!startNode || !endNode) continue;

      try {
        const range = document.createRange();
        range.setStart(startNode, startOff);
        range.setEnd(endNode, endOff);

        // Verify range text matches
        if (range.toString() !== issue.original) continue;

        // Delete the old text and insert the replacement
        range.deleteContents();
        range.insertNode(document.createTextNode(issue.replacement));
        applied++;

        // Only corrections that land entirely before the caret's original position
        // shift where the caret should end up. Corrections after it don't matter.
        if (caretOffset !== null && idx + issue.original.length <= caretOffset) {
          caretDelta += issue.replacement.length - issue.original.length;
        }
      } catch (e) {
        // Range error — skip this issue
      }
    }

    if (applied > 0) {
      el.dispatchEvent(new Event("input", { bubbles: true }));

      // Restore the caret to its logical position, shifted by however much the
      // text before it grew or shrank. Skip if focus moved elsewhere in the meantime.
      if (caretOffset !== null && (document.activeElement === el || el.contains(document.activeElement))) {
        restoreCaretOffset(el, caretOffset + caretDelta);
      }
    }
    return applied > 0;
  }

  function restoreCaretOffset(el, offset) {
    try {
      const { node, offset: localOffset } = findNodeAtOffset(el, Math.max(0, offset));
      if (!node) return;
      const range = document.createRange();
      range.setStart(node, Math.min(localOffset, node.textContent.length));
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {
      // Selection restore failed — non-fatal, correction is still applied
    }
  }

  function findLastUserTextNode(el) {
    // Walk text nodes (crossing shadow DOM), stop at signature separator ("--" or "—")
    const textNodes = collectTextNodes(el);
    let lastUserNode = null;
    for (const node of textNodes) {
      const text = node.textContent;
      if (text.match(/^\s*--/) || text.match(/^\s*—/) || text.match(/^\s*--\s*$/)) break;
      if (text.trim().length > 0) lastUserNode = node;
    }
    return lastUserNode || findFirstTextNode(el);
  }

  // ==================== DEBOUNCE ====================

  function createPerElementDebounce(fn, ms) {
    const timers = new WeakMap();
    return function (el) {
      if (timers.has(el)) clearTimeout(timers.get(el));
      timers.set(el, setTimeout(() => fn(el), ms));
    };
  }

  // Returns the start index of whichever occurrence of `needle` in `text` is closest to
  // `hint` (an approximate offset), or -1 if `needle` doesn't appear at all. Mirrors
  // findClosestOccurrence in services/api/src/engine/grammar.ts — same reasoning: a needle
  // that appears more than once (a repeated word/phrase) shouldn't always resolve to the
  // very first occurrence in the document when the exact offset doesn't line up.
  function findClosestOccurrence(text, needle, hint) {
    if (!needle) return -1;
    let best = -1;
    let bestDist = Infinity;
    let searchFrom = 0;
    while (true) {
      const idx = text.indexOf(needle, searchFrom);
      if (idx === -1) break;
      const dist = Math.abs(idx - hint);
      if (dist < bestDist) {
        best = idx;
        bestDist = dist;
      }
      searchFrom = idx + 1;
    }
    return best;
  }

  // ==================== GRAMMAR CHECK ====================

  async function checkText(text, lightweight = false) {
    if (!isExtensionAlive) return [];
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          { action: "checkInline", text, token: clerkToken, lightweight },
          (response) => {
            if (chrome.runtime.lastError) {
              const msg = chrome.runtime.lastError.message || "";
              if (msg.includes("Extension context invalidated") || msg.includes("Receiving end does not exist")) {
                isExtensionAlive = false;
                console.warn("[ProsePilot] Extension context invalidated. Please reload the page.");
              } else {
                console.warn("[ProsePilot] Runtime error:", msg);
              }
              resolve([]);
              return;
            }
            resolve(response?.issues || []);
          }
        );
      } catch (e) {
        isExtensionAlive = false;
        console.warn("[ProsePilot] Extension context invalidated. Please reload the page.");
        resolve([]);
      }
    });
  }

  // ==================== LOCAL (INSTANT) SPELLCHECK TIER ====================
  //
  // Purely additive speed layer — see docs/local-spellcheck-scope.md. Flags misspelled words
  // via the bundled offline dictionary (background.js/lib/nspell.js) on a short debounce, with
  // zero effect on the AI/LanguageTool tier above: checkText() still runs unchanged on every
  // check, this just gets *something* on screen faster for plain typos. Never auto-applies —
  // same click-to-accept flow as every other issue.

  // Lowercase industry jargon the bundled dictionary has never heard of but that shows up
  // constantly in this app's real usage (property management) — e.g. "makeready"/"make-ready"
  // (the process of turning a vacated unit for a new tenant). nspell correctly flags it as
  // unknown and then "corrects" it to whichever real word is closest by edit distance
  // ("makers"), which is a pure false positive, not a typo. Unlike the ALL-CAPS acronym case
  // below, these are ordinary-looking lowercase words, so they need to be named explicitly
  // rather than caught by a pattern. Add more terms here as they come up.
  const CUSTOM_DICTIONARY = new Set(["makeready", "makereadies"]);

  // ALL-CAPS tokens (optionally with a trailing lowercase "s" for a plural — "NTVs", "PMs",
  // "DMs") are almost always acronyms or internal jargon rather than typos. nspell's
  // dictionary has no notion of a property-management team's acronyms, so left unfiltered
  // it flags them as misspelled and "corrects" them to whatever real word is closest by edit
  // distance — e.g. "NTVs" -> "TVs" — which is virtually always wrong and, unlike a genuine
  // typo suggestion, actively misleading. Skipping them here matches how every mainstream
  // spellchecker (Word included) treats all-caps tokens by default.
  function isLikelyAcronym(word) {
    const base = /^[A-Z]+s$/.test(word) ? word.slice(0, -1) : word;
    return base.length >= 2 && /^[A-Z]+$/.test(base);
  }

  // Finds word-like tokens and their character offset in one pass. Deliberately simple
  // (letters + internal apostrophes only) — good enough for "is this word spelled right",
  // which is all this tier does; the AI tier already handles anything needing real language
  // understanding.
  function tokenizeWords(text) {
    const matches = [];
    const re = /[A-Za-z]+(?:'[A-Za-z]+)*/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      // Skip single letters — near-100% false-positive rate ("a", "I", mid-typing fragments)
      // and not worth a background round trip for. Skip likely acronyms and known jargon for
      // the reasons above.
      if (m[0].length > 1 && !isLikelyAcronym(m[0]) && !CUSTOM_DICTIONARY.has(m[0].toLowerCase())) {
        matches.push({ word: m[0], startUtf16: m.index });
      }
    }
    return matches;
  }

  function localSpellcheckWords(words) {
    return new Promise((resolve) => {
      if (!isExtensionAlive || words.length === 0) {
        resolve([]);
        return;
      }
      try {
        chrome.runtime.sendMessage({ action: "spellcheckLocal", words }, (response) => {
          if (chrome.runtime.lastError) {
            // Same fail-quiet posture as checkText's error path — this tier is a bonus, not
            // a dependency, so a dead extension context here just means "no instant tier this
            // time," not a warning worth surfacing on top of whatever checkText already logs.
            resolve([]);
            return;
          }
          resolve(response?.results || []);
        });
      } catch (e) {
        resolve([]);
      }
    });
  }

  const triggerLocalCheck = createPerElementDebounce(async (el) => {
    if (!isExtensionAlive || isDisabled || currentMode === "none") return;

    const text = getElementText(el);
    if (!text || text.trim().length < MIN_TEXT_LENGTH || text.length > MAX_CHECK_LENGTH) {
      localIssueMap.delete(el);
      renderMerged(el);
      return;
    }

    const tokens = tokenizeWords(text);
    if (tokens.length === 0) return;

    // One round trip for every unique word rather than one per occurrence — a paragraph
    // repeating the same typo doesn't need to ask the dictionary twice. Preserve case:
    // nspell's dictionary stores proper nouns (e.g. "Wednesday") capitalized, and lower-
    // casing the query before checking made nspell flag the (correctly capitalized) word
    // as misspelled purely because "wednesday" isn't a dictionary entry — with its own
    // top suggestion being the properly-cased word, i.e. identical to what was already
    // there. That produced no-op "Wednesday" → "Wednesday" suggestions. Checking the word
    // as-typed lets nspell's own case handling do the right thing.
    const uniqueWords = [...new Set(tokens.map((t) => t.word))];
    const results = await localSpellcheckWords(uniqueWords);

    // The live text can change while that message round trip was in flight (same race
    // checkText's caller already guards against below) — bail rather than render offsets
    // computed against text that's no longer there.
    if (getElementText(el) !== text) return;

    const misspelled = new Map(results.filter((r) => r.misspelled).map((r) => [r.word, r.suggestions]));
    if (misspelled.size === 0) {
      localIssueMap.delete(el);
      renderMerged(el);
      return;
    }

    const issues = tokens
      .filter((t) => misspelled.has(t.word))
      .map((t) => {
        const suggestions = misspelled.get(t.word);
        return {
          id: `local_${t.startUtf16}_${t.word}`,
          category: "spelling",
          rule: null,
          original: t.word,
          replacement: suggestions && suggestions[0] ? suggestions[0] : t.word,
          explanation: "Possible spelling mistake",
          startUtf16: t.startUtf16,
          confidence: 0.6,
          safeAuto: false,
        };
      })
      // Belt-and-suspenders: never surface a "fix" that doesn't actually change anything
      // (e.g. a dictionary suggestion that round-trips back to the original word).
      .filter((i) => i.replacement !== i.original)
      .filter((i) => !isIgnored(i.original));

    localIssueMap.set(el, issues);
    renderMerged(el);
  }, LOCAL_DEBOUNCE_MS);

  // ==================== SUGGEST MODE ====================

  function renderUnderlines(el, issues) {
    isRenderingUnderlines = true;

    clearUnderlines(el);

    if (!issues || issues.length === 0) {
      isRenderingUnderlines = false;
      return;
    }

    const text = getElementText(el);
    if (!text || text.trim().length === 0) {
      isRenderingUnderlines = false;
      return;
    }

    // For textarea/input, show floating indicator
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      showFloatingIndicator(el, issues);
      isRenderingUnderlines = false;
      return;
    }

    // For contentEditable, wrap issues in spans
    try {
      wrapIssuesInSpans(el, issues);
    } catch (e) {
      console.warn("[ProsePilot] wrapIssuesInSpans failed:", e);
      showFloatingIndicator(el, issues);
    }

    // Delay reset so MutationObserver callbacks see the flag as true during DOM mutations
    setTimeout(() => { isRenderingUnderlines = false; }, 0);
  }

  function clearUnderlines(el) {
    if (!el) return;

    // If the caret is currently live inside one of these spans (the user is actively
    // editing a word we already flagged), don't touch that specific span. Unwrapping it
    // means removing the exact DOM node the browser's selection is anchored to — the
    // mechanical root cause of every caret-jump bug found in this file so far, no matter
    // how carefully the offset math afterward tries to restore position. Leaving that one
    // span alone for this render pass costs nothing: it'll be re-evaluated (and re-cleared
    // if actually fixed or gone) on the next check once the caret has moved elsewhere.
    //
    // That protection has to expire, though: if the caret sits inside (or near) a flagged
    // span while the user edits *around* it — inserting a word just before it, for
    // instance — the span's live text can end up different from the issue.original it was
    // created from, while still being "caret-inside" protected on every subsequent check.
    // Left unguarded, that span (and its frozen, now-wrong original/replacement pair) can
    // survive indefinitely, showing a stale popup and — worse — corrupting the text if
    // Accepted, since Accept swaps the whole span for the old cached replacement regardless
    // of what's actually in it by then. Comparing against the dataset.original snapshot
    // catches exactly that: only protect the span if its content still matches what it was
    // flagged for.
    const hadFocus = document.activeElement === el || el.contains(document.activeElement);
    const sel = hadFocus ? window.getSelection() : null;
    const activeRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;

    // Unwrap all underline and stale spans, restoring plain text nodes
    // Crosses shadow DOM boundaries for Outlook compatibility
    const clearInRoot = (root) => {
      const spans = root.querySelectorAll(".prosepilot-underline, .prosepilot-stale");
      spans.forEach((span) => {
        const stillMatches = span.dataset.original === undefined || span.textContent === span.dataset.original;
        if (activeRange && stillMatches && span.contains(activeRange.startContainer)) return;
        const parent = span.parentNode;
        if (!parent) return;
        const textNode = document.createTextNode(span.textContent);
        parent.replaceChild(textNode, span);
      });
      root.querySelectorAll("*").forEach((child) => {
        if (child.shadowRoot) clearInRoot(child.shadowRoot);
      });
    };
    clearInRoot(el);
    // Merge adjacent text nodes left by unwrapping
    el.normalize();
    // Also remove floating indicator
    const indicator = el.parentNode?.querySelector(".prosepilot-indicator");
    if (indicator) indicator.remove();
  }

  // Builds the clickable underline <span> for one flagged issue. Pulled out of
  // wrapIssuesInSpans so both the single-node fast path and the cross-node fallback below
  // (see wrapCrossNodeMatch) can share the exact same styling/click-handler logic instead
  // of duplicating it.
  function createUnderlineSpan(issue, problemText, issues, el) {
    const color = issue.category === "spelling" ? "#dc2626" : issue.category === "grammar" ? "#ea580c" : "#6366f1";
    const span = document.createElement("span");
    span.className = "prosepilot-underline";
    span.dataset.issueId = issue.id;
    // Snapshot of the exact text this span was created to represent — lets clearUnderlines()
    // detect when a span's live content has since diverged from the issue it's bound to (see
    // the staleness check there) without needing to re-look-up the issue object.
    span.dataset.original = issue.original;
    span.textContent = problemText;
    span.style.textDecorationLine = "underline";
    span.style.textDecorationStyle = "wavy";
    span.style.textDecorationColor = color;
    span.style.textUnderlineOffset = "3px";
    span.style.cursor = "pointer";
    span.style.background = "rgba(99,102,241,0.06)";
    span.style.borderRadius = "2px";
    span.style.padding = "0 1px";
    span.addEventListener("click", (e) => {
      e.stopPropagation();
      const iss = issues.find((i) => i.id === span.dataset.issueId);
      if (iss) showSuggestionPopup(span, iss, el);
    });
    return span;
  }

  // Splits `node` at `localIdx` and replaces it with before-text + underline span +
  // after-text, exactly as the old inline logic did. Shared by both the fast path (match
  // found within a single existing text node) and the cross-node fallback (match found only
  // after merging a run of adjacent text nodes into one).
  function wrapNodeAtIndex(node, localIdx, issue, issues, el) {
    const parent = node.parentNode;
    if (!parent) return false;
    const tc = node.textContent;
    const before = tc.substring(0, localIdx);
    const problem = tc.substring(localIdx, localIdx + issue.original.length);
    const after = tc.substring(localIdx + issue.original.length);
    const span = createUnderlineSpan(issue, problem, issues, el);
    if (before) parent.insertBefore(document.createTextNode(before), node);
    parent.insertBefore(span, node);
    if (after) parent.insertBefore(document.createTextNode(after), node);
    parent.removeChild(node);
    console.log("[ProsePilot] Underline CREATED:", issue.original, "->", issue.replacement);
    return true;
  }

  // Fallback for when an issue's matched text doesn't exist inside any single text node.
  // Seen in Outlook's Loop-based compose editor (the newer "cloud.microsoft" UI): a single
  // word like "grammer" can be split across two or more text nodes that don't even share the
  // same immediate parent element — e.g. the editor wraps each fragment in its own <span> —
  // so a same-parent node-merging approach isn't reliable (it correctly refuses to merge
  // across different parents to avoid corrupting formatting, but then just gives up).
  // Instead, this locates the exact (node, offset) start/end boundary points of the match
  // across the joined text of every text node in the element, builds a native DOM Range
  // spanning those boundaries — Range.deleteContents()/insertNode() correctly handle
  // crossing arbitrary element boundaries, which manual node splicing can't — and replaces
  // exactly that range with the same underline <span> the fast path would create.
  function wrapCrossNodeMatch(el, issue, issues, activeRange) {
    const nodes = collectTextNodes(el);
    const joined = nodes.map((n) => n.textContent).join("");
    const globalIdx = joined.indexOf(issue.original);
    if (globalIdx === -1) return false;
    const matchEnd = globalIdx + issue.original.length;

    let pos = 0, startIdx = -1, startOffset = 0, endIdx = -1, endOffset = 0;
    for (let i = 0; i < nodes.length; i++) {
      const len = nodes[i].textContent.length;
      if (startIdx === -1 && globalIdx < pos + len) { startIdx = i; startOffset = globalIdx - pos; }
      if (endIdx === -1 && matchEnd <= pos + len) { endIdx = i; endOffset = matchEnd - pos; }
      pos += len;
      if (startIdx !== -1 && endIdx !== -1) break;
    }
    // A same-node match would already have been caught by the fast path — only handle
    // genuine cross-node spans here.
    if (startIdx === -1 || endIdx === -1 || endIdx === startIdx) return false;

    // Same caret-safety rule as the fast path (see its comment): only refuse when the caret
    // is actually inside the matched span's global character range, not merely anchored to
    // one of the nodes the span happens to pass through. Skip this issue this round rather
    // than risk the cursor jumping — it'll just get picked up on the next check once the
    // user's moved past it.
    if (activeRange && el.contains(activeRange.startContainer)) {
      const caretGlobal = getGlobalOffset(el, activeRange.startContainer, activeRange.startOffset);
      if (caretGlobal >= globalIdx && caretGlobal <= matchEnd) return false;
    }

    try {
      const range = document.createRange();
      range.setStart(nodes[startIdx], startOffset);
      range.setEnd(nodes[endIdx], endOffset);
      // Use the range's own text rather than issue.original for the span's content —
      // they should be identical if the offset math above is right, but this guarantees
      // the rendered span never shows something other than what was actually removed.
      const problemText = range.toString();
      if (!problemText) return false;
      const span = createUnderlineSpan(issue, problemText, issues, el);
      range.deleteContents();
      range.insertNode(span);
      console.log("[ProsePilot] Underline CREATED (cross-node):", issue.original, "->", issue.replacement);
      return true;
    } catch (e) {
      console.warn("[ProsePilot] cross-node wrap error:", issue.original, e);
      return false;
    }
  }

  function wrapIssuesInSpans(el, issues) {
    const text = getElementText(el);
    if (!text) { console.warn("[ProsePilot] wrapIssuesInSpans: no text"); return; }

    const sorted = [...issues]
      .map((issue) => {
        let idx = -1;
        if (issue.startUtf16 !== null && issue.startUtf16 !== undefined && issue.startUtf16 >= 0) {
          if (text.substring(issue.startUtf16, issue.startUtf16 + issue.original.length) === issue.original) {
            idx = issue.startUtf16;
          }
        }
        if (idx === -1) idx = text.indexOf(issue.original);
        return { ...issue, idx };
      })
      .filter((i) => i.idx !== -1)
      .sort((a, b) => a.idx - b.idx);

    if (sorted.length === 0) { console.warn("[ProsePilot] No issues matched in text"); return; }

    // Save the caret's character offset before splitting any text nodes. Underlining
    // works by replacing a live text node with three new nodes (before + <span> + after)
    // — if the browser's selection was anchored inside the node we just removed, the
    // cursor silently jumps and subsequent keystrokes land wherever it ends up. Wrapping
    // doesn't change the total text length, so no offset delta is needed on restore.
    let caretOffset = null;
    const hadFocus = document.activeElement === el || el.contains(document.activeElement);
    if (hadFocus) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (el.contains(range.startContainer)) {
          caretOffset = getGlobalOffset(el, range.startContainer, range.startOffset);
        }
      }
    }

    // let, not const — the cross-node fallback below reassigns this after merging nodes
    let textNodes = collectTextNodes(el);
    console.log("[ProsePilot] wrapIssuesInSpans:", textNodes.length, "text nodes,", sorted.length, "issues");

    // If the caret is live inside a text node, never split/replace THAT specific node —
    // same principle as clearUnderlines above. Splitting the node the browser's selection
    // is anchored to is what actually causes the cursor to jump; no amount of offset-based
    // restoration afterward fully avoids that, since the node itself is gone. Skipping just
    // that one node's issue this round means it simply gets underlined on the next check,
    // once the user has typed past it and the caret has moved to a different node.
    const activeSel = hadFocus ? window.getSelection() : null;
    const activeRange = activeSel && activeSel.rangeCount > 0 ? activeSel.getRangeAt(0) : null;

    // For each issue, first try the fast path — search each text node individually. Most
    // editors (Gmail, LinkedIn, Slack, plain textareas) keep a run of typed text in one text
    // node, so this handles the common case cheaply with no DOM merging needed.
    for (const issue of sorted) {
      let wrapped = false;
      for (const node of textNodes) {
        if (wrapped) break;
        const localIdx = node.textContent.indexOf(issue.original);
        if (localIdx === -1) continue;
        // Only refuse when the caret is truly inside the matched span itself (mid-word,
        // actively being typed) — not merely "somewhere in this node". Outlook's Loop editor
        // (cloud.microsoft) can keep an entire paragraph as one live text node, so blanket-
        // skipping any node the caret happens to occupy meant a word flagged earlier in the
        // same paragraph could never get underlined while the user kept typing later in that
        // same node: the fast path always lost this node to the skip, the cross-node fallback
        // correctly refuses same-node matches (see its own comment), and the issue silently
        // never rendered — this was the root cause of ProsePilot appearing to "not pick up
        // errors at all" while composing in Outlook. The caret is still safe either way:
        // caretOffset/restoreCaretOffset (above/below) relocate it by *global* character
        // offset after any split, independent of this per-node check.
        if (
          activeRange &&
          activeRange.startContainer === node &&
          activeRange.startOffset >= localIdx &&
          activeRange.startOffset <= localIdx + issue.original.length
        ) {
          continue;
        }
        try {
          wrapped = wrapNodeAtIndex(node, localIdx, issue, issues, el);
          // wrapNodeAtIndex splices the DOM (splits this node into before/span/after and
          // detaches the original), so the `textNodes` array captured at the top of
          // wrapIssuesInSpans is now stale — it still holds a reference to the now-detached
          // original node. Left unrefreshed, the *next* issue in this same pass would search
          // that dead node, find the text via its still-populated (but disconnected)
          // .textContent, and then fail silently inside wrapNodeAtIndex itself (parentNode is
          // null on a detached node) — exactly the "found text, still couldn't wrap it" failure
          // mode, just one issue later than the caret-skip bug above. Only the cross-node
          // fallback refreshed this before; the much more common same-node fast path needs to
          // as well, or every issue after the first one in a given text node silently drops.
          if (wrapped) textNodes = collectTextNodes(el);
        } catch (e) {
          console.warn("[ProsePilot] wrap error:", issue.original, e);
        }
      }

      // Fallback — the match doesn't live inside any single text node. See
      // wrapCrossNodeMatch's comment for why this happens (Outlook's Loop-based editor
      // fragmenting text mid-word, sometimes across different parent elements, being the
      // known case).
      if (!wrapped) {
        wrapped = wrapCrossNodeMatch(el, issue, issues, activeRange);
        // The DOM changed if that succeeded, so refresh textNodes before the next issue in
        // this loop searches it.
        if (wrapped) textNodes = collectTextNodes(el);
      }

      if (!wrapped) {
        // Diagnostic: getElementText() (innerText-based) is what built the text sent to
        // the server and passed the staleness check, but wrapIssuesInSpans/wrapCrossNodeMatch
        // search a *different* string — the raw textContent of collectTextNodes(). These can
        // genuinely disagree (innerText collapses whitespace / follows rendering rules;
        // textContent doesn't, and can include content invisible to innerText or miss content
        // innerText includes). Logging both here lets us see exactly where they diverge
        // instead of guessing.
        const liveText = getElementText(el);
        const domJoined = collectTextNodes(el).map((n) => n.textContent).join("");
        console.warn(
          "[ProsePilot] Could not find text node containing:", JSON.stringify(issue.original),
          "\n  getElementText() contains it:", liveText.includes(issue.original),
          "\n  DOM textContent join contains it:", domJoined.includes(issue.original),
          "\n  getElementText() === DOM textContent join:", liveText === domJoined,
          "\n  getElementText() length:", liveText.length, "DOM join length:", domJoined.length
        );
      }
    }

    // Restore the caret to its original logical position now that the text nodes it may
    // have been anchored to have been replaced. Skip if focus moved elsewhere meanwhile.
    if (caretOffset !== null && (document.activeElement === el || el.contains(document.activeElement))) {
      restoreCaretOffset(el, caretOffset);
    }
  }

  function getGlobalOffset(root, targetNode, targetOffset) {
    // Use shadow-DOM-aware traversal instead of TreeWalker
    let offset = 0;
    const textNodes = collectTextNodes(root);
    for (const node of textNodes) {
      if (node === targetNode) return offset + targetOffset;
      offset += node.textContent.length;
    }
    // targetNode wasn't one of the text nodes we walked — the caret is anchored to an
    // element boundary instead (e.g. an empty paragraph at the start of a fresh line, or a
    // text node that just got detached by clearUnderlines()/wrapIssuesInSpans() unwrapping
    // a span mid-typing — both routine in Outlook's compose box). Returning 0 here used to
    // be indistinguishable from "the caret is genuinely at the very start of the field," and
    // every caller treated any number as trustworthy — so a caret that was actually
    // mid-sentence got forcibly snapped back to position 0 on the next underline re-render,
    // scrambling whatever the user typed next. null tells callers "couldn't determine" so
    // they skip the forced restore and leave the browser's own selection alone instead of
    // guessing wrong.
    return null;
  }

  function findNodeAtOffset(root, targetOffset) {
    // Use shadow-DOM-aware traversal instead of TreeWalker
    let offset = 0;
    const textNodes = collectTextNodes(root);
    for (const node of textNodes) {
      const nodeEnd = offset + node.textContent.length;
      if (targetOffset <= nodeEnd) return { node, offset: targetOffset - offset };
      offset = nodeEnd;
    }
    return { node: null, offset: 0 };
  }

  function showFloatingIndicator(el, issues) {
    const existing = el.parentNode?.querySelector(".prosepilot-indicator");
    if (existing) existing.remove();

    const indicator = document.createElement("div");
    indicator.className = "prosepilot-indicator";
    indicator.innerHTML = `
      <div style="
        position:absolute;top:-8px;right:-8px;
        background:#6366f1;color:white;
        border-radius:50%;width:22px;height:22px;
        display:flex;align-items:center;justify-content:center;
        font-size:11px;font-weight:700;cursor:pointer;
        box-shadow:0 2px 6px rgba(0,0,0,0.2);z-index:10000;
        font-family:-apple-system,BlinkMacSystemFont,sans-serif;
      ">${issues.length}</div>
    `;

    const parent = el.parentNode;
    if (parent) {
      const pos = getComputedStyle(parent);
      if (pos.position === "static") parent.style.position = "relative";
      parent.appendChild(indicator);
    }

    indicator.addEventListener("click", (e) => {
      e.stopPropagation();
      showIssueListPopup(el, issues);
    });
  }

  // ==================== SUGGESTION POPUPS ====================

  // After a single fix is applied, any OTHER pending issue in the same field that came
  // after it in the text has shifted character positions. Recomputing that locally lets
  // the remaining underlines/rows re-render instantly instead of paying for a full API
  // round-trip (including the DeepSeek call in "review" mode) after every single accept —
  // that per-accept full re-check was the direct cause of a paragraph with many issues
  // taking 1-2 minutes to work through. Anything whose range overlaps the edit, or has no
  // known offset, is dropped rather than guessed at, matching this file's existing rule of
  // failing gracefully instead of risking a misplaced edit. Dropped issues simply stop
  // being shown for the rest of this session — they'll resurface on the next real check
  // if the user keeps editing that spot.
  function patchIssueOffsets(acceptedIssue, otherIssues) {
    const accStart = acceptedIssue.startUtf16;
    const hasAccStart = accStart !== null && accStart !== undefined;
    const accEnd = hasAccStart ? accStart + acceptedIssue.original.length : null;
    const delta = acceptedIssue.replacement.length - acceptedIssue.original.length;

    return otherIssues
      .filter((i) => i.id !== acceptedIssue.id)
      .map((i) => {
        if (!hasAccStart || i.startUtf16 === null || i.startUtf16 === undefined) return null;
        const iStart = i.startUtf16;
        const iEnd = iStart + i.original.length;
        if (iEnd <= accStart) return i; // entirely before the edit — unaffected
        if (iStart >= accEnd) return { ...i, startUtf16: iStart + delta }; // entirely after — shift
        return null; // overlaps the edit — ambiguous, drop rather than misplace
      })
      .filter((i) => i !== null);
  }

  function showSuggestionPopup(target, issue, editableEl) {
    hidePopup();

    const popup = document.createElement("div");
    popup.className = "prosepilot-popup";
    popup.innerHTML = `
      <div style="
        position:fixed;z-index:2147483647;
        background:white;border:1px solid #e5e7eb;border-radius:10px;
        padding:14px;box-shadow:0 8px 30px rgba(0,0,0,0.15);
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        font-size:13px;min-width:280px;max-width:360px;
      ">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <span style="color:#6366f1;font-weight:600;text-transform:uppercase;font-size:10px;letter-spacing:0.5px;">${escapeHtml(issue.category)}</span>
          <button class="prosepilot-close" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:18px;padding:0;line-height:1;">&times;</button>
        </div>
        <div style="margin-bottom:8px;">
          <span style="color:#dc2626;text-decoration:line-through;">${escapeHtml(issue.original)}</span>
          <span style="color:#9ca3af;margin:0 6px;">→</span>
          <span style="color:#059669;font-weight:500;">${escapeHtml(issue.replacement)}</span>
        </div>
        <div style="color:#6b7280;font-size:11px;margin-bottom:10px;line-height:1.4;">${escapeHtml(issue.explanation)}</div>
        <div style="display:flex;gap:6px;margin-bottom:6px;">
          <button class="prosepilot-accept" style="
            flex:1;padding:7px 12px;border:none;border-radius:6px;
            background:#059669;color:white;font-size:12px;font-weight:500;cursor:pointer;
          ">Accept</button>
          <button class="prosepilot-skip" style="
            flex:1;padding:7px 12px;border:none;border-radius:6px;
            background:#f3f4f6;color:#374151;font-size:12px;font-weight:500;cursor:pointer;
          ">Skip</button>
        </div>
        <button class="prosepilot-ignore" style="
          width:100%;padding:5px 8px;border:none;background:none;
          color:#9ca3af;font-size:11px;cursor:pointer;text-decoration:underline;
        ">Ignore "${escapeHtml(issue.original)}" everywhere</button>
      </div>
    `;

    document.body.appendChild(popup);
    activePopup = popup;

    // Position — get the inner div (not firstChild which may be whitespace)
    const popupInner = popup.querySelector("div");
    if (!popupInner) return;

    const rect = target.getBoundingClientRect();
    const popupRect = popupInner.getBoundingClientRect();
    let top = window.scrollY + rect.top - popupRect.height - 8;
    let left = window.scrollX + rect.left + (rect.width - popupRect.width) / 2;

    if (top < window.scrollY) top = window.scrollY + rect.bottom + 8;
    if (left < 8) left = 8;
    if (left + popupRect.width > window.innerWidth - 8)
      left = window.innerWidth - popupRect.width - 8;

    popupInner.style.top = top + "px";
    popupInner.style.left = left + "px";

    // Handlers
    popup.querySelector(".prosepilot-close").addEventListener("click", hidePopup);
    popup.querySelector(".prosepilot-skip").addEventListener("click", () => {
      // Remove the underline span when user skips/dismisses — restore whatever text is
      // CURRENTLY inside the span (span.textContent), not the frozen issue.original. Those
      // normally match, but if this span went stale (its live content diverged from the
      // issue since it was flagged — see clearUnderlines' staleness check), forcing back
      // issue.original would silently throw away whatever the user actually typed there.
      // "Skip" should only ever mean "stop flagging this," never "revert my edit."
      const safeId = CSS.escape(String(issue.id));
      const span = editableEl.querySelector(`.prosepilot-underline[data-issue-id="${safeId}"]`);
      if (span) {
        const parent = span.parentNode;
        parent.replaceChild(document.createTextNode(span.textContent), span);
        parent.normalize();
      }
      hidePopup();
    });
    popup.querySelector(".prosepilot-accept").addEventListener("click", async () => {
      // Suppress the MutationObserver's own re-check for the DOM edit below — we're about
      // to patch offsets and re-render locally instead of paying for a full re-check.
      isRenderingUnderlines = true;

      // Find the underline span for this issue and replace it directly
      const safeId = CSS.escape(String(issue.id));
      const span = editableEl.querySelector(`.prosepilot-underline[data-issue-id="${safeId}"]`);
      // Stale-span guard: if the span's live text no longer matches what this issue was
      // flagged for (the user edited in/around it since — see clearUnderlines' matching
      // staleness check), swapping in the frozen replacement would silently overwrite
      // whatever they actually typed. Bail and force a fresh check instead of corrupting
      // the text — same "fail gracefully rather than misplace an edit" rule this file
      // already follows in patchIssueOffsets above.
      if (span && span.textContent !== issue.original) {
        hidePopup();
        showToast("Text changed — re-checking...");
        isRenderingUnderlines = false;
        triggerCheck(editableEl);
        triggerLocalCheck(editableEl);
        return;
      }
      if (span) {
        const parent = span.parentNode;
        const replacementNode = document.createTextNode(issue.replacement);
        parent.replaceChild(replacementNode, span);
        parent.normalize();
      } else {
        // Fallback: find and replace in text
        const text = getElementText(editableEl);
        const idx = text.indexOf(issue.original);
        if (idx !== -1) {
          const newText = text.slice(0, idx) + issue.replacement + text.slice(idx + issue.original.length);
          setElementText(editableEl, newText);
        }
      }
      hidePopup();
      showToast("✓ Correction applied");

      // Patch the remaining issues' offsets locally and re-render immediately — no full
      // re-check needed for every single accept.
      const remaining = issueMap.get(editableEl) || [];
      const updated = patchIssueOffsets(issue, remaining);
      issueMap.set(editableEl, updated);
      lastCheckedText.set(editableEl, getElementText(editableEl));
      renderUnderlines(editableEl, updated);
    });

    popup.querySelector(".prosepilot-ignore").addEventListener("click", async () => {
      await addIgnoredWord(issue.original);
      isRenderingUnderlines = true;
      // Drop every OTHER occurrence of this same word from the current issue list too —
      // not just the one the user clicked on.
      const remaining = (issueMap.get(editableEl) || []).filter((i) => normalizeWord(i.original) !== normalizeWord(issue.original));
      issueMap.set(editableEl, remaining);
      renderUnderlines(editableEl, remaining);
      hidePopup();
      showToast(`Won't flag "${issue.original}" again`);
    });

    setTimeout(() => {
      document.addEventListener("click", hidePopup, { once: true });
    }, 10);
  }

  function showIssueListPopup(el, issuesParam) {
    hidePopup();

    const popup = document.createElement("div");
    popup.className = "prosepilot-popup";

    // Mutable working copy. Accept no longer closes this popup or forces a full re-check —
    // it patches the remaining issues' offsets locally (patchIssueOffsets) and re-renders
    // just the rows below, which is what makes working through a paragraph with many
    // issues fast instead of a DeepSeek round-trip after every single click.
    let issues = issuesParam.slice();

    function issueRowHtml(issue) {
      return `
      <div class="prosepilot-list-issue" data-issue-id="${escapeHtml(String(issue.id))}" style="padding:8px;background:#f9fafb;border-radius:6px;margin-bottom:6px;border-left:3px solid ${
        issue.category === "spelling"
          ? "#dc2626"
          : issue.category === "grammar"
            ? "#ea580c"
            : "#6366f1"
      };">
        <div style="font-size:11px;color:#6b7280;margin-bottom:4px;">${escapeHtml(issue.category)}</div>
        <div style="font-size:12px;">
          <span style="color:#dc2626;text-decoration:line-through;">${escapeHtml(issue.original)}</span>
          <span style="color:#9ca3af;"> → </span>
          <span style="color:#059669;font-weight:500;">${escapeHtml(issue.replacement)}</span>
        </div>
        <div style="font-size:11px;color:#6b7280;margin-top:4px;">${escapeHtml(issue.explanation)}</div>
        <div style="display:flex;gap:6px;margin-top:6px;">
          <button class="prosepilot-list-accept" data-issue-id="${escapeHtml(String(issue.id))}" style="flex:1;padding:5px 8px;border:none;border-radius:5px;background:#dcfce7;color:#166534;font-size:11px;font-weight:500;cursor:pointer;">Accept</button>
          <button class="prosepilot-list-skip" data-issue-id="${escapeHtml(String(issue.id))}" style="flex:1;padding:5px 8px;border:none;border-radius:5px;background:#f3f4f6;color:#6b7280;font-size:11px;font-weight:500;cursor:pointer;">Skip</button>
        </div>
        <button class="prosepilot-list-ignore" data-issue-id="${escapeHtml(String(issue.id))}" style="width:100%;margin-top:4px;padding:3px 8px;border:none;background:none;color:#9ca3af;font-size:10px;cursor:pointer;text-decoration:underline;">Ignore "${escapeHtml(issue.original)}" everywhere</button>
      </div>
    `;
    }

    popup.innerHTML = `
      <div style="
        position:fixed;z-index:2147483647;
        background:white;border:1px solid #e5e7eb;border-radius:10px;
        padding:14px;box-shadow:0 8px 30px rgba(0,0,0,0.15);
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        font-size:13px;min-width:300px;max-width:400px;max-height:400px;overflow-y:auto;
      ">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <span class="prosepilot-list-title" style="font-weight:600;">ProsePilot — ${issues.length} issue(s)</span>
          <button class="prosepilot-close" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:18px;padding:0;line-height:1;">&times;</button>
        </div>
        <div id="prosepilot-list-rows">${issues.map(issueRowHtml).join("")}</div>
      </div>
    `;

    document.body.appendChild(popup);
    activePopup = popup;

    const popupInner = popup.querySelector("div");
    if (!popupInner) return;

    const rect = el.getBoundingClientRect();
    let top = window.scrollY + rect.bottom + 8;
    let left = window.scrollX + rect.left;

    popupInner.style.top = top + "px";
    popupInner.style.left = left + "px";

    popup.querySelector(".prosepilot-close").addEventListener("click", hidePopup);

    const rowsContainer = popup.querySelector("#prosepilot-list-rows");
    const titleEl = popup.querySelector(".prosepilot-list-title");

    function syncBadgeAndMap() {
      if (titleEl) titleEl.textContent = `ProsePilot — ${issues.length} issue(s)`;
      const badge = el.parentNode?.querySelector(".prosepilot-indicator div");
      if (badge) badge.textContent = String(issues.length);
      issueMap.set(el, issues);
    }

    // Event delegation for accept/skip — rows get replaced wholesale after each action, so
    // one delegated listener (bound once, here) avoids re-binding after every render.
    rowsContainer.addEventListener("click", async (e) => {
      const acceptBtn = e.target.closest(".prosepilot-list-accept");
      const skipBtn = e.target.closest(".prosepilot-list-skip");
      const ignoreBtn = e.target.closest(".prosepilot-list-ignore");
      if (!acceptBtn && !skipBtn && !ignoreBtn) return;
      e.stopPropagation();

      const issueId = (acceptBtn || skipBtn || ignoreBtn).dataset.issueId;
      const issue = issues.find((i) => String(i.id) === issueId);
      if (!issue) return;

      if (skipBtn) {
        // Skip: just dismiss that one row locally — no server round-trip needed.
        issues = issues.filter((i) => i.id !== issue.id);
        syncBadgeAndMap();
        if (issues.length === 0) { hidePopup(); return; }
        rowsContainer.innerHTML = issues.map(issueRowHtml).join("");
        return;
      }

      if (ignoreBtn) {
        // Ignore: persist so this word never gets flagged again anywhere, and drop every
        // OTHER occurrence of it from this list right now too.
        await addIgnoredWord(issue.original);
        issues = issues.filter((i) => normalizeWord(i.original) !== normalizeWord(issue.original));
        syncBadgeAndMap();
        showToast(`Won't flag "${issue.original}" again`);
        if (issues.length === 0) { hidePopup(); return; }
        rowsContainer.innerHTML = issues.map(issueRowHtml).join("");
        return;
      }

      // Accept: this popup only ever appears for textarea/input elements (the contentEditable
      // path uses showSuggestionPopup's per-underline click instead), so a direct value splice
      // is safe here — no DOM-node surgery needed like applyAutoCorrectToContentEditable does.
      const text = getElementText(el);
      let idx = -1;
      if (issue.startUtf16 !== null && issue.startUtf16 !== undefined && text.substring(issue.startUtf16, issue.startUtf16 + issue.original.length) === issue.original) {
        idx = issue.startUtf16;
      } else {
        // The stored offset didn't line up — fall back to a text search, but for a word/
        // phrase that appears more than once, pick whichever occurrence is closest to the
        // (stale but usually roughly-right) stored offset rather than always the first one
        // in the whole field. Same reasoning as findClosestOccurrence server-side: a blind
        // first-match here would risk "fixing" a different, unrelated occurrence of a
        // repeated word instead of the one actually flagged.
        idx = findClosestOccurrence(text, issue.original, issue.startUtf16 ?? 0);
      }

      if (idx === -1) {
        showToast("Couldn't find that text — it may have already changed.", "error");
        return;
      }

      const newText = text.slice(0, idx) + issue.replacement + text.slice(idx + issue.original.length);
      isAutoCorrecting = true;
      isRenderingUnderlines = true;
      setElementText(el, newText);
      lastCheckedText.set(el, newText);
      setTimeout(() => { isAutoCorrecting = false; isRenderingUnderlines = false; }, 0);

      showToast("✓ Correction applied");

      // Patch the remaining issues' offsets locally instead of a full re-check — this is
      // what keeps working through a long list fast.
      issues = patchIssueOffsets(issue, issues);
      syncBadgeAndMap();

      if (issues.length === 0) {
        hidePopup();
      } else {
        rowsContainer.innerHTML = issues.map(issueRowHtml).join("");
      }
    });

    setTimeout(() => {
      document.addEventListener("click", (e) => {
        if (activePopup && !activePopup.contains(e.target)) {
          hidePopup();
        }
      }, { once: true });
    }, 50);
  }

  function hidePopup() {
    if (activePopup) {
      activePopup.remove();
      activePopup = null;
    }
  }

  // ==================== CHECK TRIGGER (MODE-AWARE) ====================

  const triggerCheck = createPerElementDebounce(async (el) => {
    // Stop if extension context is dead
    if (!isExtensionAlive) return;

    // Stop if extension is disabled
    if (isDisabled) return;

    // Respect current mode
    if (currentMode === "none") {
      clearUnderlines(el);
      issueMap.delete(el);
      localIssueMap.delete(el);
      return;
    }

    const text = getElementText(el);

    // A file-upload input can start out empty (and get legitimately monitored while empty)
    // and only take on its browser-masked "C:\fakepath\<filename>" value later, once the user
    // actually picks a file — after the element is already being monitored, the findEditables()
    // discovery-time check for this same pattern doesn't get a second chance to run. Catch it
    // here too, at every check, so a file selection made after monitoring started still doesn't
    // get treated as prose.
    if (el.tagName === "INPUT" && /^[A-Za-z]:\\fakepath\\/i.test(text)) {
      clearUnderlines(el);
      issueMap.delete(el);
      localIssueMap.delete(el);
      return;
    }

    if (text.length > MAX_CHECK_LENGTH) {
      clearUnderlines(el);
      issueMap.delete(el);
      localIssueMap.delete(el);
      return;
    }
    if (!text || text.trim().length < MIN_TEXT_LENGTH) {
      clearUnderlines(el);
      issueMap.delete(el);
      localIssueMap.delete(el);
      lastCheckedText.delete(el);
      return;
    }

    // Skip if text hasn't changed since last check
    if (lastCheckedText.get(el) === text) return;

    console.log(`[ProsePilot] Checking text (${text.length} chars): "${text.substring(0, 80)}..."`);
    const rawIssues = await checkText(text);

    // The live text can change while this check was in flight — the DeepSeek/LanguageTool
    // round trip (0.5-2+ seconds) routinely takes longer than the debounce window (300ms),
    // so a newer check for more recent text can start, finish, and already mutate the DOM
    // (e.g. auto-applying an earlier accepted fix) before this older one resolves.
    // Rendering issues computed against stale text is worse than a no-op: issue.original
    // may no longer exist verbatim in the DOM at all (previously showed up as a confusing
    // "Could not find text node containing" warning with nothing rendered), or could even
    // match the wrong occurrence of a short/common string that reappeared elsewhere. Bail
    // out entirely once the text has moved on — a newer check already superseded this one,
    // so nothing is actually lost by discarding it.
    if (getElementText(el) !== text) {
      console.log("[ProsePilot] Discarding stale check result — text changed while checking");
      return;
    }

    // Drop anything the user has told us to stop flagging (e.g. a proper noun that isn't
    // actually a spelling mistake) — applies to every future check, not just this element.
    const issues = rawIssues.filter((i) => !isIgnored(i.original));
    issueMap.set(el, issues);
    lastCheckedText.set(el, text);

    console.log(`[ProsePilot] Mode: ${currentMode}, Issues found: ${issues.length}`, issues);

    // Auto-correct mode was removed entirely (see REMOVE_AUTO_MODE note near currentMode's
    // declaration) — every issue is now shown as a clickable underline/badge and the user
    // explicitly accepts or skips each one via showSuggestionPopup / showIssueListPopup.
    // Nothing ever edits the live text without that explicit click, which eliminates the
    // whole class of bugs the old auto-apply path kept hitting: caret jumping mid-type,
    // offset drift from stale snapshots, and duplicate overlapping edits from two tiers
    // flagging the same fix. Anything reaching this point has already passed the
    // stale-text guard above, and wrapIssuesInSpans/renderUnderlines fail gracefully (skip,
    // don't corrupt) for any individual issue that still doesn't match by the time it runs.
    renderMerged(el);
  }, DEBOUNCE_MS);

  // Combines the AI/LanguageTool tier's issues (issueMap) with the local spellcheck tier's
  // issues (localIssueMap) into the single list renderUnderlines actually draws. The two
  // tiers run on independent timers (local is much faster), so this is the one place their
  // output comes together rather than each tier fighting the other's render.
  //
  // Dedup is by matched text, not position — simpler than reconciling offsets between two
  // independently-computed checks, and sufficient here since the only failure mode being
  // guarded against is "the same misspelled word gets two underlines" (one from each tier),
  // not subtly-different spans. The AI tier always wins a duplicate: it's slower but sees
  // full context, so if it's already flagged a word the faster-but-dumber local guess adds
  // nothing.
  function renderMerged(el) {
    const remoteIssues = issueMap.get(el) || [];
    const localIssues = localIssueMap.get(el) || [];
    const remoteWords = new Set(remoteIssues.map((i) => i.original.toLowerCase()));
    const merged = remoteIssues.concat(localIssues.filter((i) => !remoteWords.has(i.original.toLowerCase())));
    renderUnderlines(el, merged);
  }

  // ==================== ELEMENT OBSERVER ====================

  function observeElement(el) {
    if (monitored.has(el)) return;
    monitored.add(el);

    // Diagnostic: log what the element contains
    const diagText = el.innerText || el.textContent || "(empty)";
    const diagLen = diagText.length;
    console.log(`[ProsePilot] Monitoring ${el.tagName} ce=${el.contentEditable} h=${el.offsetHeight} text="${diagText.substring(0, 60)}" len=${diagLen}`);

    el.addEventListener("input", () => { triggerCheck(el); triggerLocalCheck(el); });
    el.addEventListener("keyup", (e) => {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)) {
        triggerCheck(el);
        triggerLocalCheck(el);
      }
    });

    // Focus/blur — just track focused element
    el.addEventListener("focus", () => {
      focusedElement = el;
    });
    el.addEventListener("blur", () => {
      setTimeout(() => {
        if (document.activeElement === document.body) {
          focusedElement = null;
        }
      }, 300);
    });

    // For contentEditable, observe DOM mutations (but debounce aggressively)
    if (el.contentEditable === "true" || el.contentEditable === "") {
      const observer = new MutationObserver(() => {
        if (!isRenderingUnderlines && !isAutoCorrecting) { triggerCheck(el); triggerLocalCheck(el); }
      });
      observer.observe(el, { childList: true, subtree: true, characterData: true });

      // KEY FIX: Trigger an initial check after a short delay
      // This catches text that was already present before the listener was attached
      setTimeout(() => {
        if (isDisabled || currentMode === "none") return;
        const text = getElementText(el);
        if (text && text.trim().length >= MIN_TEXT_LENGTH && lastCheckedText.get(el) !== text) {
          triggerCheck(el);
        }
        if (text && text.trim().length >= MIN_TEXT_LENGTH) {
          triggerLocalCheck(el);
        }
      }, 1000);
    }
  }

  // ==================== INITIALIZE ====================

  // Detect if an element is an editable text field
  //
  // This is the focus-driven counterpart to findEditables()'s querySelectorAll scan (see
  // "KEY fix for Outlook" below) — it has to apply the *same* exclusions, or anything that
  // gets to it via a focusin event bypasses every filter findEditables() already enforces.
  // Real bug report: a YottaReal "DBA" picker (a disabled/read-only combobox input showing
  // "Cherry Creek") and a WebForms <input type="submit" value="Generate Report"> button were
  // both getting focused, waved through as "editable", and grammar-checked as if their
  // display value were prose the user had typed — hence "Sentences should end with a
  // period" on a button label.
  function isEditable(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName;
    if (tag === "TEXTAREA" || tag === "INPUT") {
      if (el.readOnly || el.disabled) return false;
      if (tag === "INPUT") {
        // Mirror findEditables()'s "input[type='text'], input:not([type])" selectors —
        // buttons, submits, checkboxes, files, etc. are never user-authored prose.
        const typeAttr = el.getAttribute("type");
        const type = typeAttr ? typeAttr.toLowerCase() : null;
        if (type !== null && type !== "text") return false;
        if (/^[A-Za-z]:\\fakepath\\/i.test(el.value || "")) return false;
        if (isSearchBox(el)) return false;
      }
      return true;
    }
    const ce = el.getAttribute("contenteditable");
    if (ce === "true" || ce === "" || ce === "plaintext-only") return true;
    if (el.getAttribute("role") === "textbox") return true;
    return false;
  }

  // Walk up from target to find the closest editable container (crosses shadow DOM boundaries)
  function findClosestEditable(target) {
    let el = target;
    while (el && el !== document.body && el !== document.documentElement) {
      if (isEditable(el)) return el;
      // Try parentElement first (normal DOM)
      if (el.parentElement) {
        el = el.parentElement;
      } else if (el.parentNode && el.parentNode.nodeType === 11) {
        // We're inside a shadow root — jump to the host element
        el = el.parentNode.host;
      } else {
        break;
      }
    }
    return null;
  }

  async function init() {
    injectStyles();
    await loadMode();
    await loadIgnoredWords();

    // Load cached Clerk token from storage
    try {
      const tokenResult = await chrome.storage.local.get("prosepilot_clerk_token");
      clerkToken = tokenResult.prosepilot_clerk_token || null;
    } catch (e) { /* ignore */ }

    if (isDisabled) return;

    // Find and monitor existing editable elements
    const editables = findEditables();
    editables.forEach(observeElement);

    // Method 2: MutationObserver for new elements
    bodyObserver = new MutationObserver(() => {
      if (isDisabled) {
        if (bodyObserver) { bodyObserver.disconnect(); bodyObserver = null; }
        return;
      }
      findEditables().forEach(observeElement);
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });

    // Method 3: Document-level event delegation (catches shadow DOM elements)
    // This is the KEY fix for Outlook — shadow DOM elements aren't found by querySelectorAll
    document.addEventListener("focusin", (e) => {
      if (isDisabled) return;
      const editable = findClosestEditable(e.target);
      if (editable && !monitored.has(editable)) {
        observeElement(editable);
        // Trigger a check after a short delay (text may already be present)
        setTimeout(() => {
          const text = getElementText(editable);
          if (text && text.trim().length >= MIN_TEXT_LENGTH) {
            triggerCheck(editable);
            triggerLocalCheck(editable);
          }
        }, 500);
      }
    }, true); // Use capture to fire before Outlook's handlers

    // Method 4: Periodic scan as fallback (every 3 seconds)
    periodicScanIntervalId = setInterval(() => {
      if (isDisabled) {
        if (periodicScanIntervalId) { clearInterval(periodicScanIntervalId); periodicScanIntervalId = null; }
        return;
      }
      findEditables().forEach(observeElement);
      // Also re-scan for elements in shadow DOMs
      document.querySelectorAll("*").forEach((el) => {
        if (el.shadowRoot) {
          el.shadowRoot.querySelectorAll("[contenteditable='true'], [contenteditable=''], textarea, input[type='text']").forEach((shadowEl) => {
            if (!monitored.has(shadowEl) && isVisible(shadowEl) && isLargeEnough(shadowEl)) {
              observeElement(shadowEl);
            }
          });
        }
      });
    }, 3000);

    // Listen for mode changes and re-enable from popup
    try {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === "setMode") {
          saveMode(msg.mode);
          lastCheckedText.delete(focusedElement);
          if (focusedElement) { triggerCheck(focusedElement); triggerLocalCheck(focusedElement); }
        } else if (msg.action === "enable") {
          isDisabled = false;
          chrome.storage.local.remove(DISABLED_KEY);
          findEditables().forEach(observeElement);
          showToast("ProsePilot enabled");
          // Re-check focused element with fresh text
          if (focusedElement) {
            lastCheckedText.delete(focusedElement);
            triggerCheck(focusedElement);
            triggerLocalCheck(focusedElement);
          }
        } else if (msg.action === "disable") {
          isDisabled = true;
          chrome.storage.local.set({ [DISABLED_KEY]: true });
          // Clear underlines on every element we can currently find, then drop both issue
          // WeakMaps and start fresh. (Previously this did `for (const [el] of issueMap)` and
          // `issueMap.clear()` — WeakMap supports neither iteration nor .clear(), so this threw
          // a TypeError on every single click of "disable" in the popup.)
          findEditables().forEach((el) => clearUnderlines(el));
          if (focusedElement) clearUnderlines(focusedElement);
          issueMap = new WeakMap();
          localIssueMap = new WeakMap();
          hideIcon();
        }
      });
    } catch (e) {
      // Extension context may be invalidated
    }
  }

  // Run when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // ==================== UTILITIES ====================

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
})();
