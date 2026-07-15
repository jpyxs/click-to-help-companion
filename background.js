import { CAMPAIGN_URL, ALARM_AUTO_CLICK, STORAGE_KEYS, getTodayString } from "./shared.js";

/* --- Constants --- */

const ALARM_AUTO_CLICK_CLEANUP = "daily-auto-click-cleanup";
const ALARM_REMINDER = "daily-reminder";
const PENDING_AUTO_CLICK_TAB = "_pendingAutoClickTab";
const PENDING_AUTO_CLICK_TIMEOUT_MINUTES = 5;
const MIN_ALARM_DELAY_MINUTES = 0.1;
const CURRENT_STORAGE_VERSION = 3;

/* --- Promise Wrappers --- */

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(data) {
  return new Promise((resolve) => chrome.storage.local.set(data, resolve));
}

function storageRemove(keys) {
  return new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
}

function alarmsClear(name) {
  return new Promise((resolve) => chrome.alarms.clear(name, resolve));
}

function alarmsGet(name) {
  return new Promise((resolve) => chrome.alarms.get(name, resolve));
}

function tabsCreate(props) {
  return new Promise((resolve) => chrome.tabs.create(props, resolve));
}

function tabsRemove(tabId) {
  return new Promise((resolve) => chrome.tabs.remove(tabId, resolve));
}

/* --- Lifecycle Events --- */

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    await storageSet({
      storageVersion: CURRENT_STORAGE_VERSION,
      [STORAGE_KEYS.STREAK]: 0,
      [STORAGE_KEYS.BEST_STREAK]: 0,
      [STORAGE_KEYS.TOTAL_CLICKS]: 0,
      [STORAGE_KEYS.LAST_CLICK_DATE]: "",
      [STORAGE_KEYS.TODAY_CLICKS]: 0,
      [STORAGE_KEYS.TODAY_DATE]: "",
      [STORAGE_KEYS.AUTO_CLICK]: false,
      [STORAGE_KEYS.TIME_RANGE]: "morning",
      [STORAGE_KEYS.NOTIFICATIONS]: true,
      [STORAGE_KEYS.LAST_REMINDER_DATE]: "",
      [STORAGE_KEYS.CUSTOM_TIME_START]: "09:00",
      [STORAGE_KEYS.CUSTOM_TIME_END]: "10:00",
      [STORAGE_KEYS.REMINDER_HOUR]: 18,
      [STORAGE_KEYS.WEEK_CLICKS]: 0,
      [STORAGE_KEYS.WEEK_START_DATE]: ""
    });
  } else if (details.reason === "update") {
    await runStorageMigrations();
  }

  setupAlarms();
});

async function runStorageMigrations() {
  const { storageVersion } = await storageGet("storageVersion");
  const from = storageVersion || 0;

  if (from < 1) {
    // v0 → v1: LAST_REMINDER_DATE added in v1.1.0
    const existing = await storageGet(STORAGE_KEYS.LAST_REMINDER_DATE);
    if (existing[STORAGE_KEYS.LAST_REMINDER_DATE] === undefined) {
      await storageSet({ [STORAGE_KEYS.LAST_REMINDER_DATE]: "" });
    }
  }

  if (from < 2) {
    // v1 → v2: REMINDER_HOUR added in v1.3.0
    const existing = await storageGet(STORAGE_KEYS.REMINDER_HOUR);
    if (existing[STORAGE_KEYS.REMINDER_HOUR] === undefined) {
      await storageSet({ [STORAGE_KEYS.REMINDER_HOUR]: 18 });
    }
  }

  if (from < 3) {
    // v2 → v3: WEEK_CLICKS + WEEK_START_DATE added in v1.3.0
    const existing = await storageGet([STORAGE_KEYS.WEEK_CLICKS, STORAGE_KEYS.WEEK_START_DATE]);
    const updates = {};
    if (existing[STORAGE_KEYS.WEEK_CLICKS] === undefined) updates[STORAGE_KEYS.WEEK_CLICKS] = 0;
    if (existing[STORAGE_KEYS.WEEK_START_DATE] === undefined) updates[STORAGE_KEYS.WEEK_START_DATE] = "";
    if (Object.keys(updates).length) await storageSet(updates);
  }

  await storageSet({ storageVersion: CURRENT_STORAGE_VERSION });
}

chrome.runtime.onStartup.addListener(() => {
  setupAlarms();
});

/* --- Alarm Management --- */

async function setupAlarms() {
  updateBadge();

  const data = await storageGet([
    STORAGE_KEYS.AUTO_CLICK,
    STORAGE_KEYS.TIME_RANGE,
    STORAGE_KEYS.NOTIFICATIONS,
    STORAGE_KEYS.TODAY_CLICKS,
    STORAGE_KEYS.TODAY_DATE,
    STORAGE_KEYS.CUSTOM_TIME_START,
    STORAGE_KEYS.CUSTOM_TIME_END,
    STORAGE_KEYS.REMINDER_HOUR,
    PENDING_AUTO_CLICK_TAB
  ]);

  const reminderHour = data[STORAGE_KEYS.REMINDER_HOUR] ?? 18;
  let openedCatchUpTab = false;

  if (data[STORAGE_KEYS.AUTO_CLICK]) {
    const today = getTodayString();
    const alreadyClicked =
      data[STORAGE_KEYS.TODAY_DATE] === today && data[STORAGE_KEYS.TODAY_CLICKS] > 0;
    const customTimes = getCustomTimes(data);
    scheduleAutoClickAlarm(data[STORAGE_KEYS.TIME_RANGE] || "morning", alreadyClicked, customTimes);
    openedCatchUpTab = await handleMissedAutoClickWindow(data);
  } else {
    await alarmsClear(ALARM_AUTO_CLICK);
    await alarmsClear(ALARM_AUTO_CLICK_CLEANUP);
    await storageRemove(PENDING_AUTO_CLICK_TAB);
  }

  if (data[STORAGE_KEYS.NOTIFICATIONS]) {
    scheduleAlarm(ALARM_REMINDER, reminderHour);
    if (!openedCatchUpTab) {
      handleMissedReminder(reminderHour);
    }
  } else {
    await alarmsClear(ALARM_REMINDER);
  }
}

function scheduleAutoClickAlarm(timeRange, alreadyClicked = false, customTimes = null) {
  const now = new Date();
  const target = getNextAutoClickTarget(timeRange, now, alreadyClicked, customTimes);
  const delayMinutes = Math.max(
    (target.getTime() - now.getTime()) / (1000 * 60),
    MIN_ALARM_DELAY_MINUTES
  );

  chrome.alarms.create(ALARM_AUTO_CLICK, { delayInMinutes: delayMinutes });
}

function getNextAutoClickTarget(timeRange, now, alreadyClicked = false, customTimes = null) {
  const todayWindow = getTimeRangeWindow(timeRange, now, customTimes);
  let start = todayWindow.start;
  let end = todayWindow.end;

  if (alreadyClicked || now > end) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowWindow = getTimeRangeWindow(timeRange, tomorrow, customTimes);
    start = tomorrowWindow.start;
    end = tomorrowWindow.end;
  } else if (now > start) {
    start = new Date(now.getTime() + MIN_ALARM_DELAY_MINUTES * 60 * 1000);
  }

  if (start > end) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowWindow = getTimeRangeWindow(timeRange, tomorrow, customTimes);
    start = tomorrowWindow.start;
    end = tomorrowWindow.end;
  }

  return randomDateBetween(start, end);
}

/**
 * Returns a { start, end } window for the given date.
 * customTimes = { start: "HH:MM", end: "HH:MM" } — used when timeRange is "custom".
 */
function getTimeRangeWindow(timeRange, date, customTimes = null) {
  let minHour, minMinute = 0, maxHour, maxMinute = 59;

  if (timeRange === "custom" && customTimes?.start && customTimes?.end) {
    [minHour, minMinute] = customTimes.start.split(":").map(Number);
    [maxHour, maxMinute] = customTimes.end.split(":").map(Number);
  } else {
    ({ minHour, maxHour } = getTimeRangeHours(timeRange));
  }

  const start = new Date(date);
  const end = new Date(date);
  start.setHours(minHour, minMinute, 0, 0);
  end.setHours(maxHour, maxMinute, 59, 999);

  return { start, end };
}

function getTimeRangeHours(timeRange) {
  switch (timeRange) {
    case "morning":   return { minHour: 8,  maxHour: 10 };
    case "midday":    return { minHour: 11, maxHour: 14 };
    case "afternoon": return { minHour: 15, maxHour: 17 };
    case "evening":   return { minHour: 18, maxHour: 20 };
    case "night":     return { minHour: 21, maxHour: 23 };
    default:          return { minHour: 8,  maxHour: 10 };
  }
}

/** Extracts custom time strings from a storage data object. */
function getCustomTimes(data) {
  return {
    start: data[STORAGE_KEYS.CUSTOM_TIME_START] || "09:00",
    end: data[STORAGE_KEYS.CUSTOM_TIME_END] || "10:00"
  };
}

function randomDateBetween(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

async function scheduleAlarm(name, targetHour) {
  const now = new Date();
  const target = new Date();
  target.setHours(targetHour, 0, 0, 0);

  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  const delayMinutes = (target.getTime() - now.getTime()) / (1000 * 60);

  await alarmsClear(name);
  chrome.alarms.create(name, {
    delayInMinutes: delayMinutes,
    periodInMinutes: 24 * 60
  });
}

async function handleMissedAutoClickWindow(data) {
  const today = getTodayString();
  const alreadyClicked =
    data[STORAGE_KEYS.TODAY_DATE] === today && data[STORAGE_KEYS.TODAY_CLICKS] > 0;

  if (alreadyClicked) return false;

  const pendingTabData = data[PENDING_AUTO_CLICK_TAB];
  if (isExpiredPendingTab(pendingTabData)) {
    await storageRemove(PENDING_AUTO_CLICK_TAB);
  } else if (getPendingAutoClickTabId(pendingTabData)) {
    return false;
  }

  const customTimes = getCustomTimes(data);
  const selectedWindow = getTimeRangeWindow(
    data[STORAGE_KEYS.TIME_RANGE] || "morning",
    new Date(),
    customTimes
  );
  if (new Date() <= selectedWindow.end) return false;

  openAutoClickTab();
  return true;
}

function handleMissedReminder(reminderHour) {
  if (new Date().getHours() < reminderHour) return;
  handleReminder();
}

/* --- Alarm Handlers --- */

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_AUTO_CLICK)         handleAutoClick();
  if (alarm.name === ALARM_AUTO_CLICK_CLEANUP) cleanupPendingAutoClickTab();
  if (alarm.name === ALARM_REMINDER)           handleReminder();
});

async function handleAutoClick() {
  const data = await storageGet([
    STORAGE_KEYS.AUTO_CLICK,
    STORAGE_KEYS.TIME_RANGE,
    STORAGE_KEYS.TODAY_CLICKS,
    STORAGE_KEYS.TODAY_DATE,
    STORAGE_KEYS.CUSTOM_TIME_START,
    STORAGE_KEYS.CUSTOM_TIME_END,
    PENDING_AUTO_CLICK_TAB
  ]);

  if (!data[STORAGE_KEYS.AUTO_CLICK]) return;

  const today = getTodayString();
  const alreadyClicked =
    data[STORAGE_KEYS.TODAY_DATE] === today && data[STORAGE_KEYS.TODAY_CLICKS] > 0;

  const customTimes = getCustomTimes(data);
  scheduleAutoClickAlarm(data[STORAGE_KEYS.TIME_RANGE] || "morning", alreadyClicked, customTimes);

  if (alreadyClicked) return;

  const pendingTabData = data[PENDING_AUTO_CLICK_TAB];
  if (isExpiredPendingTab(pendingTabData)) {
    await storageRemove(PENDING_AUTO_CLICK_TAB);
  } else if (getPendingAutoClickTabId(pendingTabData)) {
    return;
  }

  openAutoClickTab();
}

async function openAutoClickTab() {
  const tab = await tabsCreate({ url: CAMPAIGN_URL, active: false });
  if (chrome.runtime.lastError || !tab?.id) return;

  await storageSet({
    [PENDING_AUTO_CLICK_TAB]: {
      tabId: tab.id,
      createdAt: Date.now()
    }
  });

  chrome.alarms.create(ALARM_AUTO_CLICK_CLEANUP, {
    delayInMinutes: PENDING_AUTO_CLICK_TIMEOUT_MINUTES
  });
}

async function cleanupPendingAutoClickTab() {
  const data = await storageGet([
    PENDING_AUTO_CLICK_TAB,
    STORAGE_KEYS.AUTO_CLICK,
    STORAGE_KEYS.TIME_RANGE,
    STORAGE_KEYS.CUSTOM_TIME_START,
    STORAGE_KEYS.CUSTOM_TIME_END
  ]);

  const pendingTab = data[PENDING_AUTO_CLICK_TAB];
  const pendingTabId = getPendingAutoClickTabId(pendingTab);
  if (!pendingTabId) return;

  await tabsRemove(pendingTabId).catch(() => {});
  await storageRemove(PENDING_AUTO_CLICK_TAB);
  await alarmsClear(ALARM_AUTO_CLICK_CLEANUP);

  if (data[STORAGE_KEYS.AUTO_CLICK]) {
    const timeRange = data[STORAGE_KEYS.TIME_RANGE] || "morning";
    const customTimes = getCustomTimes(data);
    const currentWindow = getTimeRangeWindow(timeRange, new Date(), customTimes);

    if (new Date() <= currentWindow.end) {
      chrome.alarms.create(ALARM_AUTO_CLICK, { delayInMinutes: 15 });
    } else {
      scheduleAutoClickAlarm(timeRange, true, customTimes);
    }
  }
}

async function closePendingAutoClickTab(tabId, pendingTab) {
  const pendingTabId = getPendingAutoClickTabId(pendingTab);
  if (!pendingTabId || tabId !== pendingTabId) return;

  await tabsRemove(tabId).catch(() => {});
  await storageRemove(PENDING_AUTO_CLICK_TAB);
  await alarmsClear(ALARM_AUTO_CLICK_CLEANUP);
}

function isExpiredPendingTab(pendingTab) {
  if (!pendingTab || typeof pendingTab !== "object") return false;
  const { createdAt } = pendingTab;
  return !!createdAt && Date.now() - createdAt > PENDING_AUTO_CLICK_TIMEOUT_MINUTES * 60 * 1000;
}

function getPendingAutoClickTabId(pendingTab) {
  if (!pendingTab) return null;
  if (isExpiredPendingTab(pendingTab)) return null;
  return typeof pendingTab === "number" ? pendingTab : pendingTab.tabId;
}

async function handleReminder() {
  const data = await storageGet([
    STORAGE_KEYS.NOTIFICATIONS,
    STORAGE_KEYS.TODAY_CLICKS,
    STORAGE_KEYS.TODAY_DATE,
    STORAGE_KEYS.LAST_REMINDER_DATE
  ]);

  if (!data[STORAGE_KEYS.NOTIFICATIONS]) return;

  const today = getTodayString();
  const alreadyClicked =
    data[STORAGE_KEYS.TODAY_DATE] === today && data[STORAGE_KEYS.TODAY_CLICKS] > 0;

  if (alreadyClicked) return;
  if (data[STORAGE_KEYS.LAST_REMINDER_DATE] === today) return;

  // Write date first to prevent a concurrent setupAlarms() from firing a duplicate.
  await storageSet({ [STORAGE_KEYS.LAST_REMINDER_DATE]: today });
  chrome.notifications.create("click-reminder", {
    type: "basic",
    iconUrl: "icons/icon-128.png",
    title: "Click to Help Palestine",
    message: "You haven't clicked today. Keep your streak alive!",
    priority: 2
  });
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
  if (message.type === "CLICK_CONFIRMED") {
    recordClick(sender.tab?.id);
    sendResponse({ status: "ok" });
  }

  if (message.type === "SETTINGS_CHANGED") {
    setupAlarms();
    sendResponse({ status: "ok" });
  }

  return true;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const data = await storageGet(PENDING_AUTO_CLICK_TAB);
  const pendingTab = data[PENDING_AUTO_CLICK_TAB];
  const pendingTabId = getPendingAutoClickTabId(pendingTab);

  if (pendingTabId === tabId || isExpiredPendingTab(pendingTab)) {
    await storageRemove(PENDING_AUTO_CLICK_TAB);
    await alarmsClear(ALARM_AUTO_CLICK_CLEANUP);
  }
});

/* --- Click Recording --- */

/**
 * Returns the ISO week start (Monday) date string "YYYY-MM-DD" for a given date string.
 */
function getWeekStartDate(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d.toLocaleDateString("en-CA");
}

async function recordClick(tabId) {
  const data = await storageGet([...Object.values(STORAGE_KEYS), PENDING_AUTO_CLICK_TAB]);
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

  const currentWeekStart = getWeekStartDate(today);
  const storedWeekStart = data[STORAGE_KEYS.WEEK_START_DATE] || "";
  const weekClicks = storedWeekStart === currentWeekStart
    ? (data[STORAGE_KEYS.WEEK_CLICKS] || 0) + 1
    : 1;

  await storageSet({
    [STORAGE_KEYS.STREAK]: streak,
    [STORAGE_KEYS.BEST_STREAK]: bestStreak,
    [STORAGE_KEYS.TOTAL_CLICKS]: totalClicks,
    [STORAGE_KEYS.TODAY_CLICKS]: 1,
    [STORAGE_KEYS.TODAY_DATE]: today,
    [STORAGE_KEYS.LAST_CLICK_DATE]: today,
    [STORAGE_KEYS.WEEK_CLICKS]: weekClicks,
    [STORAGE_KEYS.WEEK_START_DATE]: currentWeekStart
  });

  closePendingAutoClickTab(tabId, pendingTab);
  setupAlarms();
}

/* --- Badge --- */

async function updateBadge() {
  const data = await storageGet([STORAGE_KEYS.TODAY_CLICKS, STORAGE_KEYS.TODAY_DATE]);
  const today = getTodayString();
  const clickedToday =
    data[STORAGE_KEYS.TODAY_DATE] === today && data[STORAGE_KEYS.TODAY_CLICKS] > 0;

  if (clickedToday) {
    chrome.action.setBadgeText({ text: "" });
  } else {
    chrome.action.setBadgeText({ text: "!" });
    chrome.action.setBadgeBackgroundColor({ color: "#1A1A1A" });
  }
}

/* --- Keyboard Shortcut --- */

chrome.commands.onCommand.addListener((command) => {
  if (command === "trigger-click") {
    handleKeyboardClick();
  }
});

async function handleKeyboardClick() {
  const data = await storageGet([
    STORAGE_KEYS.TODAY_CLICKS,
    STORAGE_KEYS.TODAY_DATE,
    PENDING_AUTO_CLICK_TAB
  ]);

  const today = getTodayString();
  const alreadyClicked =
    data[STORAGE_KEYS.TODAY_DATE] === today && data[STORAGE_KEYS.TODAY_CLICKS] > 0;

  if (alreadyClicked) return;
  if (getPendingAutoClickTabId(data[PENDING_AUTO_CLICK_TAB])) return;

  const tab = await tabsCreate({ url: CAMPAIGN_URL, active: true });
  if (chrome.runtime.lastError || !tab?.id) return;

  await storageSet({
    [PENDING_AUTO_CLICK_TAB]: {
      tabId: tab.id,
      createdAt: Date.now()
    }
  });
  chrome.alarms.create(ALARM_AUTO_CLICK_CLEANUP, {
    delayInMinutes: PENDING_AUTO_CLICK_TIMEOUT_MINUTES
  });
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local") {
    updateBadge();
  }
});
