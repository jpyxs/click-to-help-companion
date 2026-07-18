<p align="center">
  <img src="./icons/icon-128.png" alt="Click to Help Companion icon" width="72">
</p>

<h1 align="center">Click to Help Companion</h1>

<p align="center">
  <a href="https://github.com/Safouene1/support-palestine-banner/blob/master/Markdown-pages/Support.md">
    <img src="https://raw.githubusercontent.com/Safouene1/support-palestine-banner/master/StandWithPalestine.svg" alt="StandWithPalestine">
  </a>
</p>

A small browser extension for Arab.org's Click-to-Help campaigns, starting with Palestine. It helps you open the campaign from the toolbar, keeps a local streak, and can remind you or run a daily auto-click when you turn that on.

The extension only counts a click after the campaign reaches the thank-you page. Opening the campaign page or attempting a click is not enough to update your stats.

## Features

- **Toolbar access** - Open the Palestine campaign page from the extension popup.
- **Confirmed click tracking** - Stats update only after the thank-you page loads.
- **Daily streaks** - See your current streak, best streak, this week's clicks, and today's status.
- **Streak milestone ring** - The ring turns gold when your streak reaches 30 days.
- **Optional auto-click** - Choose a daily time window and let the extension open the campaign in the background.
- **Same-day catch-up** - If your browser was closed during your chosen window, the extension can try again when you open it later that day.
- **Reminder notifications** - Get a reminder at your chosen time if today's click has not been confirmed.
- **At-risk countdown** - When the reminder hour passes without a click, the status bar shows a live countdown to midnight.
- **Keyboard shortcut** - Press `Alt+Shift+C` from anywhere in the browser to trigger the campaign tab without opening the popup.
- **Milestone celebrations** - A toast and ring glow animation appear when your streak hits 7, 14, or 30 days.

## Preview

<p align="center">
  <img src="./img/preview.webp" alt="Click to Help Companion popup preview" width="760">
</p>

## Installation

1. Open the extensions page in a Chromium-based browser.
   For example: `chrome://extensions/`, `edge://extensions/`, or `brave://extensions/`.
2. Turn on developer mode.
3. Click "Load unpacked".
4. Select the `click-to-help-companion` folder
5. The extension icon should appear in your toolbar

If the icon does not show up, click the puzzle piece icon in the toolbar and pin "Click to Help Companion."

## How to use it

Open the extension from your toolbar. The popup shows your streak, total clicks, this week's clicks, today's status, and your settings.

To click manually, press **Click to Help Palestine**. The campaign page opens, and the extension will try to complete the click on the page. Your stats update only if the page reaches the thank-you screen.

You can also press `Alt+Shift+C` from anywhere in the browser. This opens the campaign tab directly without needing to open the popup first.

To use auto-click, turn on **Auto-Click Daily** and choose a time window. The extension schedules one daily attempt within that window. If today's click has already been confirmed, it skips the attempt.

If your browser was closed during that window, the extension checks when it starts again. When the window has already passed and today's click is still unconfirmed, it opens a same-day catch-up attempt instead of silently waiting until tomorrow.

To use reminders, leave **Notifications** enabled and choose your reminder time. If no click has been confirmed by that time, your browser will show a reminder. Once the reminder time passes, the popup status bar switches to an at-risk countdown showing how long you have until midnight.

## How confirmation works

The content script runs only on Arab.org's Click-to-Help pages. It looks for the campaign click target, tries the click, and then waits for the Palestine thank-you page. Once that page loads, the background service worker records the click.

This keeps the streak from moving ahead just because a tab opened or a click was attempted. If Arab.org changes the campaign page, the selectors in `content.js` may need an update.

## Auto-click details

When the alarm triggers, the extension:

1. Checks if you already clicked today (skips if you did)
2. Opens the Arab.org campaign page in a background tab
3. The content script finds the click button on the page and clicks it
4. The extension waits for the campaign thank-you page
5. Your streak and stats update only after that confirmation
6. Auto-click tabs close after confirmation or cleanup; manually opened tabs stay open

The content script retries every 2 seconds up to 15 times while the page loads. Auto-click tabs also have cleanup handling so a failed attempt does not leave hidden state behind.

Browser alarms only run while the browser can run extensions. If the browser is closed or the computer is asleep during the selected window, the same-day catch-up check handles the next available opportunity.

## Streaks and storage

Your streak increases by 1 for each calendar day with a confirmed click. If more than one day passes between confirmed clicks, the streak resets. The ring in the popup fills over 30 days and turns gold once you hit that milestone.

The **This Week** stat shows how many confirmed clicks you have made in the current calendar week (Monday–Sunday). It resets automatically each week.

All streaks, settings, and click counts are stored in `chrome.storage.sync` on your browser so they sync across your devices. The extension does not use an external account or send your stats to a server.

## Keyboard shortcut

The default shortcut is `Alt+Shift+C`. You can customise it at `chrome://extensions/shortcuts` (or the equivalent page for your browser).

## Permissions

- **storage** - Saving your streak, click counts, dates, and settings
- **alarms** - Scheduling the daily auto-click and reminder
- **notifications** - Sending you a reminder if you haven't clicked
- **host permissions for Arab.org** - Allowing the content script to run on the campaign page

## For contributors

The extension is intentionally plain: no build step, no framework, and no remote runtime assets. The main files are:

- `manifest.json` for the extension configuration
- `popup.html`, `popup.css`, and `popup.js` for the toolbar popup
- `background.js` for alarms, reminders, and confirmed click recording
- `content.js` for the Arab.org campaign page interaction
- `shared.js` for constants shared between the background and popup

This project is not affiliated with or endorsed by Arab.org.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

<div align="center"><a href="https://github.com/Safouene1/support-palestine-banner/blob/master/Markdown-pages/Support.md"><img src="https://raw.githubusercontent.com/Safouene1/support-palestine-banner/master/banner-support.svg" alt="Support Palestine" style="width: 100%;"></a></div>
