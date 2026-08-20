// background.js
importScripts("utils/heuristics.js");

let blocklistDomains = [];

// Load the local blocklist once when the service worker starts
fetch(chrome.runtime.getURL("data/blocklist.json"))
  .then(res => res.json())
  .then(data => {
    blocklistDomains = data.domains || [];
  })
  .catch(err => console.error("Failed to load blocklist:", err));

// Store the latest result per tab so the popup can read it
const tabBaseResults = {};   // from URL heuristics + blocklist
const tabContentSignals = {}; // from content.js, keyed by tabId
const notifiedPages = {};     // tracks "tabId::url" pairs already alerted, to avoid duplicate spam

function maybeAlertDangerous(tabId, combined) {
  if (!combined || combined.verdict !== "dangerous") return;

  const key = `${tabId}::${combined.url}`;
  if (notifiedPages[key]) return; // already warned about this exact page load
  notifiedPages[key] = true;

  // 1. Native system notification
  chrome.notifications.create(`phishing-${tabId}-${Date.now()}`, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "⚠️ Dangerous site detected",
    message: combined.reasons.slice(0, 3).join(" • "),
    priority: 2
  });

  // 2. In-page banner, sent to the already-injected content script
  chrome.tabs.sendMessage(tabId, { type: "SHOW_WARNING", result: combined }, () => {
    if (chrome.runtime.lastError) {
      // content script may not be ready yet on very fast redirects; safe to ignore
    }
  });
}

function computeCombined(tabId) {
  const base = tabBaseResults[tabId];
  if (!base) return null;

  const contentSignals = tabContentSignals[tabId] || [];
  const totalScore = base.score + contentSignals.length * 15;
  const reasons = [...base.reasons, ...contentSignals];

  let verdict = "safe";
  if (totalScore >= 50) verdict = "dangerous";
  else if (totalScore >= 20) verdict = "suspicious";

  return { url: base.url, score: totalScore, reasons, verdict };
}

function isDomainBlocklisted(hostname) {
  return blocklistDomains.some(
    blocked => hostname === blocked || hostname.endsWith("." + blocked)
  );
}

function updateBadge(tabId, verdict) {
  const badgeMap = {
    dangerous: { text: "!", color: "#e53935" },
    suspicious: { text: "?", color: "#fb8c00" },
    safe: { text: "", color: "#43a047" }
  };
  const config = badgeMap[verdict] || badgeMap.safe;
  chrome.action.setBadgeText({ tabId, text: config.text });
  chrome.action.setBadgeBackgroundColor({ tabId, color: config.color });
}

function evaluateUrl(url, tabId) {
  if (!url || (!url.startsWith("http") && !url.startsWith("file"))) return;

  const previous = tabBaseResults[tabId];
  if (!previous || previous.url !== url) {
    // Genuinely new page load for this tab — clear out old content signals
    tabContentSignals[tabId] = [];
  }

  const heuristicResult = analyzeUrl(url);
  const hostname = new URL(url).hostname;
  const blocklisted = isDomainBlocklisted(hostname);

  if (blocklisted) {
    heuristicResult.score += 100;
    heuristicResult.verdict = "dangerous";
    heuristicResult.reasons.unshift("Domain matches a known phishing blocklist entry");
  }

  tabBaseResults[tabId] = { url, ...heuristicResult };

  const combined = computeCombined(tabId);
  updateBadge(tabId, combined.verdict);
  maybeAlertDangerous(tabId, combined);
}

// Fires when navigation completes (top-level frame)
chrome.webNavigation.onCommitted.addListener(details => {
  console.log("[Phishing Detector] onCommitted:", details.url, "frameId:", details.frameId);
  if (details.frameId === 0) {
    evaluateUrl(details.url, details.tabId);
  }
});

// Also catch tab updates (covers SPA/history changes some cases miss)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    console.log("[Phishing Detector] tabs.onUpdated complete:", tab.url);
    evaluateUrl(tab.url, tabId);
  }
});

chrome.tabs.onRemoved.addListener(tabId => {
  delete tabBaseResults[tabId];
  delete tabContentSignals[tabId];
  Object.keys(notifiedPages).forEach(key => {
    if (key.startsWith(`${tabId}::`)) delete notifiedPages[key];
  });
});

// Let content.js send page-level findings (login form mismatch, etc.)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "PAGE_SIGNALS" && sender.tab) {
    const tabId = sender.tab.id;
    if (!tabContentSignals[tabId]) tabContentSignals[tabId] = [];

    // Avoid piling up duplicate signals if content.js fires more than once
    message.signals.forEach(signal => {
      if (!tabContentSignals[tabId].includes(signal)) {
        tabContentSignals[tabId].push(signal);
      }
    });

    const combined = computeCombined(tabId);
    console.log("[Phishing Detector] PAGE_SIGNALS merged, combined result:", combined);
    if (combined) {
      updateBadge(tabId, combined.verdict);
      maybeAlertDangerous(tabId, combined);
    }
    return false;
  }

  if (message.type === "CLOSE_TAB" && sender.tab) {
    chrome.tabs.remove(sender.tab.id);
    return false;
  }

  if (message.type === "GET_RESULT") {
    sendResponse(computeCombined(message.tabId));
    return true; // async-style response, keep channel open
  }
});
