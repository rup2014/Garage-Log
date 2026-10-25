// Optional sync through the visitor's own Google Drive. The garage is kept as one JSON file, plus one
// file per uploaded 3D model, in the Drive "app data" folder: a hidden folder only this app can see.
// The app asks only for the drive.appdata permission, so it can't read anything else in the Drive.
// Nothing passes through any server of ours; the browser talks to Google directly.
import { GOOGLE_CLIENT_ID } from "./config.js?v=mvo50fl6";
import * as store from "./store.js?v=mvo50fl6";

const SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const DATA_FILE = "garage-log.json";
const PREF = "garage-log.sync";      // "on" once connected in this browser
const TOKEN = "garage-log.syncToken"; // { token, exp } kept for the session so reloads don't need a new sign-in

export const available = () => !!GOOGLE_CLIENT_ID;
const listeners = new Set();
let state = { status: "off", lastSync: null, error: "" }; // off | needs-auth | syncing | synced | error
export const getState = () => state;
export const onState = (fn) => listeners.add(fn);
let onModelsChanged = () => {};
export const onModels = (fn) => { onModelsChanged = fn; };
function set(patch) { state = { ...state, ...patch }; listeners.forEach((fn) => fn(state)); }

const isOn = () => { try { return localStorage.getItem(PREF) === "on"; } catch (e) { return false; } };
function savedToken() {
  try { const t = JSON.parse(sessionStorage.getItem(TOKEN) || "null"); return t && t.exp > Date.now() + 60e3 ? t.token : null; } catch (e) { return null; }
}
let token = null, gisPromise = null, tokenClient = null, timer = 0, running = null, again = false;

function loadGIS() {
  return (gisPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client"; s.async = true;
    s.onload = () => resolve(window.google);
    s.onerror = () => { gisPromise = null; reject(new Error("Couldn't load Google sign-in. Check your connection.")); };
    document.head.appendChild(s);
  }));
}
// Getting a token opens Google's sign-in popup when needed, so call it from a tap or click.
async function requestToken(prompt) {
  const google = await loadGIS();
  return new Promise((resolve, reject) => {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: (r) => {
        if (r.error) return reject(new Error(r.error === "access_denied" ? "Google Drive access wasn't allowed." : "Google sign-in didn't finish."));
        if (!google.accounts.oauth2.hasGrantedAllScopes(r, SCOPE)) return reject(new Error("Garage Log needs permission to use its Drive app folder to sync."));
        token = r.access_token;
        try { sessionStorage.setItem(TOKEN, JSON.stringify({ token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000 })); } catch (e) {}
        resolve(token);
      },
      error_callback: (e) => reject(new Error(e && e.type === "popup_closed" ? "The Google sign-in window was closed." : "Google sign-in was blocked. Allow pop-ups for this site and try again.")),
    });
    tokenClient.requestAccessToken({ prompt });
  });
}

async function drive(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { Authorization: "Bearer " + token, ...(opts.headers || {}) } });
  if (res.status === 401) { token = null; try { sessionStorage.removeItem(TOKEN); } catch (e) {} throw Object.assign(new Error("Google sign-in expired."), { code: "auth" }); }
  if (!res.ok) throw Object.assign(new Error(`Google Drive returned an error (${res.status}).`), { code: "drive", status: res.status });
  return res;
}
async function listFiles() {
  const q = new URLSearchParams({ spaces: "appDataFolder", fields: "files(id,name,size,modifiedTime)", pageSize: "1000" });
  return (await (await drive(`${API}?${q}`)).json()).files || [];
}
// Resumable upload works for small JSON and large models alike.
async function upload(name, blob, fileId) {
  const meta = fileId ? {} : { name, parents: ["appDataFolder"] };
  const start = await drive(`${UPLOAD}${fileId ? "/" + fileId : ""}?uploadType=resumable`, {
    method: fileId ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": blob.type || "application/octet-stream" },
    body: JSON.stringify(meta),
  });
  const loc = start.headers.get("Location");
  if (!loc) throw new Error("Google Drive didn't accept the upload.");
  const res = await fetch(loc, { method: "PUT", body: blob });
  if (!res.ok) throw Object.assign(new Error(`Google Drive upload failed (${res.status}).`), { code: "drive" });
}

// Pull the Drive copy, merge it with this one, push the result, and swap any missing 3D models.
async function syncOnce() {
  const files = await listFiles();
  const dataFile = files.find((f) => f.name === DATA_FILE);
  if (dataFile) store.merge(await (await drive(`${API}/${dataFile.id}?alt=media`)).json());
  const merged = store.get();
  await upload(DATA_FILE, new Blob([JSON.stringify({ app: "garage-log", version: 1, savedAt: new Date().toISOString(), ...merged })], { type: "application/json" }), dataFile && dataFile.id);

  const wanted = new Set(merged.cars.map((c) => c.modelId).filter(Boolean));
  const remote = new Map(files.filter((f) => /^model-.+\.glb$/.test(f.name)).map((f) => [f.name.slice(6, -4), f]));
  const local = new Set(await store.modelIds());
  let pulled = false;
  for (const id of wanted) {
    if (local.has(id) && !remote.has(id)) { const blob = await store.loadModel(id); if (blob) await upload(`model-${id}.glb`, blob); }
    else if (!local.has(id) && remote.has(id)) { await store.saveModel(id, await (await drive(`${API}/${remote.get(id).id}?alt=media`)).blob()); pulled = true; }
  }
  for (const [id, f] of remote) if (!wanted.has(id)) await drive(`${API}/${f.id}`, { method: "DELETE" }).catch(() => {});
  if (pulled) onModelsChanged();
}

// Run a sync. interactive = started by a tap, so a sign-in popup is allowed if needed.
export async function syncNow(interactive = false) {
  if (!available() || (!isOn() && !interactive)) return;
  if (running) { again = true; return running; }
  running = (async () => {
    try {
      token = token || savedToken();
      if (!token) {
        if (!interactive) { set({ status: "needs-auth" }); return; }
        await requestToken(isOn() ? "" : "consent");
      }
      try { localStorage.setItem(PREF, "on"); } catch (e) {}
      set({ status: "syncing", error: "" });
      await syncOnce();
      set({ status: "synced", lastSync: new Date(), error: "" });
    } catch (e) {
      if (e.code === "auth") set({ status: "needs-auth", error: "" });
      else set({ status: "error", error: e.message || "Sync didn't finish." });
    } finally {
      running = null;
      if (again) { again = false; syncNow(false); }
    }
  })();
  return running;
}
export const connect = () => syncNow(true);

// Stop syncing in this browser. The Drive copy stays, so other devices keep working.
export function disconnect() {
  try { localStorage.removeItem(PREF); sessionStorage.removeItem(TOKEN); } catch (e) {}
  if (token && window.google && window.google.accounts) window.google.accounts.oauth2.revoke(token, () => {});
  token = null;
  set({ status: "off", lastSync: null, error: "" });
}

// Push local edits a few seconds after they happen, and pull when the page comes back into view.
export function start() {
  if (!available()) return;
  if (isOn()) { token = savedToken(); syncNow(false); }
  store.onChange((d, origin) => {
    if (origin !== "local" || !isOn()) return;
    clearTimeout(timer); timer = setTimeout(() => syncNow(false), 3000);
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && isOn()) syncNow(false); });
}
