// utils/heuristics.js
// Pure functions that analyze a URL and return suspicion "points".
// Each check returns { triggered: bool, points: number, reason: string }
// Higher total points = more suspicious.

const BRAND_KEYWORDS = [
  "paypal", "google", "microsoft", "apple", "amazon", "facebook",
  "instagram", "netflix", "bankofamerica", "chase", "wellsfargo",
  "outlook", "office365", "linkedin", "coinbase", "binance"
];

const SUSPICIOUS_TLDS = [
  ".tk", ".ml", ".ga", ".cf", ".gq", ".xyz", ".top", ".club", ".work", ".click"
];

function isIPAddress(hostname) {
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  return ipv4.test(hostname);
}

function hasAtSymbolTrick(url) {
  // Anything before "@" in a URL is ignored by the browser when navigating,
  // so attackers hide the real (malicious) domain after it.
  return url.includes("@");
}

function countSubdomains(hostname) {
  const parts = hostname.split(".");
  // e.g. login.paypal.com.verify-account.xyz -> many parts
  return Math.max(0, parts.length - 2);
}

function hasSuspiciousTLD(hostname) {
  return SUSPICIOUS_TLDS.some(tld => hostname.endsWith(tld));
}

function countHyphens(hostname) {
  return (hostname.match(/-/g) || []).length;
}

function isNotHTTPS(protocol) {
  return protocol !== "https:";
}

// Simple Levenshtein distance for typosquatting detection
function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[a.length][b.length];
}

function checkTyposquatting(hostname) {
  // Strip common prefixes/suffixes to get the "core" domain word
  const core = hostname.replace(/^www\./, "").split(".")[0];
  for (const brand of BRAND_KEYWORDS) {
    if (core === brand) return null; // exact match to a brand's own domain root, fine
    const distance = levenshtein(core, brand);
    // Close but not exact = likely impersonation (e.g. "paypa1", "paypall")
    if (distance > 0 && distance <= 2 && core.length >= brand.length - 2) {
      return brand;
    }
    // Brand name embedded in a longer, unrelated-looking domain
    if (core.includes(brand) && core !== brand) {
      return brand;
    }
  }
  return null;
}

/**
 * Run all heuristics against a URL and return a risk report.
 */
function analyzeUrl(rawUrl) {
  const reasons = [];
  let score = 0;

  let url;
  try {
    url = new URL(rawUrl);
  } catch (e) {
    return { score: 0, reasons: ["Could not parse URL"], verdict: "unknown" };
  }

  const hostname = url.hostname;

  if (isIPAddress(hostname)) {
    score += 25;
    reasons.push("Site uses a raw IP address instead of a domain name");
  }

  if (hasAtSymbolTrick(rawUrl)) {
    score += 25;
    reasons.push('URL contains "@", which can hide the real destination');
  }

  const subdomainCount = countSubdomains(hostname);
  if (subdomainCount >= 3) {
    score += 15;
    reasons.push(`Unusually high number of subdomains (${subdomainCount})`);
  }

  if (hasSuspiciousTLD(hostname)) {
    score += 10;
    reasons.push(`Domain uses a TLD commonly abused for phishing (${hostname.slice(hostname.lastIndexOf("."))})`);
  }

  const hyphens = countHyphens(hostname);
  if (hyphens >= 3) {
    score += 10;
    reasons.push(`Domain contains many hyphens (${hyphens})`);
  }

  if (isNotHTTPS(url.protocol)) {
    score += 15;
    reasons.push("Site does not use HTTPS");
  }

  const impersonated = checkTyposquatting(hostname);
  if (impersonated) {
    score += 30;
    reasons.push(`Domain closely resembles "${impersonated}" but is not its official site`);
  }

  if (rawUrl.length > 100) {
    score += 5;
    reasons.push("Unusually long URL");
  }

  let verdict = "safe";
  if (score >= 50) verdict = "dangerous";
  else if (score >= 20) verdict = "suspicious";

  return { score, reasons, verdict };
}

// Export for use in background.js (service worker uses ES module or importScripts)
if (typeof module !== "undefined") {
  module.exports = { analyzeUrl, levenshtein, BRAND_KEYWORDS, SUSPICIOUS_TLDS };
}
