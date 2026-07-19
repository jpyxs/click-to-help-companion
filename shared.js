/* --- Shared Constants & Utilities --- */
/* Imported by background.js (ES module service worker) and popup.js (module script). */

export const CAMPAIGN_URL = "https://arab.org/click-to-help/palestine/";

export const ALARM_AUTO_CLICK = "daily-auto-click";

export const STORAGE_KEYS = {
  STREAK: "streak",
  BEST_STREAK: "bestStreak",
  TOTAL_CLICKS: "totalClicks",
  LAST_CLICK_DATE: "lastClickDate",
  TODAY_CLICKS: "todayClicks",
  TODAY_DATE: "todayDate",
  AUTO_CLICK: "autoClick",
  TIME_RANGE: "timeRange",
  NOTIFICATIONS: "notifications",
  LAST_REMINDER_DATE: "lastReminderDate",
  LAST_REMINDER_TIME: "lastReminderTime",
  CUSTOM_TIME_START: "customTimeStart",
  CUSTOM_TIME_END: "customTimeEnd",
  WEEK_CLICKS: "weekClicks",
  WEEK_START_DATE: "weekStartDate",
  EXACT_TIME: "exactTime"
};

/** Returns today's date as "YYYY-MM-DD" in the local timezone. */
export function getTodayString() {
  return new Date().toLocaleDateString("en-CA");
}

/** Returns the ISO week start (Monday) as "YYYY-MM-DD" for a given "YYYY-MM-DD" date string. */
export function getWeekStartDate(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d.toLocaleDateString("en-CA");
}
