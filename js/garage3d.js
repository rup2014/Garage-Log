// The 3D garage: a studio floor, the car (built-in Supra or an uploaded .glb), mod parts built from
// the part library, effects (tint, ride height, spacers, coating, wrap), and tool props on the floor.
// Uses the global THREE (r128) and THREE.GLTFLoader loaded by index.html.
import { SUPRA_FRAME, frameFromSize } from "./parts.js?v=mvo50fl6";

export const BUILTIN_MODEL = "models/supra-a90.glb";

export function createGarage(host, { onReady, onStatus } = {}) {
  const T = window.THREE;
  const fail = () => ({ ready: false, failed: true, showModel() {}, apply() {}, focus() {}, frame: () => SUPRA_FRAME, isBuiltin: () => false });
  if (!T || !T.GLTFLoader) return fail();
  let renderer;
  try { renderer = new T.WebGLRenderer({ antialias: true, powerPreference: "high-performance" }); } catch (e) { return fail(); }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  host.prepend(renderer.domElement);
  const lin = (hex) => new T.Color(hex).convertSRGBToLinear();
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const status = (msg, isErr) => onStatus && onStatus(msg, isErr);

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(30, 1, 0.1, 60);

  // Studio reflections: a soft grey dome with a few light panels, baked to an environment map.
  const pmrem = new T.PMREMGenerator(renderer);
  const env = new T.Scene();
  const dome = new T.SphereGeometry(10, 32, 16);
  const cols = [], dp = dome.attributes.position;
  for (let i = 0; i < dp.count; i++) { const v = 0.08 + 0.55 * Math.max(0, dp.getY(i) / 10); cols.push(v, v, v * 1.05); }
  dome.setAttribute("color", new T.Float32BufferAttribute(cols, 3));
  env.add(new T.Mesh(dome, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
  [[8, 2, 0, 9, 0, 4], [4, 4, 8, 3, 5, 2], [4, 4, -8, 3, -5, 1.5], [6, 1.5, 0, 2, -9, 1.2]].forEach(([w, h, x, y, z, k]) => {
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(k, k, k), side: T.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
  });
  scene.environment = pmrem.fromScene(env, 0.02).texture;

  scene.add(new T.HemisphereLight(0xffffff, 0x30343a, 0.45));
  const sun = new T.DirectionalLight(0xffffff, 1.4);
  sun.position.set(3, 7, 4); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -4.5, right: 4.5, top: 4.5, bottom: -4.5, near: 1, far: 20 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const floorMat = new T.MeshStandardMaterial({ color: 0x888888, roughness: 0.85 });
  const floor = new T.Mesh(new T.CircleGeometry(14, 64), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const bayMat = new T.MeshBasicMaterial({ color: 0xf0b400, transparent: true, opacity: 0.8 });
  [-1.65, 1.65].forEach((z) => { const l = new T.Mesh(new T.PlaneGeometry(6, 0.06), bayMat); l.rotation.x = -Math.PI / 2; l.position.set(0, 0.002, z); scene.add(l); });

  // Materials
  const std = (hex, metalness = 0, roughness = 0.6, extra = {}) => new T.MeshStandardMaterial({ color: lin(hex), metalness, roughness, ...extra });
  const DEFAULT_PAINT = "#121316";
  const paint = new T.MeshPhysicalMaterial({ color: lin(DEFAULT_PAINT), metalness: 0.5, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.1 });
  const carbonTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 32; const g = c.getContext("2d");
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const on = (x + y) % 2 === 0;
      const gr = g.createLinearGradient(x * 8, y * 8, on ? x * 8 + 8 : x * 8, on ? y * 8 : y * 8 + 8);
      gr.addColorStop(0, "#1b1d20"); gr.addColorStop(0.5, "#3c4046"); gr.addColorStop(1, "#1b1d20");
      g.fillStyle = gr; g.fillRect(x * 8, y * 8, 8, 8);
    }
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(6, 6); t.encoding = T.sRGBEncoding; return t;
  })();
  const FINISH_MATS = {
    carbon: new T.MeshPhysicalMaterial({ map: carbonTex, metalness: 0.35, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 }),
    gloss: new T.MeshPhysicalMaterial({ color: lin("#0d0f12"), metalness: 0.2, roughness: 0.15, clearcoat: 1 }),
    matte: std("#1d2024", 0.1, 0.8),
    chrome: std("#d0d4d9", 1, 0.12),
    titanium: std("#6f6a9e", 1, 0.25),
    aluminum: std("#b9bec4", 0.9, 0.38),
    red: std("#b3141c", 0.2, 0.4),
    white: std("#e9ecef", 0, 0.5),
    light: std("#ffffff", 0, 0.2, { emissive: lin("#eaf2ff"), emissiveIntensity: 1.2 }),
  };
  const customMats = new Map();
  const matFor = (finish, color) => {
    if (finish === "body") return paint;
    if (finish === "custom") {
      const hex = /^#[0-9a-f]{6}$/i.test(color || "") ? color : "#888888";
      if (!customMats.has(hex)) customMats.set(hex, new T.MeshPhysicalMaterial({ color: lin(hex), metalness: 0.3, roughness: 0.35, clearcoat: 0.6 }));
      return customMats.get(hex);
    }
    return FINISH_MATS[finish] || FINISH_MATS.carbon;
  };
  const ghost = new T.MeshBasicMaterial({ color: 0x1d5aa0, transparent: true, opacity: 0.45, depthWrite: false });

  // Unit primitives; meshes scale them to each primitive's size.
  const extrudeUnit = (pts, spline) => {
    const s = new T.Shape();
    if (spline) { s.moveTo(pts[0][0], pts[0][1]); s.splineThru(pts.slice(1).map(([x, y]) => new T.Vector2(x, y))); }
    else pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
    const g = new T.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 16 });
    g.translate(0, 0, -0.5); return g;
  };
  const cyl = new T.CylinderGeometry(0.5, 0.5, 1, 24); cyl.rotateZ(Math.PI / 2);
  const UNIT = {
    box: new T.BoxGeometry(1, 1, 1),
    cylinder: cyl,
    sphere: new T.SphereGeometry(0.5, 24, 16),
    wedge: extrudeUnit([[0.5, -0.5], [-0.5, -0.5], [-0.5, 0.5]]),
    airfoil: extrudeUnit([[0.5, 0], [0.3, 0.5], [-0.1, 0.42], [-0.5, 0.06], [-0.5, -0.06], [-0.1, -0.22], [0.3, -0.3], [0.5, 0]], true),
  };
  const DEG = Math.PI / 180;
  function primMesh(p, z, mirrored, mat) {
    const m = new T.Mesh(UNIT[p.shape] || UNIT.box, mat);
    m.position.set(p.at[0], p.at[1], z);
    const r = p.rot || [0, 0, 0];
    m.rotation.set((mirrored ? -r[0] : r[0]) * DEG, (mirrored ? -r[1] : r[1]) * DEG, r[2] * DEG);
    m.scale.set(p.size[0], p.size[1], p.size[2]);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  const car = new T.Group(); scene.add(car);
  const bodyG = new T.Group(); car.add(bodyG); // add-on parts ride with the body when it's lowered
  const partsG = new T.Group(); bodyG.add(partsG);
  let partsSig = "";

  // The built-in Supra. Model axes: x = left, y = rear, z = up; remapped so the nose points along +x.
  const WHEEL = { Object_45: 1, Object_46: -1, Object_47: 1, Object_48: -1, Object_9: -1, Object_10: 1, Object_11: -1, Object_12: 1 };
  const FIXED = new Set(["Object_26", "Object_27", "Object_28", "Object_50", "Object_32"]);
  const prepBuiltin = (gltf) => {
    const windows = [], bodyNodes = [], wheelNodes = [];
    const root = gltf.scene.getObjectByName("Sketchfab_model") || gltf.scene.children[0];
    root.matrixAutoUpdate = false;
    root.matrix.set(0, -1, 0, 0, 0, 0, 1, 0, -1, 0, 0, 0, 0, 0, 0, 1);
    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true;
        if (o.material.name === "Supra_body_paint") o.material = paint;
        else if (o.material.name === "Window") { o.material.userData.base = { color: o.material.color.clone(), opacity: o.material.opacity }; windows.push(o.material); }
      }
      if (o.name in WHEEL) wheelNodes.push({ o, side: WHEEL[o.name], base: o.position.clone() });
      else if (/^Object_\d+$/.test(o.name) && !FIXED.has(o.name)) bodyNodes.push({ o, base: o.position.clone() });
    });
    return { obj: gltf.scene, windows, bodyNodes, wheelNodes, builtin: true, frame: SUPRA_FRAME };
  };
  // An uploaded model: stand it on the floor, centered, with its long side along x, scaled to car
  // size if its units are off. Window tint applies to materials named glass/window.
  const prepCustom = (gltf) => {
    const obj = new T.Group(), inner = gltf.scene, windows = [];
    obj.add(inner);
    inner.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        if (/glass|window/i.test(m.name || "") && !m.userData.base) { m.userData.base = { color: m.color.clone(), opacity: m.opacity }; windows.push(m); }
      });
    });
    const box = () => { inner.updateMatrixWorld(true); return new T.Box3().setFromObject(inner); };
    let s = box().getSize(new T.Vector3());
    if (s.z > s.x) { inner.rotation.y = Math.PI / 2; s = box().getSize(new T.Vector3()); }
    if (s.x > 0 && (s.x < 2.5 || s.x > 7)) inner.scale.multiplyScalar(4.5 / s.x);
    const b = box(), c = b.getCenter(new T.Vector3()), size = b.getSize(new T.Vector3());
    inner.position.x -= c.x; inner.position.z -= c.z; inner.position.y -= b.min.y;
    return { obj, windows, bodyNodes: [], wheelNodes: [], builtin: false, frame: frameFromSize(size.x, size.z, size.y) };
  };

  const models = new Map();
  let shown = null, wantKey = null;
  const api = {
    ready: false, failed: false,
    frame: () => (shown ? shown.frame : SUPRA_FRAME),
    isBuiltin: () => !!(shown && shown.builtin),
    showModel, apply,
    focus(y) { targetYaw = y; lastUser = performance.now(); requestRender(); },
  };
  function mount(m, src) {
    shown = m; m.obj.rotation.y = src.yaw || 0; car.add(m.obj);
    api.ready = true; partsSig = ""; status("");
    onReady && onReady();
  }
  function showModel(src) {
    wantKey = src ? src.key : null;
    if (shown && (!src || shown.key !== src.key)) { car.remove(shown.obj); shown = null; api.ready = false; partsSig = ""; }
    if (!src) { requestRender(); return; }
    if (shown) { shown.obj.rotation.y = src.yaw || 0; requestRender(); return; }
    const cached = models.get(src.key);
    if (cached && cached.obj) return mount(cached, src);
    if (cached) return; // still loading
    models.set(src.key, { loading: true });
    status("Loading 3D model…");
    const loader = new T.GLTFLoader();
    const done = (gltf) => {
      const m = src.builtin ? prepBuiltin(gltf) : prepCustom(gltf);
      m.key = src.key; models.set(src.key, m);
      if (wantKey === src.key) mount(m, src);
    };
    const failed = () => { models.delete(src.key); if (wantKey === src.key) status("The 3D model didn't load. Reload the page to try again.", true); };
    if (src.blob) src.blob.arrayBuffer().then((buf) => loader.parse(buf, "", done, failed), failed);
    else loader.load(src.url, done, (e) => { if (e.total && wantKey === src.key) status(`Loading 3D model… ${Math.round((e.loaded / e.total) * 100)}%`); }, failed);
  }

  // Garage props for tools
  const gParts = {};
  const add = (geo, mat, x, y, z, parent) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const prop = (key, x, z, ry = 0) => { const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g); gParts[key] = g; return g; };
  const red = std("#a3241f", 0.4, 0.4), steel = std("#8d939a", 0.8, 0.35), dark = std("#24272b", 0.3, 0.5), yellow = std("#e0a400", 0.1, 0.6);
  const tb = prop("toolbox", -0.7, -2.7);
  add(new T.BoxGeometry(0.95, 0.95, 0.5), red, 0, 0.475, 0, tb);
  for (let i = 0; i < 5; i++) add(new T.BoxGeometry(0.80, 0.012, 0.01), steel, 0, 0.18 + i * 0.16, 0.255, tb);
  add(new T.BoxGeometry(0.85, 0.30, 0.42), red, 0, 1.10, 0, tb);
  const tq = prop("torque", -0.7, -2.7);
  [-0.12, 0.08].forEach((dz) => { add(new T.CylinderGeometry(0.014, 0.014, 0.55, 10), steel, 0, 1.27, dz, tq).rotation.z = Math.PI / 2; });
  const mt = prop("maintainer", -0.7, -2.7);
  add(new T.BoxGeometry(0.18, 0.08, 0.12), yellow, 0.30, 1.29, 0.05, mt);
  const jk = prop("jack", 3.0, 1.3, -0.4);
  add(new T.BoxGeometry(0.9, 0.12, 0.30), red, 0, 0.09, 0, jk);
  add(new T.CylinderGeometry(0.07, 0.07, 0.05, 20), dark, 0.42, 0.18, 0, jk);
  add(new T.CylinderGeometry(0.018, 0.018, 1.0, 10), steel, -0.75, 0.32, 0, jk).rotation.z = -1.1;
  const st = prop("stands", 0, 0);
  [[2.0, -1.5], [-2.0, -1.5]].forEach(([x, z]) => {
    add(new T.CylinderGeometry(0.05, 0.17, 0.36, 4), red, x, 0.18, z, st);
    add(new T.CylinderGeometry(0.03, 0.03, 0.22, 10), steel, x, 0.45, z, st);
  });
  const ramp = new T.Mesh(UNIT.wedge, dark);
  const rp = prop("ramps", 3.45, 0);
  [0.78, -0.78].forEach((z) => { const r = ramp.clone(); r.position.set(0.37, 0.033, z); r.scale.set(0.75, 0.065, 0.3); r.castShadow = true; rp.add(r); });
  const ch = prop("chocks", 0, 0);
  [[-1.294 - 0.40, 0.775, Math.PI], [-1.294 + 0.40, 0.775, 0]].forEach(([x, z, ry]) => { const c = new T.Mesh(UNIT.wedge, yellow); c.position.set(x, 0.06, z); c.scale.set(0.2, 0.12, 0.18); c.rotation.y = ry; c.castShadow = true; ch.add(c); });

  function applyTheme() {
    const bg = css("--scene") || "#dde2e7";
    scene.background = new T.Color(bg);
    scene.fog = new T.Fog(new T.Color(bg), 9, 18);
    floorMat.color.copy(lin(css("--scene-floor") || "#c4cad1"));
    bayMat.color.copy(lin(css("--tag") || "#f0b400"));
    ghost.color.copy(lin(css("--accent") || "#1d5aa0"));
    requestRender();
  }

  let targetDrop = 0, targetSpread = 0, drop = 0, spread = 0;
  // parts: [{ id, prims, ghost }]; effects: { tint, lowering, spacers, ppf, wrap } (each true/false, wrap a color);
  // tools: { toolbox: true, … }
  function apply({ paintHex, parts = [], effects = {}, tools = {} }) {
    const builtin = !!(shown && shown.builtin);
    const wrapHex = /^#[0-9a-f]{6}$/i.test(effects.wrap || "") ? effects.wrap : null;
    paint.color.copy(lin(wrapHex || (/^#[0-9a-f]{6}$/i.test(paintHex || "") ? paintHex : DEFAULT_PAINT)));
    paint.clearcoat = effects.ppf ? 1 : 0.6; paint.roughness = effects.ppf ? 0.18 : 0.3;
    (shown ? shown.windows : []).forEach((m) => { const b = m.userData.base; m.color.copy(effects.tint ? lin("#050608") : b.color); m.opacity = effects.tint ? Math.max(0.93, b.opacity) : b.opacity; });
    targetDrop = builtin && effects.lowering ? 0.035 : 0;
    targetSpread = builtin && effects.spacers ? 0.03 : 0;
    const sig = JSON.stringify([shown && shown.key, parts]);
    if (sig !== partsSig) {
      partsSig = sig;
      partsG.clear();
      if (shown) parts.forEach((part) => part.prims.forEach((p) => {
        const mat = part.ghost ? ghost : matFor(p.finish, p.color);
        partsG.add(primMesh(p, p.at[2], false, mat));
        if (p.mirror) partsG.add(primMesh(p, -p.at[2], true, mat));
      }));
      partsG.traverse((m) => { if (m.isMesh && m.material === ghost) m.castShadow = false; });
    }
    Object.entries(gParts).forEach(([k, o]) => (o.visible = !!tools[k]));
    requestRender();
  }

  // Orbit camera
  let yaw = 0.75, pitch = 0.2, targetYaw = null, lastUser = 0, R = 7.6, drag = null;
  const autorotate = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  host.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button, input, a, .viewer-empty, .model-status")) return;
    drag = { x: e.clientX, y: e.clientY };
    try { host.setPointerCapture(e.pointerId); } catch (_) {}
    lastUser = performance.now(); targetYaw = null; requestRender();
  });
  host.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    yaw += dx * 0.008;
    if (e.pointerType === "mouse") pitch = Math.min(0.75, Math.max(0.04, pitch + dy * 0.005));
    lastUser = performance.now(); requestRender();
  });
  const end = () => { drag = null; };
  host.addEventListener("pointerup", end); host.addEventListener("pointercancel", end);
  host.addEventListener("dblclick", () => { yaw = 0.75; pitch = 0.2; targetYaw = null; requestRender(); });

  new ResizeObserver(() => {
    const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    R = w / h < 1.4 ? 9.4 : 7.6; requestRender();
  }).observe(host);

  let visible = true, raf = 0, last = performance.now();
  function frame(t) {
    raf = 0;
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    if (targetYaw != null) {
      const d = ((targetYaw - yaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      yaw += d * Math.min(1, dt * 4); if (Math.abs(d) < 0.003) targetYaw = null;
    } else if (autorotate && !drag && t - lastUser > 4000) yaw -= dt * 0.15;
    drop += (targetDrop - drop) * Math.min(1, dt * 5);
    spread += (targetSpread - spread) * Math.min(1, dt * 5);
    bodyG.position.y = -drop;
    if (shown) {
      shown.bodyNodes.forEach((n) => { n.o.position.z = n.base.z - drop; });
      shown.wheelNodes.forEach((n) => { n.o.position.x = n.base.x + n.side * spread; });
    }
    camera.position.set(Math.cos(yaw) * Math.cos(pitch) * R, 0.55 + Math.sin(pitch) * R, Math.sin(yaw) * Math.cos(pitch) * R);
    camera.lookAt(0, 0.5, 0);
    renderer.render(scene, camera);
    const settling = targetYaw != null || Math.abs(targetDrop - drop) > 1e-4 || Math.abs(targetSpread - spread) > 1e-4 || drag;
    if (visible && !document.hidden && (autorotate || settling)) raf = requestAnimationFrame(frame);
  }
  function requestRender() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) requestRender(); }).observe(host);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) requestRender(); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  applyTheme();
  return api;
}

// Camera angle that faces a part: front parts from the front quarter, rear parts from the rear.
export function yawFacing(prims) {
  if (!prims.length) return 0.75;
  const cx = prims.reduce((a, p) => a + p.at[0], 0) / prims.length;
  const cz = prims.reduce((a, p) => a + p.at[2], 0) / prims.length;
  return Math.atan2(Math.abs(cz) > 0.1 ? cz : 0.6, cx);
}
