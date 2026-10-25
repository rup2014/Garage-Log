import * as store from "./store.js?v=mvo60qvi";
import { TEMPLATES, FINISHES, SUPRA_FRAME, detectTemplate, templateFor, templateKind, templateLabel, primsFor } from "./parts.js?v=mvo60qvi";
import { createGarage, yawFacing } from "./garage3d.js?v=mvo60qvi";
import { designPart, getKey, setKey } from "./ai.js?v=mvo60qvi";
import * as sync from "./sync.js?v=mvo60qvi";

// The garage holds every car's records; S.profile / S.log / S.items are the selected car's view.
// Parts and log entries carry a carId (missing = the first car); tools are shared by all cars.
const S = { cars: [], allLog: [], allItems: [], carId: null, profile: {}, log: [], items: [], logF: "all", partsF: "all", wishF: "all", logQ: "", partsQ: "", wishQ: "", preview: new Set(), prevInstalled: new Set(), loaded: false };
try { S.carId = localStorage.getItem("garage-log.car"); } catch (e) {}
const DEFAULT_PAINT = "#121316";
const MAX_MODEL_MB = 60;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const cur = () => S.profile.currency || "$";
const money = (n) => cur() + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const unit = () => S.profile.unit || "mi";
const miles = (n) => (n || n === 0) && n !== "" ? Number(n).toLocaleString() + " " + unit() : "";
const fmtDate = (d) => { if (!d) return ""; const t = new Date(d + "T00:00:00"); return isNaN(t) ? d : t.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); };
const today = () => new Date().toISOString().slice(0, 10);
const nowISO = () => new Date().toISOString();
const safeUrl = (u) => /^https?:\/\//i.test(u || "") ? u : "";

function toast(msg) {
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2400);
}
function save(fn) {
  try { fn(); return true; }
  catch (e) { toast(e.code === "storage_full" ? "This browser's storage is full. Download a backup, then delete old entries." : "Couldn't save. Try again."); return false; }
}

/* ---------- tabs ---------- */
const TABS = ["overview", "log", "parts", "wishlist"];
function showTab(name) {
  if (!TABS.includes(name)) name = "overview";
  TABS.forEach((t) => { $(t).hidden = t !== name; $("tab-" + t).setAttribute("aria-selected", t === name); });
  try { history.replaceState(null, "", "#" + name); } catch (e) {}
}
TABS.forEach((t) => $("tab-" + t).addEventListener("click", () => showTab(t)));
document.querySelectorAll("[data-go]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); showTab(a.dataset.go); }));
function wireSeg(id, key) {
  $(id).addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    S[key] = b.dataset.f;
    $(id).querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
    render();
  });
}
wireSeg("logFilter", "logF"); wireSeg("partsFilter", "partsF"); wireSeg("wishFilter", "wishF");
function wireSearch(id, key) {
  $(id).addEventListener("input", (e) => { S[key] = e.target.value; render(); });
}
wireSearch("logSearch", "logQ"); wireSearch("partsSearch", "partsQ"); wireSearch("wishSearch", "wishQ");

/* ---------- cars ---------- */
const carName = (c) => c.nickname || [c.year, c.make, c.model].filter(Boolean).join(" ") || "My car";
const byCreated = (a, b) => (a.createdAt || "").localeCompare(b.createdAt || "") || a.id.localeCompare(b.id);
function selectView() {
  if (S.cars.length && !S.cars.some((c) => c.id === S.carId)) S.carId = S.cars[0].id;
  const first = S.cars.length ? S.cars[0].id : null;
  const mine = (x) => (x.carId || first) === S.carId;
  S.profile = S.cars.find((c) => c.id === S.carId) || {};
  S.log = S.allLog.filter(mine);
  S.items = S.allItems.filter((i) => i.kind === "tool" || mine(i));
}
function chooseCar(id) {
  S.carId = id;
  try { localStorage.setItem("garage-log.car", id); } catch (e) {}
  S.preview.clear(); S.loaded = false;
  render();
  S.loaded = true;
}
const newCarValues = () => ({ unit: "mi", currency: S.profile.currency || "$", paint: DEFAULT_PAINT, paintCustom: DEFAULT_PAINT });
$("carSelect").addEventListener("change", (e) => {
  const v = e.target.value;
  if (v === "__new") { e.target.value = S.carId || "__none"; openForm("car", newCarValues()); $("dlgTitle").textContent = "Add a car"; }
  else if (v !== "__none") chooseCar(v);
});

/* ---------- rendering ---------- */
function renderHeader() {
  const p = S.profile;
  const ymm = [p.year, p.make, p.model].filter(Boolean).join(" ");
  $("carSelect").innerHTML = (S.cars.length ? S.cars.map((c) => `<option value="${esc(c.id)}"${c.id === S.carId ? " selected" : ""}>${esc(carName(c))}</option>`).join("") : `<option value="__none" selected>Garage Log</option>`)
    + `<option value="__new">+ Add a car</option>`;
  const sub = [p.nickname ? ymm : "", p.trim, p.vin && "VIN " + p.vin].filter(Boolean).join(" · ");
  $("carSub").textContent = S.cars.length ? sub : "Track services, mods, parts and tools";
  $("odoDigits").innerHTML = String(Math.round(currentOdo())).padStart(6, "0").split("").map((d) => "<span>" + d + "</span>").join("");
  $("odoUnit").textContent = unit();
  $("editCar").hidden = !S.cars.length;
}
function currentOdo() {
  return Math.max(num(S.profile.mileage), S.log.reduce((m, e) => Math.max(m, num(e.mileage)), 0));
}

function logRow(e, compact) {
  return `<div class="row">
    <div class="when"><span>${esc(fmtDate(e.date))}</span><span>${esc(miles(e.mileage))}</span></div>
    <div class="what">
      <span class="title">${esc(e.title)}</span>
      <span class="meta"><span class="chip ${e.type === "mod" ? "mod" : "service"}">${e.type === "mod" ? "Mod" : "Service"}</span>${e.shop ? `<span>${esc(e.shop)}</span>` : ""}${e.parts ? `<span>Parts: ${esc(e.parts)}</span>` : ""}</span>
      ${!compact && e.notes ? `<span class="notes">${esc(e.notes)}</span>` : ""}
    </div>
    <div class="side">${num(e.cost) ? `<span class="cost">${money(e.cost)}</span>` : ""}${!compact ? `<span class="actions"><button class="btn small" data-edit-log="${esc(e.id)}" type="button">Edit</button></span>` : ""}</div>
  </div>`;
}
function itemRow(it, compact) {
  const st = it.status || "owned";
  const stLabel = { wishlist: "Wishlist", ordered: "Ordered", owned: "Owned", installed: "Installed" }[st] || st;
  const qty = num(it.qty) > 1 ? num(it.qty) : 1;
  const total = num(it.price) * qty;
  const url = safeUrl(it.link);
  const tpl = it.kind !== "tool" ? templateFor(it) : null;
  return `<div class="row">
    <div class="when"><span>${st === "wishlist" ? (it.priority ? esc(it.priority[0].toUpperCase() + it.priority.slice(1)) + " priority" : "Planned") : esc(fmtDate(it.date))}</span></div>
    <div class="what">
      <span class="title">${esc(it.name)}${qty > 1 ? ` <span class="mono">×${qty}</span>` : ""}</span>
      <span class="meta">
        <span class="chip ${it.kind === "tool" ? "tool" : "part"}">${it.kind === "tool" ? "Tool" : "Part"}</span>
        <span class="chip st-${esc(st)}">${esc(stLabel)}</span>
        ${tpl && templateKind(tpl) !== "hidden" ? `<span class="chip st-none" title="Shown on the 3D car">3D: ${esc(templateLabel(tpl))}</span>` : ""}
        ${it.brand ? `<span>${esc(it.brand)}</span>` : ""}
        ${it.partNumber ? `<span class="pn">${esc(it.partNumber)}</span>` : ""}
        ${it.vendor ? `<span>${esc(it.vendor)}</span>` : ""}
        ${url ? `<a class="link" href="${esc(url)}" target="_blank" rel="noopener">Product page</a>` : ""}
      </span>
      ${!compact && it.notes ? `<span class="notes">${esc(it.notes)}</span>` : ""}
    </div>
    <div class="side">${total ? `<span class="cost">${st === "wishlist" ? "~" : ""}${money(total)}</span>` : ""}${!compact ? `<span class="actions">${st === "wishlist" ? `<button class="btn small" data-bought="${esc(it.id)}" type="button">Mark bought</button>` : ""}${(st === "owned" || st === "ordered") && it.kind !== "tool" ? `<button class="btn small" data-install="${esc(it.id)}" type="button">Install</button>` : ""}${st === "owned" || st === "ordered" ? `<button class="btn small" data-unbuy="${esc(it.id)}" type="button">Move to wishlist</button>` : ""}<button class="btn small" data-edit-item="${esc(it.id)}" type="button">Edit</button></span>` : ""}</div>
  </div>`;
}
const empty = (title, body, newKind, label) => `<div class="empty"><strong>${title}</strong><span>${body}</span>${newKind ? `<button class="btn primary" data-new="${newKind}" type="button">${label}</button>` : ""}</div>`;
const byDateDesc = (a, b) => (b.date || "").localeCompare(a.date || "") || num(b.mileage) - num(a.mileage);
const prRank = { high: 0, medium: 1, low: 2 };
const byPriority = (a, b) => (prRank[a.priority] ?? 1) - (prRank[b.priority] ?? 1) || (a.name || "").localeCompare(b.name || "");
function matches(q, text) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = text.toLowerCase();
  return terms.every((t) => hay.includes(t));
}
const logText = (e) => [e.title, e.shop, e.parts, e.notes, e.type].filter(Boolean).join(" ");
const itemText = (i) => [i.name, i.brand, i.partNumber, i.vendor, i.notes, i.kind, i.priority].filter(Boolean).join(" ");

function render() {
  selectView();
  renderHeader();
  const noCars = !S.cars.length;
  document.body.classList.toggle("no-cars", noCars);
  $("welcome").hidden = !noCars;
  const log = [...S.log].sort(byDateDesc);
  const owned = S.items.filter((i) => (i.status || "owned") !== "wishlist").sort(byDateDesc);
  const wish = S.items.filter((i) => i.status === "wishlist").sort(byPriority);
  const lineTotal = (i) => num(i.price) * (num(i.qty) > 1 ? num(i.qty) : 1);
  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);

  $("cLog").textContent = log.length || ""; $("cParts").textContent = owned.length || ""; $("cWish").textContent = wish.length || "";
  const svc = log.filter((e) => e.type !== "mod"), mods = log.filter((e) => e.type === "mod");
  $("sService").textContent = svc.length ? money(sum(svc, (e) => num(e.cost))) : "—";
  $("hService").textContent = svc.length ? `${svc.length} service${svc.length > 1 ? "s" : ""} logged` : "No services logged";
  $("sMods").textContent = mods.length ? money(sum(mods, (e) => num(e.cost))) : "—";
  $("hMods").textContent = mods.length ? `${mods.length} mod${mods.length > 1 ? "s" : ""} done` : "No mods logged";
  $("sBought").textContent = owned.length ? money(sum(owned, lineTotal)) : "—";
  const tools = owned.filter((i) => i.kind === "tool").length;
  $("hBought").textContent = owned.length ? `${owned.length - tools} parts · ${tools} tools` : "Nothing bought yet";
  $("sWish").textContent = wish.length ? money(sum(wish, lineTotal)) : "—";
  $("hWish").textContent = wish.length ? `${wish.length} item${wish.length > 1 ? "s" : ""} planned` : "Wishlist is empty";

  $("recentLog").innerHTML = log.length ? `<div class="records flat">${log.slice(0, 5).map((e) => logRow(e, true)).join("")}</div>` : empty("No work logged yet", "Add your last oil change or a mod you've done.", "log", "Add entry");
  $("recentWish").innerHTML = wish.length ? `<div class="records flat">${wish.slice(0, 5).map((i) => itemRow(i, true)).join("")}</div>` : empty("Nothing on the list", "Add a part or tool you plan to buy.", "wishlist", "Add to wishlist");
  const logShown = (S.logF === "all" ? log : log.filter((e) => (S.logF === "mod") === (e.type === "mod"))).filter((e) => matches(S.logQ, logText(e)));
  const logQ = S.logQ.trim();
  $("logList").innerHTML = logShown.length ? `<div class="records">${logShown.map((e) => logRow(e)).join("")}</div>`
    : log.length ? empty(logQ ? "Nothing matches your search" : "Nothing matches this filter", logQ ? "Try a different search or filter." : "Try another filter.", "")
    : empty("Your service record is empty", "Log services and mods with date, mileage and cost.", "log", "Add entry");
  const partsShown = (S.partsF === "all" ? owned : owned.filter((i) => (i.kind || "part") === S.partsF)).filter((i) => matches(S.partsQ, itemText(i)));
  const partsQ = S.partsQ.trim();
  $("partsList").innerHTML = partsShown.length ? `<div class="records">${partsShown.map((i) => itemRow(i)).join("")}</div>
    <div class="total-line"><span>${partsShown.length} item${partsShown.length > 1 ? "s" : ""}</span><span>Total <b>${money(sum(partsShown, lineTotal))}</b></span></div>`
    : owned.length ? empty(partsQ ? "Nothing matches your search" : "Nothing matches this filter", partsQ ? "Try a different search or filter." : "Try another filter.", "")
    : empty("No purchases yet", "Record parts and tools you've bought, with price and part number.", "owned", "Add purchase");
  const wishShown = (S.wishF === "all" ? wish : wish.filter((i) => (i.kind || "part") === S.wishF)).filter((i) => matches(S.wishQ, itemText(i)));
  const wishQ = S.wishQ.trim();
  $("wishList").innerHTML = wishShown.length ? `<div class="records">${wishShown.map((i) => itemRow(i)).join("")}</div>
    <div class="total-line"><span>${wishShown.length} item${wishShown.length > 1 ? "s" : ""}</span><span>Estimated <b>${money(sum(wishShown, lineTotal))}</b></span></div>`
    : wish.length ? empty(wishQ ? "Nothing matches your search" : "Nothing matches this filter", wishQ ? "Try a different search or filter." : "Try another filter.", "")
    : empty("Your wishlist is empty", "Add parts and tools you plan to buy, with a link and expected price.", "wishlist", "Add to wishlist");
  renderBuild();
}

/* ---------- forms ---------- */
const PAINTS = [["#121316", "Black"], ["#9ea3a8", "Silver"], ["#5d6166", "Gray"], ["#ebecee", "White"], ["#a3141c", "Red"], ["#e8c400", "Yellow"], ["#1f4fa8", "Blue"], ["#e0661a", "Orange"], ["custom", "Custom color"]];
const P3D_KEYS = ["shape", "finish", "size", "moveFwd", "moveUp", "moveOut", "color"];
const shapeOptions = (name) => {
  const det = detectTemplate(name);
  return [["auto", `Automatic (${det ? templateLabel(det) : "no match for this name"})`], ...Object.entries(TEMPLATES).map(([id, t]) => [id, t.label]), ["ai", "Designed by AI"], ["none", "Don't show on the car"]];
};
const FORMS = {
  car: { title: "Car details", fields: [
    ["nickname", "Nickname", "text", { full: true, ph: "e.g. The Civic" }],
    ["year", "Year", "number"], ["make", "Make", "text"], ["model", "Model", "text"], ["trim", "Trim / engine", "text"],
    ["mileage", "Current odometer", "number"], ["unit", "Units", "select", { opts: [["mi", "Miles"], ["km", "Kilometres"]] }],
    ["vin", "VIN", "text"], ["currency", "Currency symbol", "text", { ph: "$" }],
    ["paint", "Paint (for the 3D view)", "select", { opts: PAINTS }],
    ["paintCustom", "Custom color", "color"],
  ] },
  log: { title: "Service or mod", fields: [
    ["type", "Type", "select", { opts: [["service", "Service / repair"], ["mod", "Modification"]] }],
    ["date", "Date", "date"],
    ["title", "What was done", "text", { full: true, req: true, ph: "e.g. Oil and filter change, 0W-20" }],
    ["mileage", "Odometer", "number"], ["cost", "Cost", "number", { step: "0.01" }],
    ["shop", "Done by", "text", { ph: "DIY or shop name" }], ["parts", "Parts used", "text", { ph: "e.g. OEM filter, 4.4 qt oil" }],
    ["notes", "Notes", "textarea", { full: true }],
  ] },
  item: { title: "Part or tool", fields: [
    ["name", "Name", "text", { full: true, req: true, ph: "e.g. Carbon GT wing" }],
    ["kind", "Kind", "select", { opts: [["part", "Part"], ["tool", "Tool"]] }],
    ["status", "Status", "select", { opts: [["wishlist", "Wishlist"], ["ordered", "Ordered"], ["owned", "Owned"], ["installed", "Installed"]] }],
    ["brand", "Brand", "text"], ["partNumber", "Part number", "text"],
    ["price", "Price (each)", "number", { step: "0.01" }], ["qty", "Quantity", "number", { ph: "1" }],
    ["vendor", "Store", "text"], ["date", "Purchase date", "date"],
    ["priority", "Priority", "select", { opts: [["", "—"], ["high", "High"], ["medium", "Medium"], ["low", "Low"]] }],
    ["link", "Link", "url", { ph: "https://" }],
    ["notes", "Notes", "textarea", { full: true }],
    ["__p3d", "3D part on the car", "heading", { full: true, p3d: true }],
    ["shape", "Shape", "select", { full: true, p3d: true, opts: [] }],
    ["finish", "Finish", "select", { p3d: true, opts: [["auto", "Automatic"], ...Object.entries(FINISHES)] }],
    ["color", "Custom color", "color", { p3d: true }],
    ["size", "Size (%)", "number", { p3d: true, ph: "100", signed: true }],
    ["moveFwd", "Move forward (cm)", "number", { p3d: true, ph: "0", signed: true }],
    ["moveUp", "Move up (cm)", "number", { p3d: true, ph: "0", signed: true }],
    ["moveOut", "Move outward (cm)", "number", { p3d: true, ph: "0", signed: true }],
    ["__ai", "", "ai", { full: true, p3d: true }],
  ] },
};
let dlgCtx = null;
function openForm(kind, values, docRef) {
  const f = FORMS[kind];
  dlgCtx = { kind, ref: docRef || null, aiSpec: null };
  const title = (docRef ? "Edit " : kind === "car" ? "" : "Add ") + f.title.toLowerCase();
  $("dlgTitle").textContent = title.replace(/^./, (c) => c.toUpperCase());
  $("dlgFields").innerHTML = f.fields.map(([k, label, type, o = {}]) => {
    const id = "f-" + k, v = values[k] ?? "", cls = `field${o.full ? " full" : ""}${o.p3d ? " p3d" : ""}`;
    if (type === "heading") return `<div class="${cls}"><span class="form-sub">${label}</span><span class="set-note">Shown when the part is installed, or while you preview it. Leave it on Automatic to use the part library.</span></div>`;
    if (type === "ai") return `<div class="${cls}"><div class="ai-row"><button type="button" class="btn small" id="aiDesign">Design with AI</button><span class="set-note" id="aiStatus" role="status"></span></div></div>`;
    let input;
    const opts = k === "shape" ? shapeOptions(values.name) : o.opts;
    if (type === "select") input = `<select id="${id}" name="${k}">${opts.map(([ov, ol]) => `<option value="${esc(ov)}"${String(v) === ov ? " selected" : ""}>${esc(ol)}</option>`).join("")}</select>`;
    else if (type === "textarea") input = `<textarea id="${id}" name="${k}">${esc(v)}</textarea>`;
    else input = `<input id="${id}" name="${k}" type="${type}" value="${esc(v)}"${o.ph ? ` placeholder="${esc(o.ph)}"` : ""}${o.step ? ` step="${o.step}"` : ""}${type === "number" ? ` inputmode="decimal"${o.signed ? "" : ' min="0"'}` : ""}>`;
    return `<div class="${cls}"><label for="${id}">${label}${o.req ? " *" : ""}</label>${input}</div>`;
  }).join("");
  $("dlgErr").hidden = true;
  const del = $("dlgDelete"); del.hidden = !docRef; del.classList.remove("armed"); del.textContent = kind === "car" ? "Delete car" : "Delete";
  if (kind === "item") wireItemForm(values);
  $("dlg").showModal();
  const first = $("dlgFields").querySelector("input[type=text], input:not([type])"); if (first) first.focus();
}
function wireItemForm(values) {
  const toggle = () => document.querySelectorAll("#dlgFields .p3d").forEach((el) => (el.hidden = $("f-kind").value === "tool"));
  $("f-kind").addEventListener("change", toggle); toggle();
  $("f-name").addEventListener("input", () => { const det = detectTemplate($("f-name").value); $("f-shape").options[0].text = `Automatic (${det ? templateLabel(det) : "no match for this name"})`; });
  if (values.part3d && values.part3d.ai) $("aiStatus").textContent = `AI design saved: ${values.part3d.ai.summary || "custom part"}`;
  $("aiDesign").addEventListener("click", async () => {
    const btn = $("aiDesign"), out = $("aiStatus"), name = $("f-name").value.trim();
    if (!name) { out.textContent = "Type the part's name first."; return; }
    btn.disabled = true; out.textContent = "Designing… this can take up to a minute.";
    try {
      const spec = await designPart({ name, brand: $("f-brand").value.trim(), notes: $("f-notes").value.trim(), frame: G3D && G3D.ready ? G3D.frame() : SUPRA_FRAME, carLabel: carName(S.profile) });
      dlgCtx.aiSpec = spec;
      $("f-shape").value = "ai";
      out.textContent = `Designed: ${spec.summary || name} (${spec.primitives.length} shapes). Save to keep it.`;
    } catch (e) { out.textContent = e.message || "The design didn't work. Try again."; }
    finally { btn.disabled = false; }
  });
}
$("dlgCancel").addEventListener("click", () => $("dlg").close());
$("dlgDelete").addEventListener("click", () => {
  const del = $("dlgDelete");
  if (!del.classList.contains("armed")) { del.classList.add("armed"); del.textContent = dlgCtx.kind === "car" ? "Click again to delete this car and its history" : "Click again to delete"; return; }
  const { kind, ref } = dlgCtx;
  const ok = save(() => {
    if (kind === "car") {
      // Remove the car's own log entries and parts; shared tools stay.
      const first = S.cars.length ? S.cars[0].id : null, own = (x) => (x.carId || first) === ref;
      const car = S.cars.find((c) => c.id === ref);
      if (car && car.modelId) store.deleteModel(car.modelId).catch(() => {});
      store.remove("log", S.allLog.filter(own).map((e) => e.id));
      store.remove("items", S.allItems.filter((i) => i.kind !== "tool" && own(i)).map((i) => i.id));
      store.remove("cars", ref);
    } else store.remove(kind === "log" ? "log" : "items", ref);
  });
  if (ok) { $("dlg").close(); toast("Deleted"); }
});
$("dlgForm").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const f = FORMS[dlgCtx.kind], data = {}, p3d = {};
  for (const [k, label, type, o = {}] of f.fields) {
    if (type === "heading" || type === "ai") continue;
    let v = $("f-" + k).value.trim();
    if (o.req && !v) { $("dlgErr").hidden = false; $("dlgErr").textContent = `Fill in “${label}”.`; $("f-" + k).focus(); return; }
    if (type === "number") v = v === "" ? "" : num(v);
    (o.p3d ? p3d : data)[k] = v;
  }
  if (data.link && !safeUrl(data.link)) data.link = "https://" + data.link.replace(/^\/*/, "");
  const now = nowISO();
  let ok, previewId = null;
  if (dlgCtx.kind === "car") {
    const carId = dlgCtx.ref || store.newId("c");
    const prev = S.cars.find((c) => c.id === carId) || {};
    ok = save(() => store.put("cars", { ...prev, ...data, id: carId, updatedAt: now, createdAt: prev.createdAt || now }));
    if (ok && !dlgCtx.ref) { $("dlg").close(); toast("Car added"); chooseCar(carId); return; }
  } else {
    const coll = dlgCtx.kind === "log" ? "log" : "items";
    const id = dlgCtx.ref || store.newId(coll === "log" ? "l" : "i");
    const prev = (coll === "log" ? S.allLog : S.allItems).find((x) => x.id === id) || {};
    const doc = { ...prev, ...data, id, updatedAt: now, createdAt: prev.createdAt || now };
    if (coll === "items") {
      if (doc.status !== "wishlist" && !doc.date) doc.date = today();
      doc.carId = doc.kind === "tool" ? null : prev.carId || S.carId;
      if (doc.kind !== "tool") {
        const ai = dlgCtx.aiSpec || (prev.part3d && prev.part3d.ai) || null;
        doc.part3d = { ...p3d, ai };
        const customized = P3D_KEYS.some((k) => k !== "color" && p3d[k] !== "" && p3d[k] !== "auto") || ai;
        if (!customized) delete doc.part3d;
        const tpl = templateFor(doc);
        if (tpl && templateKind(tpl) !== "hidden" && doc.status !== "installed") previewId = id;
      }
    } else doc.carId = prev.carId || S.carId;
    ok = save(() => {
      store.put(coll, doc);
      if (dlgCtx.installId) store.patch("items", dlgCtx.installId, { status: "installed", installedAt: data.date || today(), updatedAt: now });
    });
  }
  if (ok) {
    $("dlg").close();
    if (previewId) { S.preview.add(previewId); render(); toast("Saved. Previewing it on the car."); } else toast("Saved");
  }
});

document.addEventListener("click", (e) => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.new === "log") openForm("log", { type: "service", date: today(), mileage: Math.round(currentOdo()) || "" });
  else if (t.dataset.new === "owned") openForm("item", { kind: "part", status: "owned", date: today() });
  else if (t.dataset.new === "wishlist") openForm("item", { kind: "part", status: "wishlist", priority: "medium" });
  else if (t.dataset.editLog) openForm("log", S.allLog.find((x) => x.id === t.dataset.editLog) || {}, t.dataset.editLog);
  else if (t.dataset.editItem) openItem(t.dataset.editItem);
  else if (t.dataset.bought) { openItem(t.dataset.bought, { status: "owned", date: today() }); $("dlgTitle").textContent = "Mark as bought"; }
  else if (t.dataset.unbuy) {
    const it = S.allItems.find((x) => x.id === t.dataset.unbuy); if (!it) return;
    if (save(() => store.patch("items", it.id, { status: "wishlist", priority: it.priority || "medium" }))) toast("Moved to wishlist");
  }
  else if (t.dataset.install) {
    const it = S.allItems.find((x) => x.id === t.dataset.install); if (!it) return;
    const qty = num(it.qty) > 1 ? num(it.qty) : 1;
    openForm("log", { type: "mod", date: today(), mileage: Math.round(currentOdo()) || "", title: "Installed " + it.name, cost: num(it.price) * qty || "", shop: "DIY", parts: [it.brand, it.partNumber].filter(Boolean).join(" ") });
    dlgCtx.installId = it.id;
    $("dlgTitle").textContent = "Log the install";
  }
  else if (t.id === "editCar") openForm("car", { paint: DEFAULT_PAINT, paintCustom: DEFAULT_PAINT, ...S.profile }, S.carId);
  else if (t.id === "welcomeAdd") { openForm("car", newCarValues()); $("dlgTitle").textContent = "Add a car"; }
  else if (t.id === "welcomeDemo") loadDemo();
  else if (t.id === "welcomeImport") $("importFile").click();
  else if (t.id === "welcomeSync" || t.id === "syncConnect" || t.id === "syncRun" || t.id === "syncBtn") sync.connect();
  else if (t.id === "syncOff") { sync.disconnect(); toast("Sync stopped in this browser. Your Drive copy is kept."); }
});
function openItem(id, overrides = {}) {
  const it = S.allItems.find((x) => x.id === id); if (!it) return;
  const p = it.part3d || {};
  openForm("item", { ...it, ...Object.fromEntries(P3D_KEYS.map((k) => [k, p[k] ?? ""])), shape: p.shape || "auto", finish: p.finish || "auto", color: p.color || "#888888", ...overrides }, id);
}

/* ---------- 3D garage ---------- */
// Tools appear as props around the garage floor once you own them.
const GSLOTS = [
  { key: "toolbox", label: "Tool chest", re: /mechanic|tool set|tool chest|toolbox/i },
  { key: "torque", label: "Torque wrenches", re: /torque wrench/i },
  { key: "jack", label: "Floor jack", re: /floor jack/i, not: /adapter|pad/i },
  { key: "stands", label: "Jack stands", re: /jack stand/i, not: /adapter/i },
  { key: "ramps", label: "Ramps", re: /ramp/i },
  { key: "chocks", label: "Wheel chocks", re: /chock/i },
  { key: "maintainer", label: "Battery maintainer", re: /battery maintainer|battery charger/i },
];
const RANK = { wishlist: 1, ordered: 2, owned: 3, installed: 4 };
const STATE_LABEL = { wishlist: "Wishlist", ordered: "Ordered", owned: "Not installed", installed: "Installed" };
const modelBlobs = new Map();
let G3D = null;

function modelSource(p) {
  if (p.modelId) {
    const blob = modelBlobs.get(p.modelId);
    if (blob === undefined) {
      modelBlobs.set(p.modelId, null);
      store.loadModel(p.modelId).then((b) => { modelBlobs.set(p.modelId, b || false); renderBuild(); }, () => { modelBlobs.set(p.modelId, false); renderBuild(); });
    }
    if (blob) return { key: p.modelId, blob, builtin: false, yaw: (num(p.modelYaw) * Math.PI) / 180 };
    if (blob === false) return null; // missing from this browser (e.g. after importing a backup)
    return "loading";
  }
  return /supra/i.test(`${p.make || ""} ${p.model || ""}`) ? { key: "builtin", url: "models/supra-a90.glb", builtin: true, yaw: 0 } : null;
}
const modelStatus = (msg, isErr) => { const el = $("modelStatus"); el.hidden = !msg; el.textContent = msg || ""; el.classList.toggle("err", !!isErr); };

function renderBuild() {
  const p = S.profile, garage = document.querySelector(".garage");
  garage.hidden = !S.carId;
  if (garage.hidden) return;
  if (!G3D) {
    G3D = createGarage($("garage3d"), { onReady: () => renderBuild(), onStatus: (msg, isErr) => { $("viewerTag").textContent = isErr ? "" : msg; if (isErr) modelStatus(msg, true); } });
    if (G3D.failed) $("viewerFallback").hidden = false;
  }
  const src = modelSource(p);
  if (src !== "loading") G3D.showModel(src);
  const custom = !!(src && src !== "loading" && !src.builtin);
  $("viewerEmpty").hidden = !!src || G3D.failed;
  $("viewerTools").hidden = !src || src === "loading" || G3D.failed;
  $("modelUpload").textContent = custom ? "Replace model" : "Use my own model";
  $("modelTurn").hidden = $("modelRemove").hidden = !custom;
  $("creditBuiltin").hidden = !(src && src.builtin);
  $("creditCustom").hidden = !custom;
  $("creditCustom").textContent = custom ? `3D model: ${p.modelName || "your upload"}. Parts are placed from the model's size, so use Move and Size on a part to fine-tune it.` : "";
  if (p.modelId && modelBlobs.get(p.modelId) === false) modelStatus("This car's 3D model isn't in this browser. Upload it again to see it.", true);

  // Parts for this car that have a 3D template (or count as a mod), and the tools on the floor.
  const mods = S.items.filter((it) => it.kind !== "tool").map((it) => ({ it, tpl: templateFor(it) })).filter((m) => m.tpl);
  const st = (it) => it.status || "owned";
  const installed = mods.filter((m) => st(m.it) === "installed");
  const pct = mods.length ? Math.round((installed.length / mods.length) * 100) : 0;
  $("lvl").textContent = installed.length;
  $("meterFill").style.width = pct + "%"; $("meter").setAttribute("aria-valuenow", pct);
  $("meterText").textContent = mods.length ? `${installed.length} of ${mods.length} planned mods installed` : "Add parts to your wishlist to plan your build";
  if (G3D.ready && src && src !== "loading") $("viewerTag").textContent = installed.length ? `Level ${installed.length} build` : "Stock";

  const tools = {};
  S.items.filter((i) => i.kind === "tool").forEach((it) => {
    const s = GSLOTS.find((g) => g.re.test(it.name || "") && !(g.not && g.not.test(it.name || ""))); if (!s) return;
    if (!tools[s.key] || RANK[st(it)] > RANK[tools[s.key]]) tools[s.key] = st(it);
  });
  const chip = (s, tool) => !s ? `<span class="chip st-none">Not planned</span>`
    : `<span class="chip st-${s}">${tool && s !== "wishlist" && s !== "ordered" ? "Owned" : STATE_LABEL[s]}</span>`;
  $("slots").innerHTML = mods.length ? mods.map(({ it, tpl }) => {
    const hidden = templateKind(tpl) === "hidden";
    return `<li><button type="button" data-slot="${esc(it.id)}" aria-pressed="${S.preview.has(it.id)}"${hidden ? ' title="Not visible on the car"' : ""}><span>${esc(it.name)}${hidden ? ' <span class="off">· under the hood</span>' : ""}</span>${chip(st(it))}</button></li>`;
  }).join("") : `<li class="hint">Parts you add appear here. Tap one to preview it on the car.</li>`;
  $("gslots").innerHTML = GSLOTS.map((g) => `<li><button type="button" data-gslot="${g.key}"><span class="${tools[g.key] ? "" : "off"}">${g.label}</span>${chip(tools[g.key], true)}</button></li>`).join("");

  const nowInstalled = new Set(installed.map((m) => m.it.id));
  const preview = new Set(S.preview);
  if ($("previewAll").checked) mods.forEach((m) => preview.add(m.it.id));
  const frame = G3D.ready ? G3D.frame() : SUPRA_FRAME;
  const parts = [], effects = {};
  mods.forEach(({ it, tpl }) => {
    const on = st(it) === "installed", pv = preview.has(it.id) && !on;
    if (!on && !pv) return;
    const kind = templateKind(tpl);
    if (kind === "effect") effects[tpl] = tpl === "wrap" ? (it.part3d && it.part3d.color) || "#888888" : true;
    else if (kind === "part") parts.push({ id: it.id, prims: primsFor(it, frame), ghost: pv });
  });
  if (S.loaded) {
    const fresh = installed.filter((m) => !S.prevInstalled.has(m.it.id));
    if (fresh.length) {
      const m = fresh[fresh.length - 1];
      G3D.focus(yawFacing(primsFor(m.it, frame)));
      toast(`${m.it.name} installed · Level ${installed.length}`);
    }
  }
  S.prevInstalled = nowInstalled;
  G3D.apply({ paintHex: p.paint === "custom" ? p.paintCustom : p.paint || DEFAULT_PAINT, parts, effects, tools: Object.fromEntries(Object.entries(tools).map(([k, v]) => [k, v === "owned" || v === "installed"])) });
}
$("slots").addEventListener("click", (e) => {
  const b = e.target.closest("[data-slot]"); if (!b) return;
  const id = b.dataset.slot, it = S.items.find((x) => x.id === id);
  if (S.preview.has(id)) S.preview.delete(id); else S.preview.add(id);
  if (it && G3D && G3D.ready) G3D.focus(yawFacing(primsFor(it, G3D.frame())));
  renderBuild();
});
$("gslots").addEventListener("click", (e) => { if (e.target.closest("[data-gslot]") && G3D) G3D.focus(-1.35); });
$("previewAll").addEventListener("change", renderBuild);

/* ---------- uploading a car's own 3D model ---------- */
$("viewerEmptyBtn").addEventListener("click", () => $("modelFile").click());
$("modelUpload").addEventListener("click", () => $("modelFile").click());
$("modelFile").addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0]; e.target.value = "";
  if (!file || !S.carId) return;
  const carId = S.carId;
  if (!/\.glb$/i.test(file.name)) return modelStatus("Choose a .glb file. On Sketchfab, download the glTF Binary (.glb) version.", true);
  if (file.size > MAX_MODEL_MB * 1048576) return modelStatus(`That model is ${(file.size / 1048576).toFixed(1)} MB. The limit is ${MAX_MODEL_MB} MB, so download a smaller version of it.`, true);
  try {
    modelStatus("Checking the model…");
    const buf = await file.arrayBuffer();
    if (new TextDecoder().decode(new Uint8Array(buf, 0, 4)) !== "glTF") return modelStatus("That file isn't a valid .glb model.", true);
    await new Promise((res, rej) => new THREE.GLTFLoader().parse(buf, "", res, rej));
    const id = store.newId("m"), prev = (S.cars.find((c) => c.id === carId) || {}).modelId;
    await store.saveModel(id, new Blob([buf], { type: "model/gltf-binary" }));
    modelBlobs.set(id, new Blob([buf], { type: "model/gltf-binary" }));
    store.patch("cars", carId, { modelId: id, modelName: file.name, modelYaw: 0, updatedAt: nowISO() });
    if (prev) { store.deleteModel(prev).catch(() => {}); modelBlobs.delete(prev); }
    modelStatus(""); toast("3D model added");
  } catch (err) {
    modelStatus(err && err.name === "QuotaExceededError" ? "This browser doesn't have room for that model. Free up space or use a smaller file." : "That model couldn't be read. Try downloading it again as .glb.", true);
  }
});
$("modelTurn").addEventListener("click", () => save(() => store.patch("cars", S.carId, { modelYaw: (num(S.profile.modelYaw) + 90) % 360 })));
$("modelRemove").addEventListener("click", () => {
  const b = $("modelRemove");
  if (!b.classList.contains("armed")) { b.classList.add("armed"); b.textContent = "Click again to remove"; setTimeout(() => { b.classList.remove("armed"); b.textContent = "Remove"; }, 4000); return; }
  const prev = S.profile.modelId;
  save(() => store.patch("cars", S.carId, { modelId: null, modelName: null, modelYaw: 0 }));
  if (prev) { store.deleteModel(prev).catch(() => {}); modelBlobs.delete(prev); }
  b.classList.remove("armed"); b.textContent = "Remove"; modelStatus(""); toast("3D model removed");
});

/* ---------- settings: backup, AI key, start over ---------- */
$("openSettings").addEventListener("click", () => { $("apiKey").value = getKey(); $("keyStatus").textContent = getKey() ? "A key is saved in this browser." : ""; $("importStatus").textContent = ""; $("settings").showModal(); });
$("settingsClose").addEventListener("click", () => $("settings").close());
$("saveKey").addEventListener("click", () => {
  const k = $("apiKey").value.trim();
  if (!/^sk-ant-/.test(k)) { $("keyStatus").textContent = "That doesn't look like an Anthropic API key (they start with sk-ant-)."; return; }
  setKey(k); $("keyStatus").textContent = "Saved in this browser.";
});
$("clearKey").addEventListener("click", () => { setKey(""); $("apiKey").value = ""; $("keyStatus").textContent = "Key removed."; });
$("exportBtn").addEventListener("click", () => {
  const blob = new Blob([store.exportJSON()], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `garage-log-backup-${today()}.json` });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
let pendingImport = null;
$("importBtn").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0]; e.target.value = "";
  if (!file) return;
  const out = $("importStatus");
  if (!$("settings").open) $("settings").showModal();
  try {
    pendingImport = store.parseImport(await file.text());
    const n = pendingImport.cars.length, have = S.cars.length;
    if (!have) return finishImport();
    out.innerHTML = `This backup has ${n} car${n === 1 ? "" : "s"}. Importing replaces the ${have} car${have === 1 ? "" : "s"} in this browser. <button class="btn small danger" type="button" id="confirmImport">Replace my garage</button>`;
    $("confirmImport").addEventListener("click", finishImport);
  } catch (err) { pendingImport = null; out.textContent = err.message && /backup/.test(err.message) ? err.message : "That file couldn't be read as a Garage Log backup."; }
});
function finishImport() {
  if (!pendingImport) return;
  const d = pendingImport; pendingImport = null;
  if (save(() => store.replaceAll(d))) { $("importStatus").textContent = `Imported ${d.cars.length} car${d.cars.length === 1 ? "" : "s"}.`; S.loaded = false; refresh(); S.loaded = true; toast("Backup imported"); }
}
$("wipeBtn").addEventListener("click", async () => {
  const b = $("wipeBtn");
  if (!b.classList.contains("armed")) { b.classList.add("armed"); b.textContent = "Click again to delete all cars, logs, parts and models in this browser"; return; }
  // Stop syncing first, so this only clears this browser and the Google Drive copy is left alone.
  sync.disconnect();
  await Promise.all(S.cars.filter((c) => c.modelId).map((c) => store.deleteModel(c.modelId).catch(() => {})));
  store.clearLocal();
  try { localStorage.removeItem("garage-log.car"); } catch (e) {}
  b.classList.remove("armed"); b.textContent = "Delete everything in this browser";
  $("settings").close(); toast("Garage cleared");
});

/* ---------- sync ---------- */
const agoText = (d) => { const s = Math.round((Date.now() - d) / 1000); return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); };
function renderSync(st = sync.getState()) {
  const avail = sync.available(), on = st.status !== "off";
  $("syncGroup").hidden = !avail;
  $("welcomeSync").hidden = !avail;
  $("syncBtn").hidden = !avail || !on;
  $("syncBtn").textContent = { syncing: "Syncing…", synced: "Synced", "needs-auth": "Tap to sync", error: "Sync problem" }[st.status] || "Sync";
  $("syncBtn").classList.toggle("warn", st.status === "needs-auth" || st.status === "error");
  $("syncBtn").title = st.status === "synced" && st.lastSync ? `Synced with Google Drive ${agoText(st.lastSync)}` : st.error || "Sync with Google Drive";
  $("syncConnect").hidden = on;
  $("syncRun").hidden = $("syncOff").hidden = !on;
  $("syncState").textContent = !on ? "" : st.status === "syncing" ? "Syncing with Google Drive…"
    : st.status === "synced" ? `Synced with Google Drive ${st.lastSync ? agoText(st.lastSync) : ""}. Changes sync automatically while this page is open.`
    : st.status === "needs-auth" ? "Google sign-in expired. Tap Sync now to sign in again; your changes are kept until then."
    : st.error || "";
}
sync.onState((st) => {
  renderSync(st);
  if (st.status === "synced" && $("welcome").hidden === false && S.cars.length === 0) toast("Your Google Drive has no garage yet. Add a car and it will sync.");
});
sync.onModels(() => { [...modelBlobs.entries()].forEach(([id, v]) => { if (!v) modelBlobs.delete(id); }); renderBuild(); });
setInterval(() => { if (sync.getState().status === "synced") renderSync(); }, 30000);

/* ---------- demo garage ---------- */
function loadDemo() {
  const now = nowISO(), car = "demo-supra";
  const part = (id, name, status, price, extra = {}) => ({ id: "demo-" + id, carId: car, kind: "part", name, status, price, qty: 1, createdAt: now, ...extra });
  store.replaceAll({
    cars: [{ id: car, nickname: "", year: 2026, make: "Toyota", model: "GR Supra", trim: "3.0 Premium · demo", mileage: 4200, unit: "mi", currency: "$", paint: "#a3141c", createdAt: now }],
    log: [
      { id: "demo-l1", carId: car, type: "service", date: "2026-06-02", mileage: 1250, title: "Break-in oil and filter change", cost: 189, shop: "Dealer", createdAt: now },
      { id: "demo-l2", carId: car, type: "mod", date: "2026-08-14", mileage: 3100, title: "Installed carbon front lip", cost: 597, shop: "DIY", createdAt: now },
    ],
    items: [
      part("lip", "Carbon front lip", "installed", 597, { date: "2026-08-14", brand: "Example Carbon" }),
      part("tint", "Ceramic window tint", "installed", 600, { date: "2026-07-01" }),
      part("wing", "Carbon GT wing", "wishlist", 1450, { priority: "high" }),
      part("skirts", "Carbon side skirts", "wishlist", 900, { priority: "medium" }),
      part("exhaust", "Cat-back exhaust", "wishlist", 1400, { priority: "medium" }),
      part("canards", "Front canards", "wishlist", 250, { priority: "low" }),
      part("springs", "Lowering springs", "ordered", 368),
      { id: "demo-t1", kind: "tool", name: "Low-profile floor jack", status: "owned", price: 240, qty: 1, date: "2026-05-20", createdAt: now },
      { id: "demo-t2", kind: "tool", name: "Jack stands (pair)", status: "owned", price: 50, qty: 2, date: "2026-05-20", createdAt: now },
    ],
  });
  chooseCar(car);
  toast("Demo garage loaded. Delete it any time in Settings.");
}

/* ---------- start ---------- */
function refresh() {
  const d = store.get();
  S.cars = [...d.cars].sort(byCreated); S.allLog = d.log; S.allItems = d.items;
  render();
}
store.load();
store.onChange(refresh);
store.requestPersistence();
showTab((location.hash || "").slice(1));
refresh();
S.loaded = true;
renderSync();
sync.start();
