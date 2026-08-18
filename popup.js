// popup.js

const verdictBox = document.getElementById("verdict-box");
const verdictIcon = document.getElementById("verdict-icon");
const verdictText = document.getElementById("verdict-text");
const scoreValue = document.getElementById("score-value");
const reasonsList = document.getElementById("reasons-list");

const VERDICT_DISPLAY = {
  safe: { icon: "✓", text: "This site looks safe" },
  suspicious: { icon: "⚠", text: "This site looks suspicious" },
  dangerous: { icon: "✕", text: "This site looks dangerous" }
};

function render(result) {
  if (!result) {
    verdictText.textContent = "No data yet — try reloading the page.";
    return;
  }

  const display = VERDICT_DISPLAY[result.verdict] || VERDICT_DISPLAY.safe;

  verdictBox.className = "verdict " + result.verdict;
  verdictIcon.textContent = display.icon;
  verdictText.textContent = display.text;
  scoreValue.textContent = result.score;

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

  chrome.runtime.sendMessage({ type: "GET_RESULT", tabId: tab.id }, result => {
    render(result);
  });
});
