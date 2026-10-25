# Garage Log

Track your cars' services, mods, parts and tools, plan a wishlist, and watch each mod appear on your car in a 3D garage.

**Use it:** https://rup2014.github.io/Garage-Log/

- **Multiple cars.** Each car has its own service history, parts, wishlist and odometer. Tools are shared by all your cars.
- **3D garage.** A built-in Toyota GR Supra (A90) model, or upload any car as a `.glb` file. Installed parts appear on the car; wishlist parts can be previewed in blue. Your build level goes up as you install mods.
- **Part library.** Type a part's name and Garage Log builds a matching 3D part: front lips, splitters, canards, side skirts, diffusers, trunk spoilers, GT wings, roof spoilers, hood scoops and vents, fender vents, mirror caps, wind deflectors, exhaust tips, mud flaps, roof racks, light bars, tow straps, plate relocation. Tint, lowering, wheel spacers, paint protection and wraps change the car itself. Every part has finish, size and position controls.
- **Optional AI design.** For parts the library doesn't know, Claude can design one from its name and notes, using your own Anthropic API key.
- **Private by default.** Everything is saved in your browser (localStorage and IndexedDB). There's no account, no server, no analytics and no tracking. Fonts and libraries are served from the site itself.
- **Sync across devices (optional).** "Sync with Google Drive" keeps a garage, including uploaded 3D models, in a hidden app folder in the user's own Google Drive and merges changes between devices. The app only gets the `drive.appdata` permission and never sees anything else in the Drive. Backups (**Settings → Download backup**) still work without it.

> **Disclaimer:** Garage Log is a record-keeping tool provided as is, with no warranty. It isn't mechanical, safety or legal advice, and its 3D and AI-generated parts are visual approximations. Vehicle work and modifications are at your own risk; follow your owner's manual, safe practices and local laws. See the [Terms of Use](terms.html) and [Privacy Policy](privacy.html).

## Run it

It's a static site with no build step. Serve the folder with any static file server:

```bash
npx serve .
```

Then open the address it prints. (Opening `index.html` straight from disk won't load the 3D model, because browsers block file access from `file://` pages.)

### Deploy to GitHub Pages

1. Push this repository to GitHub.
2. In the repository, go to **Settings → Pages**, set **Source** to *Deploy from a branch*, and pick `main` and `/ (root)`.
3. Your site appears at `https://<your-username>.github.io/<repository-name>/` within a minute or two.

### Releasing changes

GitHub Pages lets browsers cache files for 10 minutes. Before committing a release, run `node tools/stamp.mjs`: it adds a fresh `?v=` version to every local script, stylesheet and module import so visitors get the new files right away.

### Turn on Google Drive sync (for your own copy)

Sync needs a Google OAuth client ID for your site's address. It's free.

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable the **Google Drive API**.
2. Under **APIs & Services → OAuth consent screen**, set the app name, your support email, the home page (your site) and the privacy policy (`<your site>/privacy.html`). Add the scope `https://www.googleapis.com/auth/drive.appdata`.
3. Under **Credentials → Create credentials → OAuth client ID**, choose **Web application** and add your site's origin (for example `https://<your-username>.github.io`) as an authorized JavaScript origin. Add `http://localhost:3000` too if you test locally.
4. Put the client ID in `GOOGLE_CLIENT_ID` in `js/config.js`.

Until you publish the consent screen, only the test users you add there can sign in.

## How the 3D parts work

`js/parts.js` describes every part as a list of simple primitives (box, cylinder, wedge, ellipsoid, airfoil) placed on a **car frame**: key positions such as the bumpers, hood, roof, trunk lip, mirrors and wheels. The frame is measured exactly for the built-in Supra and estimated from the bounding box for uploaded models, so parts on uploaded models may need a nudge with the **Move** and **Size** controls.

To add a part to the library, add a template to `TEMPLATES` and a name pattern to `MATCHERS` in `js/parts.js`. Coordinates are meters, with +x toward the nose, +y up and +z toward the car's right side; `mirror: true` copies a primitive to the left side.

### AI part design

`js/ai.js` sends the part's name, brand and notes, plus the car's dimensions and named anchor points, to the Claude API. Claude replies with primitives in a fixed JSON schema (structured outputs), which the app validates and renders. The request runs in the visitor's browser with their own API key, which is stored only in that browser. It uses `claude-opus-5-5` with server-side refusal fallback enabled. Each design costs a few cents.

## Project layout

```
index.html          page structure
css/style.css       styles (light and dark themes)
js/app.js           app logic: cars, logs, parts, forms, build panel, backups
js/store.js         browser storage, merging, backup import/export
js/sync.js          optional Google Drive sync
js/config.js        Google client ID and repo link
js/parts.js         3D part library, name matching and car frames
js/garage3d.js      three.js scene, models, effects and camera
js/ai.js            optional AI part designer
models/             built-in Supra model and its license
vendor/             three.js r128 and fonts, with their licenses
privacy.html        Privacy Policy
terms.html          Terms of Use
```

The page's Content-Security-Policy only allows code from the site itself, plus Google sign-in and Drive (for sync) and Anthropic's API and the jsDelivr copy of its SDK (for AI design).

## Credits, licenses and policies

- [Privacy Policy](PRIVACY.md) · [Terms of Use](TERMS.md) · [Security policy](SECURITY.md) · [Third-party notices](THIRD_PARTY_NOTICES.md)
- Code: [MIT License](LICENSE).
- Built-in 3D model: ["Toyota Supra MK5 A90"](https://sketchfab.com/3d-models/toyota-supra-mk5-a90-30528ef37af844919074498f979b9515) by [pryanex](https://sketchfab.com/pryanex), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Simplified and compressed for the web; see `models/supra-a90-LICENSE.txt`. The model is not covered by the MIT License.
- Toyota and GR Supra are trademarks of Toyota Motor Corporation. This project isn't affiliated with or endorsed by Toyota.
