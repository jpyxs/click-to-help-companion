/* --- Configuration --- */

const CLICK_BUTTON_SELECTORS = [
  "div.clickable img.img_pointer",
  "div.clickable img[onclick]",
  "img.img_pointer",
  "img[onclick*='make_vote']",
  "div.clickable",
  ".button_palestine",
  "button.click-to-help-btn",
  "button.cth-btn",
  "#click-to-help-button",
  "[data-action='click-to-help']"
];

const THANK_YOU_PATH = "/click-to-help/palestine/thank-you";
const AUTO_CLOSE_DELAY_MS = 4000;
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

  const fallbackElements = document.querySelectorAll(
    "button, a.btn, a[role='button'], div.clickable, img[onclick]"
  );
  for (const el of fallbackElements) {
    const text = (el.textContent || el.title || el.alt || "").toLowerCase().trim();
    if (
      (text.includes("click") && text.includes("help")) ||
      (text.includes("click") && text.includes("donate")) ||
      (text.includes("you click") && text.includes("donate")) ||
      text === "click" ||
      text === "click to help"
    ) {
      if (isVisible(el)) {
        return el;
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

if (window.location.pathname.startsWith(THANK_YOU_PATH)) {
  handleThankYouPage();
} else if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", attemptClick);
} else {
  attemptClick();
}

/* --- Thank You Page Auto-Close --- */

function handleThankYouPage() {
  notifyBackground();

  setTimeout(() => {
    chrome.runtime.sendMessage({ type: "CLOSE_TAB" }, () => {
      if (chrome.runtime.lastError) {
        return;
      }
    });
  }, AUTO_CLOSE_DELAY_MS);
}
