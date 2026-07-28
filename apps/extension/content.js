// ProsePilot Inline Grammar Checker — Content Script
// Runs on every page, finds editable elements, checks grammar as you type

(function () {
  "use strict";

  const API_BASE = "https://prosepilot.io";
  const DEBOUNCE_MS = 800;
  const MIN_TEXT_LENGTH = 20;

  // Track which elements we're monitoring
  const monitored = new WeakSet();
  // Track current issues per element
  const issueMap = new Map();
  // Track active popup
  let activePopup = null;

  // --- Find editable elements ---
  function findEditables() {
    const selectors = [
      "[contenteditable='true']",
      "[contenteditable='']",
      "textarea",
      "input[type='text']",
      "input:not([type])",
    ];
    const elements = [];
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach((el) => {
        if (!monitored.has(el) && isVisible(el) && isLargeEnough(el)) {
          elements.push(el);
        }
      });
    }
    return elements;
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
      return el.rows >= 2 || el.offsetHeight > 50;
    }
    return el.offsetHeight > 50;
  }

  function getElementText(el) {
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      return el.value;
    }
    return el.innerText || el.textContent || "";
  }

  function setElementText(el, text) {
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      el.value = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      el.innerText = text;
    }
  }

  // --- Debounce ---
  function debounce(fn, ms) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  // --- Grammar check via background ---
  async function checkText(text) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: "checkInline", text },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve([]);
            return;
          }
          resolve(response?.issues || []);
        }
      );
    });
  }

  // --- Render underlines ---
  function renderUnderlines(el, issues) {
    clearUnderlines(el);

    if (!issues || issues.length === 0) return;

    const text = getElementText(el);
    if (!text || text.trim().length === 0) return;

    // For textarea/input, we can't wrap text in spans easily
    // Use a different approach: show a floating indicator
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      showFloatingIndicator(el, issues);
      return;
    }

    // For contentEditable, wrap problematic text in spans
    try {
      wrapIssuesInSpans(el, issues);
    } catch (e) {
      // If wrapping fails (complex DOM), fall back to floating indicator
      showFloatingIndicator(el, issues);
    }
  }

  function clearUnderlines(el) {
    // Remove existing ProsePilot underlines
    el.querySelectorAll(".prosepilot-underline").forEach((span) => {
      const parent = span.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(span.textContent), span);
        parent.normalize();
      }
    });
    // Remove floating indicator
    const indicator = el.parentNode?.querySelector(".prosepilot-indicator");
    if (indicator) indicator.remove();
  }

  function wrapIssuesInSpans(el, issues) {
    // This is a simplified approach — for complex DOM structures,
    // we fall back to the floating indicator
    const text = getElementText(el);
    if (!text) return;

    // Sort issues by position
    const sorted = [...issues]
      .map((issue) => {
        const idx = text.indexOf(issue.original);
        return { ...issue, idx };
      })
      .filter((i) => i.idx !== -1)
      .sort((a, b) => a.idx - b.idx);

    if (sorted.length === 0) return;

    // Build new innerHTML with underlines
    let html = "";
    let lastIdx = 0;

    for (const issue of sorted) {
      // Add text before this issue
      html += escapeHtml(text.slice(lastIdx, issue.idx));
      // Add underlined issue
      const color =
        issue.category === "spelling"
          ? "#dc2626"
          : issue.category === "grammar"
            ? "#ea580c"
            : "#6366f1";
      html += `<span class="prosepilot-underline" data-issue-id="${issue.id}" style="text-decoration-color:${color};text-decoration-style:wavy;text-underline-offset:3px;cursor:pointer;background:rgba(99,102,241,0.08);border-radius:2px;padding:0 1px;">${escapeHtml(issue.original)}</span>`;
      lastIdx = issue.idx + issue.original.length;
    }

    // Add remaining text
    html += escapeHtml(text.slice(lastIdx));

    el.innerHTML = html;

    // Add click handlers to underlines
    el.querySelectorAll(".prosepilot-underline").forEach((span) => {
      span.addEventListener("click", (e) => {
        e.stopPropagation();
        const issueId = span.dataset.issueId;
        const issue = issues.find((i) => i.id === issueId);
        if (issue) showSuggestionPopup(span, issue, el);
      });
    });
  }

  function showFloatingIndicator(el, issues) {
    // Remove existing indicator
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

    // Position relative to the element
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

  function showSuggestionPopup(target, issue, editableEl) {
    hidePopup();

    const popup = document.createElement("div");
    popup.className = "prosepilot-popup";
    popup.innerHTML = `
      <div style="
        position:absolute;z-index:100001;
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
        <div style="display:flex;gap:6px;">
          <button class="prosepilot-accept" style="
            flex:1;padding:7px 12px;border:none;border-radius:6px;
            background:#059669;color:white;font-size:12px;font-weight:500;cursor:pointer;
          ">Accept</button>
          <button class="prosepilot-skip" style="
            flex:1;padding:7px 12px;border:none;border-radius:6px;
            background:#f3f4f6;color:#374151;font-size:12px;font-weight:500;cursor:pointer;
          ">Skip</button>
        </div>
      </div>
    `;

    document.body.appendChild(popup);
    activePopup = popup;

    // Position near the target
    const rect = target.getBoundingClientRect();
    const popupRect = popup.firstChild.getBoundingClientRect();
    let top = window.scrollY + rect.top - popupRect.height - 8;
    let left = window.scrollX + rect.left + (rect.width - popupRect.width) / 2;

    // Keep in viewport
    if (top < window.scrollY) top = window.scrollY + rect.bottom + 8;
    if (left < 8) left = 8;
    if (left + popupRect.width > window.innerWidth - 8)
      left = window.innerWidth - popupRect.width - 8;

    popup.firstChild.style.top = top + "px";
    popup.firstChild.style.left = left + "px";

    // Handlers
    popup.querySelector(".prosepilot-close").addEventListener("click", hidePopup);
    popup.querySelector(".prosepilot-skip").addEventListener("click", hidePopup);
    popup.querySelector(".prosepilot-accept").addEventListener("click", async () => {
      // Apply the fix
      const text = getElementText(editableEl);
      const idx = text.indexOf(issue.original);
      if (idx !== -1) {
        const newText =
          text.slice(0, idx) + issue.replacement + text.slice(idx + issue.original.length);
        setElementText(editableEl, newText);
      }
      hidePopup();
      // Re-check after applying
      setTimeout(() => triggerCheck(editableEl), 300);
    });

    // Close on click outside
    setTimeout(() => {
      document.addEventListener("click", hidePopup, { once: true });
    }, 10);
  }

  function showIssueListPopup(el, issues) {
    hidePopup();

    const popup = document.createElement("div");
    popup.className = "prosepilot-popup";

    const issuesHtml = issues
      .map(
        (issue) => `
      <div style="padding:8px;background:#f9fafb;border-radius:6px;margin-bottom:6px;border-left:3px solid ${
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
      </div>
    `
      )
      .join("");

    popup.innerHTML = `
      <div style="
        position:absolute;z-index:100001;
        background:white;border:1px solid #e5e7eb;border-radius:10px;
        padding:14px;box-shadow:0 8px 30px rgba(0,0,0,0.15);
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        font-size:13px;min-width:300px;max-width:400px;max-height:400px;overflow-y:auto;
      ">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <span style="font-weight:600;">ProsePilot — ${issues.length} issue(s)</span>
          <button class="prosepilot-close" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:18px;padding:0;line-height:1;">&times;</button>
        </div>
        ${issuesHtml}
      </div>
    `;

    document.body.appendChild(popup);
    activePopup = popup;

    // Position
    const rect = el.getBoundingClientRect();
    let top = window.scrollY + rect.bottom + 8;
    let left = window.scrollX + rect.left;

    popup.firstChild.style.top = top + "px";
    popup.firstChild.style.left = left + "px";

    popup.querySelector(".prosepilot-close").addEventListener("click", hidePopup);
    setTimeout(() => {
      document.addEventListener("click", hidePopup, { once: true });
    }, 10);
  }

  function hidePopup() {
    if (activePopup) {
      activePopup.remove();
      activePopup = null;
    }
  }

  // --- Check trigger ---
  const triggerCheck = debounce(async (el) => {
    const text = getElementText(el);
    if (!text || text.trim().length < MIN_TEXT_LENGTH) {
      clearUnderlines(el);
      issueMap.delete(el);
      return;
    }

    const issues = await checkText(text);
    issueMap.set(el, issues);
    renderUnderlines(el, issues);
  }, DEBOUNCE_MS);

  // --- Observe changes ---
  function observeElement(el) {
    monitored.add(el);

    // Listen for input events
    el.addEventListener("input", () => triggerCheck(el));
    el.addEventListener("keyup", (e) => {
      // Also check on arrow keys, space, etc.
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)) {
        triggerCheck(el);
      }
    });

    // For contentEditable, also observe DOM mutations
    if (el.contentEditable === "true" || el.contentEditable === "") {
      const observer = new MutationObserver(() => triggerCheck(el));
      observer.observe(el, { childList: true, subtree: true, characterData: true });
    }

    // Initial check
    triggerCheck(el);
  }

  // --- Initialize ---
  function init() {
    // Find and monitor existing editable elements
    findEditables().forEach(observeElement);

    // Watch for new editable elements
    const bodyObserver = new MutationObserver(() => {
      findEditables().forEach(observeElement);
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });
  }

  // Run when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // --- Utilities ---
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
})();
