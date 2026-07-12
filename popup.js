/* --- Constants --- */

const STORAGE_KEYS = {
  STREAK: "streak",
  BEST_STREAK: "bestStreak",
  TOTAL_CLICKS: "totalClicks",
  LAST_CLICK_DATE: "lastClickDate",
  TODAY_CLICKS: "todayClicks",
  TODAY_DATE: "todayDate",
  AUTO_CLICK: "autoClick",
  TIME_RANGE: "timeRange",
  NOTIFICATIONS: "notifications"
};

const STREAK_CIRCUMFERENCE = 2 * Math.PI * 52;
const MAX_STREAK_DISPLAY = 30;
const ALARM_AUTO_CLICK = "daily-auto-click";

/* --- DOM References --- */

const dom = {
  streakCount: document.getElementById("streak-count"),
  totalClicks: document.getElementById("total-clicks"),
  todayClicks: document.getElementById("today-clicks"),
  bestStreak: document.getElementById("best-streak"),
  statusBar: document.getElementById("status-bar"),
  statusIcon: document.getElementById("status-icon"),
  statusText: document.getElementById("status-text"),
  btnClick: document.getElementById("btn-click"),
  toggleAutoclick: document.getElementById("toggle-autoclick"),
  timeRangeSelect: document.getElementById("time-range-select"),
  timeRangeContainer: document.getElementById("time-range-container"),
  toggleNotifications: document.getElementById("toggle-notifications"),
  streakProgress: document.querySelector(".streak-progress"),
  countdownRow: document.getElementById("countdown-row"),
  countdownText: document.getElementById("countdown-text")
};

/* --- Utility Functions --- */

function getTodayString() {
  return new Date().toLocaleDateString("en-CA");
}

function loadStorage(keys) {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(keys, resolve);
    } else {
      const result = {};
      keys.forEach((key) => {
        const value = localStorage.getItem(key);
        if (value !== null) {
          try {
            result[key] = JSON.parse(value);
          } catch {
            result[key] = value;
          }
        }
      });
      resolve(result);
    }
  });
}

function saveStorage(data) {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set(data, resolve);
    } else {
      Object.entries(data).forEach(([key, value]) => {
        localStorage.setItem(key, JSON.stringify(value));
      });
      resolve();
    }
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
  notifications: true
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
  state.notifications = data[STORAGE_KEYS.NOTIFICATIONS] !== undefined
    ? data[STORAGE_KEYS.NOTIFICATIONS]
    : true;

  reconcileDate();
}

function reconcileDate() {
  const today = getTodayString();

  if (state.todayDate !== today) {
    state.todayClicks = 0;
    state.todayDate = today;

    if (state.lastClickDate) {
      const lastDate = new Date(state.lastClickDate);
      const todayDate = new Date(today);
      const diffMs = todayDate.getTime() - lastDate.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays > 1) {
        state.streak = 0;
      }
    }
  }
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
    [STORAGE_KEYS.NOTIFICATIONS]: state.notifications
  });
}

/* --- Rendering --- */

function updateStreakRing() {
  const ratio = Math.min(state.streak / MAX_STREAK_DISPLAY, 1);
  const targetOffset = STREAK_CIRCUMFERENCE * (1 - ratio);

  // Reset to empty (no transition), then trigger CSS draw-in animation
  dom.streakProgress.style.transition = "none";
  dom.streakProgress.style.strokeDashoffset = STREAK_CIRCUMFERENCE;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      dom.streakProgress.style.transition = "";
      dom.streakProgress.style.strokeDashoffset = targetOffset;
    });
  });
}

function updateStatusBar() {
  const clickedToday = state.todayClicks > 0;

  // Always clear the waiting shimmer when re-rendering status
  dom.btnClick.classList.remove("btn-click--waiting");

  if (clickedToday) {
    dom.statusBar.classList.add("completed");
    dom.statusIcon.innerHTML = "&#10003;";
    dom.statusText.textContent = "Today's click completed!";
    dom.btnClick.disabled = true;
    dom.btnClick.textContent = "Done for Today";
  } else {
    dom.statusBar.classList.remove("completed");
    dom.statusIcon.innerHTML = "!";
    dom.statusText.textContent = "Pending until thank-you page";
    dom.btnClick.disabled = false;
    dom.btnClick.textContent = "Click to Help Palestine";
  }
}

function render() {
  dom.streakCount.textContent = state.streak;
  dom.totalClicks.textContent = state.totalClicks;
  dom.todayClicks.textContent = state.todayClicks;
  dom.bestStreak.textContent = state.bestStreak;

  dom.toggleAutoclick.checked = state.autoClick;
  dom.timeRangeSelect.value = state.timeRange;
  dom.toggleNotifications.checked = state.notifications;

  dom.timeRangeContainer.classList.toggle("visible", state.autoClick);

  updateStreakRing();
  updateStatusBar();
  updateCountdown();
}

/* --- Click Handler --- */

/* --- Countdown --- */

let _countdownInterval = null;

function updateCountdown() {
  const show = state.autoClick && state.todayClicks === 0;

  dom.countdownRow.classList.toggle("visible", show);

  if (_countdownInterval) {
    clearInterval(_countdownInterval);
    _countdownInterval = null;
  }

  if (!show || typeof chrome === "undefined" || !chrome.alarms) return;

  chrome.alarms.get(ALARM_AUTO_CLICK, (alarm) => {
    if (chrome.runtime.lastError || !alarm) {
      dom.countdownText.textContent = "Scheduling\u2026";
      return;
    }

    function tick() {
      const ms = alarm.scheduledTime - Date.now();
      if (ms <= 0) {
        dom.countdownText.textContent = "Any moment now";
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
    _countdownInterval = setInterval(tick, 1000);
  });
}

/* --- Click Handler --- */

function handleClick() {
  if (state.todayClicks > 0) return;

  openCampaignPage();
}

function openCampaignPage() {
  const campaignUrl = "https://arab.org/click-to-help/palestine/";
  const previousText = dom.btnClick.textContent;

  dom.btnClick.disabled = true;
  dom.btnClick.textContent = "Opening Campaign\u2026";

  if (typeof chrome !== "undefined" && chrome.tabs) {
    chrome.tabs.create({ url: campaignUrl, active: true }, () => {
      if (chrome.runtime.lastError) {
        dom.btnClick.disabled = false;
        dom.btnClick.textContent = previousText;
        dom.btnClick.classList.remove("btn-click--waiting");
        return;
      }

      // Show shimmer while waiting for thank-you page confirmation
      dom.btnClick.textContent = "Waiting for Confirmation";
      dom.btnClick.classList.add("btn-click--waiting");

      setTimeout(() => {
        if (state.todayClicks === 0) {
          dom.btnClick.disabled = false;
          dom.btnClick.textContent = "Click to Help Palestine";
          dom.btnClick.classList.remove("btn-click--waiting");
        }
      }, 1200);
    });
  } else {
    window.open(campaignUrl, "_blank");
    dom.btnClick.disabled = false;
    dom.btnClick.textContent = previousText;
    dom.btnClick.classList.remove("btn-click--waiting");
  }
}

/* --- Settings Handlers --- */

async function handleToggle(key, element) {
  state[key] = element.checked;
  await persistState();
  notifyBackground();
}

function notifyBackground() {
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ type: "SETTINGS_CHANGED" }, () => {
      if (chrome.runtime.lastError) {
        return;
      }
    });
  }
}

/* --- Event Listeners --- */

dom.btnClick.addEventListener("click", handleClick);

dom.toggleAutoclick.addEventListener("change", () => {
  state.autoClick = dom.toggleAutoclick.checked;
  persistState();
  if (state.autoClick) {
    dom.timeRangeContainer.classList.add("visible");
  } else {
    dom.timeRangeContainer.classList.remove("visible");
  }
  notifyBackground();
});

dom.timeRangeSelect.addEventListener("change", () => {
  state.timeRange = dom.timeRangeSelect.value;
  persistState();
  notifyBackground();
});

dom.toggleNotifications.addEventListener("change", () => {
  handleToggle("notifications", dom.toggleNotifications);
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

if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local") {
      loadState().then(render);
    }
  });
}

/* --- Initialization --- */

(async function init() {
  await loadState();
  render();
})();
