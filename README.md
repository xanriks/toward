# Toward

A private companion app for couples in therapy. It installs on iPhone and Android like a regular app, works offline, and has no accounts or servers.

It has five parts:

- **Prep:** a ten-minute review before each session, covering last session, open follow-ups, flagged moments, skills practice, and three lines from each partner. One tap turns it into that session's notes.
- **Log:** quick notes through the week, like something good, a bid, hitting the loop, a repair, a hard moment, or a skill practice.
- **Sessions:** notes from each therapy session, plus follow-ups with an owner.
- **Us:** a two-minute attachment check-in for each partner, a history chart to see change over time, everyday moments from both sides, and small weekly moves.
- **Skills:** a pocket mindfulness coach (DBT Module 1). Each skill has a timed "Try it now" practice, and flashcards are timed too. Every practice is logged with how long it took, what you noticed, and how helpful it was.

## Install it on your phone

This is a Progressive Web App (PWA). It installs from the browser instead of the App Store.

- **iPhone:** open the link in Safari, tap Share, then **Add to Home Screen**. If you see **Open as Web App**, leave it on.
- **Android:** open the link in Chrome, then tap **Install app** (or menu, then **Add to Home screen**).

Once installed, it opens full screen with its own icon, launch screen, and offline support. Installing also keeps your data safe: iPhone Safari can clear website data after a week without a visit, but Home Screen apps keep it.

## Your data stays on your phone

Everything is saved on the device you use. Nothing is sent anywhere, and the code has no analytics.

- **Each phone has its own copy.** To move data between phones, go to Settings, export a backup, send the file, and import it on the other phone. Importing merges and never erases what's already there.
- **Export a backup now and then.**

## Notion

- **Weekly summary:** on Prep (or in Settings), tap **Copy for Notion** and paste into a new row of the Weekly check-ins database. The top lines match the database columns.
- **Practice log:** on Skills, then History, tap **Export CSV for Notion**. In Notion on a computer, open the Practice Log database, click the ••• menu, choose **Merge with CSV**, and pick the file. Each practice becomes a row with skill, date, minutes, helpfulness, and notes. Merge only new entries, or Notion will add duplicates.

## Starting over

Tap the gear, then **Erase and start over**. If the app won't open properly, add `#reset` to the end of the link and confirm.

## Updating the app on GitHub

Upload changed files with **Add file**, then **Upload files**, and commit. GitHub Pages republishes automatically in a minute or two. Always bump `VERSION` in `sw.js` when anything changes, so phones load the new version.

## Changing the app

- **Words:** all scenarios, check-in statements, styles, log categories, skills, and flashcards live in `content.js`.
- **Look:** base styles are in `styles.css`. App-feel styles (safe areas, translucent bars, press states) are in `native.css`.

## A note on the check-in

The ten statements are written in the spirit of attachment research (the anxiety and avoidance dimensions of the ECR-R). They are not the official ECR-R. Results are a starting point for conversation, not a diagnosis.

## Files

| File | What it does |
| --- | --- |
| `index.html` | App shell, icons, and launch screens |
| `styles.css` | Base styling |
| `native.css` | Native-app feel |
| `content.js` | All written content |
| `app.js` | App logic and on-device storage |
| `sw.js` | Offline support |
| `manifest.webmanifest` | Install details for Android and iPhone |
| `icons/` | App icons and iPhone launch screens |
