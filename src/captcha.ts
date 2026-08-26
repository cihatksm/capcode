import { randomInt, createHash, createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { encodePng } from "./png.js";
import {
  DEFAULT_GLYPHS,
  GLYPH_WIDTH,
  GLYPH_HEIGHT,
  getGlyph,
  validateGlyphs,
  type GlyphMap,
} from "./font.js";

export const DEFAULT_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type Difficulty = "easy" | "medium" | "hard";

export type RGB = readonly [number, number, number];

export interface GradientOptions {
  /** Start color of the gradient, as [r, g, b] (0-255). */
  from: RGB;
  /** End color of the gradient, as [r, g, b] (0-255). */
  to: RGB;
  /** Gradient direction in degrees (0 = left→right, 90 = top→bottom). Default: 45. */
  angle?: number;
}

export interface ThemeOptions {
  /** Exact color used for the text glyphs, as [r, g, b] (0-255). */
  textColor?: RGB;
  /** Canvas background color, as [r, g, b] (default: white). Used when no gradient is set. */
  backgroundColor?: RGB;
  /** Override color for the noise lines (default: auto, contrasting with the background). */
  lineColor?: RGB;
  /** Optional gradient background. When set, it overrides `backgroundColor`. */
  backgroundGradient?: GradientOptions;
}

export interface NoiseOptions {
  /** Salt-and-pepper + scattered dots per 1000 px² (0 = off) */
  dots?: number;
  /** Light lines drawn BEHIND the text */
  backgroundLines?: number;
  /** Darker lines drawn OVER the text */
  foregroundLines?: number;
  /** How much adjacent characters overlap, in pixels (0 = off) */
  charOverlap?: number;
  /** Draw wavy background pattern */
  backgroundPattern?: boolean;
  /** Vertical character jitter multiplier (1-3) */
  jitter?: number;
  /** Maximum per-character rotation in degrees */
  rotation?: number;
  /** Maximum per-character horizontal shear factor */
  shear?: number;
  /** Per-character horizontal scale range [min, max] */
  widthScale?: [number, number];
  /** Per-character vertical scale range [min, max] */
  heightScale?: [number, number];
}

const DIFFICULTY_PRESETS: Record<Difficulty, Required<NoiseOptions>> = {
  easy: {
    dots: 0.5,
    backgroundLines: 1,
    foregroundLines: 0,
    charOverlap: 0,
    backgroundPattern: false,
    jitter: 1,
    rotation: 0,
    shear: 0,
    widthScale: [1, 1],
    heightScale: [1, 1],
  },
  medium: {
    dots: 2.5,
    backgroundLines: 2,
    foregroundLines: 1,
    charOverlap: 0,
    backgroundPattern: false,
    jitter: 1,
    rotation: 8,
    shear: 0.12,
    widthScale: [0.9, 1.1],
    heightScale: [0.95, 1.05],
  },
  hard: {
    dots: 6,
    backgroundLines: 4,
    foregroundLines: 3,
    charOverlap: 1,
    backgroundPattern: true,
    jitter: 2,
    rotation: 20,
    shear: 0.3,
    widthScale: [0.85, 1.2],
    heightScale: [0.85, 1.2],
  },
};

export interface CaptchaOptions {
  /** Length of the generated code (default: 6) */
  length?: number;
  /** Characters used for the code. Must be present in `glyphs` (default excludes I/O/0/1) */
  charset?: string;
  /** Secret for HMAC hashing; if omitted a plain SHA-256 is used (recommended: set this) */
  secret?: string;
  /** Base pixel scale of the bitmap font (default: 8) */
  scale?: number;
  /** Hash algorithm for the id (default: sha256) */
  algorithm?: string;
  /** Visual difficulty of the image (default: "medium") */
  difficulty?: Difficulty;
  /** Fine-grained noise/geometry overrides on top of the difficulty preset */
  noise?: NoiseOptions;
  /** Custom glyph map (bitmap font). Each value is an array of 7 numbers (5-bit rows). */
  glyphs?: GlyphMap;
  /** Color theme for the rendered image */
  theme?: ThemeOptions;
  /** Whether to render and return the image (default: true) */
  renderImage?: boolean;
}

export interface RenderCaptchaOptions {
  /** The code to render (optional if passed as first argument) */
  code?: string;
  /** Base pixel scale of the bitmap font (default: 8) */
  scale?: number;
  /** Visual difficulty of the image (default: "medium") */
  difficulty?: Difficulty;
  /** Fine-grained noise/geometry overrides on top of the difficulty preset */
  noise?: NoiseOptions;
  /** Custom glyph map (bitmap font). Each value is an array of 7 numbers (5-bit rows). */
  glyphs?: GlyphMap;
  /** Color theme for the rendered image */
  theme?: ThemeOptions;
}

interface ResolvedTheme {
  textColor: RGB | undefined;
  backgroundColor: RGB;
  lineColor: RGB | undefined;
  gradient: { from: RGB; to: RGB; angle: number } | undefined;
  /** Representative background color used for noise line contrast. */
  bgRef: RGB;
}

interface ResolvedOptions {
  length: number;
  charset: string;
  secret?: string;
  scale: number;
  algorithm: string;
  noise: Required<NoiseOptions>;
  glyphs: GlyphMap;
  theme: ResolvedTheme;
  renderImage: boolean;
}

function resolveHash(options: CaptchaOptions = {}): Pick<ResolvedOptions, "secret" | "algorithm"> {
  return { secret: options.secret, algorithm: options.algorithm ?? "sha256" };
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function isLight(c: RGB): boolean {
  return (c[0] + c[1] + c[2]) / 3 > 128;
}

function resolve(options: CaptchaOptions = {}): ResolvedOptions {
  const length = options.length ?? 6;
  const charset = options.charset ?? DEFAULT_CHARSET;
  const scale = options.scale ?? 8;
  const difficulty = options.difficulty ?? "medium";
  const glyphs = options.glyphs ?? DEFAULT_GLYPHS;

  if (!Number.isInteger(length) || length < 1 || length > 64) {
    throw new RangeError("length must be an integer between 1 and 64");
  }
  if (!Number.isInteger(scale) || scale < 1 || scale > 16) {
    throw new RangeError("scale must be an integer between 1 and 16");
  }
  if (charset.length < 2) {
    throw new Error("charset must contain at least 2 characters");
  }
  if (!options.charset && length > charset.length) {
    throw new Error("charset too small for the requested code length");
  }
  if (!(difficulty in DIFFICULTY_PRESETS)) {
    throw new Error(`difficulty must be one of: ${Object.keys(DIFFICULTY_PRESETS).join(", ")}`);
  }
  validateGlyphs(glyphs, charset);

  const noise: Required<NoiseOptions> = {
    ...DIFFICULTY_PRESETS[difficulty],
    ...options.noise,
  };
  if (
    noise.dots < 0 ||
    noise.backgroundLines < 0 ||
    noise.foregroundLines < 0 ||
    noise.charOverlap < 0 ||
    noise.rotation < 0 ||
    noise.shear < 0
  ) {
    throw new RangeError("noise values must not be negative");
  }
  if (noise.jitter < 0 || noise.jitter > 3) {
    throw new RangeError("noise.jitter must be between 0 and 3");
  }

  const g = options.theme?.backgroundGradient;
  const gradient =
    g != null
      ? { from: g.from, to: g.to, angle: g.angle ?? 45 }
      : undefined;

  const theme: ResolvedTheme = {
    textColor: options.theme?.textColor ?? undefined,
    backgroundColor: options.theme?.backgroundColor ?? [255, 255, 255],
    lineColor: options.theme?.lineColor ?? undefined,
    gradient,
    bgRef: gradient
      ? [
          Math.round((gradient.from[0] + gradient.to[0]) / 2),
          Math.round((gradient.from[1] + gradient.to[1]) / 2),
          Math.round((gradient.from[2] + gradient.to[2]) / 2),
        ]
      : (options.theme?.backgroundColor ?? [255, 255, 255]),
  };
  const colorChecks: (RGB | undefined)[] = [
    theme.backgroundColor,
    theme.textColor,
    theme.lineColor,
    gradient?.from,
    gradient?.to,
  ];
  if (colorChecks.some((c) => c && c.some((v) => v < 0 || v > 255))) {
    throw new RangeError("theme colors must be in the 0-255 range");
  }

  return { length, charset, scale, noise, glyphs, theme, renderImage: options.renderImage ?? true, ...resolveHash(options) };
}

/** Generates a cryptographically random code from the charset. */
export function generateCode(options: CaptchaOptions = {}): string {
  const { length, charset } = resolve(options);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += charset[randomInt(charset.length)];
  }
  return out;
}

/**
 * Produces a verifiable id for a code as a signed, opaque token:
 *
 *     id = `${nonce}.${hmac(secret, nonce + ":" + normalizedCode)}`
 *
 * The token is opaque to clients: it leaks neither the code nor its length
 * (the `nonce` makes every token unique even for identical codes).
 *
 * A `secret` is REQUIRED. Without it the code space is tiny (≈32^length) and
 * could be brute-forced, so producing a verifiable id is refused. Verification
 * (`verifyCode`) also requires the same `secret`.
 *
 * Input is normalized (uppercased, whitespace removed) so user input
 * like " a b 3x " matches the code "AB3X".
 */
export function hashCode(code: string, options: CaptchaOptions = {}): string {
  const { secret, algorithm } = resolveHash(options);
  if (!secret) {
    throw new Error("a `secret` is required to produce a verifiable captcha id");
  }
  const normalized = code.replace(/\s+/g, "").toUpperCase();
  const nonce = randomBytes(16).toString("hex");
  const tag = createHmac(algorithm, secret).update(`${nonce}:${normalized}`).digest("hex");
  return `${nonce}.${tag}`;
}

/**
 * Verifies a user-supplied `code` against a previously issued `id` (from
 * `hashCode` / `createCaptcha`). Uses constant-time comparison.
 *
 * Requires the same `secret` used when the id was created. Without a `secret`
 * verification is refused (throws), because an unsigned token cannot be
 * authenticated.
 */
export function verifyCode(id: string, code: string, options: CaptchaOptions = {}): boolean {
  const { secret, algorithm } = resolveHash(options);
  if (!secret) {
    throw new Error("a `secret` is required to verify a captcha id");
  }
  const raw = String(id);
  const dot = raw.indexOf(".");
  if (dot < 0) return false;
  const nonce = raw.slice(0, dot);
  const tag = raw.slice(dot + 1).toLowerCase();
  if (!/^[0-9a-f]+$/.test(nonce) || !/^[0-9a-f]+$/.test(tag)) return false;
  const normalized = code.replace(/\s+/g, "").toUpperCase();
  const expected = Buffer.from(
    createHmac(algorithm, secret).update(`${nonce}:${normalized}`).digest("hex"),
    "hex"
  );
  const actual = Buffer.from(tag, "hex");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export interface CaptchaImage {
  /** Raw PNG bytes */
  buffer: Buffer;
  /** PNG bytes as base64 string */
  base64: string;
  /** data URL ready for <img src="..."> */
  dataUrl: string;
  /** Web Blob (image/png) */
  blob: Blob;
  width: number;
  height: number;
}

export interface CaptchaResult {
  /**
   * Signed, opaque token for this captcha (format: `nonce.tag`). Publish it to
   * the client together with the image, then pass it back to `verifyCode` along
   * with the user's input. It is computationally impossible to recover the code
   * from this token without the `secret`. Keep the `secret` server-side only.
   */
  id: string;
  /** The plaintext code — keep this server-side only */
  code: string;
  /** Rendered PNG image (only present if renderImage was true) */
  image?: CaptchaImage;
}

interface Canvas {
  width: number;
  height: number;
  pixels: Uint8Array;
}

function createCanvas(width: number, height: number, theme: ResolvedTheme): Canvas {
  const pixels = new Uint8Array(width * height * 3);

  if (!theme.gradient) {
    const bg = theme.backgroundColor;
    for (let i = 0; i < pixels.length; i += 3) {
      pixels[i] = bg[0];
      pixels[i + 1] = bg[1];
      pixels[i + 2] = bg[2];
    }
    return { width, height, pixels };
  }

  // Linear gradient: project each pixel onto the angle vector and normalize
  // over the canvas bounding range so both endpoints are reached.
  const { from, to, angle } = theme.gradient;
  const rad = (angle * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const corners = [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ];
  let minP = Infinity;
  let maxP = -Infinity;
  for (const [cx, cy] of corners) {
    const proj = cx * dx + cy * dy;
    if (proj < minP) minP = proj;
    if (proj > maxP) maxP = proj;
  }
  const span = maxP - minP || 1;

  let p = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = ((x + 0.5) * dx + (y + 0.5) * dy - minP) / span;
      pixels[p] = Math.round(from[0] + (to[0] - from[0]) * t);
      pixels[p + 1] = Math.round(from[1] + (to[1] - from[1]) * t);
      pixels[p + 2] = Math.round(from[2] + (to[2] - from[2]) * t);
      p += 3;
    }
  }
  return { width, height, pixels };
}

function setPixel(c: Canvas, x: number, y: number, color: RGB): void {
  if (x < 0 || y < 0 || x >= c.width || y >= c.height) return;
  const i = (y * c.width + x) * 3;
  c.pixels[i] = color[0];
  c.pixels[i + 1] = color[1];
  c.pixels[i + 2] = color[2];
}

function drawLine(
  c: Canvas,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: RGB
): void {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    setPixel(c, x0, y0, color);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
}

function drawWaves(c: Canvas, count: number, color: RGB): void {
  for (let w = 0; w < count; w++) {
    const amp = randomInt(3, 8);
    const period = randomInt(10, 30);
    const phase = randomInt(0, 628) / 100;
    const mid = randomInt(0, c.height);
    let prevY = Math.round(mid + amp * Math.sin(phase));
    for (let x = 1; x < c.width; x++) {
      const y = Math.round(mid + amp * Math.sin(phase + x / period));
      drawLine(c, x - 1, prevY, x, y, color);
      prevY = y;
    }
  }
}

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Renders a glyph with per-character geometric deformation: horizontal/vertical
 * scaling (randomizes width & height), rotation and shear. Rendering uses
 * inverse-transform sampling so rotated glyphs stay gapless.
 */
function drawTransformedGlyph(
  c: Canvas,
  char: string,
  cx: number,
  cy: number,
  scaleX: number,
  scaleY: number,
  angleDeg: number,
  shear: number,
  color: RGB,
  glyphs: GlyphMap
): void {
  const glyph = getGlyph(glyphs, char);
  if (!glyph) throw new Error(`unsupported character: "${char}"`);

  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const gw = GLYPH_WIDTH * scaleX;
  const gh = GLYPH_HEIGHT * scaleY;

  const halfW = (gw / 2) * Math.abs(cos) + (gh / 2) * Math.abs(sin) + 2;
  const halfH = (gw / 2) * Math.abs(sin) + (gh / 2) * Math.abs(cos) + 2;
  const top = cy - gh / 2;

  const minX = Math.round(cx - halfW);
  const maxX = Math.round(cx + halfW);
  const minY = Math.round(top - halfH);
  const maxY = Math.round(top + gh + halfH);

  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      const dx = px - cx;
      const dy = py - cy;

      // reverse rotation
      const rx = dx * cos + dy * sin;
      const ry = -dx * sin + dy * cos;
      // reverse shear
      const sx = rx - shear * ry;
      // reverse scale + center the glyph grid on (cx, cy)
      const gx = sx / scaleX + GLYPH_WIDTH / 2;
      const gy = ry / scaleY + GLYPH_HEIGHT / 2;

      const col = Math.floor(gx);
      const row = Math.floor(gy);
      if (col >= 0 && col < GLYPH_WIDTH && row >= 0 && row < GLYPH_HEIGHT) {
        const bits = glyph[row];
        if (bits & (1 << (GLYPH_WIDTH - 1 - col))) {
          setPixel(c, px, py, color);
        }
      }
    }
  }
}

function addNoise(c: Canvas, noise: Required<NoiseOptions>, theme: ResolvedTheme): void {
  const bg = theme.bgRef;
  const lineColor = theme.lineColor;
  const lightLine: RGB = lineColor ?? (isLight(bg) ? [205, 205, 215] : mix(bg, [255, 255, 255], 0.6));
  const darkLine: RGB = lineColor ?? (isLight(bg) ? [110, 110, 130] : mix([255, 255, 255], bg, 0.4));
  const darkSpeck: RGB = mix(bg, [0, 0, 0], 0.85);
  const lightSpeck: RGB = mix(bg, [255, 255, 255], 0.85);

  if (noise.backgroundPattern) {
    drawWaves(c, randomInt(2, 5), lightLine);
  }
  for (let i = 0; i < noise.backgroundLines; i++) {
    drawLine(
      c,
      randomInt(c.width),
      randomInt(c.height),
      randomInt(c.width),
      randomInt(c.height),
      lightLine
    );
  }
  const dotCount = Math.floor((c.width * c.height * noise.dots) / 1000);
  for (let i = 0; i < dotCount; i++) {
    setPixel(c, randomInt(c.width), randomInt(c.height), Math.random() < 0.5 ? darkSpeck : lightSpeck);
  }
  for (let i = 0; i < noise.foregroundLines; i++) {
    drawLine(
      c,
      randomInt(c.width),
      randomInt(c.height),
      randomInt(c.width),
      randomInt(c.height),
      darkLine
    );
  }
}

function renderCaptchaImage(code: string, opts: ResolvedOptions): CaptchaImage {
  const n = opts.noise;
  const baseGap = Math.max(1, Math.round(opts.scale * 1.5));
  const rotRad = (n.rotation * Math.PI) / 180;
  const rotAllow = Math.ceil((GLYPH_WIDTH * opts.scale * Math.sin(rotRad)) / 2) + 2;

  const metrics = Array.from(code, () => ({
    scaleX: opts.scale * randRange(n.widthScale[0], n.widthScale[1]),
    scaleY: opts.scale * randRange(n.heightScale[0], n.heightScale[1]),
    angle: randRange(-n.rotation, n.rotation),
    shear: randRange(-n.shear, n.shear),
    gap: Math.max(0, baseGap + randomInt(-2, 3) - n.charOverlap),
    jitterY: n.jitter > 0 ? randomInt(-opts.scale * n.jitter, opts.scale * n.jitter + 1) : 0,
  }));

  const charW = metrics.map((m) => Math.ceil(GLYPH_WIDTH * m.scaleX));
  const charH = metrics.map((m) => Math.ceil(GLYPH_HEIGHT * m.scaleY));
  const maxCharH = Math.max(...charH);
  const totalW =
    charW.reduce((a, b) => a + b, 0) +
    metrics.reduce((a, m) => a + m.gap, 0) -
    (metrics.at(-1)?.gap ?? 0);

  const paddingX = opts.scale * 3;
  const paddingY = opts.scale * 3 + rotAllow;
  const width = paddingX * 2 + totalW;
  const height = paddingY * 2 + maxCharH;

  const canvas = createCanvas(width, height, opts.theme);
  const centerY = paddingY + maxCharH / 2;

  let x = paddingX;
  for (let i = 0; i < code.length; i++) {
    const m = metrics[i];
    const cx = x + charW[i] / 2;
    const cy = centerY + m.jitterY;
    const color: RGB =
      opts.theme.textColor ?? [randomInt(20, 110), randomInt(20, 110), randomInt(20, 110)];
    drawTransformedGlyph(
      canvas,
      code[i],
      cx,
      cy,
      m.scaleX,
      m.scaleY,
      m.angle,
      m.shear,
      color,
      opts.glyphs
    );
    x += charW[i] + m.gap;
  }

  addNoise(canvas, opts.noise, opts.theme);

  const buffer = encodePng(width, height, canvas.pixels);
  const base64 = buffer.toString("base64");

  return {
    buffer,
    base64,
    dataUrl: `data:image/png;base64,${base64}`,
    blob: new Blob([new Uint8Array(buffer)], { type: "image/png" }),
    width,
    height,
  };
}

/**
 * Generates a random code, optionally renders it to a PNG and returns its irreversible hash.
 *
 * Every rendering metric (character spacing, per-character width/height, rotation,
 * shear and jitter) is randomized per image to defeat OCR/segmentation.
 *
 * ```ts
 * const captcha = createCaptcha({ secret: process.env.CAPTCHA_SECRET });
 * // send captcha.image.dataUrl + captcha.id to client, store nothing else
 * // later:
 * verifyCode(storedId, userInput, { secret: process.env.CAPTCHA_SECRET });
 * ```
 */
export function createCaptcha(options: CaptchaOptions = {}): CaptchaResult {
  const opts = resolve(options);
  const code = generateCode(opts);

  const result: CaptchaResult = {
    id: hashCode(code, opts),
    code,
  };

  if (opts.renderImage) {
    result.image = renderCaptchaImage(code, opts);
  }

  return result;
}

/**
 * Renders a specific code to a PNG image.
 * Use this when you already have a code (e.g., from generateCode) and want to render it.
 *
 * ```ts
 * const code = generateCode({ length: 6, secret: "my-secret" });
 * const image = renderCaptcha(code, { scale: 8, difficulty: "hard" });
 * // image.buffer, image.base64, image.dataUrl, image.blob
 * ```
 */
export function renderCaptcha(code: string, options: RenderCaptchaOptions = {}): CaptchaImage {
  const captchaOptions: CaptchaOptions = {
    ...options,
    length: code.length,
    renderImage: true,
  };
  const opts = resolve(captchaOptions);
  return renderCaptchaImage(code, opts);
}
