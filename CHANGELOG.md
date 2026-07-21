# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

<!-- 
  NOTE FOR RELEASES:
  List all ongoing changes directly under the ## [Unreleased] section.
  Do NOT manually add version headings (e.g. ## [X.Y.Z]); the GitHub Actions release workflow
  automatically stamps ## [Unreleased] into ## [X.Y.Z] - YYYY-MM-DD when a version tag (vX.Y.Z) is pushed.
-->

---

## [Unreleased]

### Added
- Internationalization (i18n) support for 7 languages: English (`en`), Arabic (`ar`), Spanish (`es`), French (`fr`), German (`de`), Turkish (`tr`), and Indonesian (`id`)
- Automatic browser language detection with manual language selector dropdown in Popup settings
- Right-to-Left (RTL) layout switching for Arabic (`ar`) with mirrored components, controls, and flag animations
- Hard-coded fallback dictionary (`FALLBACK_MESSAGES`) in `shared.js` to ensure reliable string resolution even if locale files are missing or offline
- Quota-safe storage wrappers (`safeStorageSet` / `saveStorage`) with automatic fallback to `chrome.storage.local` if `chrome.storage.sync` quota limits are exceeded
- Expressed `"minimum_chrome_version": "91"` requirement in `manifest.json` for Manifest V3 ES Module service worker support

### Fixed & Improved
- Content Script `isVisible()` function now correctly recognizes `position: fixed` elements overlaying the Arab.org click button
- Prevented silent storage failures by handling `chrome.runtime.lastError` across all storage operations
- Eliminated 1-frame button label flicker on language change by excluding `#btn-click` from static translation loops
- Refactored `_atRiskInterval` timer callback in `popup.js` to eliminate unhandled/dropped promises
- Added `unload` event listener in `popup.js` to clean up all active intervals and timers on popup close
- Wrapped all `chrome.alarms.create` calls in `try/catch` blocks across `background.js` to prevent unhandled background worker exceptions
- Enforced a 1-minute minimum delay (`Math.max(delayMinutes, 1)`) on reminder alarms to prevent zero-delay alarm creation loops
- Consolidated duplicate storage updates in `recordClick()` into a single atomic write
- Added content script re-injection guard (`window.__clickToHelpInjected`) and path-change reset handlers to prevent duplicate script execution on single-page navigation

---

## [1.4.0] - 2026-07-19

### Changed
- Reminder notifications are now contextual and periodic instead of a single fixed-time alert
  - When auto-click is enabled, reminders start after the auto-click window closes without a confirmed click
  - When auto-click is disabled, the first reminder fires at 6 PM
  - Reminders repeat every 2 hours until the day's click is confirmed or midnight
- Removed the "Reminder time" hour selector from the Notifications setting (on/off toggle only)
- At-risk countdown in the popup now triggers at 8 PM regardless of notification settings

### Added
- Automated GitHub Actions release workflow (`.github/workflows/release.yml`)
  - Triggered by pushing a version tag (e.g. `v1.4.0`)
  - Auto-updates the popup footer version badge
  - Builds and attaches the extension zip to the GitHub Release

---

## [1.3.0] - 2026-07-12

### Added
- Weekly click counter ("This Week" stat in the popup)
- Exact-time auto-click option alongside the existing time-range windows
- Custom time range for auto-click (user-defined start/end)
- Reminder hour setting (replaced in v1.4.0)

### Changed
- Storage version bumped to v3

---

## [1.2.0] - 2026-06-20

### Added
- Streak milestone celebration at 7, 14, and 30-day streaks (confetti + ring glow)
- Milestone toast notification in the popup
- At-risk countdown to midnight when the reminder time passes without a click

### Changed
- Streak ring turns gold at 30-day milestone

---

## [1.1.0] - 2026-06-01

### Added
- Daily reminder notifications with configurable time
- `lastReminderDate` storage key to prevent duplicate reminders

---

## [1.0.0] - 2026-05-15

### Added
- Initial release
- Confirmed click tracking via content script on Arab.org
- Daily streak counter and best streak
- Optional auto-click with morning/midday/afternoon/evening/night windows
- Same-day catch-up for missed auto-click windows
- `Alt+Shift+C` keyboard shortcut
- Extension badge showing `!` when today's click is pending
