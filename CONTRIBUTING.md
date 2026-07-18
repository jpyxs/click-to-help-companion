# Contributing to Click to Help Companion

Thank you for your interest in contributing! This extension is built to be as accessible and transparent as possible. 

I welcome contributions of all kinds: bug reports, feature requests, documentation improvements, and code changes.

## Philosophy

The extension is intentionally plain and lightweight:
- **No build step**: No Webpack, Vite, or Rollup.
- **No frameworks**: No React, Vue, or Tailwind. Pure HTML, CSS, and Vanilla JavaScript.
- **No remote runtime assets**: Everything is bundled directly in the extension for privacy and security.

## How to Set Up for Development

1. Fork and clone the repository to your local machine.
2. Open your Chromium-based browser (Chrome, Edge, Brave, etc.) and go to `chrome://extensions/`.
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked** and select the folder containing the extension files.
5. Whenever you make changes to the code, simply go back to the extensions page and click the **Reload** button (the circular arrow) on the extension card.

## File Structure

Here is a breakdown of the core files so you can find what you need to change:

- **`manifest.json`**: The heart of the extension. Defines permissions, background scripts, and popup configuration.
- **`popup.html`**: The UI structure of the toolbar popup.
- **`popup.css`**: All the styles for the popup. Uses standard CSS variables for theming.
- **`popup.js`**: Handles the popup UI logic, including state rendering, countdown timers, and toggles.
- **`background.js`**: The Service Worker. It runs silently in the background and is responsible for managing Chrome alarms, scheduling auto-clicks, tracking streaks, and sending notifications.
- **`content.js`**: Injected directly into the Arab.org campaign page. It is responsible for finding the click button, interacting with the DOM, and detecting when the "Thank You" confirmation page loads.
- **`shared.js`**: Shared constants (like storage keys and URLs) used by both the popup and background scripts.

## Making Changes

1. **Create a branch**: Branch off of `main` for your feature or bug fix.
2. **Keep it simple**: Try to stick to the Vanilla JS/CSS philosophy. Avoid introducing external dependencies unless absolutely necessary.
3. **Test thoroughly**: Since there are no automated tests, please manually test your changes. Ensure you haven't broken the auto-click scheduler, the manual click tracking, or the streak logic.

## Submitting a Pull Request

1. Commit your changes with a clear, descriptive commit message.
2. Push your branch to your fork on GitHub.
3. Open a Pull Request against the `main` branch.
4. Include a description of what you changed, why you changed it, and how you tested it.

---

*Disclaimer: This project is not affiliated with or endorsed by Arab.org.*
