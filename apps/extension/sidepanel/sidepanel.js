const API_BASE = "https://prosepilot.io";

const checkBtn = document.getElementById('checkBtn');
const status = document.getElementById('status');
const loading = document.getElementById('loading');
const results = document.getElementById('results');
const voiceScoreSection = document.getElementById('voiceScoreSection');

async function checkSelection() {
  status.textContent = "Getting selection...";
  status.className = "status ready";
  loading.style.display = "block";
  results.style.display = "none";
  voiceScoreSection.style.display = "none";
  
  try {
    // Get selected text from the active tab
    const text = await getSelectedText();
    
    if (!text || text.trim().length === 0) {
      status.textContent = "No text selected. Select text first.";
      status.className = "status error";
      loading.style.display = "none";
      return;
    }
    
    status.textContent = `Checking ${text.length} characters...`;
    status.className = "status info";
    
    // Call ProsePilot API
    const response = await fetch(`${API_BASE}/v1/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, mode: "review" }),
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    loading.style.display = "none";
    
    // Display Voice Preservation Score
    if (data.voicePreservation) {
      renderVoicePreservation(data.voicePreservation);
    }
    
    // Display issues
    if (data.issues && data.issues.length > 0) {
      status.textContent = `Found ${data.issues.length} issue${data.issues.length !== 1 ? 's' : ''} — click to accept`;
      status.className = "status info";
      renderIssues(data.issues);
    } else {
      status.textContent = "No issues found!";
      status.className = "status ready";
      results.innerHTML = '<div class="issue" style="background:#ecfdf5;color:#065f46;">Your text looks great!</div>';
      results.style.display = "block";
      
      // Still show voice score for clean text
      if (data.voicePreservation) {
        renderVoicePreservation(data.voicePreservation);
      }
    }
  } catch (err) {
    loading.style.display = "none";
    status.textContent = "Error: " + err.message;
    status.className = "status error";
  }
}

async function getSelectedText() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "getSelection" }, (response) => {
      if (chrome.runtime.lastError) {
        resolve("");
        return;
      }
      if (response && response.error) {
        resolve("");
        return;
      }
      resolve(response?.text || "");
    });
  });
}

function renderVoicePreservation(vp) {
  const section = document.getElementById('voiceScoreSection');
  const badge = section.querySelector('.voice-badge');
  
  if (!section || !badge) return;
  
  const score = Math.round(vp.score * 100);
  const grammarlyScore = Math.max(0, Math.round(100 - (vp.factors.contractionChanges * 5 + vp.factors.passiveToActive * 8 + vp.factors.sentenceRestructuring * 6 + vp.factors.formalityShifts * 5 + vp.factors.vocabularySubstitutions * 3)));
  
  section.style.display = "block";
  badge.textContent = score + "%";
  
  // Color gradient based on score
  if (score >= 90) {
    badge.style.background = "linear-gradient(135deg,#059669 0%,#10b981 100%)";
  } else if (score >= 75) {
    badge.style.background = "linear-gradient(135deg,#d97706 0%,#f59e0b 100%)";
  } else {
    badge.style.background = "linear-gradient(135deg,#dc2626 0%,#ef4444 100%)";
  }
  
  // Update the comparison text
  const label = section.querySelector('p');
  if (label) {
    label.textContent = `Most tools would change ~${100 - grammarlyScore}% of your voice`;
  }
  
  // Factor breakdown
  const factorsContainer = document.getElementById('voiceScoreFactors');
  if (factorsContainer) {
    const factorData = [
      { key: "contractionChanges", label: "Contractions", color: "#8b5cf6" },
      { key: "passiveToActive", label: "Passive→Active", color: "#f97316" },
      { key: "sentenceRestructuring", label: "Restructuring", color: "#ec4899" },
      { key: "formalityShifts", label: "Formality", color: "#6366f1" },
      { key: "vocabularySubstitutions", label: "Vocab", color: "#14b8a6" },
    ];
    
    factorsContainer.innerHTML = factorData
      .filter(f => vp.factors[f.key] > 0)
      .map(f => `
        <span style="background:${f.color}22;border:1px solid ${f.color}55;color:${f.color};padding:2px 8px;border-radius:999px;display:flex;align-items:center;gap:4px;">
          ${f.label}: ${vp.factors[f.key]}
        </span>
      `).join("") || '<span style="color:#6b7280;font-size:10px;">No voice-altering changes</span>';
  }
}

function renderIssues(issues) {
  const container = document.getElementById('results');
  container.style.display = "block";
  
  container.innerHTML = issues.map(issue => `
    <div class="issue" data-id="${issue.id}">
      <span class="category">${issue.category}</span>
      <span class="original">${escapeHtml(issue.original)}</span>
      <span class="arrow">&rarr;</span>
      <span class="replacement">${escapeHtml(issue.replacement)}</span>
      <div class="explanation">${escapeHtml(issue.explanation)}</div>
      <div class="actions">
        <button class="btn-accept" data-action="accept" data-id="${issue.id}">Accept</button>
        <button class="btn-reject" data-action="reject" data-id="${issue.id}">Skip</button>
      </div>
    </div>
  `).join("");
  
  // Add event listeners
  container.querySelectorAll('.issue .actions button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (action === 'accept') acceptIssue(id);
      else if (action === 'reject') rejectIssue(id);
    });
  });
}

async function acceptIssue(id) {
  const issue = currentIssues.find(i => i.id === id);
  if (!issue || issue.status !== "pending") return;
  
  const btn = document.querySelector(`#issue-${id} .btn-accept`);
  if (btn) { btn.disabled = true; btn.textContent = "Applying..."; }
  
  try {
    // Send to content script to apply fix
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error("No active tab");
    
    chrome.tabs.sendMessage(tab.id, { 
      action: "applyFix", 
      original: issue.original, 
      replacement: issue.replacement 
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("Runtime error:", chrome.runtime.lastError);
      }
      if (response?.success) {
        issue.status = "accepted";
        renderIssues(currentIssues);
        status.textContent = `Applied: ${issue.original} → ${issue.replacement}`;
        status.className = "status ready";
      } else {
        if (btn) { btn.disabled = false; btn.textContent = "Accept"; }
        status.textContent = "Could not apply: " + (response?.reason || "text not found");
        status.className = "status error";
      }
    });
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = "Accept"; }
    status.textContent = "Error: " + err.message;
    status.className = "status error";
  }
}

function rejectIssue(id) {
  const issue = currentIssues.find(i => i.id === id);
  if (!issue) return;
  issue.status = "rejected";
  renderIssues(currentIssues);
  
  const pending = currentIssues.filter(i => i.status === "pending").length;
  status.textContent = `Skipped. ${pending} remaining.`;
  status.className = "status info";
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? "" : String(text);
  return div.innerHTML;
}

// Global functions for inline handlers
window.acceptIssue = acceptIssue;
window.rejectIssue = rejectIssue;

// Initialize
document.getElementById('checkBtn').addEventListener('click', checkSelection);

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "showIssues") {
    if (message.issues && message.issues.length > 0) {
      renderIssues(message.issues);
      status.textContent = `Found ${message.issues.length} issue(s)`;
      status.className = "status info";
      
      if (message.voicePreservation) {
        renderVoicePreservation(message.voicePreservation);
      }
    } else {
      results.innerHTML = '<div class="issue" style="background:#ecfdf5;color:#065f46;">Your text looks great!</div>';
      results.style.display = "block";
      status.textContent = "No issues found!";
      status.className = "status ready";
      
      if (message.voicePreservation) {
        renderVoicePreservation(message.voicePreservation);
      }
    }
  }
});