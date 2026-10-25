// The 3D part library.
//
// A part is a list of primitives placed on a "car frame": a handful of key positions on the car
// (bumpers, hood, roof, trunk lip, mirrors, wheels). The frame is measured exactly for the built-in
// Supra model and estimated from the bounding box for uploaded models.
//
// Coordinates are meters: +x toward the nose, +y up, +z toward the car's right side.
// A primitive is { shape, at: [x, y, z], size: [length, height, width], rot: [x, y, z] (degrees),
// finish, mirror }. `size` is the primitive's box before rotation; `mirror` adds a copy on the left side.
// Shapes: box, cylinder (axis along x), wedge (high at the rear), sphere (ellipsoid), airfoil (chord along x).

export const SHAPES = ["box", "cylinder", "wedge", "sphere", "airfoil"];
export const FINISHES = {
  carbon: "Carbon fiber",
  gloss: "Gloss black",
  matte: "Matte black",
  body: "Body color",
  chrome: "Chrome",
  titanium: "Burnt titanium",
  aluminum: "Brushed aluminum",
  red: "Red",
  white: "White",
  light: "Light (glowing)",
  custom: "Custom color",
};

// Measured from the built-in Toyota GR Supra (A90) model.
export const SUPRA_FRAME = {
  front: 2.32, rear: -2.27, half: 0.945, ground: 0.10, rocker: 0.16, roof: 1.29,
  roofFrontX: 0.0, roofRearX: -1.03, trunkX: -2.13, trunkY: 0.975,
  hoodFrontX: 2.0, hoodFrontY: 0.72, hoodMid: [1.35, 0.88], cowlX: 0.65, cowlY: 0.93,
  mirror: [0.14, 0.975, 0.905], axleF: 1.294, axleR: -1.294, wheelR: 0.33,
  exhaustY: 0.273, exhaustZ: 0.52,
};

// Estimated frame for any car model from its overall length, width and height.
export function frameFromSize(L, W, H) {
  const half = (W / 2) * 0.93;
  return {
    front: L / 2, rear: -L / 2, half, ground: 0.07 * H, rocker: 0.12 * H, roof: H,
    roofFrontX: 0, roofRearX: -0.22 * L, trunkX: -0.46 * L, trunkY: 0.75 * H,
    hoodFrontX: 0.43 * L, hoodFrontY: 0.56 * H, hoodMid: [0.3 * L, 0.66 * H], cowlX: 0.14 * L, cowlY: 0.72 * H,
    mirror: [0.03 * L, 0.75 * H, half * 0.96], axleF: 0.29 * L, axleR: -0.29 * L, wheelR: 0.26 * H,
    exhaustY: 0.21 * H, exhaustZ: 0.28 * W,
  };
}

// Named spots the AI designer places primitives against ([x, y, z] on the car's right side or center line).
export function anchors(F) {
  return {
    front_bumper_bottom: [F.front - 0.1, F.ground, 0],
    front_bumper: [F.front, F.ground + 0.3, 0],
    hood_front: [F.hoodFrontX, F.hoodFrontY, 0],
    hood_middle: [F.hoodMid[0], F.hoodMid[1], 0],
    windshield_base: [F.cowlX, F.cowlY, 0],
    roof_front: [F.roofFrontX, F.roof, 0],
    roof_rear: [F.roofRearX, F.roof - 0.02, 0],
    trunk_lip: [F.trunkX, F.trunkY, 0],
    rear_bumper: [F.rear, F.exhaustY + 0.2, 0],
    rear_bumper_bottom: [F.rear + 0.1, F.ground, 0],
    side_rocker: [(F.axleF + F.axleR) / 2, F.rocker, F.half],
    front_wheel_arch: [F.axleF, F.wheelR * 2 + 0.05, F.half],
    rear_wheel_arch: [F.axleR, F.wheelR * 2 + 0.05, F.half],
    mirror: F.mirror.slice(),
    under_car_center: [0, F.ground, 0],
  };
}

const hoodSlopeDeg = (F) => (Math.atan2(F.cowlY - F.hoodFrontY, F.hoodFrontX - F.cowlX) * 180) / Math.PI;

// Templates: id → { label, kind: "part" | "effect" | "hidden", build(F) → primitives, finish }.
// "effect" templates change the car itself (tint, ride height…); "hidden" ones are mods you can't see.
export const TEMPLATES = {
  "front-lip": {
    label: "Front lip", finish: "carbon",
    build: (F) => [{ shape: "box", at: [F.front - 0.13, F.ground - 0.008, 0], size: [0.15, 0.022, F.half * 1.5] }],
  },
  splitter: {
    label: "Front splitter", finish: "carbon",
    build: (F) => [
      { shape: "box", at: [F.front - 0.08, F.ground - 0.015, 0], size: [0.30, 0.02, F.half * 1.85] },
      { shape: "cylinder", at: [F.front + 0.02, F.ground + 0.08, F.half * 0.6], size: [0.012, 0.16, 0.012], rot: [0, 0, 90], finish: "aluminum", mirror: true },
    ],
  },
  canards: {
    label: "Canards", finish: "carbon",
    build: (F) => [0.2, 0.31].map((dy, i) => ({
      shape: "wedge", at: [F.front - 0.3 - i * 0.04, F.ground + dy, F.half * 0.88], size: [0.2, 0.018, 0.11], rot: [0, -18, -10], mirror: true,
    })),
  },
  "side-skirts": {
    label: "Side skirts", finish: "carbon",
    build: (F) => [{ shape: "box", at: [(F.axleF + F.axleR) / 2, F.rocker + 0.015, F.half + 0.005], size: [(F.axleF - F.axleR) - 3 * F.wheelR, 0.06, 0.04], mirror: true }],
  },
  diffuser: {
    label: "Rear diffuser", finish: "carbon",
    build: (F) => [
      { shape: "box", at: [F.rear + 0.18, F.ground + 0.02, 0], size: [0.36, 0.02, F.half * 1.3] },
      ...[0.12, 0.36, 0.6].map((t) => ({ shape: "box", at: [F.rear + 0.17, F.ground + 0.06, F.half * t], size: [0.30, 0.08, 0.01], mirror: true })),
    ],
  },
  ducktail: {
    label: "Trunk spoiler", finish: "carbon",
    build: (F) => [{ shape: "wedge", at: [F.trunkX - 0.01, F.trunkY + 0.03, 0], size: [0.22, 0.06, F.half * 1.16] }],
  },
  "gt-wing": {
    label: "GT wing", finish: "carbon",
    build: (F) => [
      { shape: "box", at: [F.trunkX + 0.12, F.trunkY + 0.14, F.half * 0.45], size: [0.07, 0.28, 0.02], finish: "gloss", mirror: true },
      { shape: "airfoil", at: [F.trunkX + 0.08, F.trunkY + 0.3, 0], size: [0.30, 0.04, F.half * 1.75], rot: [0, 0, -6] },
      { shape: "box", at: [F.trunkX + 0.08, F.trunkY + 0.28, F.half * 0.875], size: [0.34, 0.16, 0.01], mirror: true },
    ],
  },
  "roof-spoiler": {
    label: "Roof spoiler", finish: "carbon",
    build: (F) => [{ shape: "wedge", at: [F.roofRearX - 0.06, F.roof - 0.005, 0], size: [0.18, 0.04, F.half * 1.0] }],
  },
  "hood-scoop": {
    label: "Hood scoop", finish: "body",
    build: (F) => [
      { shape: "wedge", at: [F.hoodMid[0], F.hoodMid[1] + 0.04, 0], size: [0.45, 0.08, 0.40], rot: [0, 0, -hoodSlopeDeg(F)] },
      { shape: "box", at: [F.hoodMid[0] - 0.22, F.hoodMid[1] + 0.06, 0], size: [0.01, 0.05, 0.34], finish: "matte" },
    ],
  },
  "hood-vents": {
    label: "Hood vents", finish: "matte",
    build: (F) => {
      const r = [0, 0, -hoodSlopeDeg(F)], [x, y] = F.hoodMid;
      return [
        { shape: "box", at: [x, y + 0.008, F.half * 0.32], size: [0.34, 0.012, 0.22], rot: r, mirror: true },
        ...[-0.12, -0.04, 0.04, 0.12].map((dx) => ({ shape: "box", at: [x + dx, y + 0.02, F.half * 0.32], size: [0.025, 0.012, 0.2], rot: r, finish: "gloss", mirror: true })),
      ];
    },
  },
  "fender-vents": {
    label: "Fender vents", finish: "gloss",
    build: (F) => [0, 1, 2].map((i) => ({
      shape: "box", at: [F.axleF - F.wheelR * 1.35 - i * 0.02, F.wheelR * 1.6 + i * 0.045, F.half + 0.006], size: [0.13, 0.014, 0.012], rot: [0, 0, 22], mirror: true,
    })),
  },
  "mirror-caps": {
    label: "Mirror caps", finish: "carbon",
    build: (F) => [{ shape: "sphere", at: F.mirror.slice(), size: [0.28, 0.124, 0.21], mirror: true }],
  },
  "wind-deflectors": {
    label: "Wind deflectors", finish: "gloss",
    build: (F) => [{ shape: "box", at: [F.mirror[0] + 0.17, F.mirror[1], F.mirror[2] + 0.05], size: [0.05, 0.09, 0.012], rot: [0, 29, 0], mirror: true }],
  },
  exhaust: {
    label: "Exhaust tips", finish: "titanium",
    build: (F) => [F.exhaustZ - 0.08, F.exhaustZ + 0.06].map((z) => ({ shape: "cylinder", at: [F.rear + 0.05, F.exhaustY, z], size: [0.12, 0.10, 0.10], mirror: true })),
  },
  "mud-flaps": {
    label: "Mud flaps", finish: "matte",
    build: (F) => [F.axleF, F.axleR].map((ax) => ({ shape: "box", at: [ax - F.wheelR - 0.06, F.ground + 0.09, F.half - 0.12], size: [0.01, 0.16, 0.2], mirror: true })),
  },
  "roof-rack": {
    label: "Roof rack", finish: "matte",
    build: (F) => [F.roofFrontX - 0.12, F.roofRearX + 0.2].flatMap((x) => [
      { shape: "cylinder", at: [x, F.roof + 0.07, 0], size: [F.half * 1.3, 0.03, 0.03], rot: [0, 90, 0] },
      { shape: "box", at: [x, F.roof + 0.035, F.half * 0.62], size: [0.06, 0.07, 0.04], mirror: true },
    ]),
  },
  "light-bar": {
    label: "Light bar", finish: "light",
    build: (F) => [
      { shape: "box", at: [F.roofFrontX - 0.05, F.roof + 0.06, 0], size: [0.05, 0.06, F.half * 1.1], finish: "light" },
      { shape: "box", at: [F.roofFrontX - 0.09, F.roof + 0.06, 0], size: [0.04, 0.08, F.half * 1.15], finish: "matte" },
    ],
  },
  "tow-strap": {
    label: "Tow strap", finish: "red",
    build: (F) => [{ shape: "box", at: [F.front - 0.02, F.ground + 0.12, F.half * 0.55], size: [0.03, 0.10, 0.03], rot: [0, 0, -15] }],
  },
  "plate-relocation": {
    label: "Plate relocation", finish: "white",
    build: (F) => [{ shape: "box", at: [F.front - 0.09, F.ground + 0.2, F.half * 0.59], size: [0.02, 0.15, 0.30], rot: [0, 11, 0] }],
  },
  panel: {
    label: "Custom panel", finish: "carbon",
    build: (F) => [{ shape: "box", at: [F.trunkX + 0.25, F.trunkY + 0.01, 0], size: [0.2, 0.02, 0.3] }],
  },
  tint: { label: "Window tint", kind: "effect" },
  lowering: { label: "Lowered suspension", kind: "effect" },
  spacers: { label: "Wheel spacers", kind: "effect" },
  ppf: { label: "Paint protection / coating", kind: "effect" },
  wrap: { label: "Wrap or repaint", kind: "effect" },
  hidden: { label: "Under the hood or inside", kind: "hidden" },
};

// Name → template, first match wins. Order matters ("Ceramic window tint" is tint, not coating).
const MATCHERS = [
  [/plate relocat|license plate|tow ?tag/i, "plate-relocation"],
  [/mirror (cap|cover)/i, "mirror-caps"],
  [/deflector|visor|rain guard/i, "wind-deflectors"],
  [/canard|dive plane/i, "canards"],
  [/splitter|air dam/i, "splitter"],
  [/\blip\b|front (lip|spoiler)|chin/i, "front-lip"],
  [/side skirt|rocker|side extension/i, "side-skirts"],
  [/diffuser/i, "diffuser"],
  [/(gt|rear|swan.?neck|big|track) wing|\bwing\b(?! mirror)/i, "gt-wing"],
  [/roof spoiler|roof wing/i, "roof-spoiler"],
  [/spoiler|ducktail|duck tail|trunk lid wing/i, "ducktail"],
  [/scoop/i, "hood-scoop"],
  [/hood (vent|louver)|louver/i, "hood-vents"],
  [/fender (vent|louver)|vent/i, "fender-vents"],
  [/exhaust|cat.?back|muffler|tailpipe|\btips?\b/i, "exhaust"],
  [/mud ?flap|splash guard/i, "mud-flaps"],
  [/roof rack|cross ?bar|roof rail/i, "roof-rack"],
  [/light ?bar|led bar|auxiliary light|fog light/i, "light-bar"],
  [/tow (strap|hook)/i, "tow-strap"],
  [/\btint\b|window film/i, "tint"],
  [/lowering|coilover|air (ride|suspension)|\bsprings?\b|drop (kit|spindle)/i, "lowering"],
  [/spacer/i, "spacers"],
  [/paint protection|\bppf\b|ceramic coat|clear bra/i, "ppf"],
  [/\bwrap\b|repaint|paint job/i, "wrap"],
  [/intake|filter|tune|\becu\b|jb4|piggyback|downpipe|turbo|intercooler|\boil\b|brake|\bpads?\b|rotor|fluid|battery|spark|ignition|sensor|\bobd|bimmer|seat|steering|shift|audio|speaker|stereo|dash|camera|charge pipe|heat exchanger|radiator|clutch|flywheel|diff\b|differential|axle|mount|bushing|sway bar|strut bar|harness|gauge/i, "hidden"],
];

export function detectTemplate(name) {
  for (const [re, id] of MATCHERS) if (re.test(name || "")) return id;
  return null;
}

// The template an item uses after its own 3D settings: "auto" follows its name.
export function templateFor(item) {
  const p = item.part3d || {};
  if (p.shape === "none") return null;
  if (p.shape === "ai") return p.ai && p.ai.primitives && p.ai.primitives.length ? "ai" : null;
  if (p.shape && p.shape !== "auto") return TEMPLATES[p.shape] ? p.shape : null;
  return detectTemplate(item.name);
}
export const templateKind = (id) => (id === "ai" ? "part" : (TEMPLATES[id] && TEMPLATES[id].kind) || "part");
export const templateLabel = (id) => (id === "ai" ? "Designed by AI" : TEMPLATES[id] ? TEMPLATES[id].label : "");

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || 0));

// AI designs place primitives against named anchors; convert them to frame coordinates.
export function aiToPrims(F, spec) {
  const A = anchors(F);
  return (spec.primitives || []).slice(0, 40).map((p) => {
    const base = A[p.anchor] || A.under_car_center, o = p.offset || [];
    return {
      shape: SHAPES.includes(p.shape) ? p.shape : "box",
      at: [base[0] + clamp(o[0], -3, 3), base[1] + clamp(o[1], -1, 2), base[2] + clamp(o[2], -2, 2)],
      size: [0, 1, 2].map((i) => clamp((p.size || [])[i] || 0.05, 0.004, 3)),
      rot: [0, 1, 2].map((i) => clamp((p.rotation || [])[i], -180, 180)),
      finish: FINISHES[p.finish] ? p.finish : undefined,
      mirror: !!p.mirror,
    };
  });
}

// Final primitives for an item on a frame: template (or AI design), then the item's size and nudges.
export function primsFor(item, F) {
  const id = templateFor(item);
  if (!id || templateKind(id) !== "part") return [];
  const p = item.part3d || {};
  const base = id === "ai" ? aiToPrims(F, p.ai) : TEMPLATES[id].build(F);
  const finish = p.finish && p.finish !== "auto" ? p.finish : null;
  const defFinish = id === "ai" ? "carbon" : TEMPLATES[id].finish;
  const s = clamp(p.size || 100, 25, 400) / 100;
  const n = base.length || 1;
  const pivot = [0, 1, 2].map((k) => base.reduce((acc, q) => acc + q.at[k], 0) / n);
  const d = [clamp(p.moveFwd, -200, 200) / 100, clamp(p.moveUp, -200, 200) / 100, clamp(p.moveOut, -200, 200) / 100];
  return base.map((q) => ({
    ...q,
    at: [0, 1, 2].map((k) => pivot[k] + (q.at[k] - pivot[k]) * s + d[k] * (k === 2 && !q.mirror && Math.abs(q.at[2]) < 0.05 ? 1 : k === 2 ? Math.sign(q.at[2]) || 1 : 1)),
    size: q.size.map((v) => v * s),
    finish: finish || q.finish || defFinish,
    color: p.color,
  }));
}
