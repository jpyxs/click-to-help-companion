/* --- Constants --- */

const CAMPAIGN_URL = "https://arab.org/click-to-help/palestine/";
const ALARM_AUTO_CLICK = "daily-auto-click";
const ALARM_AUTO_CLICK_CLEANUP = "daily-auto-click-cleanup";
const ALARM_REMINDER = "daily-reminder";
const REMINDER_HOUR = 18;
const PENDING_AUTO_CLICK_TAB = "_pendingAutoClickTab";
const PENDING_AUTO_CLICK_TIMEOUT_MINUTES = 5;
const MIN_ALARM_DELAY_MINUTES = 0.1;

const STORAGE_KEYS = {
  STREAK: "streak",
  BEST_STREAK: "bestStreak",
  TOTAL_CLICKS: "totalClicks",
  LAST_CLICK_DATE: "lastClickDate",
  TODAY_CLICKS: "todayClicks",
  TODAY_DATE: "todayDate",
  AUTO_CLICK: "autoClick",
  TIME_RANGE: "timeRange",
  NOTIFICATIONS: "notifications",
  LAST_REMINDER_DATE: "lastReminderDate"
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
      [STORAGE_KEYS.NOTIFICATIONS]: true,
      [STORAGE_KEYS.LAST_REMINDER_DATE]: ""
    });
  }

  setupAlarms();
});

chrome.runtime.onStartup.addListener(() => {
  setupAlarms();
});

/* --- Alarm Management --- */

function setupAlarms() {
  updateBadge();
  chrome.storage.local.get(
    [
      STORAGE_KEYS.AUTO_CLICK,
      STORAGE_KEYS.TIME_RANGE,
      STORAGE_KEYS.NOTIFICATIONS,
      STORAGE_KEYS.TODAY_CLICKS,
      STORAGE_KEYS.TODAY_DATE,
      PENDING_AUTO_CLICK_TAB
    ],
    (data) => {
      let openedCatchUpTab = false;

      if (data[STORAGE_KEYS.AUTO_CLICK]) {
        const today = getTodayString();
        const alreadyClicked =
          data[STORAGE_KEYS.TODAY_DATE] === today && data[STORAGE_KEYS.TODAY_CLICKS] > 0;
        scheduleAutoClickAlarm(data[STORAGE_KEYS.TIME_RANGE] || "morning", alreadyClicked);
        openedCatchUpTab = handleMissedAutoClickWindow(data);
      } else {
        chrome.alarms.clear(ALARM_AUTO_CLICK);
        chrome.alarms.clear(ALARM_AUTO_CLICK_CLEANUP);
        chrome.storage.local.remove(PENDING_AUTO_CLICK_TAB);
      }

      if (data[STORAGE_KEYS.NOTIFICATIONS]) {
        scheduleAlarm(ALARM_REMINDER, REMINDER_HOUR);
        if (!openedCatchUpTab) {
          handleMissedReminder();
        }
      } else {
        chrome.alarms.clear(ALARM_REMINDER);
      }
    }
  );
}

function scheduleAutoClickAlarm(timeRange, alreadyClicked = false) {
  const now = new Date();
  const target = getNextAutoClickTarget(timeRange, now, alreadyClicked);
  const delayMinutes = Math.max(
    (target.getTime() - now.getTime()) / (1000 * 60),
    MIN_ALARM_DELAY_MINUTES
  );

  chrome.alarms.create(ALARM_AUTO_CLICK, {
    delayInMinutes: delayMinutes
  });
}

function getNextAutoClickTarget(timeRange, now, alreadyClicked = false) {
  const todayWindow = getTimeRangeWindow(timeRange, now);
  let start = todayWindow.start;
  let end = todayWindow.end;

  if (alreadyClicked || now > end) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowWindow = getTimeRangeWindow(timeRange, tomorrow);
    start = tomorrowWindow.start;
    end = tomorrowWindow.end;
  } else if (now > start) {
    start = new Date(now.getTime() + MIN_ALARM_DELAY_MINUTES * 60 * 1000);
  }

  if (start > end) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowWindow = getTimeRangeWindow(timeRange, tomorrow);
    start = tomorrowWindow.start;
    end = tomorrowWindow.end;
  }

  return randomDateBetween(start, end);
}

function getTimeRangeWindow(timeRange, date) {
  const { minHour, maxHour } = getTimeRangeHours(timeRange);
  const start = new Date(date);
  const end = new Date(date);

  start.setHours(minHour, 0, 0, 0);
  end.setHours(maxHour, 59, 59, 999);

  return { start, end };
}

function getTimeRangeHours(timeRange) {
  switch (timeRange) {
    case "morning": return { minHour: 8, maxHour: 10 };
    case "midday": return { minHour: 11, maxHour: 14 };
    case "afternoon": return { minHour: 15, maxHour: 17 };
    case "evening": return { minHour: 18, maxHour: 20 };
    case "night": return { minHour: 21, maxHour: 23 };
    default: return { minHour: 8, maxHour: 10 };
  }
}

function randomDateBetween(start, end) {
  return new Date(randomInt(start.getTime(), end.getTime()));
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

function handleMissedAutoClickWindow(data) {
  const today = getTodayString();
  const alreadyClicked =
    data[STORAGE_KEYS.TODAY_DATE] === today && data[STORAGE_KEYS.TODAY_CLICKS] > 0;

  if (alreadyClicked) return false;
  if (getPendingAutoClickTabId(data[PENDING_AUTO_CLICK_TAB])) return false;

  const selectedWindow = getTimeRangeWindow(data[STORAGE_KEYS.TIME_RANGE] || "morning", new Date());
  if (new Date() <= selectedWindow.end) return false;

  openAutoClickTab();
  return true;
}

function handleMissedReminder() {
  const now = new Date();
  if (now.getHours() < REMINDER_HOUR) return;

  handleReminder();
}

/* --- Alarm Handlers --- */

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_AUTO_CLICK) {
    handleAutoClick();
  }

  if (alarm.name === ALARM_AUTO_CLICK_CLEANUP) {
    cleanupPendingAutoClickTab();
  }

  if (alarm.name === ALARM_REMINDER) {
    handleReminder();
  }
});

function handleAutoClick() {
  chrome.storage.local.get(
    [
      STORAGE_KEYS.AUTO_CLICK,
      STORAGE_KEYS.TIME_RANGE,
      STORAGE_KEYS.TODAY_CLICKS,
      STORAGE_KEYS.TODAY_DATE,
      PENDING_AUTO_CLICK_TAB
    ],
    (data) => {
      if (!data[STORAGE_KEYS.AUTO_CLICK]) return;

      const today = getTodayString();
      const alreadyClicked =
        data[STORAGE_KEYS.TODAY_DATE] === today && data[STORAGE_KEYS.TODAY_CLICKS] > 0;

      scheduleAutoClickAlarm(data[STORAGE_KEYS.TIME_RANGE] || "morning", alreadyClicked);

      if (alreadyClicked) return;
      if (getPendingAutoClickTabId(data[PENDING_AUTO_CLICK_TAB])) return;

      openAutoClickTab();
    }
  );
}

function openAutoClickTab() {
  chrome.tabs.create({ url: CAMPAIGN_URL, active: false }, (tab) => {
    if (chrome.runtime.lastError || !tab?.id) return;

    chrome.storage.local.set({
      [PENDING_AUTO_CLICK_TAB]: {
        tabId: tab.id,
        createdAt: Date.now()
      }
    });

    chrome.alarms.create(ALARM_AUTO_CLICK_CLEANUP, {
      delayInMinutes: PENDING_AUTO_CLICK_TIMEOUT_MINUTES
    });
  });
}

function cleanupPendingAutoClickTab() {
  chrome.storage.local.get(
    [PENDING_AUTO_CLICK_TAB, STORAGE_KEYS.AUTO_CLICK],
    (data) => {
      const pendingTab = data[PENDING_AUTO_CLICK_TAB];
      const pendingTabId = getPendingAutoClickTabId(pendingTab);
      if (!pendingTabId) return;

      chrome.tabs.remove(pendingTabId, () => {
        if (chrome.runtime.lastError) {
          // The tab may already be gone; the pending state should still be cleared.
        }
        chrome.storage.local.remove(PENDING_AUTO_CLICK_TAB);
        chrome.alarms.clear(ALARM_AUTO_CLICK_CLEANUP);

        if (data[STORAGE_KEYS.AUTO_CLICK]) {
          chrome.alarms.create(ALARM_AUTO_CLICK, {
            delayInMinutes: 15
          });
        }
      });
    }
  );
}

function closePendingAutoClickTab(tabId, pendingTab) {
  const pendingTabId = getPendingAutoClickTabId(pendingTab);
  if (!pendingTabId || tabId !== pendingTabId) return;

  chrome.tabs.remove(tabId, () => {
    if (chrome.runtime.lastError) {
      // The tab may already be gone; the pending state should still be cleared.
    }
    chrome.storage.local.remove(PENDING_AUTO_CLICK_TAB);
    chrome.alarms.clear(ALARM_AUTO_CLICK_CLEANUP);
  });
}

function getPendingAutoClickTabId(pendingTab) {
  if (!pendingTab) return null;

  const tabId = typeof pendingTab === "number" ? pendingTab : pendingTab.tabId;
  const createdAt = typeof pendingTab === "object" ? pendingTab.createdAt : null;

  if (createdAt && Date.now() - createdAt > PENDING_AUTO_CLICK_TIMEOUT_MINUTES * 60 * 1000) {
    chrome.storage.local.remove(PENDING_AUTO_CLICK_TAB);
    return null;
  }

  return tabId;
}

function handleReminder() {
  chrome.storage.local.get(
    [
      STORAGE_KEYS.NOTIFICATIONS,
      STORAGE_KEYS.TODAY_CLICKS,
      STORAGE_KEYS.TODAY_DATE,
      STORAGE_KEYS.LAST_REMINDER_DATE
    ],
    (data) => {
      if (!data[STORAGE_KEYS.NOTIFICATIONS]) return;

      const today = getTodayString();
      const alreadyClicked =
        data[STORAGE_KEYS.TODAY_DATE] === today && data[STORAGE_KEYS.TODAY_CLICKS] > 0;

      if (alreadyClicked) return;
      if (data[STORAGE_KEYS.LAST_REMINDER_DATE] === today) return;

      chrome.notifications.create("click-reminder", {
        type: "basic",
        iconUrl: "icons/icon-128.png",
        title: "Click to Help Palestine",
        message: "You haven't clicked today. Keep your streak alive!",
        priority: 2
      }, () => {
        if (chrome.runtime.lastError) return;
        chrome.storage.local.set({ [STORAGE_KEYS.LAST_REMINDER_DATE]: today });
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
  if (message.type === "CLICK_CONFIRMED" || message.type === "CLICK_COMPLETED") {
    recordClick(sender.tab?.id);
    sendResponse({ status: "ok" });
  }

  if (message.type === "SETTINGS_CHANGED") {
    setupAlarms();
    sendResponse({ status: "ok" });
  }

  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.get(PENDING_AUTO_CLICK_TAB, (data) => {
    const pendingTab = data[PENDING_AUTO_CLICK_TAB];
    if (getPendingAutoClickTabId(pendingTab) === tabId) {
      chrome.storage.local.remove(PENDING_AUTO_CLICK_TAB);
      chrome.alarms.clear(ALARM_AUTO_CLICK_CLEANUP);
    }
  });
});

/* --- Click Recording --- */

function recordClick(tabId) {
  chrome.storage.local.get([...Object.values(STORAGE_KEYS), PENDING_AUTO_CLICK_TAB], (data) => {
    const today = getTodayString();
    const todayClicks = data[STORAGE_KEYS.TODAY_CLICKS] || 0;
    const pendingTab = data[PENDING_AUTO_CLICK_TAB];

    if (data[STORAGE_KEYS.TODAY_DATE] === today && todayClicks > 0) {
      closePendingAutoClickTab(tabId, pendingTab);
      return;
    }

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

    chrome.storage.local.set(
      {
        [STORAGE_KEYS.STREAK]: streak,
        [STORAGE_KEYS.BEST_STREAK]: bestStreak,
        [STORAGE_KEYS.TOTAL_CLICKS]: totalClicks,
        [STORAGE_KEYS.TODAY_CLICKS]: 1,
        [STORAGE_KEYS.TODAY_DATE]: today,
        [STORAGE_KEYS.LAST_CLICK_DATE]: today
      },
      () => {
        closePendingAutoClickTab(tabId, pendingTab);
        setupAlarms();
      }
    );
  });
}

/* --- Utility --- */

function getTodayString() {
  return new Date().toLocaleDateString("en-CA");
}

function updateBadge() {
  chrome.storage.local.get([STORAGE_KEYS.TODAY_CLICKS, STORAGE_KEYS.TODAY_DATE], (data) => {
    const today = getTodayString();
    const clickedToday =
      data[STORAGE_KEYS.TODAY_DATE] === today && data[STORAGE_KEYS.TODAY_CLICKS] > 0;

    if (clickedToday) {
      chrome.action.setBadgeText({ text: "" });
    } else {
      chrome.action.setBadgeText({ text: "!" });
      chrome.action.setBadgeBackgroundColor({ color: "#1A1A1A" });
    }
  });
}

if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local") {
      updateBadge();
    }
  });
}
