/* --- Shared Constants & Utilities --- */
/* Imported by background.js (ES module service worker) and popup.js (module script). */

export const CAMPAIGN_URL = "https://arab.org/click-to-help/palestine/";

export const ALARM_AUTO_CLICK = "daily-auto-click";

export const STORAGE_KEYS = {
  AUTO_CLICK: "autoClick",
  BEST_STREAK: "bestStreak",
  CUSTOM_TIME_END: "customTimeEnd",
  CUSTOM_TIME_START: "customTimeStart",
  EXACT_TIME: "exactTime",
  LANGUAGE: "language",
  LAST_CLICK_DATE: "lastClickDate",
  LAST_REMINDER_DATE: "lastReminderDate",
  LAST_REMINDER_TIME: "lastReminderTime",
  NOTIFICATIONS: "notifications",
  STREAK: "streak",
  TIME_RANGE: "timeRange",
  TODAY_CLICKS: "todayClicks",
  TODAY_DATE: "todayDate",
  TOTAL_CLICKS: "totalClicks",
  WEEK_CLICKS: "weekClicks",
  WEEK_START_DATE: "weekStartDate"
};

/** Returns today's date as "YYYY-MM-DD" in the local timezone. */
export function getTodayString() {
  return new Date().toLocaleDateString("en-CA");
}

/** Returns the ISO week start (Monday) as "YYYY-MM-DD" for a given "YYYY-MM-DD" date string. */
export function getWeekStartDate(dateStr) {
  // Parse as local date parts — new Date("YYYY-MM-DD") is UTC midnight and
  // shifts the date by up to a full day in timezones behind UTC.
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day); // local midnight
  const dow = d.getDay();
  const diff = (dow === 0 ? -6 : 1) - dow;
  d.setDate(d.getDate() + diff);
  return d.toLocaleDateString("en-CA");
}

const localeCache = {};

/**
 * Resolves a localized string key based on stored language preference or browser locale.
 * @param {string} key - The message key in messages.json
 * @param {string} langPreference - Stored language preference ("auto", "en", "ar", etc.)
 * @param {Array|string} substitutions - Optional placeholder substitution string(s)
 * @returns {Promise<string>}
 */
export async function getI18nMessage(key, langPreference = "auto", substitutions = []) {
  let lang = langPreference;
  if (!lang || lang === "auto") {
    if (typeof chrome !== "undefined" && chrome.i18n && chrome.i18n.getUILanguage) {
      lang = chrome.i18n.getUILanguage().split("-")[0];
    } else {
      lang = "en";
    }
  }

  if (!localeCache[lang]) {
    try {
      const url = typeof chrome !== "undefined" && chrome.runtime
        ? chrome.runtime.getURL(`_locales/${lang}/messages.json`)
        : `_locales/${lang}/messages.json`;
      const res = await fetch(url);
      if (res.ok) {
        localeCache[lang] = await res.json();
      }
    } catch {
      // Fallback below
    }
  }

  if (!localeCache[lang] && lang !== "en") {
    try {
      const url = typeof chrome !== "undefined" && chrome.runtime
        ? chrome.runtime.getURL(`_locales/en/messages.json`)
        : `_locales/en/messages.json`;
      const res = await fetch(url);
      if (res.ok) {
        localeCache["en"] = await res.json();
      }
    } catch {
      // Fallback below
    }
  }

  const messages = localeCache[lang] || localeCache["en"] || {};
  const entry = messages[key];

  if (!entry) {
    if (typeof chrome !== "undefined" && chrome.i18n && chrome.i18n.getMessage) {
      const chromeMsg = chrome.i18n.getMessage(key, substitutions);
      if (chromeMsg) return chromeMsg;
    }
    return key;
  }

  let text = entry.message || "";
  const subArray = Array.isArray(substitutions) ? substitutions : [substitutions];
  if (entry.placeholders) {
    Object.keys(entry.placeholders).forEach((phKey, idx) => {
      const val = subArray[idx] !== undefined ? subArray[idx] : "";
      text = text.replace(new RegExp(`\\$${phKey.toUpperCase()}\\$`, "g"), val);
    });
  }
  return text;
}
