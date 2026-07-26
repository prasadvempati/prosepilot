// ProsePilot Background Service Worker

chrome.runtime.onInstalled.addListener(() => {
  // Create context menu
  chrome.contextMenus.create({
    id: "prosepilot-check",
    title: "Check grammar with ProsePilot",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "prosepilot-check") {
    // Send message to content script
    chrome.tabs.sendMessage(tab.id, { action: "getSelection" }, (response) => {
      const text = response?.text;
      if (text) {
        // Open popup with the text
        chrome.action.openPopup();
      }
    });
  }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "checkSelection") {
    chrome.action.openPopup();
  }
  return true;
});
