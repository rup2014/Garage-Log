// Optional AI part designer. Sends the part's name and notes plus the car's frame to Claude and
// gets back primitives in the same format the part library uses. Runs in the browser with the
// visitor's own Anthropic API key (kept in this browser's localStorage, sent only to Anthropic).
import { SHAPES, FINISHES, anchors } from "./parts.js?v=mvo7jy6r";

const SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.131.0/+esm";
const MODEL = "claude-opus-5-5";
const KEY_STORE = "garage-log.anthropicKey";

export function getKey() { try { return localStorage.getItem(KEY_STORE) || ""; } catch (e) { return ""; } }
export function setKey(k) { try { k ? localStorage.setItem(KEY_STORE, k) : localStorage.removeItem(KEY_STORE); } catch (e) {} }

const ANCHOR_NAMES = Object.keys(anchors({ front: 0, rear: 0, half: 0, ground: 0, rocker: 0, roof: 0, roofFrontX: 0, roofRearX: 0, trunkX: 0, trunkY: 0, hoodFrontX: 0, hoodFrontY: 0, hoodMid: [0, 0], cowlX: 0, cowlY: 0, mirror: [0, 0, 0], axleF: 0, axleR: 0, wheelR: 0, exhaustY: 0, exhaustZ: 0 }));
const vec3 = { type: "array", items: { type: "number" } };
const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    primitives: {
      type: "array",
      items: {
        type: "object",
        properties: {
          shape: { type: "string", enum: SHAPES },
          anchor: { type: "string", enum: ANCHOR_NAMES },
          offset: vec3,
          size: vec3,
          rotation: vec3,
          finish: { type: "string", enum: Object.keys(FINISHES) },
          mirror: { type: "boolean" },
        },
        required: ["shape", "anchor", "offset", "size", "rotation", "finish", "mirror"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "primitives"],
  additionalProperties: false,
};

const SYSTEM = `You design simple 3D models of aftermarket car parts for a garage app. A part is built from 1 to 30 primitives placed on a car.

Coordinates are meters: +x points toward the car's nose, +y up, +z toward the car's right side. The car's center line is z = 0 and the ground is y = 0.

Each primitive:
- shape: box; cylinder (its axis runs along x: size[0] is its length, size[1] and size[2] its diameters); wedge (a ramp whose tall end faces the rear, -x); sphere (an ellipsoid filling its size); airfoil (a wing section: chord along x with the leading edge toward +x, thickness along y, span along z).
- anchor: a named spot on the car (positions are given for this car). offset is [forward, up, right] in meters from that anchor.
- size: [length along x, height along y, width along z] in meters, before rotation.
- rotation: degrees about x, y, z, applied to the primitive.
- finish: the surface material.
- mirror: true adds a copy reflected to the car's left side (z negated). Place mirrored primitives on the right side (z > 0) and set mirror true, rather than writing both sides.

Make the part recognizable and sized like the real product, sitting on or just touching the car's surface at the right spot, not floating and not buried. Use few primitives for simple parts and more only where shape matters. In summary, describe the part in one short sentence.`;

export async function designPart({ name, brand, notes, frame, carLabel }) {
  const apiKey = getKey();
  if (!apiKey) throw Object.assign(new Error("Add your Anthropic API key in Settings to design parts with AI."), { code: "no_key" });
  const { default: Anthropic } = await import(SDK_URL);
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const A = anchors(frame), fmt = (v) => v.map((n) => n.toFixed(3)).join(", ");
  const user = [
    `Car: ${carLabel || "a sports car"}. Length ${(frame.front - frame.rear).toFixed(2)} m, half-width ${frame.half.toFixed(2)} m, roof height ${frame.roof.toFixed(2)} m, wheel radius ${frame.wheelR.toFixed(2)} m, front axle x = ${frame.axleF.toFixed(2)}, rear axle x = ${frame.axleR.toFixed(2)}.`,
    `Anchors [x, y, z]:\n${Object.entries(A).map(([k, v]) => `- ${k}: [${fmt(v)}]`).join("\n")}`,
    `Part to design: ${name}${brand ? ` (brand: ${brand})` : ""}.${notes ? `\nNotes: ${notes}` : ""}`,
  ].join("\n\n");

  let res;
  try {
    res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: user }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw Object.assign(new Error("Anthropic didn't accept that API key. Check it in Settings."), { code: "auth" });
    if (e instanceof Anthropic.PermissionDeniedError) throw Object.assign(new Error("This API key isn't allowed to use that model."), { code: "permission" });
    if (e instanceof Anthropic.RateLimitError) throw Object.assign(new Error("Too many requests right now. Wait a minute and try again."), { code: "rate" });
    if (e instanceof Anthropic.APIConnectionError) throw Object.assign(new Error("Couldn't reach Anthropic. Check your connection and try again."), { code: "network" });
    if (e instanceof Anthropic.APIError) throw Object.assign(new Error(`Anthropic returned an error (${e.status || "unknown"}). Try again later.`), { code: "api" });
    throw e;
  }
  if (res.stop_reason === "refusal") throw Object.assign(new Error("Claude declined to design this part. Try describing it differently."), { code: "refusal" });
  if (res.stop_reason === "max_tokens") throw Object.assign(new Error("The design came back incomplete. Try a simpler description."), { code: "truncated" });
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  let spec;
  try { spec = JSON.parse(text); } catch (e) { throw Object.assign(new Error("The design came back in an unexpected format. Try again."), { code: "parse" }); }
  if (!Array.isArray(spec.primitives) || !spec.primitives.length) throw Object.assign(new Error("The design had no shapes in it. Try again."), { code: "empty" });
  return { summary: String(spec.summary || "").slice(0, 200), primitives: spec.primitives.slice(0, 40), model: res.model, createdAt: new Date().toISOString() };
}
