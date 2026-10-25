// Everything stays on this device: the garage (cars, log, items) as JSON in localStorage, uploaded
// 3D models as blobs in IndexedDB. Export/import moves a garage between browsers or devices.
const KEY = "garage-log.v1";
const listeners = new Set();
let data = { cars: [], log: [], items: [] };

const normalize = (d) => ({
  cars: Array.isArray(d && d.cars) ? d.cars : [],
  log: Array.isArray(d && d.log) ? d.log : [],
  items: Array.isArray(d && d.items) ? d.items : [],
});

export function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) data = normalize(JSON.parse(raw)); } catch (e) { console.warn("Garage Log: couldn't read saved data", e); }
  return data;
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); }
  catch (e) { throw Object.assign(new Error("This browser's storage is full."), { code: "storage_full" }); }
  listeners.forEach((fn) => fn(data));
}
export const get = () => data;
export const onChange = (fn) => listeners.add(fn);
export const newId = (prefix) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function put(collection, doc) {
  const list = data[collection], i = list.findIndex((x) => x.id === doc.id);
  if (i >= 0) list[i] = doc; else list.push(doc);
  persist();
}
export function patch(collection, id, fields) {
  const doc = data[collection].find((x) => x.id === id);
  if (doc) { Object.assign(doc, fields); persist(); }
}
export function remove(collection, ids) {
  const drop = new Set([].concat(ids));
  data[collection] = data[collection].filter((x) => !drop.has(x.id));
  persist();
}
export function replaceAll(next) { data = normalize(next); persist(); }

// Another tab changed the garage: reload and redraw.
window.addEventListener("storage", (e) => { if (e.key === KEY) { load(); listeners.forEach((fn) => fn(data)); } });

export function exportJSON() {
  return JSON.stringify({ app: "garage-log", version: 1, exportedAt: new Date().toISOString(), ...data }, null, 2);
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

// Ask the browser not to clear this site's storage under pressure (best effort).
export function requestPersistence() { try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {} }
