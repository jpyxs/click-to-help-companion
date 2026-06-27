/* --- Constants --- */

const STORAGE_KEYS = {
  STREAK: "streak",
  BEST_STREAK: "bestStreak",
  TOTAL_CLICKS: "totalClicks",
  LAST_CLICK_DATE: "lastClickDate",
  TODAY_CLICKS: "todayClicks",
  TODAY_DATE: "todayDate",
  AUTO_CLICK: "autoClick",
  NOTIFICATIONS: "notifications",
  SOUND: "sound"
};

const STREAK_CIRCUMFERENCE = 2 * Math.PI * 52;
const MAX_STREAK_DISPLAY = 30;

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
  toggleNotifications: document.getElementById("toggle-notifications"),
  toggleSound: document.getElementById("toggle-sound"),
  streakProgress: document.querySelector(".streak-progress")
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
  notifications: true,
  sound: false
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
  state.notifications = data[STORAGE_KEYS.NOTIFICATIONS] !== undefined
    ? data[STORAGE_KEYS.NOTIFICATIONS]
    : true;
  state.sound = data[STORAGE_KEYS.SOUND] || false;

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
    [STORAGE_KEYS.NOTIFICATIONS]: state.notifications,
    [STORAGE_KEYS.SOUND]: state.sound
  });
}

/* --- Rendering --- */

function updateStreakRing() {
  const ratio = Math.min(state.streak / MAX_STREAK_DISPLAY, 1);
  const offset = STREAK_CIRCUMFERENCE * (1 - ratio);
  dom.streakProgress.style.strokeDashoffset = offset;
}

function updateStatusBar() {
  const clickedToday = state.todayClicks > 0;

  if (clickedToday) {
    dom.statusBar.classList.add("completed");
    dom.statusIcon.innerHTML = "&#10003;";
    dom.statusText.textContent = "Today's click completed!";
    dom.btnClick.disabled = true;
    dom.btnClick.textContent = "Done for Today";
  } else {
    dom.statusBar.classList.remove("completed");
    dom.statusIcon.innerHTML = "&#8226;";
    dom.statusText.textContent = "Today's click pending";
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
  dom.toggleNotifications.checked = state.notifications;
  dom.toggleSound.checked = state.sound;

  updateStreakRing();
  updateStatusBar();
}

/* --- Click Handler --- */

async function handleClick() {
  if (state.todayClicks > 0) return;

  const today = getTodayString();
  const previousLastClick = state.lastClickDate;

  state.todayClicks = 1;
  state.totalClicks += 1;
  state.lastClickDate = today;

  if (previousLastClick) {
    const lastDate = new Date(previousLastClick);
    const todayDate = new Date(today);
    const diffDays = Math.floor(
      (todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays > 1) {
      state.streak = 1;
    } else {
      state.streak += 1;
    }
  } else {
    state.streak = 1;
  }

  if (state.streak > state.bestStreak) {
    state.bestStreak = state.streak;
  }

  await persistState();
  render();

  openCampaignPage();
}

function openCampaignPage() {
  const campaignUrl = "https://arab.org/click-to-help/palestine/";

  if (typeof chrome !== "undefined" && chrome.tabs) {
    chrome.tabs.create({ url: campaignUrl, active: true });
  } else {
    window.open(campaignUrl, "_blank");
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
  handleToggle("autoClick", dom.toggleAutoclick);
});

dom.toggleNotifications.addEventListener("change", () => {
  handleToggle("notifications", dom.toggleNotifications);
});

dom.toggleSound.addEventListener("change", () => {
  handleToggle("sound", dom.toggleSound);
});

document.getElementById("footer-repo-link").addEventListener("click", (e) => {
  e.preventDefault();
  const url = e.currentTarget.href;
  if (typeof chrome !== "undefined" && chrome.tabs) {
    chrome.tabs.create({ url: url, active: true });
  } else {
    window.open(url, "_blank");
  }
});

/* --- Initialization --- */

(async function init() {
  await loadState();
  render();
})();
