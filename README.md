# Garage Log

Track your cars' services, mods, parts and tools, plan a wishlist, and watch each mod appear on your car in a 3D garage.

**Use it:** https://rup2014.github.io/Garage-Log/

- **Multiple cars.** Each car has its own service history, parts, wishlist and odometer. Tools are shared by all your cars.
- **3D garage.** A built-in Toyota GR Supra (A90) model, or upload any car as a `.glb` file. Installed parts appear on the car; wishlist parts can be previewed in blue. Your build level goes up as you install mods.
- **Part library.** Type a part's name and Garage Log builds a matching 3D part: front lips, splitters, canards, side skirts, diffusers, trunk spoilers, GT wings, roof spoilers, hood scoops and vents, fender vents, mirror caps, wind deflectors, exhaust tips, mud flaps, roof racks, light bars, tow straps, plate relocation. Tint, lowering, wheel spacers, paint protection and wraps change the car itself. Every part has finish, size and position controls.
- **Optional AI design.** For parts the library doesn't know, Claude can design one from its name and notes, using your own Anthropic API key.
- **Private by default.** Everything is saved in your browser (localStorage and IndexedDB). There's no account and no server. Use **Settings → Download backup** to keep a copy or move to another device.

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
js/store.js         browser storage and backup import/export
js/parts.js         3D part library, name matching and car frames
js/garage3d.js      three.js scene, models, effects and camera
js/ai.js            optional AI part designer
models/             built-in Supra model and its license
```

Libraries load from CDNs: [three.js](https://threejs.org) r128 and its GLTFLoader, plus the [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript) (loaded only when AI design is used).

## Credits and licenses

- Code: [MIT License](LICENSE).
- Built-in 3D model: ["Toyota Supra MK5 A90"](https://sketchfab.com/3d-models/toyota-supra-mk5-a90-30528ef37af844919074498f979b9515) by [pryanex](https://sketchfab.com/pryanex), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Simplified and compressed for the web; see `models/supra-a90-LICENSE.txt`. The model is not covered by the MIT License.
- Toyota and GR Supra are trademarks of Toyota Motor Corporation. This project isn't affiliated with or endorsed by Toyota.
