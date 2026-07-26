// ProsePilot Content Script
// Runs on every page to enable text selection and grammar checking

(function() {
  "use strict";

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getSelection") {
      const selection = window.getSelection();
      const text = selection ? selection.toString() : "";
      sendResponse({ text });
    }
    return true;
  });

  // Optional: Add floating button on text selection
  let floatingBtn = null;

  document.addEventListener("mouseup", (e) => {
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : "";

    if (text.length > 10) {
      showFloatingBtn(e.pageX, e.pageY);
    } else {
      hideFloatingBtn();
    }
  });

  function showFloatingBtn(x, y) {
    hideFloatingBtn();
    
    floatingBtn = document.createElement("div");
    floatingBtn.id = "prosepilot-btn";
    floatingBtn.innerHTML = `
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    `;
    floatingBtn.style.cssText = `
      position: absolute;
      left: ${x}px;
      top: ${y - 40}px;
      background: #6366f1;
      color: white;
      width: 32px;
      height: 32px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 999999;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;
    
    floatingBtn.addEventListener("click", () => {
      // Open popup or trigger check
      chrome.runtime.sendMessage({ action: "checkSelection" });
      hideFloatingBtn();
    });

    document.body.appendChild(floatingBtn);
  }

  function hideFloatingBtn() {
    if (floatingBtn) {
      floatingBtn.remove();
      floatingBtn = null;
    }
  }

  // Hide button when clicking elsewhere
  document.addEventListener("mousedown", (e) => {
    if (e.target.id !== "prosepilot-btn") {
      setTimeout(hideFloatingBtn, 100);
    }
  });
})();
