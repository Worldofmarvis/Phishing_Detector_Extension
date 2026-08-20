// popup.js

const verdictIconEl = document.getElementById("verdict-icon");
const verdictText = document.getElementById("verdict-text");
const riskLevelLabel = document.getElementById("risk-level-label");
const needleGroup = document.getElementById("needle-group");
const reasonsList = document.getElementById("reasons-list");

// 5-level risk scale. Angle matches the gauge segment centers (see gauge SVG).
const RISK_LEVELS = [
  { max: 10, level: 1, label: "Very Low Risk", color: "#2e7d32", angle: -72, category: "safe" },
  { max: 25, level: 2, label: "Low Risk", color: "#8bc34a", angle: -36, category: "safe" },
  { max: 45, level: 3, label: "Moderate Risk", color: "#fdd835", angle: 0, category: "caution" },
  { max: 65, level: 4, label: "High Risk", color: "#fb8c00", angle: 36, category: "danger" },
  { max: Infinity, level: 5, label: "Severe Risk", color: "#e53935", angle: 72, category: "danger" }
];

function getRiskLevel(score) {
  return RISK_LEVELS.find(r => score < r.max) || RISK_LEVELS[RISK_LEVELS.length - 1];
}

// Simple inline icon set, swapped based on category instead of a plain checkmark
const ICONS = {
  safe: `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5l-8-3z"/>
    <path d="M9 12l2 2 4-4"/>
  </svg>`,
  caution: `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5l-8-3z"/>
    <line x1="12" y1="8" x2="12" y2="13"/>
    <circle cx="12" cy="16.5" r="0.5" fill="white"/>
  </svg>`,
  danger: `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10.3 3.86 1.82 18a1 1 0 0 0 .87 1.5h18.62a1 1 0 0 0 .87-1.5L13.7 3.86a1 1 0 0 0-1.74 0Z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <circle cx="12" cy="16.5" r="0.5" fill="white"/>
  </svg>`
};

const CATEGORY_BG = { safe: "#2e7d32", caution: "#f9a825", danger: "#c62828" };
const CATEGORY_TEXT = { safe: "This site looks safe", caution: "Proceed with caution", danger: "This site looks dangerous" };

function getResultWithRetry(tabId, attemptsLeft, callback) {
  chrome.runtime.sendMessage({ type: "GET_RESULT", tabId }, result => {
    if (result || attemptsLeft <= 0) {
      callback(result);
    } else {
      setTimeout(() => getResultWithRetry(tabId, attemptsLeft - 1, callback), 200);
    }
  });
}

function renderUnscannable(url) {
  verdictIconEl.style.background = "#757575";
  verdictIconEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="9"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <circle cx="12" cy="16" r="0.5" fill="white"/>
  </svg>`;
  verdictText.textContent = "This page can't be scanned";
  riskLevelLabel.textContent = "Browser or internal pages aren't checked";
  reasonsList.innerHTML = "";
  const li = document.createElement("li");
  li.className = "muted";
  li.textContent = "Try this on a regular website (http/https).";
  reasonsList.appendChild(li);
}

function render(result) {
  const risk = getRiskLevel(result.score);

  verdictIconEl.style.background = CATEGORY_BG[risk.category];
  verdictIconEl.innerHTML = ICONS[risk.category];
  verdictText.textContent = CATEGORY_TEXT[risk.category];
  riskLevelLabel.textContent = `${risk.label} · Score ${result.score}`;

  needleGroup.setAttribute("transform", `rotate(${risk.angle} 100 95)`);

  reasonsList.innerHTML = "";
  if (result.reasons.length === 0) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "No issues found.";
    reasonsList.appendChild(li);
  } else {
    result.reasons.forEach(reason => {
      const li = document.createElement("li");
      li.textContent = reason;
      reasonsList.appendChild(li);
    });
  }
}

chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
  const tab = tabs[0];
  if (!tab) return;

  const scannable = tab.url && (tab.url.startsWith("http") || tab.url.startsWith("file"));
  if (!scannable) {
    renderUnscannable(tab.url);
    return;
  }

  getResultWithRetry(tab.id, 6, result => {
    if (result) {
      render(result);
    } else {
      // Genuinely nothing detected after retries on a scannable page — default to safe, not an error message
      render({ score: 0, reasons: [], verdict: "safe" });
    }
  });
});
