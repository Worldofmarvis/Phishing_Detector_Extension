// content.js
// Runs inside the page. Looks for red flags only visible in the rendered DOM,
// which URL-only analysis can't catch.

function checkPageSignals() {
  const signals = [];
  const pageHost = window.location.hostname;

  // 1. Forms that submit to a totally different domain than the page itself
  document.querySelectorAll("form").forEach(form => {
    const action = form.getAttribute("action");
    if (action) {
      try {
        const actionUrl = new URL(action, window.location.href);
        if (actionUrl.hostname && actionUrl.hostname !== pageHost) {
          signals.push(`Login/form data is sent to a different domain (${actionUrl.hostname})`);
        }
      } catch (e) {
        // relative/invalid action, ignore
      }
    }
  });

  // 2. Password fields on a non-HTTPS page
  const hasPasswordField = document.querySelector('input[type="password"]') !== null;
  if (hasPasswordField && window.location.protocol !== "https:") {
    signals.push("Password field present on a non-HTTPS page");
  }

  // 3. Brand name mentioned in page text/title but domain doesn't match
  const brands = ["paypal", "google", "microsoft", "apple", "amazon", "facebook", "bankofamerica", "chase"];
  const pageText = (document.title + " " + document.body.innerText.slice(0, 2000)).toLowerCase();
  for (const brand of brands) {
    if (pageText.includes(brand) && !pageHost.includes(brand)) {
      signals.push(`Page mentions "${brand}" but the domain does not belong to that brand`);
      break; // one flag is enough, avoid spamming duplicates
    }
  }

  return signals;
}

console.log("[Phishing Detector] content.js running on:", window.location.href);

function showWarningBanner(result) {
  // Avoid injecting more than one banner
  if (document.getElementById("phishing-detector-banner")) return;

  const banner = document.createElement("div");
  banner.id = "phishing-detector-banner";
  banner.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 2147483647;
    background: #c62828;
    color: #ffffff;
    font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
    padding: 14px 18px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  `;

  const textWrap = document.createElement("div");

  const title = document.createElement("div");
  title.textContent = "⚠ Warning: This site shows signs of phishing";
  title.style.cssText = "font-weight: 700; font-size: 15px; margin-bottom: 4px;";
  textWrap.appendChild(title);

  const list = document.createElement("ul");
  list.style.cssText = "margin: 4px 0 0 0; padding-left: 18px; font-size: 13px; line-height: 1.5;";
  result.reasons.slice(0, 4).forEach(reason => {
    const li = document.createElement("li");
    li.textContent = reason;
    list.appendChild(li);
  });
  textWrap.appendChild(list);

  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display: flex; flex-direction: column; gap: 6px; flex-shrink: 0;";

  const leaveBtn = document.createElement("button");
  leaveBtn.type = "button";
  leaveBtn.textContent = "Leave This Site";
  leaveBtn.style.cssText = `
    background: #ffffff;
    border: none;
    color: #c62828;
    padding: 7px 14px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 700;
    white-space: nowrap;
  `;
  leaveBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: "CLOSE_TAB" });
  });

  const ignoreBtn = document.createElement("button");
  ignoreBtn.type = "button";
  ignoreBtn.textContent = "Ignore warning";
  ignoreBtn.style.cssText = `
    background: transparent;
    border: none;
    color: rgba(255,255,255,0.85);
    padding: 4px 6px;
    cursor: pointer;
    font-size: 11px;
    text-decoration: underline;
    white-space: nowrap;
  `;
  ignoreBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    banner.remove();
  });

  btnRow.appendChild(leaveBtn);
  btnRow.appendChild(ignoreBtn);

  banner.appendChild(textWrap);
  banner.appendChild(btnRow);
  banner.addEventListener("click", (e) => e.stopPropagation());
  banner.addEventListener("mousedown", (e) => e.stopPropagation());
  document.documentElement.appendChild(banner);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "SHOW_WARNING") {
    showWarningBanner(message.result);
  }
});

const signals = checkPageSignals();
console.log("[Phishing Detector] signals found:", signals);

if (signals.length > 0) {
  chrome.runtime.sendMessage({ type: "PAGE_SIGNALS", signals }, () => {
    if (chrome.runtime.lastError) {
      console.log("[Phishing Detector] sendMessage error:", chrome.runtime.lastError.message);
    }
  });
}
