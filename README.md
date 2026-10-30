# How We Connect

A private companion for couples in therapy. It works on phones, runs offline, and has no accounts or servers.

It has four parts:

- **Prep:** a ten-minute review before each session. It shows what you worked on last time, open follow-ups, moments flagged from the log, and three quick lines from each partner. One tap turns it into that session's notes.
- **Log:** quick notes as the week happens, like something good, a bid for connection, hitting the loop, a repair, or a hard moment. Any entry can be marked "bring this up at our next session."
- **Sessions:** notes from each therapy session, what you worked on, plus follow-ups with an owner (either partner or both).
- **Us:** a two-minute attachment check-in for each partner, everyday "moments" seen from both sides, how your patterns fit together, and small weekly moves.

## Your data stays on your phone

Everything is saved in the browser on the device you use. Nothing is sent anywhere, and the code has no analytics or tracking.

Some things to know:

- **Each phone has its own copy.** To move notes between phones, go to Settings, export a backup, send the file, and import it on the other phone. Importing merges and never erases what's already there.
- **On iPhone, add it to your Home Screen.** Open the site in Safari, tap Share, then Add to Home Screen. Safari can clear a website's saved data after about a week without a visit, but Home Screen apps keep it.
- **Export a backup now and then,** especially before clearing your browser or switching phones.

## Put it online with GitHub Pages (free)

1. Sign in at https://github.com and create a new repository, for example `how-we-connect`. Leave it **Public**, since free GitHub Pages needs a public repo. Only the app's code goes in the repo, never your notes.
2. On the repository page, choose **Add file**, then **Upload files**. Drag in everything from this folder: `index.html`, `styles.css`, `app.js`, `content.js`, `sw.js`, `manifest.webmanifest`, `.nojekyll`, `README.md`, and the `icons` folder. Commit.
   - `.nojekyll` is a hidden file. If your computer hides it, that's fine. The app works without it.
3. Go to **Settings**, then **Pages**. Under "Build and deployment," set Source to **Deploy from a branch**, Branch to **main**, and folder to **/ (root)**. Save.
4. After a minute or two the page shows your link, like `https://YOUR-USERNAME.github.io/how-we-connect/`. Open it on your phone and add it to your Home Screen.

Anyone with the link can open the app, but they only ever see their own empty copy. Your data never touches GitHub.

## Setting it up on two phones

On each phone, enter the two names **in the same order**, then pick whose phone it is. Keeping the order the same makes backups and check-in codes line up.

## Changing the app

- **Words:** scenarios, check-in statements, style descriptions, pairings, and log categories all live in `content.js`.
- **Look:** colors and type are in `styles.css`. Light and dark mode both follow the phone's setting.
- **After any change,** open `sw.js` and bump `VERSION` (for example `hwc-v1` to `hwc-v2`), so phones load the new version instead of the saved offline copy.

## A note on the check-in

The ten statements are written in the spirit of attachment research, using the two dimensions of the ECR-R: anxiety and avoidance. They are not the official ECR-R. Results are a starting point for conversation, not a diagnosis.

## Files

| File | What it does |
| --- | --- |
| `index.html` | The app shell |
| `styles.css` | All styling |
| `content.js` | All the written content |
| `app.js` | App logic and on-device storage |
| `sw.js` | Offline support |
| `manifest.webmanifest` | Home Screen install details |
| `icons/` | App icons |
