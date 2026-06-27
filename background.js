/* --- Constants --- */

const CAMPAIGN_URL = "https://arab.org/click-to-help/palestine/";
const ALARM_AUTO_CLICK = "daily-auto-click";
const ALARM_REMINDER = "daily-reminder";
const AUTO_CLICK_HOUR = 10;
const REMINDER_HOUR = 18;

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

/* --- Lifecycle Events --- */

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.storage.local.set({
      [STORAGE_KEYS.STREAK]: 0,
      [STORAGE_KEYS.BEST_STREAK]: 0,
      [STORAGE_KEYS.TOTAL_CLICKS]: 0,
      [STORAGE_KEYS.LAST_CLICK_DATE]: "",
      [STORAGE_KEYS.TODAY_CLICKS]: 0,
      [STORAGE_KEYS.TODAY_DATE]: "",
      [STORAGE_KEYS.AUTO_CLICK]: false,
      [STORAGE_KEYS.TIME_RANGE]: "morning",
      [STORAGE_KEYS.NOTIFICATIONS]: true
    });
  }

  setupAlarms();
});

chrome.runtime.onStartup.addListener(() => {
  setupAlarms();
});

/* --- Alarm Management --- */

function setupAlarms() {
  chrome.storage.local.get(
    [STORAGE_KEYS.AUTO_CLICK, STORAGE_KEYS.TIME_RANGE, STORAGE_KEYS.NOTIFICATIONS],
    (data) => {
      if (data[STORAGE_KEYS.AUTO_CLICK]) {
        scheduleAutoClickAlarm(data[STORAGE_KEYS.TIME_RANGE] || "morning");
      } else {
        chrome.alarms.clear(ALARM_AUTO_CLICK);
      }

      if (data[STORAGE_KEYS.NOTIFICATIONS]) {
        scheduleAlarm(ALARM_REMINDER, REMINDER_HOUR);
      } else {
        chrome.alarms.clear(ALARM_REMINDER);
      }
    }
  );
}

function scheduleAutoClickAlarm(timeRange) {
  const now = new Date();
  const target = new Date();

  let minHour, maxHour;
  switch (timeRange) {
    case "morning": minHour = 8; maxHour = 11; break;
    case "midday": minHour = 10; maxHour = 14; break;
    case "afternoon": minHour = 13; maxHour = 17; break;
    case "evening": minHour = 17; maxHour = 21; break;
    case "night": minHour = 20; maxHour = 23; break;
    default: minHour = 8; maxHour = 11;
  }

  target.setHours(randomInt(minHour, maxHour), randomInt(0, 59), 0, 0);

  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  const delayMinutes = (target.getTime() - now.getTime()) / (1000 * 60);

  chrome.alarms.create(ALARM_AUTO_CLICK, {
    delayInMinutes: delayMinutes,
    periodInMinutes: 24 * 60
  });
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function scheduleAlarm(name, targetHour) {
  const now = new Date();
  const target = new Date();
  target.setHours(targetHour, 0, 0, 0);

  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  const delayMinutes = (target.getTime() - now.getTime()) / (1000 * 60);

  chrome.alarms.create(name, {
    delayInMinutes: delayMinutes,
    periodInMinutes: 24 * 60
  });
}

/* --- Alarm Handlers --- */

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_AUTO_CLICK) {
    handleAutoClick();
  }

  if (alarm.name === ALARM_REMINDER) {
    handleReminder();
  }
});

function handleAutoClick() {
  chrome.storage.local.get(
    [STORAGE_KEYS.AUTO_CLICK, STORAGE_KEYS.TODAY_CLICKS, STORAGE_KEYS.TODAY_DATE],
    (data) => {
      if (!data[STORAGE_KEYS.AUTO_CLICK]) return;

      const today = getTodayString();
      const alreadyClicked =
        data[STORAGE_KEYS.TODAY_DATE] === today && data[STORAGE_KEYS.TODAY_CLICKS] > 0;

      if (alreadyClicked) return;

      chrome.tabs.create({ url: CAMPAIGN_URL, active: false }, (tab) => {
        chrome.storage.local.set({ _pendingAutoClickTab: tab.id });
      });
    }
  );
}

function handleReminder() {
  chrome.storage.local.get(
    [STORAGE_KEYS.NOTIFICATIONS, STORAGE_KEYS.TODAY_CLICKS, STORAGE_KEYS.TODAY_DATE],
    (data) => {
      if (!data[STORAGE_KEYS.NOTIFICATIONS]) return;

      const today = getTodayString();
      const alreadyClicked =
        data[STORAGE_KEYS.TODAY_DATE] === today && data[STORAGE_KEYS.TODAY_CLICKS] > 0;

      if (alreadyClicked) return;

      chrome.notifications.create("click-reminder", {
        type: "basic",
        iconUrl: "icons/icon-128.png",
        title: "Click to Help Palestine",
        message: "You haven't clicked today. Keep your streak alive!",
        priority: 2
      });
    }
  );
}

/* --- Notification Click --- */

chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId === "click-reminder") {
    chrome.tabs.create({ url: CAMPAIGN_URL, active: true });
    chrome.notifications.clear(notificationId);
  }
});

/* --- Message Handling --- */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CLICK_COMPLETED") {
    recordClick(sender.tab?.id);
    sendResponse({ status: "ok" });
  }

  if (message.type === "SETTINGS_CHANGED") {
    setupAlarms();
    sendResponse({ status: "ok" });
  }

  if (message.type === "CLOSE_TAB") {
    if (sender.tab?.id) {
      chrome.tabs.remove(sender.tab.id);
    }
    sendResponse({ status: "ok" });
  }

  return true;
});

/* --- Click Recording --- */

function recordClick(tabId) {
  chrome.storage.local.get(Object.values(STORAGE_KEYS), (data) => {
    const today = getTodayString();
    const todayClicks = data[STORAGE_KEYS.TODAY_CLICKS] || 0;

    if (data[STORAGE_KEYS.TODAY_DATE] === today && todayClicks > 0) return;

    let streak = data[STORAGE_KEYS.STREAK] || 0;
    const lastClickDate = data[STORAGE_KEYS.LAST_CLICK_DATE] || "";

    if (lastClickDate) {
      const lastDate = new Date(lastClickDate);
      const todayDate = new Date(today);
      const diffDays = Math.floor(
        (todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (diffDays > 1) {
        streak = 0;
      }
    }

    streak += 1;

    const bestStreak = Math.max(streak, data[STORAGE_KEYS.BEST_STREAK] || 0);
    const totalClicks = (data[STORAGE_KEYS.TOTAL_CLICKS] || 0) + 1;

    chrome.storage.local.set({
      [STORAGE_KEYS.STREAK]: streak,
      [STORAGE_KEYS.BEST_STREAK]: bestStreak,
      [STORAGE_KEYS.TOTAL_CLICKS]: totalClicks,
      [STORAGE_KEYS.TODAY_CLICKS]: 1,
      [STORAGE_KEYS.TODAY_DATE]: today,
      [STORAGE_KEYS.LAST_CLICK_DATE]: today
    });

    const pendingTabId = data._pendingAutoClickTab;
    if (pendingTabId && tabId === pendingTabId) {
      chrome.tabs.remove(tabId);
      chrome.storage.local.remove("_pendingAutoClickTab");
    }
  });
}

/* --- Utility --- */

function getTodayString() {
  return new Date().toLocaleDateString("en-CA");
}
