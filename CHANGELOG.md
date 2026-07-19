# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]



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
