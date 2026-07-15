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
  CUSTOM_TIME_START: "customTimeStart",
  CUSTOM_TIME_END: "customTimeEnd",
  REMINDER_HOUR: "reminderHour",
  WEEK_CLICKS: "weekClicks",
  WEEK_START_DATE: "weekStartDate"
};

/** Returns today's date as "YYYY-MM-DD" in the local timezone. */
export function getTodayString() {
  return new Date().toLocaleDateString("en-CA");
}
