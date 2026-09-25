const API_BASE = "https://prosepilot.io";

// Kill switch: Rewrite was timing out in production (server-side DeepSeek timeout).
// Fixed by adding 60s timeout wrapper in callDeepSeekForRewrite (services/api/src/engine/grammar.ts)
// Flip back to true once resolved; no other code needs to change.
const REWRITE_FEATURE_ENABLED = true;

let currentIssues = [];
let selectedText = "";

// Global functions so onclick handlers work
window.acceptIssue = async function(id) {
  const issue = currentIssues.find(i => i.id === id);
  if (!issue || issue.status !== "pending") return;

  const btn = document.querySelector(`#issue-${id} .btn-accept`);
  if (btn) { btn.disabled = true; btn.textContent = "Applying..."; }

  try {
    const result = await applyFix(issue.original, issue.replacement);

    if (result.success) {
      issue.status = "accepted";
      const pending = currentIssues.filter(i => i.status === "pending").length;
      if (pending === 0) {
        document.getElementById("acceptAllBtn").style.display = "none";
      }
      document.getElementById("status").textContent = `Applied fix. ${pending} remaining.`;
      document.getElementById("status").className = "status ready";
      renderIssues();
    } else {
      if (btn) { btn.disabled = false; btn.textContent = "Accept"; }
      document.getElementById("status").textContent = "Could not find text: " + (result.reason || "unknown");
      document.getElementById("status").className = "status error";
    }
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = "Accept"; }
    document.getElementById("status").textContent = "Error: " + err.message;
    document.getElementById("status").className = "status error";
  }
};

window.rejectIssue = function(id) {
  const issue = currentIssues.find(i => i.id === id);
  if (!issue) return;
  issue.status = "rejected";

  const pending = currentIssues.filter(i => i.status === "pending").length;
  if (pending === 0) {
    document.getElementById("acceptAllBtn").style.display = "none";
  }

  document.getElementById("status").textContent = `Skipped. ${pending} remaining.`;
  document.getElementById("status").className = "status info";
  renderIssues();
};

document.addEventListener("DOMContentLoaded", async () => {
  // Check if ProsePilot is disabled
  const { prosepilot_disabled } = await chrome.storage.local.get("prosepilot_disabled");
  const disabledBanner = document.getElementById("disabledBanner");
  const checkBtn = document.getElementById("checkBtn");
  const acceptAllBtn = document.getElementById("acceptAllBtn");
  const settingsBtn = document.getElementById("settingsBtn");
  const signInBtn = document.getElementById("signInBtn");
  const turnOffBtn = document.getElementById("turnOffBtn");
  const status = document.getElementById("status");
  const loading = document.getElementById("loading");
  const results = document.getElementById("results");
  const rewriteSection = document.getElementById("rewriteSection");
  const rewriteBtn = document.getElementById("rewriteBtn");
  const rewriteTone = document.getElementById("rewriteTone");
  const rewritePreview = document.getElementById("rewritePreview");

  // Settings panel elements
  const settingsPanel = document.getElementById("settingsPanel");
  const closeSettingsBtn = document.getElementById("closeSettingsBtn");
  const addIgnoredWordBtn = document.getElementById("addIgnoredWordBtn");
  const newIgnoredWordInput = document.getElementById("newIgnoredWordInput");
  const saveIgnoredWordBtn = document.getElementById("saveIgnoredWordBtn");
  const cancelIgnoredWordBtn = document.getElementById("cancelIgnoredWordBtn");
  const ignoredWordsList = document.getElementById("ignoredWordsList");
  const addIgnoredWordForm = document.getElementById("addIgnoredWordForm");
  const reportIssueBtn = document.getElementById("reportIssueBtn");
  const privacyPolicyLink = document.getElementById("privacyPolicyLink");

  // Load ignored words
  async function loadIgnoredWords() {
    const { prosepilot_ignored_words } = await chrome.storage.local.get("prosepilot_ignored_words");
    return prosepilot_ignored_words || [];
  }

  // Render ignored words list
  async function renderIgnoredWords() {
    const words = await loadIgnoredWords();
    if (words.length === 0) {
      ignoredWordsList.innerHTML = '<div class="empty-ignored">No ignored words yet. Click + Add to add one.</div>';
      return;
    }
    ignoredWordsList.innerHTML = words.map(word => `
      <div class="ignored-word-item">
        <span class="ignored-word-text">${escapeHtml(word)}</span>
        <button class="ignored-word-delete" data-word="${escapeHtml(word)}" title="Remove">&times;</button>
      </div>
    `).join("");

    // Add delete handlers
    ignoredWordsList.querySelectorAll(".ignored-word-delete").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const word = btn.dataset.word;
        const words = await loadIgnoredWords();
        const filtered = words.filter(w => w !== word);
        await chrome.storage.local.set({ prosepilot_ignored_words: filtered });
        renderIgnoredWords();
        // Notify content scripts to update their ignored words
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          try {
            chrome.tabs.sendMessage(tab.id, { action: "updateIgnoredWords", words: filtered });
          } catch (e) { /* tab may not have content script */ }
        }
      });
    });
  }

  // Settings panel toggle
  settingsBtn.addEventListener("click", async () => {
    const isVisible = settingsPanel.style.display !== "none";
    settingsPanel.style.display = isVisible ? "none" : "block";
    if (!isVisible) {
      await renderIgnoredWords();
      addIgnoredWordForm.style.display = "none";
      addIgnoredWordInput.value = "";
    }
  });

  closeSettingsBtn.addEventListener("click", () => {
    settingsPanel.style.display = "none";
  });

  // Add ignored word flow
  addIgnoredWordBtn.addEventListener("click", () => {
    addIgnoredWordBtn.style.display = "none";
    addIgnoredWordForm.style.display = "flex";
    newIgnoredWordInput.focus();
  });

  cancelIgnoredWordBtn.addEventListener("click", () => {
    addIgnoredWordBtn.style.display = "block";
    addIgnoredWordForm.style.display = "none";
    newIgnoredWordInput.value = "";
  });

  saveIgnoredWordBtn.addEventListener("click", async () => {
    const word = newIgnoredWordInput.value.trim().toLowerCase();
    if (!word) return;
    const words = await loadIgnoredWords();
    if (!words.includes(word)) {
      words.push(word);
      await chrome.storage.local.set({ prosepilot_ignored_words: words });
      renderIgnoredWords();
      // Notify content scripts
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        try {
          chrome.tabs.sendMessage(tab.id, { action: "updateIgnoredWords", words });
        } catch (e) { /* tab may not have content script */ }
      }
    }
    addIgnoredWordBtn.style.display = "block";
    addIgnoredWordForm.style.display = "none";
    newIgnoredWordInput.value = "";
  });

  newIgnoredWordInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") saveIgnoredWordBtn.click();
    if (e.key === "Escape") cancelIgnoredWordBtn.click();
  });

  // Report issue button
  reportIssueBtn.addEventListener("click", () => {
    const issue = currentIssues.find(i => i.status === "pending");
    if (!issue) {
      status.textContent = "No pending issues to report";
      status.className = "status info";
      return;
    }
    // Open a pre-filled GitHub issue or email
    const body = `**Issue Type:** Incorrect suggestion\n\n**Original:** \`${issue.original}\`\n**Suggested:** \`${issue.replacement}\`\n**Rule:** ${issue.rule}\n**Category:** ${issue.category}\n\n**Context:** ${issue.explanation}`;
    const url = `https://github.com/prasadvempati/prosepilot/issues/new?title=${encodeURIComponent("Incorrect suggestion: " + issue.original)}&body=${encodeURIComponent(body)}`;
    chrome.tabs.create({ url });
  });

  // Privacy policy link - open in new tab
  privacyPolicyLink.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: "https://prosepilot.io/privacy.html" });
  });

  if (!REWRITE_FEATURE_ENABLED && rewriteSection) {
    rewriteSection.style.display = "none";
  }

  if (prosepilot_disabled) {
    disabledBanner.style.display = "block";
    checkBtn.style.display = "none";
    signInBtn.style.display = "none";
    settingsBtn.style.display = "none";
    turnOffBtn.style.display = "none";
    status.style.display = "none";
    if (rewriteSection) rewriteSection.style.display = "none";
  }

  // Re-enable button
  const reEnableBtn = document.getElementById("reEnableBtn");
  if (reEnableBtn) {
    reEnableBtn.addEventListener("click", async () => {
      await chrome.storage.local.remove("prosepilot_disabled");
      // Tell all content scripts to re-enable
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        try {
          chrome.tabs.sendMessage(tab.id, { action: "enable" });
        } catch (e) { /* tab may not have content script */ }
      }
      disabledBanner.style.display = "none";
      checkBtn.style.display = "";
      signInBtn.style.display = "";
      settingsBtn.style.display = "";
      status.style.display = "";
      if (rewriteSection && REWRITE_FEATURE_ENABLED) rewriteSection.style.display = "";
      status.textContent = "ProsePilot re-enabled!";
      status.className = "status ready";
    });
  }

  // Load current mode and set radio
  const { prosepilot_grammar_mode } = await chrome.storage.local.get("prosepilot_grammar_mode");
  // Auto-correct mode was removed — migrate anyone with the old "auto" preference already
  // saved to "suggest" rather than leaving it as a dead, unhandled value.
  let currentModeVal = prosepilot_grammar_mode || "suggest";
  if (currentModeVal === "auto") {
    currentModeVal = "suggest";
    chrome.storage.local.set({ prosepilot_grammar_mode: "suggest" });
  }
  console.log("[ProsePilot Popup] Current mode:", currentModeVal, "stored:", prosepilot_grammar_mode);

  // Set all radios unchecked first, then check the current one
  document.querySelectorAll('input[name="grammarMode"]').forEach((r) => {
    r.checked = false;
    const lbl = r.closest("label");
    if (lbl) lbl.style.background = "#f3f4f6";
  });

  const modeRadio = document.querySelector(`input[name="grammarMode"][value="${currentModeVal}"]`);
  if (modeRadio) {
    modeRadio.checked = true;
    const label = modeRadio.closest("label");
    if (label) {
      label.style.background = currentModeVal === "suggest" ? "#fef3c7" : "#fee2e2";
    }
    console.log("[ProsePilot Popup] Set radio:", currentModeVal, "checked:", modeRadio.checked);
  } else {
    console.warn("[ProsePilot Popup] Radio not found for value:", currentModeVal);
  }

  // Mode change handler
  document.querySelectorAll('input[name="grammarMode"]').forEach((radio) => {
    radio.addEventListener("change", async (e) => {
      const mode = e.target.value;
      await chrome.storage.local.set({ prosepilot_grammar_mode: mode });
      // Highlight selected label, unhighlight others
      document.querySelectorAll('input[name="grammarMode"]').forEach((r) => {
        const lbl = r.closest("label");
        if (lbl) {
          if (r.checked) {
            lbl.style.background = mode === "suggest" ? "#fef3c7" : "#fee2e2";
          } else {
            lbl.style.background = "#f3f4f6";
          }
        }
      });
      // Tell all content scripts about the mode change
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        try {
          chrome.tabs.sendMessage(tab.id, { action: "setMode", mode });
        } catch (e) { /* tab may not have content script */ }
      }
    });
  });

  // Inject content script on popup open (no host_permissions needed)
  chrome.runtime.sendMessage({ action: "injectContentScript" }, () => {});

  checkBtn.addEventListener("click", async () => {
    status.textContent = "Getting selection...";
    status.className = "status ready";
    loading.style.display = "none";
    results.style.display = "none";
    acceptAllBtn.style.display = "none";
    acceptAllBtn.disabled = false;
    acceptAllBtn.textContent = "Accept All Fixes";
    currentIssues = [];

    try {
      const text = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: "getSelection" }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (response && response.error) {
            reject(new Error(response.error));
            return;
          }
          resolve(response?.text || "");
        });
      });

      if (!text || text.trim().length === 0) {
        status.textContent = "No text selected. Select text first.";
        status.className = "status error";
        return;
      }

      selectedText = text;
      status.textContent = `Checking ${text.length} characters...`;
      status.className = "status ready";
      loading.style.display = "block";

      const { clerkToken } = await chrome.storage.local.get("clerkToken");
      const headers = { "Content-Type": "application/json" };
      if (clerkToken) headers["Authorization"] = `Bearer ${clerkToken}`;

      const res = await fetch(`${API_BASE}/v1/check`, {
        method: "POST",
        headers,
        body: JSON.stringify({ text, mode: "review" }),
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      loading.style.display = "none";

      // Display Voice Preservation Score
      if (data.voicePreservation) {
        renderVoicePreservation(data.voicePreservation);
      }

      if (data.issues && data.issues.length > 0) {
        currentIssues = data.issues.map((issue, i) => ({ ...issue, id: i, status: "pending" }));
        status.textContent = `Found ${data.issues.length} issue(s) — accept or reject each`;
        status.className = "status info";
        acceptAllBtn.style.display = "block";
        renderIssues();
      } else {
        status.textContent = "No issues found!";
        status.className = "status ready";
        results.innerHTML = '<div class="issue" style="background:#ecfdf5;color:#065f46;">Your text looks good!</div>';
        results.style.display = "block";
        
        // Still show voice score for clean text (it's 100%)
        if (data.voicePreservation) {
          renderVoicePreservation(data.voicePreservation);
        }
      }
    } catch (err) {
      loading.style.display = "none";
      status.textContent = "Error: " + err.message;
      status.className = "status error";
    }
  });

  if (rewriteBtn) {
    rewriteBtn.addEventListener("click", async () => {
      status.textContent = "Getting selection...";
      status.className = "status ready";
      rewritePreview.style.display = "none";
      rewritePreview.innerHTML = "";

      try {
        const text = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ action: "getSelection" }, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (response && response.error) {
              reject(new Error(response.error));
              return;
            }
            resolve(response?.text || "");
          });
        });

        if (!text || text.trim().length === 0) {
          status.textContent = "No text selected. Select text first.";
          status.className = "status error";
          return;
        }

        const tone = rewriteTone.value;
        status.textContent = "Rewriting...";
        status.className = "status info";
        rewriteBtn.disabled = true;

        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: "rewriteText", text, tone }, (res) => {
            if (chrome.runtime.lastError) {
              resolve({ error: chrome.runtime.lastError.message });
              return;
            }
            resolve(res || { error: "No response from ProsePilot." });
          });
        });

        rewriteBtn.disabled = false;

        if (!response || response.error || !response.result || typeof response.result.rewritten !== "string") {
          status.textContent = (response && response.error) || "Rewrite failed. Please try again.";
          status.className = "status error";
          return;
        }

        const result = response.result;
        status.textContent = "Review the rewrite below";
        status.className = "status info";

        const warningHtml = result.factMismatch
          ? `<div style="background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;border-radius:6px;padding:8px 10px;font-size:11px;margin-bottom:8px;line-height:1.4;">This rewrite may have changed a name, date, or number. Review carefully before applying.</div>`
          : "";

        rewritePreview.style.display = "block";
        rewritePreview.innerHTML = `
          ${warningHtml}
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:10px;margin-bottom:8px;white-space:pre-wrap;font-size:13px;line-height:1.5;color:#065f46;max-height:220px;overflow-y:auto;">${escapeHtml(result.rewritten)}</div>
          <div style="display:flex;gap:6px;">
            <button id="rewriteApplyBtn" style="flex:1;padding:8px 10px;border:none;border-radius:6px;background:#059669;color:white;font-size:12px;font-weight:500;cursor:pointer;">Apply</button>
            <button id="rewriteDiscardBtn" style="flex:1;padding:8px 10px;border:none;border-radius:6px;background:#f3f4f6;color:#374151;font-size:12px;font-weight:500;cursor:pointer;">Discard</button>
          </div>
        `;

        document.getElementById("rewriteApplyBtn").addEventListener("click", async () => {
          try {
            const applyResult = await applyFix(text, result.rewritten);
            if (applyResult.success) {
              status.textContent = "Rewrite applied.";
              status.className = "status ready";
              rewritePreview.style.display = "none";
              rewritePreview.innerHTML = "";
            } else {
              status.textContent = "Could not apply rewrite: " + (applyResult.reason || "selection may have changed");
              status.className = "status error";
            }
          } catch (err) {
            status.textContent = "Error applying rewrite: " + err.message;
            status.className = "status error";
          }
        });
        document.getElementById("rewriteDiscardBtn").addEventListener("click", () => {
          rewritePreview.style.display = "none";
          rewritePreview.innerHTML = "";
          status.textContent = "Rewrite discarded.";
          status.className = "status info";
        });
      } catch (err) {
        rewriteBtn.disabled = false;
        status.textContent = "Error: " + err.message;
        status.className = "status error";
      }
    });
  }

  acceptAllBtn.addEventListener("click", async () => {
    const pendingIssues = currentIssues.filter(i => i.status === "pending");
    if (pendingIssues.length === 0) return;

    acceptAllBtn.disabled = true;
    acceptAllBtn.textContent = "Applying...";

    let applied = 0;
    for (let i = 0; i < pendingIssues.length; i++) {
      const issue = pendingIssues[i];
      status.textContent = `Applying fix ${i + 1} of ${pendingIssues.length}...`;
      status.className = "status info";
      try {
        const result = await applyFix(issue.original, issue.replacement);
        if (result.success) {
          issue.status = "accepted";
          applied++;
        } else {
          issue.status = "failed";
        }
      } catch (err) {
        issue.status = "failed";
      }
      renderIssues();
    }

    status.textContent = pendingIssues.length === applied
      ? "All fixes applied"
      : `Applied ${applied} of ${pendingIssues.length} fix(es).`;
    status.className = applied > 0 ? "status ready" : "status error";
    acceptAllBtn.style.display = "none";
  });

  settingsBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://prosepilot.io" });
  });

  // Turn off ProsePilot
  if (turnOffBtn) {
    turnOffBtn.addEventListener("click", async () => {
      await chrome.storage.local.set({ prosepilot_disabled: true });
      // Tell all content scripts to disable
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        try {
          chrome.tabs.sendMessage(tab.id, { action: "disable" });
        } catch (e) { /* tab may not have content script */ }
      }
      disabledBanner.style.display = "block";
      checkBtn.style.display = "none";
      signInBtn.style.display = "none";
      settingsBtn.style.display = "none";
      turnOffBtn.style.display = "none";
      status.style.display = "none";
      results.style.display = "none";
      if (rewriteSection) rewriteSection.style.display = "none";
    });
  }

  // Clerk sign-in: open web app auth page
  if (signInBtn) {
    signInBtn.addEventListener("click", () => {
      chrome.tabs.create({ url: "https://prosepilot.io/sign-in" });
    });
  }
});

function renderIssues() {
  const results = document.getElementById("results");
  results.style.display = "block";

  results.innerHTML = currentIssues.map(issue => {
    if (issue.status === "accepted") {
      return `
        <div class="issue accepted" id="issue-${issue.id}">
          <div class="accepted-label">Applied</div>
          <span class="original">${escapeHtml(issue.original)}</span>
          <span class="arrow">&rarr;</span>
          <span class="replacement">${escapeHtml(issue.replacement)}</span>
        </div>`;
    }
    if (issue.status === "rejected" || issue.status === "failed") {
      const label = issue.status === "failed" ? "Not found" : "Skipped";
      return `
        <div class="issue rejected" id="issue-${issue.id}">
          <div class="rejected-label">${label}</div>
          <span class="original">${escapeHtml(issue.original)}</span>
          <span class="arrow">&rarr;</span>
          <span class="replacement">${escapeHtml(issue.replacement)}</span>
        </div>`;
    }
    return `
      <div class="issue" id="issue-${issue.id}">
        <span class="category">${escapeHtml(issue.category)}</span>
        <span class="original">${escapeHtml(issue.original)}</span>
        <span class="arrow">&rarr;</span>
        <span class="replacement">${escapeHtml(issue.replacement)}</span>
        <div class="explanation">${escapeHtml(issue.explanation)}</div>
        <div class="actions">
          <button class="btn-accept" data-action="accept" data-id="${issue.id}">Accept</button>
          <button class="btn-reject" data-action="reject" data-id="${issue.id}">Skip</button>
        </div>
      </div>`;
  }).join("");
}

// Event delegation for accept/reject buttons
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;
  const id = parseInt(btn.dataset.id, 10);

  if (action === "accept") window.acceptIssue(id);
  else if (action === "reject") window.rejectIssue(id);
});

function applyFix(original, replacement) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action: "applyFix", original, replacement },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response && response.error) {
          reject(new Error(response.error));
          return;
        }
        resolve(response || { success: false });
      }
    );
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text == null ? "" : String(text);
  return div.innerHTML;
}

function renderVoicePreservation(vp) {
  const section = document.getElementById("voiceScoreSection");
  const badge = document.getElementById("voiceScoreBadge");
  const label = document.getElementById("voiceScoreLabel");
  const factors = document.getElementById("voiceScoreFactors");
  
  if (!section || !badge || !label || !factors) return;
  
  const score = Math.round(vp.score * 100);
  const otherToolsScore = Math.max(0, Math.round(100 - (vp.factors.contractionChanges * 5 + vp.factors.passiveToActive * 8 + vp.factors.sentenceRestructuring * 6 + vp.factors.formalityShifts * 5 + vp.factors.vocabularySubstitutions * 3)));
  
  section.style.display = "block";
  badge.textContent = score;
  
  // Color gradient based on score
  if (score >= 90) {
    badge.style.background = "linear-gradient(135deg,#059669 0%,#10b981 100%)";
  } else if (score >= 75) {
    badge.style.background = "linear-gradient(135deg,#d97706 0%,#f59e0b 100%)";
  } else {
    badge.style.background = "linear-gradient(135deg,#dc2626 0%,#ef4444 100%)";
  }
  
  badge.textContent = score + "%";
  
  label.textContent = `Most tools would change ~${100 - otherToolsScore}% of your voice`;
  
  // Factor breakdown
  const factorData = [
    { key: "contractionChanges", label: "Contractions", color: "#8b5cf6" },
    { key: "passiveToActive", label: "Passive→Active", color: "#f97316" },
    { key: "sentenceRestructuring", label: "Restructuring", color: "#ec4899" },
    { key: "formalityShifts", label: "Formality", color: "#6366f1" },
    { key: "vocabularySubstitutions", label: "Vocab", color: "#14b8a6" },
  ];
  
  factors.innerHTML = factorData
    .filter(f => vp.factors[f.key] > 0)
    .map(f => `
      <span style="background:${f.color}22;border:1px solid ${f.color}55;color:${f.color};padding:2px 8px;border-radius:999px;display:flex;align-items:center;gap:4px;">
        ${f.label}: ${vp.factors[f.key]}
      </span>
    `).join("") || '<span style="color:#6b7280;font-size:10px;">No voice-altering changes</span>';
}
