/* --- Configuration --- */

const CLICK_BUTTON_SELECTORS = [
  ".button_palestine",
  "button.click-to-help-btn",
  "button.cth-btn",
  "a.click-to-help-btn",
  "#click-to-help-button",
  "[data-action='click-to-help']",
  "button.btn-click-to-help",
  ".click-to-help button",
  ".cth-container button",
  "button[class*='click']",
  "a[class*='click-to-help']"
];

const MAX_ATTEMPTS = 15;
const RETRY_INTERVAL_MS = 2000;

/* --- State --- */

let attemptCount = 0;

/* --- Button Detection --- */

function findClickButton() {
  for (const selector of CLICK_BUTTON_SELECTORS) {
    const element = document.querySelector(selector);
    if (element && isVisible(element) && !isDisabled(element)) {
      return element;
    }
  }

  const allButtons = document.querySelectorAll("button, a.btn, a[role='button']");
  for (const btn of allButtons) {
    const text = (btn.textContent || "").toLowerCase().trim();
    if (
      (text.includes("click") && text.includes("help")) ||
      (text.includes("click") && text.includes("donate")) ||
      text === "click" ||
      text === "click to help"
    ) {
      if (isVisible(btn) && !isDisabled(btn)) {
        return btn;
      }
    }
  }

  return null;
}

function isVisible(element) {
  const style = window.getComputedStyle(element);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0" &&
    element.offsetParent !== null
  );
}

function isDisabled(element) {
  return (
    element.disabled === true ||
    element.getAttribute("aria-disabled") === "true" ||
    element.classList.contains("disabled")
  );
}

/* --- Click Execution --- */

function performClick(button) {
  button.scrollIntoView({ behavior: "smooth", block: "center" });

  const rect = button.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2 + (Math.random() * 4 - 2);
  const clientY = rect.top + rect.height / 2 + (Math.random() * 4 - 2);

  const commonProps = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: clientX,
    clientY: clientY
  };

  setTimeout(() => {
    button.dispatchEvent(new MouseEvent("mouseover", commonProps));
  }, randomDelay(50, 120));

  setTimeout(() => {
    button.dispatchEvent(new MouseEvent("mousedown", { ...commonProps, button: 0 }));
  }, randomDelay(150, 280));

  setTimeout(() => {
    button.dispatchEvent(new MouseEvent("mouseup", { ...commonProps, button: 0 }));
    button.dispatchEvent(new MouseEvent("click", { ...commonProps, button: 0 }));
    notifyBackground();
  }, randomDelay(300, 500));
}

function notifyBackground() {
  chrome.runtime.sendMessage({ type: "CLICK_COMPLETED" }, () => {
    if (chrome.runtime.lastError) {
      return;
    }
  });
}

/* --- Retry Loop --- */

function attemptClick() {
  if (attemptCount >= MAX_ATTEMPTS) return;

  const button = findClickButton();

  if (button) {
    performClick(button);
    return;
  }

  attemptCount++;
  setTimeout(attemptClick, RETRY_INTERVAL_MS);
}

/* --- Utility --- */

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/* --- Initialization --- */

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", attemptClick);
} else {
  attemptClick();
}
