import { CAMPAIGN_URL, ALARM_AUTO_CLICK, STORAGE_KEYS, getTodayString, getWeekStartDate, getI18nMessage } from "./shared.js";

/* --- Constants --- */

const STREAK_CIRCUMFERENCE = 2 * Math.PI * 52;
const MAX_STREAK_DISPLAY = 30;

/* --- DOM References --- */

const dom = {
  streakCount: document.getElementById("streak-count"),
  totalClicks: document.getElementById("total-clicks"),
  weekClicks: document.getElementById("week-clicks"),
  bestStreak: document.getElementById("best-streak"),
  statusBar: document.getElementById("status-bar"),
  statusIcon: document.getElementById("status-icon"),
  statusText: document.getElementById("status-text"),
  btnClick: document.getElementById("btn-click"),
  toggleAutoclick: document.getElementById("toggle-autoclick"),
  timeRangeSelect: document.getElementById("time-range-select"),
  timeRangeContainer: document.getElementById("time-range-container"),
  customTimeContainer: document.getElementById("custom-time-container"),
  exactTimeContainer: document.getElementById("exact-time-container"),
  customTimeStart: document.getElementById("custom-time-start"),
  customTimeEnd: document.getElementById("custom-time-end"),
  exactTimeInput: document.getElementById("exact-time-input"),
  customTimeHint: document.getElementById("custom-time-hint"),
  toggleNotifications: document.getElementById("toggle-notifications"),
  languageSelect: document.getElementById("language-select"),
  streakProgress: document.querySelector(".streak-progress"),
  countdownRow: document.getElementById("countdown-row"),
  countdownText: document.getElementById("countdown-text"),
  countdownLabel: document.getElementById("countdown-label-text"),
  milestoneToast: document.getElementById("milestone-toast")
};

/* --- Utility Functions --- */

function loadStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(keys, resolve);
  });
}

function saveStorage(data) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(data, resolve);
  });
}

/* --- State Management --- */

const state = {
  streak: 0,
  bestStreak: 0,
  totalClicks: 0,
  todayClicks: 0,
  todayDate: "",
  lastClickDate: "",
  autoClick: false,
  timeRange: "morning",
  exactTime: "12:00",
  notifications: true,
  customTimeStart: "09:00",
  customTimeEnd: "10:00",
  weekClicks: 0,
  weekStartDate: "",
  language: "auto"
};

async function loadState() {
  const data = await loadStorage(Object.values(STORAGE_KEYS));

  state.streak = data[STORAGE_KEYS.STREAK] || 0;
  state.bestStreak = data[STORAGE_KEYS.BEST_STREAK] || 0;
  state.totalClicks = data[STORAGE_KEYS.TOTAL_CLICKS] || 0;
  state.lastClickDate = data[STORAGE_KEYS.LAST_CLICK_DATE] || "";
  state.todayDate = data[STORAGE_KEYS.TODAY_DATE] || "";
  state.todayClicks = data[STORAGE_KEYS.TODAY_CLICKS] || 0;
  state.autoClick = data[STORAGE_KEYS.AUTO_CLICK] || false;
  state.timeRange = data[STORAGE_KEYS.TIME_RANGE] || "morning";
  state.exactTime = data[STORAGE_KEYS.EXACT_TIME] || "12:00";
  state.notifications = data[STORAGE_KEYS.NOTIFICATIONS] !== undefined
    ? data[STORAGE_KEYS.NOTIFICATIONS]
    : true;
  state.customTimeStart = data[STORAGE_KEYS.CUSTOM_TIME_START] || "09:00";
  state.customTimeEnd = data[STORAGE_KEYS.CUSTOM_TIME_END] || "10:00";
  state.weekClicks = data[STORAGE_KEYS.WEEK_CLICKS] || 0;
  state.weekStartDate = data[STORAGE_KEYS.WEEK_START_DATE] || "";
  state.language = data[STORAGE_KEYS.LANGUAGE] || "auto";

  const dateChanged = reconcileDate();
  if (dateChanged) {
    await persistState();
  }
}

function reconcileDate() {
  const today = getTodayString();
  let changed = false;

  if (state.todayDate !== today) {
    state.todayClicks = 0;
    state.todayDate = today;

    if (state.lastClickDate) {
      const lastDate = new Date(state.lastClickDate);
      const todayDate = new Date(today);
      const diffDays = Math.floor(
        (todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (diffDays > 1) state.streak = 0;
    }

    changed = true;
  }

  const currentWeekStart = getWeekStartDate(today);
  if (!state.weekStartDate) {
    state.weekStartDate = currentWeekStart;
    changed = true;
  } else if (state.weekStartDate !== currentWeekStart) {
    state.weekClicks = 0;
    state.weekStartDate = currentWeekStart;
    changed = true;
  }

  return changed;
}

async function persistState() {
  await saveStorage({
    [STORAGE_KEYS.STREAK]: state.streak,
    [STORAGE_KEYS.BEST_STREAK]: state.bestStreak,
    [STORAGE_KEYS.TOTAL_CLICKS]: state.totalClicks,
    [STORAGE_KEYS.LAST_CLICK_DATE]: state.lastClickDate,
    [STORAGE_KEYS.TODAY_CLICKS]: state.todayClicks,
    [STORAGE_KEYS.TODAY_DATE]: state.todayDate,
    [STORAGE_KEYS.AUTO_CLICK]: state.autoClick,
    [STORAGE_KEYS.TIME_RANGE]: state.timeRange,
    [STORAGE_KEYS.EXACT_TIME]: state.exactTime,
    [STORAGE_KEYS.NOTIFICATIONS]: state.notifications,
    [STORAGE_KEYS.CUSTOM_TIME_START]: state.customTimeStart,
    [STORAGE_KEYS.CUSTOM_TIME_END]: state.customTimeEnd,
    [STORAGE_KEYS.WEEK_CLICKS]: state.weekClicks,
    [STORAGE_KEYS.WEEK_START_DATE]: state.weekStartDate,
    [STORAGE_KEYS.LANGUAGE]: state.language
  });
}

/* --- At-Risk Countdown --- */

let _atRiskInterval = null;

function clearAtRiskCountdown() {
  if (_atRiskInterval) {
    clearInterval(_atRiskInterval);
    _atRiskInterval = null;
  }
}

function getMidnightCountdown() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const ms = midnight.getTime() - now.getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/* --- Milestone Celebration --- */

let _milestoneToastTimer = null;
let _milestoneRingTimer = null;

function spawnConfetti() {
  const container = document.createElement("div");
  container.className = "confetti-container";
  document.body.appendChild(container);

  const colors = ["var(--flag-black)", "var(--flag-white)", "var(--flag-green)", "var(--flag-red)"];
  for (let i = 0; i < 50; i++) {
    const confetti = document.createElement("div");
    confetti.className = "confetti";
    confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    confetti.style.left = Math.random() * 100 + "vw";
    confetti.style.animationDuration = (Math.random() * 2 + 2) + "s";
    confetti.style.animationDelay = Math.random() * 0.5 + "s";
    container.appendChild(confetti);
  }

  setTimeout(() => {
    container.remove();
  }, 4000);
}

async function showMilestoneCelebration(streak) {
  spawnConfetti();
  const ringEl = dom.streakProgress.closest(".streak-ring");

  if (dom.milestoneToast) {
    if (_milestoneToastTimer) { clearTimeout(_milestoneToastTimer); _milestoneToastTimer = null; }
    const emoji = streak >= 30 ? "\uD83C\uDF1F" : "\uD83D\uDD25";
    const text = await getI18nMessage("milestoneStreak", state.language, [streak]);
    dom.milestoneToast.textContent = `${emoji} ${text}`;
    dom.milestoneToast.classList.remove("visible");
    void dom.milestoneToast.offsetWidth;
    dom.milestoneToast.classList.add("visible");
    _milestoneToastTimer = setTimeout(() => {
      dom.milestoneToast.classList.remove("visible");
      _milestoneToastTimer = null;
    }, 2800);
  }

  if (ringEl) {
    if (_milestoneRingTimer) { clearTimeout(_milestoneRingTimer); _milestoneRingTimer = null; }
    ringEl.style.setProperty("--milestone-glow", streak >= 30 ? "#F5A623" : "var(--color-primary)");
    ringEl.classList.add("milestone-glow");
    _milestoneRingTimer = setTimeout(() => {
      ringEl.classList.remove("milestone-glow");
      _milestoneRingTimer = null;
    }, 1400);
  }
}

/* --- Rendering --- */

function updateStreakRing(isInitial) {
  const ratio = Math.min(state.streak / MAX_STREAK_DISPLAY, 1);
  const targetOffset = STREAK_CIRCUMFERENCE * (1 - ratio);

  if (isInitial) {
    dom.streakProgress.style.transition = "none";
    dom.streakProgress.style.strokeDashoffset = STREAK_CIRCUMFERENCE;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        dom.streakProgress.style.transition = "";
        dom.streakProgress.style.strokeDashoffset = targetOffset;
      });
    });
  } else {
    dom.streakProgress.style.transition = "";
    dom.streakProgress.style.strokeDashoffset = targetOffset;
  }

  dom.streakProgress.classList.toggle("milestone", state.streak >= MAX_STREAK_DISPLAY);
}

let _prevClickedToday = null;

async function updateStatusBar() {
  const clickedToday = state.todayClicks > 0;

  dom.btnClick.classList.remove("btn-click--waiting");

  if (clickedToday) {
    dom.statusBar.classList.add("completed");
    dom.statusBar.classList.remove("at-risk");
    clearAtRiskCountdown();

    if (_prevClickedToday === false) {
      dom.statusBar.classList.add("just-completed");
      setTimeout(() => dom.statusBar.classList.remove("just-completed"), 950);
      if (state.streak > 0 && state.streak % 7 === 0) {
        showMilestoneCelebration(state.streak);
      }
    }

    dom.statusIcon.innerHTML = "\u2713";
    dom.statusText.textContent = await getI18nMessage("statusCompleted", state.language);
    dom.btnClick.disabled = true;
    dom.btnClick.textContent = await getI18nMessage("btnDone", state.language);
  } else {
    dom.statusBar.classList.remove("completed", "just-completed");
    const atRisk = new Date().getHours() >= 20;
    dom.statusBar.classList.toggle("at-risk", atRisk);
    dom.statusIcon.innerHTML = "!";

    clearAtRiskCountdown();

    if (atRisk) {
      const updateAtRiskText = () => {
        const timeStr = getMidnightCountdown();
        // Fetch the localized message without awaiting – fire‑and‑forget is acceptable here
        getI18nMessage("statusAtRisk", state.language, [timeStr]).then((msg) => {
          dom.statusText.textContent = msg;
        });
      };
      // Initial update
      updateAtRiskText();
      // Use a normal interval; the callback is synchronous.
      _atRiskInterval = setInterval(updateAtRiskText, 60000);
    } else {
      dom.statusText.textContent = await getI18nMessage("statusPending", state.language);
    }

    dom.btnClick.disabled = false;
    dom.btnClick.textContent = await getI18nMessage("btnClickDefault", state.language);
  }

  _prevClickedToday = clickedToday;
}

let _initialRender = true;

async function render() {
  const prevStreak = parseInt(dom.streakCount.textContent, 10);
  dom.streakCount.textContent = state.streak;

  if (!_initialRender && !isNaN(prevStreak) && state.streak > prevStreak) {
    dom.streakCount.classList.remove("bump");
    void dom.streakCount.offsetWidth;
    dom.streakCount.classList.add("bump");
  }

  dom.totalClicks.textContent = state.totalClicks;
  dom.weekClicks.textContent = state.weekClicks;
  dom.bestStreak.textContent = state.bestStreak;

  dom.toggleAutoclick.checked = state.autoClick;
  dom.timeRangeSelect.value = state.timeRange;
  dom.exactTimeInput.value = state.exactTime;
  dom.toggleNotifications.checked = state.notifications;

  dom.timeRangeContainer.classList.toggle("visible", state.autoClick);

  dom.customTimeStart.value = state.customTimeStart;
  dom.customTimeEnd.value = state.customTimeEnd;
  await updateCustomTimeVisibility();

  updateStreakRing(_initialRender);
  await applyTranslations();

  _initialRender = false;
}

/* --- Dynamic Internationalization --- */

async function applyTranslations() {
  const i18nElements = document.querySelectorAll("[data-i18n]");
  for (const el of i18nElements) {
    // Skip the main click button – its text is managed dynamically by updateStatusBar()
    if (el.id === "btn-click") continue;
    const key = el.getAttribute("data-i18n");
    const text = await getI18nMessage(key, state.language);
    if (text) {
      if (el.tagName === "INPUT" && el.type === "button") {
        el.value = text;
      } else {
        el.textContent = text;
      }
    }
  }
  // Refresh dynamic UI after language change.
  await updateStatusBar();

  if (dom.languageSelect) {
    dom.languageSelect.value = state.language;
  }

  let activeLang = state.language;
  if (!activeLang || activeLang === "auto") {
    if (typeof chrome !== "undefined" && chrome.i18n && chrome.i18n.getUILanguage) {
      activeLang = chrome.i18n.getUILanguage().split("-")[0];
    } else {
      activeLang = "en";
    }
  }

  const shell = document.querySelector(".popup-shell");
  if (shell) {
    if (activeLang === "ar") {
      shell.setAttribute("dir", "rtl");
    } else {
      shell.removeAttribute("dir");
    }
  }

  await updateStatusBar();
  updateCountdown();
}

/* --- Countdown --- */

let _countdownInterval = null;

function updateCountdown() {
  const show = state.autoClick;

  dom.countdownRow.classList.toggle("visible", show);

  if (!show || typeof chrome === "undefined" || !chrome.alarms) {
    if (_countdownInterval) {
      clearInterval(_countdownInterval);
      _countdownInterval = null;
    }
    return;
  }

  chrome.alarms.get(ALARM_AUTO_CLICK, (alarm) => {
    if (chrome.runtime.lastError || !alarm) {
      if (_countdownInterval) {
        clearInterval(_countdownInterval);
        _countdownInterval = null;
      }
      getI18nMessage("scheduling", state.language).then((msg) => {
        dom.countdownText.textContent = msg;
      });
      return;
    }

    const labelKey = state.todayClicks > 0 ? "autoClickTomorrow" : "nextAutoClick";
    getI18nMessage(labelKey, state.language).then((msg) => {
      dom.countdownLabel.textContent = msg;
    });

    async function tick() {
      const ms = alarm.scheduledTime - Date.now();
      if (ms <= 0) {
        dom.countdownText.textContent = await getI18nMessage("anyMoment", state.language);
        return;
      }
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);

      if (h > 0) {
        dom.countdownText.textContent = `${h}h ${m}m`;
      } else if (m > 0) {
        dom.countdownText.textContent = `${m}m ${s}s`;
      } else {
        dom.countdownText.textContent = `${s}s`;
      }
    }

    tick();
    if (_countdownInterval) {
      clearInterval(_countdownInterval);
    }
    _countdownInterval = setInterval(tick, 1000);
  });
}

/* --- Click Handler --- */

function handleClick() {
  if (state.todayClicks > 0) return;
  openCampaignPage();
}

async function openCampaignPage() {
  const previousText = dom.btnClick.textContent;

  dom.btnClick.disabled = true;
  dom.btnClick.textContent = await getI18nMessage("btnOpening", state.language);

  if (typeof chrome !== "undefined" && chrome.tabs) {
    chrome.tabs.create({ url: CAMPAIGN_URL, active: true }, async () => {
      if (chrome.runtime.lastError) {
        dom.btnClick.disabled = false;
        dom.btnClick.textContent = previousText;
        dom.btnClick.classList.remove("btn-click--waiting");
        return;
      }

      dom.btnClick.textContent = await getI18nMessage("btnWaiting", state.language);
      dom.btnClick.classList.add("btn-click--waiting");

      setTimeout(async () => {
        if (state.todayClicks === 0) {
          dom.btnClick.disabled = false;
          dom.btnClick.textContent = await getI18nMessage("btnClickDefault", state.language);
          dom.btnClick.classList.remove("btn-click--waiting");
        }
      }, 6000);
    });
  } else {
    window.open(CAMPAIGN_URL, "_blank");
    dom.btnClick.disabled = false;
    dom.btnClick.textContent = previousText;
    dom.btnClick.classList.remove("btn-click--waiting");
  }
}

function notifyBackground(type) {
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ type }, () => {
      if (chrome.runtime.lastError) return;
    });
  }
}

/* --- Event Listeners --- */

dom.btnClick.addEventListener("click", (e) => {
  const btn = dom.btnClick;
  const ripple = document.createElement("span");
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  ripple.style.cssText = `
    position:absolute;
    border-radius:50%;
    width:${size}px;
    height:${size}px;
    left:${e.clientX - rect.left - size / 2}px;
    top:${e.clientY - rect.top - size / 2}px;
    background:rgba(255,255,255,0.35);
    transform:scale(0);
    animation:btn-ripple 500ms ease-out forwards;
    pointer-events:none;
  `;
  btn.appendChild(ripple);
  ripple.addEventListener("animationend", () => ripple.remove());
  handleClick();
});

dom.toggleAutoclick.addEventListener("change", () => {
  state.autoClick = dom.toggleAutoclick.checked;
  persistState();
  dom.timeRangeContainer.classList.toggle("visible", state.autoClick);
  updateCountdown();
  notifyBackground("AUTO_CLICK_CHANGED");
});

dom.timeRangeSelect.addEventListener("change", (e) => {
  state.timeRange = e.target.value;
  updateCustomTimeVisibility();
  persistState();
  notifyBackground("AUTO_CLICK_CHANGED");
});

async function updateCustomTimeVisibility() {
  const isCustom = state.timeRange === "custom";
  dom.customTimeContainer.classList.toggle("visible", state.autoClick && isCustom);
  dom.exactTimeContainer.classList.toggle("visible", state.autoClick && state.timeRange === "exact");
  if (isCustom) await validateCustomTimes();
  else dom.customTimeHint.textContent = "";
}

async function validateCustomTimes() {
  const start = dom.customTimeStart.value;
  const end = dom.customTimeEnd.value;
  const valid = start && end && start < end;

  dom.customTimeStart.classList.toggle("invalid", !valid);
  dom.customTimeEnd.classList.toggle("invalid", !valid);
  dom.customTimeHint.textContent = valid ? "" : await getI18nMessage("customTimeHintError", state.language);
  return valid;
}

async function saveCustomTimes() {
  if (!await validateCustomTimes()) return;
  state.customTimeStart = dom.customTimeStart.value;
  state.customTimeEnd = dom.customTimeEnd.value;
  await persistState();
  notifyBackground("AUTO_CLICK_CHANGED");
}

dom.exactTimeInput.addEventListener("change", (e) => {
  let value = e.target.value;
  if (!value) {
    value = "12:00";
    dom.exactTimeInput.value = value;
  }
  state.exactTime = value;
  persistState();
  notifyBackground("AUTO_CLICK_CHANGED");
});

dom.customTimeStart.addEventListener("change", saveCustomTimes);
dom.customTimeEnd.addEventListener("change", saveCustomTimes);

dom.toggleNotifications.addEventListener("change", () => {
  state.notifications = dom.toggleNotifications.checked;
  persistState();
  notifyBackground("NOTIFICATIONS_CHANGED");
});

dom.languageSelect.addEventListener("change", async (e) => {
  state.language = e.target.value;
  await persistState();
  await applyTranslations();
});

document.querySelectorAll(".footer-link").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const url = e.currentTarget.href;
    if (typeof chrome !== "undefined" && chrome.tabs) {
      chrome.tabs.create({ url: url, active: true });
    } else {
      window.open(url, "_blank");
    }
  });
});

let _renderDebounceTimer = null;

if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "sync") {
      clearTimeout(_renderDebounceTimer);
      _renderDebounceTimer = setTimeout(() => {
        loadState().then(render);
      }, 80);
    }
  });
}

/* --- Cleanup --- */

window.addEventListener("unload", () => {
  if (_countdownInterval) {
    clearInterval(_countdownInterval);
    _countdownInterval = null;
  }
  if (_renderDebounceTimer) {
    clearTimeout(_renderDebounceTimer);
    _renderDebounceTimer = null;
  }
  clearAtRiskCountdown();
  if (_milestoneToastTimer) { clearTimeout(_milestoneToastTimer); _milestoneToastTimer = null; }
  if (_milestoneRingTimer) { clearTimeout(_milestoneRingTimer); _milestoneRingTimer = null; }
});

/* --- Initialization --- */

(async function init() {
  await loadState();
  await render();

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getManifest) {
    const el = document.querySelector(".footer-version");
    if (el) el.textContent = `v${chrome.runtime.getManifest().version}`;
  }
})();
