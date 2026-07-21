(function () {
  if (window.__cthCompanionInjected) {
    return;
  }
  window.__cthCompanionInjected = true;

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
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return false;
    }
    return element.offsetParent !== null || style.position === "fixed";
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
    }, randomDelay(300, 500));
  }

  function notifyClickConfirmed() {
    chrome.runtime.sendMessage({ type: "CLICK_CONFIRMED" }, () => {
      if (chrome.runtime.lastError) {
        return;
      }
    });
  }

  /* --- Retry Loop --- */

  let _observer = null;

  function attemptClick() {
    const button = findClickButton();

    if (button) {
      stopWatching();
      performClick(button);
      return;
    }

    attemptCount++;

    if (attemptCount >= MAX_ATTEMPTS) {
      watchForButton();
      return;
    }

    setTimeout(attemptClick, RETRY_INTERVAL_MS);
  }

  function watchForButton() {
    if (_observer || !document.body) return;
    _observer = new MutationObserver(() => {
      const button = findClickButton();
      if (button) {
        stopWatching();
        performClick(button);
      }
    });
    _observer.observe(document.body, { childList: true, subtree: true });
  }

  function stopWatching() {
    if (_observer) {
      _observer.disconnect();
      _observer = null;
    }
  }

  /* --- Utility --- */

  function randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /* --- Initialization --- */

  const CAMPAIGN_PATH = "/click-to-help/palestine/";

  /**
   * Checks the current URL path and acts accordingly.
   * Called on initial page load AND after any SPA navigation.
   */
  function checkCurrentPath() {
    stopWatching();
    if (window.location.pathname.startsWith(THANK_YOU_PATH)) {
      notifyClickConfirmed();
    } else if (window.location.pathname.startsWith(CAMPAIGN_PATH)) {
      attemptCount = 0;
      attemptClick();
    }
  }

  /* --- SPA Navigation Detection --- */

  // Arab.org may navigate to the thank-you path via pushState/replaceState
  // rather than a full page load. In that case document_idle never fires again,
  // so we intercept the History API to catch those navigations.

  const _origPushState = history.pushState.bind(history);
  history.pushState = function (...args) {
    _origPushState(...args);
    checkCurrentPath();
  };

  const _origReplaceState = history.replaceState.bind(history);
  history.replaceState = function (...args) {
    _origReplaceState(...args);
    checkCurrentPath();
  };

  window.addEventListener("popstate", checkCurrentPath);

  /* --- Initial Page Load --- */

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", checkCurrentPath);
  } else {
    checkCurrentPath();
  }
})();
