import { CAMPAIGN_URL, ALARM_AUTO_CLICK, STORAGE_KEYS, getTodayString, getWeekStartDate } from "./shared.js";

/* --- Constants --- */

const ALARM_AUTO_CLICK_CLEANUP = "daily-auto-click-cleanup";
const ALARM_REMINDER = "daily-reminder";
const PENDING_AUTO_CLICK_TAB = "_pendingAutoClickTab";
const PENDING_AUTO_CLICK_TIMEOUT_MINUTES = 5;
const MIN_ALARM_DELAY_MINUTES = 0.1;
const CURRENT_STORAGE_VERSION = 4;
const REMINDER_INTERVAL_MINUTES = 120;          // 2 h between reminders
const REMINDER_MIN_GAP_MINUTES = 90;            // dedup guard: ignore if <90 min since last
const REMINDER_START_HOUR_NO_AUTOCLICK = 18;   // 6 PM when auto-click is OFF

/* --- Promise Wrappers --- */

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.sync.get(keys, resolve));
}

function storageSet(data) {
  return new Promise((resolve) => chrome.storage.sync.set(data, resolve));
}

function storageRemove(keys) {
  return new Promise((resolve) => chrome.storage.sync.remove(keys, resolve));
}

function alarmsClear(name) {
  return new Promise((resolve) => chrome.alarms.clear(name, resolve));
}

function tabsCreate(props) {
  return new Promise((resolve) => chrome.tabs.create(props, resolve));
}

function tabsRemove(tabId) {
  return new Promise((resolve) => chrome.tabs.remove(tabId, resolve));
}

/* --- Lifecycle Events --- */

chrome.runtime.onInstalled.addListener(async (details) => {
  const localData = await new Promise(r => chrome.storage.local.get(null, r));
  const syncData = await new Promise(r => chrome.storage.sync.get(null, r));

  const localStreak = localData[STORAGE_KEYS.STREAK] || 0;
  const syncStreak = syncData[STORAGE_KEYS.STREAK] || 0;

  if (localStreak > syncStreak) {
    await new Promise(r => chrome.storage.sync.set(localData, r));
  }
  const currentData = await storageGet(null);
  const defaults = {
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
    [STORAGE_KEYS.LAST_REMINDER_TIME]: 0,
    [STORAGE_KEYS.CUSTOM_TIME_START]: "09:00",
    [STORAGE_KEYS.CUSTOM_TIME_END]: "10:00",
    [STORAGE_KEYS.WEEK_CLICKS]: 0,
    [STORAGE_KEYS.WEEK_START_DATE]: ""
  };

  const toSet = {};
  for (const [key, value] of Object.entries(defaults)) {
    if (currentData[key] === undefined) {
      toSet[key] = value;
    }
  }

  if (Object.keys(toSet).length > 0) {
    await storageSet(toSet);
  }

  try {
    await runStorageMigrations();
  } catch (err) {
    console.error("Storage migration error:", err);
  }
  await setupAlarms();
});

async function runStorageMigrations() {
  const syncData = await new Promise(r => chrome.storage.sync.get(null, r));
  if (Object.keys(syncData).length === 0) {
    const localData = await new Promise(r => chrome.storage.local.get(null, r));
    if (Object.keys(localData).length > 0) {
      await new Promise(r => chrome.storage.sync.set(localData, r));
    }
  }

  const { storageVersion } = await storageGet("storageVersion");
  const from = storageVersion || 0;

  if (from < 1) {
    const existing = await storageGet(STORAGE_KEYS.LAST_REMINDER_DATE);
    if (existing[STORAGE_KEYS.LAST_REMINDER_DATE] === undefined) {
      await storageSet({ [STORAGE_KEYS.LAST_REMINDER_DATE]: "" });
    }
  }

  if (from < 3) {
    const existing = await storageGet([STORAGE_KEYS.WEEK_CLICKS, STORAGE_KEYS.WEEK_START_DATE]);
    const updates = {};
    if (existing[STORAGE_KEYS.WEEK_CLICKS] === undefined) updates[STORAGE_KEYS.WEEK_CLICKS] = 0;
    if (existing[STORAGE_KEYS.WEEK_START_DATE] === undefined) updates[STORAGE_KEYS.WEEK_START_DATE] = "";
    if (Object.keys(updates).length) await storageSet(updates);
  }

  if (from < 4) {
    await new Promise(r => chrome.storage.sync.remove("reminderHour", r));
    const existing = await storageGet(STORAGE_KEYS.LAST_REMINDER_TIME);
    if (existing[STORAGE_KEYS.LAST_REMINDER_TIME] === undefined) {
      await storageSet({ [STORAGE_KEYS.LAST_REMINDER_TIME]: 0 });
    }
  }

  await storageSet({ storageVersion: CURRENT_STORAGE_VERSION });
}

chrome.runtime.onStartup.addListener(() => {
  setupAlarms();
});

/* --- Alarm Management --- */

async function setupAlarms(prefetchedData = null) {
  updateBadge(prefetchedData);

  const data = prefetchedData || await storageGet([
    STORAGE_KEYS.AUTO_CLICK,
    STORAGE_KEYS.TIME_RANGE,
    STORAGE_KEYS.EXACT_TIME,
    STORAGE_KEYS.NOTIFICATIONS,
    STORAGE_KEYS.TODAY_CLICKS,
    STORAGE_KEYS.TODAY_DATE,
    STORAGE_KEYS.CUSTOM_TIME_START,
    STORAGE_KEYS.CUSTOM_TIME_END,
    STORAGE_KEYS.LAST_REMINDER_TIME,
    PENDING_AUTO_CLICK_TAB
  ]);

  let openedCatchUpTab = false;

  if (data[STORAGE_KEYS.AUTO_CLICK]) {
    const today = getTodayString();
    const alreadyClicked = hasClickedToday(data, today);
    const customTimes = getCustomTimes(data);
    scheduleAutoClickAlarm(data[STORAGE_KEYS.TIME_RANGE] || "morning", alreadyClicked, customTimes);
    openedCatchUpTab = await handleMissedAutoClickWindow(data);
  } else {
    await alarmsClear(ALARM_AUTO_CLICK);
    await alarmsClear(ALARM_AUTO_CLICK_CLEANUP);
    await storageRemove(PENDING_AUTO_CLICK_TAB);
  }

  if (data[STORAGE_KEYS.NOTIFICATIONS]) {
    scheduleNextReminder(data);
    if (!openedCatchUpTab) {
      handleMissedReminder(data);
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

async function setupAutoClickAlarm() {
  const data = await storageGet([
    STORAGE_KEYS.AUTO_CLICK,
    STORAGE_KEYS.TIME_RANGE,
    STORAGE_KEYS.EXACT_TIME,
    STORAGE_KEYS.TODAY_CLICKS,
    STORAGE_KEYS.TODAY_DATE,
    STORAGE_KEYS.CUSTOM_TIME_START,
    STORAGE_KEYS.CUSTOM_TIME_END,
    PENDING_AUTO_CLICK_TAB
  ]);

  if (data[STORAGE_KEYS.AUTO_CLICK]) {
    const today = getTodayString();
    const alreadyClicked = hasClickedToday(data, today);
    const customTimes = getCustomTimes(data);
    scheduleAutoClickAlarm(data[STORAGE_KEYS.TIME_RANGE] || "morning", alreadyClicked, customTimes);
    await handleMissedAutoClickWindow(data);
  } else {
    await alarmsClear(ALARM_AUTO_CLICK);
    await alarmsClear(ALARM_AUTO_CLICK_CLEANUP);
    await storageRemove(PENDING_AUTO_CLICK_TAB);
  }
}

async function setupReminderAlarm() {
  const data = await storageGet([
    STORAGE_KEYS.NOTIFICATIONS,
    STORAGE_KEYS.AUTO_CLICK,
    STORAGE_KEYS.TIME_RANGE,
    STORAGE_KEYS.EXACT_TIME,
    STORAGE_KEYS.TODAY_CLICKS,
    STORAGE_KEYS.TODAY_DATE,
    STORAGE_KEYS.CUSTOM_TIME_START,
    STORAGE_KEYS.CUSTOM_TIME_END,
    STORAGE_KEYS.LAST_REMINDER_TIME
  ]);

  if (data[STORAGE_KEYS.NOTIFICATIONS]) {
    scheduleNextReminder(data);
    handleMissedReminder(data);
  } else {
    await alarmsClear(ALARM_REMINDER);
  }
}

function getNextAutoClickTarget(timeRange, now, alreadyClicked = false, customTimes = null) {
  if (timeRange === "exact") {
    const [h, m] = (customTimes?.exact || "12:00").split(":").map(Number);
    const target = new Date(now);
    target.setHours(h, m, 0, 0);

    if (alreadyClicked || now > target) {
      target.setDate(target.getDate() + 1);
    }
    return target;
  }

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

  if (timeRange === "exact" && customTimes?.exact) {
    const [h, m] = customTimes.exact.split(":").map(Number);
    minHour = maxHour = h;
    minMinute = maxMinute = m;
  } else if (timeRange === "custom" && customTimes?.start && customTimes?.end) {
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
    case "morning": return { minHour: 8, maxHour: 10 };
    case "midday": return { minHour: 11, maxHour: 14 };
    case "afternoon": return { minHour: 15, maxHour: 17 };
    case "evening": return { minHour: 18, maxHour: 20 };
    case "night": return { minHour: 21, maxHour: 23 };
    default: return { minHour: 8, maxHour: 10 };
  }
}

/** Extracts custom time strings from a storage data object. */
function getCustomTimes(data) {
  return {
    start: data[STORAGE_KEYS.CUSTOM_TIME_START] || "09:00",
    end: data[STORAGE_KEYS.CUSTOM_TIME_END] || "10:00",
    exact: data[STORAGE_KEYS.EXACT_TIME] || "12:00"
  };
}

function hasClickedToday(data, today) {
  return data[STORAGE_KEYS.TODAY_DATE] === today && data[STORAGE_KEYS.TODAY_CLICKS] > 0;
}

function randomDateBetween(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

/**
 * Computes when the first reminder should fire for the current day.
 * - Auto-click ON: after the auto-click window/exact-time end (the "missed" moment)
 * - Auto-click OFF: at REMINDER_START_HOUR_NO_AUTOCLICK (6 PM)
 * Returns a Date object (may be in the past if the window already passed).
 */
function getReminderStartTime(data) {
  const autoClickOn = data[STORAGE_KEYS.AUTO_CLICK];

  if (autoClickOn) {
    const customTimes = getCustomTimes(data);
    const timeRange = data[STORAGE_KEYS.TIME_RANGE] || "morning";
    const window = getTimeRangeWindow(timeRange, new Date(), customTimes);
    return window.end; // remind after the window ends
  }

  const start = new Date();
  start.setHours(REMINDER_START_HOUR_NO_AUTOCLICK, 0, 0, 0);
  return start;
}

/**
 * Schedules (or re-arms) the periodic reminder alarm.
 * Computes the next fire time based on:
 *   - When reminders are eligible to start (getReminderStartTime)
 *   - The last reminder sent (LAST_REMINDER_TIME)
 *   - The 2-hour interval between reminders
 * Does nothing if the user has already clicked today.
 */
async function scheduleNextReminder(data) {
  const today = getTodayString();
  if (hasClickedToday(data, today)) {
    await alarmsClear(ALARM_REMINDER);
    return;
  }

  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);

  const reminderStart = getReminderStartTime(data);
  const lastReminderTime = data[STORAGE_KEYS.LAST_REMINDER_TIME] || 0;

  const afterInterval = new Date(lastReminderTime + REMINDER_INTERVAL_MINUTES * 60 * 1000);
  const nextFire = new Date(Math.max(reminderStart.getTime(), afterInterval.getTime()));

  if (nextFire >= midnight) {
    await alarmsClear(ALARM_REMINDER);
    return;
  }

  const delayMs = Math.max(nextFire.getTime() - now.getTime(), MIN_ALARM_DELAY_MINUTES * 60 * 1000);
  const delayMinutes = delayMs / (1000 * 60);

  await alarmsClear(ALARM_REMINDER);
  chrome.alarms.create(ALARM_REMINDER, { delayInMinutes: delayMinutes });
}

/**
 * Called on startup/install to fire a reminder immediately if we've already
 * passed the reminder start time and haven't sent one recently.
 */
async function handleMissedReminder(data) {
  const today = getTodayString();
  if (hasClickedToday(data, today)) return;
  if (!data[STORAGE_KEYS.NOTIFICATIONS]) return;

  const now = new Date();
  const reminderStart = getReminderStartTime(data);
  if (now < reminderStart) return;

  const lastReminderTime = data[STORAGE_KEYS.LAST_REMINDER_TIME] || 0;
  const minsSinceLast = (now.getTime() - lastReminderTime) / (1000 * 60);
  if (minsSinceLast < REMINDER_MIN_GAP_MINUTES) return;

  await sendReminderNotification();
  await storageSet({ [STORAGE_KEYS.LAST_REMINDER_TIME]: now.getTime() });
}

async function handleMissedAutoClickWindow(data) {
  const today = getTodayString();
  const alreadyClicked = hasClickedToday(data, today);

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

/* --- Alarm Handlers --- */

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_AUTO_CLICK) handleAutoClick();
  if (alarm.name === ALARM_AUTO_CLICK_CLEANUP) cleanupPendingAutoClickTab();
  if (alarm.name === ALARM_REMINDER) handleReminder();
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
  const alreadyClicked = hasClickedToday(data, today);

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

let _isOpeningAutoClickTab = false;

async function openAutoClickTab() {
  if (_isOpeningAutoClickTab) return;
  _isOpeningAutoClickTab = true;

  try {
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
  } finally {
    _isOpeningAutoClickTab = false;
  }
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

  await tabsRemove(pendingTabId).catch(() => { });
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

  await tabsRemove(tabId).catch(() => { });
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
    STORAGE_KEYS.LAST_REMINDER_DATE,
    STORAGE_KEYS.LAST_REMINDER_TIME,
    STORAGE_KEYS.AUTO_CLICK,
    STORAGE_KEYS.TIME_RANGE,
    STORAGE_KEYS.EXACT_TIME,
    STORAGE_KEYS.CUSTOM_TIME_START,
    STORAGE_KEYS.CUSTOM_TIME_END
  ]);

  if (!data[STORAGE_KEYS.NOTIFICATIONS]) return;

  const today = getTodayString();
  const alreadyClicked = hasClickedToday(data, today);
  if (alreadyClicked) {
    await alarmsClear(ALARM_REMINDER);
    return;
  }

  const now = new Date();
  const lastReminderTime = data[STORAGE_KEYS.LAST_REMINDER_TIME] || 0;
  const minsSinceLast = (now.getTime() - lastReminderTime) / (1000 * 60);
  if (minsSinceLast < REMINDER_MIN_GAP_MINUTES) {
    scheduleNextReminder(data);
    return;
  }

  await storageSet({
    [STORAGE_KEYS.LAST_REMINDER_DATE]: today,
    [STORAGE_KEYS.LAST_REMINDER_TIME]: now.getTime()
  });

  await sendReminderNotification();

  scheduleNextReminder({
    ...data,
    [STORAGE_KEYS.LAST_REMINDER_TIME]: now.getTime()
  });
}

function sendReminderNotification() {
  return new Promise((resolve) => {
    chrome.notifications.create("click-reminder", {
      type: "basic",
      iconUrl: "icons/icon-128.png",
      title: "Click to Help Palestine",
      message: "You haven't clicked today. Keep your streak alive!",
      priority: 2
    }, resolve);
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
  } else if (message.type === "AUTO_CLICK_CHANGED") {
    setupAutoClickAlarm();
    sendResponse({ status: "ok" });
  } else if (message.type === "NOTIFICATIONS_CHANGED") {
    setupReminderAlarm();
    sendResponse({ status: "ok" });
  } else if (message.type === "SETTINGS_CHANGED") {
    setupAlarms();
    sendResponse({ status: "ok" });
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const data = await storageGet([
    PENDING_AUTO_CLICK_TAB,
    STORAGE_KEYS.AUTO_CLICK,
    STORAGE_KEYS.TIME_RANGE,
    STORAGE_KEYS.CUSTOM_TIME_START,
    STORAGE_KEYS.CUSTOM_TIME_END,
    STORAGE_KEYS.TODAY_CLICKS,
    STORAGE_KEYS.TODAY_DATE
  ]);
  const pendingTab = data[PENDING_AUTO_CLICK_TAB];
  const pendingTabId = getPendingAutoClickTabId(pendingTab);

  if (pendingTabId === tabId || isExpiredPendingTab(pendingTab)) {
    await storageRemove(PENDING_AUTO_CLICK_TAB);
    await alarmsClear(ALARM_AUTO_CLICK_CLEANUP);

    if (data[STORAGE_KEYS.AUTO_CLICK]) {
      const today = getTodayString();
      if (!hasClickedToday(data, today)) {
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
  }
});

/* --- Click Recording --- */

async function recordClick(tabId) {
  const data = await storageGet([...Object.values(STORAGE_KEYS), PENDING_AUTO_CLICK_TAB]);
  const today = getTodayString();
  const pendingTab = data[PENDING_AUTO_CLICK_TAB];

  if (hasClickedToday(data, today)) {
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

  const updatedData = {
    ...data,
    [STORAGE_KEYS.STREAK]: streak,
    [STORAGE_KEYS.BEST_STREAK]: bestStreak,
    [STORAGE_KEYS.TOTAL_CLICKS]: totalClicks,
    [STORAGE_KEYS.TODAY_CLICKS]: 1,
    [STORAGE_KEYS.TODAY_DATE]: today,
    [STORAGE_KEYS.LAST_CLICK_DATE]: today,
    [STORAGE_KEYS.WEEK_CLICKS]: weekClicks,
    [STORAGE_KEYS.WEEK_START_DATE]: currentWeekStart
  };

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

  const isAutoClick = tabId && pendingTab && tabId === getPendingAutoClickTabId(pendingTab);
  if (isAutoClick) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon-128.png",
      title: "Click to Help Palestine",
      message: "Daily auto-click successful! Thank you for your support.",
      priority: 0
    });
  }

  closePendingAutoClickTab(tabId, pendingTab);
  setupAlarms(updatedData);
}

/* --- Badge --- */

async function updateBadge(prefetchedData = null) {
  const data = prefetchedData || await storageGet([STORAGE_KEYS.TODAY_CLICKS, STORAGE_KEYS.TODAY_DATE]);
  const today = getTodayString();
  const clickedToday = hasClickedToday(data, today);

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
  const alreadyClicked = hasClickedToday(data, today);

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
  if (areaName === "sync") {
    updateBadge();
  }
});
