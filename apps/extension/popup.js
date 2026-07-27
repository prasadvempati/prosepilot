const API_BASE = "https://prosepilot.io";

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

document.addEventListener("DOMContentLoaded", () => {
  const checkBtn = document.getElementById("checkBtn");
  const acceptAllBtn = document.getElementById("acceptAllBtn");
  const settingsBtn = document.getElementById("settingsBtn");
  const status = document.getElementById("status");
  const loading = document.getElementById("loading");
  const results = document.getElementById("results");

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

      const res = await fetch(`${API_BASE}/v1/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, mode: "review" }),
      });

      const data = await res.json();
      loading.style.display = "none";

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
      }
    } catch (err) {
      loading.style.display = "none";
      status.textContent = "Error: " + err.message;
      status.className = "status error";
    }
  });

  acceptAllBtn.addEventListener("click", async () => {
    const pendingIssues = currentIssues.filter(i => i.status === "pending");
    if (pendingIssues.length === 0) return;

    acceptAllBtn.disabled = true;
    acceptAllBtn.textContent = "Applying...";

    let applied = 0;
    for (const issue of pendingIssues) {
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
    }

    status.textContent = `Applied ${applied} of ${pendingIssues.length} fix(es).`;
    status.className = applied > 0 ? "status ready" : "status error";
    acceptAllBtn.style.display = "none";
    renderIssues();
  });

  settingsBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://prosepilot.io" });
  });
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
  div.textContent = text;
  return div.innerHTML;
}
