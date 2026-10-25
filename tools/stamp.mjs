// Cache-busting: stamps every local script, stylesheet and module import with ?v=<version> so
// browsers fetch fresh copies after an update instead of reusing cached ones (GitHub Pages lets
// browsers cache files for 10 minutes). Run before committing a release:
//   node tools/stamp.mjs
// All imports of a module must carry the same version, or the browser loads it twice.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = Date.now().toString(36);
const files = ["index.html", "privacy.html", "terms.html", ...readdirSync(join(root, "js")).filter((f) => f.endsWith(".js")).map((f) => "js/" + f)];

for (const f of files) {
  const path = join(root, f), before = readFileSync(path, "utf8");
  const after = before
    // href="css/x.css", src="js/x.js", src="vendor/…js" in pages
    .replace(/((?:href|src)="(?:css|js|vendor)\/[^"?]+\.(?:css|js))(?:\?v=[\w]+)?"/g, `$1?v=${version}"`)
    // import … from "./x.js" and import("./x.js") in modules
    .replace(/((?:from |import\()\s*["']\.\/[^"'?]+\.js)(?:\?v=[\w]+)?(["'])/g, `$1?v=${version}$2`);
  if (after !== before) writeFileSync(path, after);
}
console.log("stamped", version);
