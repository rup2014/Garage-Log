// Everything stays on this device: the garage (cars, log, items) as JSON in localStorage, uploaded
// 3D models as blobs in IndexedDB. Export/import moves a garage between browsers; optional Google
// Drive sync (sync.js) merges it across devices.
//
// For merging, every document carries updatedAt, and deletions leave a tombstone in `deleted`
// ({ collection: { id: deletedAt } }), so a deletion on one device isn't undone by another.
const KEY = "garage-log.v1";
const COLLECTIONS = ["cars", "log", "items"];
const listeners = new Set();
let data = blank();

function blank() { return { cars: [], log: [], items: [], deleted: { cars: {}, log: {}, items: {} } }; }
function normalize(d) {
  const out = blank();
  COLLECTIONS.forEach((c) => {
    out[c] = Array.isArray(d && d[c]) ? d[c] : [];
    out.deleted[c] = (d && d.deleted && typeof d.deleted[c] === "object" && d.deleted[c]) || {};
  });
  return out;
}
const nowISO = () => new Date().toISOString();
const stamp = (doc) => Date.parse(doc.updatedAt || doc.createdAt || 0) || 0;

export function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) data = normalize(JSON.parse(raw)); } catch (e) { console.warn("Garage Log: couldn't read saved data", e); }
  return data;
}
// origin: "local" for changes made here, "remote" for changes merged in from sync.
function persist(origin = "local") {
  try { localStorage.setItem(KEY, JSON.stringify(data)); }
  catch (e) { throw Object.assign(new Error("This browser's storage is full."), { code: "storage_full" }); }
  listeners.forEach((fn) => fn(data, origin));
}
export const get = () => data;
export const onChange = (fn) => listeners.add(fn);
export const newId = (prefix) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function put(collection, doc) {
  const list = data[collection], i = list.findIndex((x) => x.id === doc.id);
  const next = { ...doc, updatedAt: doc.updatedAt && i < 0 ? doc.updatedAt : nowISO() };
  if (i >= 0) list[i] = next; else list.push(next);
  delete data.deleted[collection][doc.id];
  persist();
}
export function patch(collection, id, fields) {
  const doc = data[collection].find((x) => x.id === id);
  if (doc) { Object.assign(doc, fields, { updatedAt: nowISO() }); persist(); }
}
export function remove(collection, ids) {
  const drop = new Set([].concat(ids)), t = nowISO();
  data[collection] = data[collection].filter((x) => !drop.has(x.id));
  drop.forEach((id) => { data.deleted[collection][id] = t; });
  persist();
}
// Replace the whole garage (import, demo). Everything not in the new set counts as deleted, so a
// synced garage follows the replacement on other devices too.
export function replaceAll(next) {
  const incoming = normalize(next), t = nowISO();
  COLLECTIONS.forEach((c) => {
    const keep = new Set(incoming[c].map((d) => d.id));
    data[c].forEach((d) => { if (!keep.has(d.id)) incoming.deleted[c][d.id] = t; });
    incoming[c] = incoming[c].map((d) => ({ ...d, updatedAt: t }));
  });
  data = incoming;
  persist();
}
// Forget everything in this browser without leaving tombstones (used after disconnecting sync).
export function clearLocal() { data = blank(); persist(); }

// Merge another copy of the garage into this one: newest version of each document wins, and a
// deletion wins over any edit made before it. Returns true when this copy changed.
export function merge(remote) {
  const r = normalize(remote);
  const merged = mergeData(data, r);
  const changed = JSON.stringify(merged) !== JSON.stringify(data);
  if (changed) { data = merged; persist("remote"); }
  return changed;
}
export function mergeData(a, b) {
  const out = blank();
  COLLECTIONS.forEach((c) => {
    const del = { ...a.deleted[c] };
    Object.entries(b.deleted[c]).forEach(([id, t]) => { if (!del[id] || Date.parse(t) > Date.parse(del[id])) del[id] = t; });
    const byId = new Map();
    [...a[c], ...b[c]].forEach((d) => { const cur = byId.get(d.id); if (!cur || stamp(d) > stamp(cur)) byId.set(d.id, d); });
    out[c] = [...byId.values()].filter((d) => {
      const t = del[d.id];
      if (!t) return true;
      if (stamp(d) > Date.parse(t)) { delete del[d.id]; return true; } // edited after it was deleted
      return false;
    }).sort((x, y) => x.id.localeCompare(y.id));
    // Tombstones older than 90 days can go; every device has synced by then.
    const cutoff = Date.now() - 90 * 864e5;
    Object.entries(del).forEach(([id, t]) => { if (Date.parse(t) < cutoff) delete del[id]; });
    out.deleted[c] = del;
  });
  return out;
}

// Another tab changed the garage: reload and redraw.
window.addEventListener("storage", (e) => { if (e.key === KEY) { load(); listeners.forEach((fn) => fn(data, "remote")); } });

export function exportJSON() {
  const { deleted, ...rest } = data;
  return JSON.stringify({ app: "garage-log", version: 1, exportedAt: nowISO(), ...rest }, null, 2);
}
export function parseImport(text) {
  const d = JSON.parse(text);
  if (!d || !Array.isArray(d.cars)) throw new Error("That file isn't a Garage Log backup.");
  return normalize(d);
}

// IndexedDB: uploaded 3D models, keyed by id.
let dbPromise;
function idb() {
  return (dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open("garage-log", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("models");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}
async function tx(mode, fn) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const t = db.transaction("models", mode), req = fn(t.objectStore("models"));
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
  });
}
export const saveModel = (id, blob) => tx("readwrite", (s) => s.put(blob, id));
export const loadModel = (id) => tx("readonly", (s) => s.get(id));
export const deleteModel = (id) => tx("readwrite", (s) => s.delete(id));
export const modelIds = () => tx("readonly", (s) => s.getAllKeys());

// Ask the browser not to clear this site's storage under pressure (best effort).
export function requestPersistence() { try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {} }
