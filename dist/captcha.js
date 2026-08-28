import { randomInt, createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { encodePng } from "./png.js";
import { encodeSvg } from "./svg.js";
import { encodeJpeg } from "./jpeg.js";
import { DEFAULT_GLYPHS, GLYPH_WIDTH, GLYPH_HEIGHT, VECTOR_GLYPH_WIDTH, VECTOR_GLYPH_HEIGHT, getGlyph, getVectorGlyph, validateGlyphs, validateVectorGlyphs, } from "./font.js";
// Rendering and Math Constants to eliminate Magic Numbers
const RENDERING_CONSTANTS = {
    SUBPIXEL_OFFSETS: [-0.25, 0.25],
    SUBPIXEL_DIVISOR: 4,
    MAX_RGB_VALUE: 255,
    COLOR_LIGHTNESS_THRESHOLD: 128,
    RADIAN_CONVERSION: Math.PI / 180,
    GRADIENT_DEFAULT_ANGLE: 45,
    GRADIENT_MIDPOINT: 0.5,
    DEFAULT_OPAQUE: 1.0,
    PADDING_SCALE_MULTIPLIER: 3,
};
const WAVE_CONSTANTS = {
    PHASE_DIVISOR: 100,
    DEFAULT_WAVES_MIN: 2,
    DEFAULT_WAVES_MAX: 5,
};
const COLOR_REF_FACTORS = {
    LIGHT_BG_LINE_LIGHTNESS: 205,
    LIGHT_BG_LINE_CONTRAST: 215,
    LIGHT_BG_LINE_MIX: 0.6,
    DARK_BG_LINE_LIGHTNESS: 110,
    DARK_BG_LINE_CONTRAST: 130,
    DARK_BG_LINE_MIX: 0.4,
    DARK_SPECK_MIX: 0.85,
    LIGHT_SPECK_MIX: 0.85,
};
export const DEFAULT_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DIFFICULTY_PRESETS = {
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
        opacity: [0.85, 1],
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
        opacity: [0.65, 1],
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
        opacity: [0.5, 1],
    },
};
// ── helpers ──
function mix(a, b, t) {
    return [
        Math.round(a[0] + (b[0] - a[0]) * t),
        Math.round(a[1] + (b[1] - a[1]) * t),
        Math.round(a[2] + (b[2] - a[2]) * t),
    ];
}
function isLight(c) {
    return (c[0] + c[1] + c[2]) / 3 > 128;
}
function normalizeCode(code) {
    return code.replace(/\s+/g, "").toUpperCase();
}
function randRange(min, max) {
    return min + Math.random() * (max - min);
}
function assertIntRange(name, value, min, max) {
    if (!Number.isInteger(value) || value < min || value > max) {
        throw new RangeError(`${name} must be an integer between ${min} and ${max}`);
    }
}
function resolveNoise(difficulty, overrides) {
    const noise = { ...DIFFICULTY_PRESETS[difficulty], ...overrides };
    if (noise.dots < 0 ||
        noise.backgroundLines < 0 ||
        noise.foregroundLines < 0 ||
        noise.charOverlap < 0 ||
        noise.rotation < 0 ||
        noise.shear < 0) {
        throw new RangeError("noise values must not be negative");
    }
    if (noise.jitter < 0 || noise.jitter > 3) {
        throw new RangeError("noise.jitter must be between 0 and 3");
    }
    if (noise.opacity[0] < 0 ||
        noise.opacity[0] > 1 ||
        noise.opacity[1] < 0 ||
        noise.opacity[1] > 1 ||
        noise.opacity[0] > noise.opacity[1]) {
        throw new RangeError("noise.opacity must be [min, max] within 0-1 and min <= max");
    }
    return noise;
}
function resolveTheme(theme) {
    const g = theme?.backgroundGradient;
    const gradient = g ? { from: g.from, to: g.to, angle: g.angle ?? RENDERING_CONSTANTS.GRADIENT_DEFAULT_ANGLE } : undefined;
    const defaultWhite = [RENDERING_CONSTANTS.MAX_RGB_VALUE, RENDERING_CONSTANTS.MAX_RGB_VALUE, RENDERING_CONSTANTS.MAX_RGB_VALUE];
    const backgroundColor = theme?.backgroundColor ?? defaultWhite;
    const bgRef = gradient ? mix(gradient.from, gradient.to, RENDERING_CONSTANTS.GRADIENT_MIDPOINT) : backgroundColor;
    const resolved = {
        textColor: theme?.textColor,
        backgroundColor,
        lineColor: theme?.lineColor,
        gradient,
        bgRef,
    };
    const toCheck = [
        resolved.backgroundColor,
        resolved.textColor,
        resolved.lineColor,
        gradient?.from,
        gradient?.to,
    ];
    if (toCheck.some((c) => c && c.some((v) => v < 0 || v > RENDERING_CONSTANTS.MAX_RGB_VALUE))) {
        throw new RangeError(`theme colors must be in the 0-${RENDERING_CONSTANTS.MAX_RGB_VALUE} range`);
    }
    return resolved;
}
function resolve(options = {}) {
    const length = options.length ?? 6;
    const charset = options.charset ?? DEFAULT_CHARSET;
    const scale = options.scale ?? 8;
    const difficulty = options.difficulty ?? "medium";
    const algorithm = options.algorithm ?? "sha256";
    assertIntRange("length", length, 1, 64);
    assertIntRange("scale", scale, 1, 16);
    if (charset.length < 2)
        throw new Error("charset must contain at least 2 characters");
    if (!(difficulty in DIFFICULTY_PRESETS)) {
        throw new Error(`difficulty must be one of: ${Object.keys(DIFFICULTY_PRESETS).join(", ")}`);
    }
    // Bitmap font is default for clean, balanced aesthetics; vector font only if explicitly provided.
    const useVector = !!options.vectorGlyphs;
    let glyphs = null;
    let vectorGlyphs = null;
    if (options.vectorGlyphs) {
        vectorGlyphs = options.vectorGlyphs;
        validateVectorGlyphs(vectorGlyphs, charset);
    }
    else if (options.glyphs) {
        glyphs = options.glyphs;
        validateGlyphs(glyphs, charset);
    }
    else {
        glyphs = DEFAULT_GLYPHS;
        validateGlyphs(glyphs, charset);
    }
    const format = options.format ?? "png";
    return {
        length,
        charset,
        scale,
        glyphs,
        vectorGlyphs,
        useVector,
        algorithm,
        secret: options.secret,
        noise: resolveNoise(difficulty, options.noise),
        theme: resolveTheme(options.theme),
        renderImage: options.renderImage ?? true,
        format,
    };
}
// ── public API ──
/** Generates a cryptographically random code from the charset. */
export function generateCode(options = {}) {
    const { length, charset } = resolve(options);
    let out = "";
    for (let i = 0; i < length; i++)
        out += charset[randomInt(charset.length)];
    return out;
}
/**
 * Produces a verifiable id for a code as a signed, opaque token.
 *
 * Token format (v2): `nonce.ts.tag`
 *   - `nonce`  16-byte random hex, prevents precomputation
 *   - `ts`     Unix timestamp (seconds) encoded as base-36, compact and URL-safe
 *   - `tag`    HMAC(secret, `nonce:ts:normalizedCode`)
 */
export function hashCode(code, options = {}) {
    const secret = options.secret;
    const algorithm = options.algorithm ?? "sha256";
    if (!secret)
        throw new Error("a `secret` is required to produce a verifiable captcha id");
    const normalized = normalizeCode(code);
    const nonce = randomBytes(16).toString("hex");
    // Embed a compact unix timestamp (base-36) so tokens can carry expiry information
    const ts = Math.floor(Date.now() / 1000).toString(36);
    const tag = createHmac(algorithm, secret).update(`${nonce}:${ts}:${normalized}`).digest("hex");
    return `${nonce}.${ts}.${tag}`;
}
/**
 * Verifies a user-supplied `code` against a previously issued `id`.
 * Uses constant-time comparison. Requires the same `secret`.
 *
 * Supports both token formats:
 *   - v2 `nonce.ts.tag`  — issued by capcode with TTL support
 *   - v1 `nonce.tag`     — legacy format; accepted only when `maxAge` is NOT set
 */
export function verifyCode(id, code, options = {}) {
    const secret = options.secret;
    const algorithm = options.algorithm ?? "sha256";
    const maxAge = options.maxAge;
    if (!secret)
        throw new Error("a `secret` is required to verify a captcha id");
    const raw = String(id);
    const parts = raw.split(".");
    let nonce;
    let ts;
    let tag;
    if (parts.length === 3) {
        // v2 format: nonce.ts.tag
        [nonce, ts, tag] = parts;
        tag = tag.toLowerCase();
    }
    else if (parts.length === 2) {
        // v1 legacy format: nonce.tag (no timestamp)
        [nonce, tag] = parts;
        ts = null;
        tag = tag.toLowerCase();
        // Legacy tokens carry no timestamp — cannot satisfy a maxAge requirement
        if (maxAge !== undefined)
            return false;
    }
    else {
        return false;
    }
    if (!/^[0-9a-f]+$/.test(nonce) || !/^[0-9a-f]+$/.test(tag))
        return false;
    if (ts !== null && !/^[0-9a-z]+$/.test(ts))
        return false;
    // TTL check: reject tokens older than maxAge seconds
    if (maxAge !== undefined && ts !== null) {
        const issuedAtSeconds = parseInt(ts, 36);
        const nowSeconds = Math.floor(Date.now() / 1000);
        if (nowSeconds - issuedAtSeconds > maxAge)
            return false;
    }
    const normalized = normalizeCode(code);
    const payload = ts !== null ? `${nonce}:${ts}:${normalized}` : `${nonce}:${normalized}`;
    const expected = Buffer.from(createHmac(algorithm, secret).update(payload).digest("hex"), "hex");
    const actual = Buffer.from(tag, "hex");
    if (expected.length !== actual.length)
        return false;
    return timingSafeEqual(expected, actual);
}
function createCanvas(width, height, theme) {
    const bytesPerPixel = 3;
    const pixels = new Uint8Array(width * height * bytesPerPixel);
    if (!theme.gradient) {
        const bg = theme.backgroundColor;
        for (let i = 0; i < pixels.length; i += bytesPerPixel) {
            pixels[i] = bg[0];
            pixels[i + 1] = bg[1];
            pixels[i + 2] = bg[2];
        }
        return { width, height, pixels };
    }
    const { from, to, angle } = theme.gradient;
    const rad = angle * RENDERING_CONSTANTS.RADIAN_CONVERSION;
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
        const p = cx * dx + cy * dy;
        if (p < minP)
            minP = p;
        if (p > maxP)
            maxP = p;
    }
    const span = maxP - minP || 1;
    let p = 0;
    const subpixelOffset = 0.5;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const t = ((x + subpixelOffset) * dx + (y + subpixelOffset) * dy - minP) / span;
            pixels[p++] = Math.round(from[0] + (to[0] - from[0]) * t);
            pixels[p++] = Math.round(from[1] + (to[1] - from[1]) * t);
            pixels[p++] = Math.round(from[2] + (to[2] - from[2]) * t);
        }
    }
    return { width, height, pixels };
}
function setPixel(c, x, y, color) {
    if (x < 0 || y < 0 || x >= c.width || y >= c.height)
        return;
    const i = (y * c.width + x) * 3;
    c.pixels[i] = color[0];
    c.pixels[i + 1] = color[1];
    c.pixels[i + 2] = color[2];
}
function blendPixel(c, x, y, color, alpha) {
    if (x < 0 || y < 0 || x >= c.width || y >= c.height)
        return;
    if (alpha >= 1) {
        const i = (y * c.width + x) * 3;
        c.pixels[i] = color[0];
        c.pixels[i + 1] = color[1];
        c.pixels[i + 2] = color[2];
        return;
    }
    if (alpha <= 0)
        return;
    const i = (y * c.width + x) * 3;
    const inv = 1 - alpha;
    c.pixels[i] = Math.round(color[0] * alpha + c.pixels[i] * inv);
    c.pixels[i + 1] = Math.round(color[1] * alpha + c.pixels[i + 1] * inv);
    c.pixels[i + 2] = Math.round(color[2] * alpha + c.pixels[i + 2] * inv);
}
function drawLine(c, x0, y0, x1, y1, color) {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (;;) {
        setPixel(c, x0, y0, color);
        if (x0 === x1 && y0 === y1)
            break;
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
function drawWaves(c, count, color) {
    for (let w = 0; w < count; w++) {
        const amp = randomInt(3, 8);
        const period = randomInt(10, 30);
        const phase = randomInt(0, 628) / WAVE_CONSTANTS.PHASE_DIVISOR;
        const mid = randomInt(0, c.height);
        let prevY = Math.round(mid + amp * Math.sin(phase));
        for (let x = 1; x < c.width; x++) {
            // Dynamic thickness variation to prevent clean mathematical wave frequency pattern detection
            const thicknessJitter = randomInt(0, 2);
            const y = Math.round(mid + amp * Math.sin(phase + x / period));
            drawLine(c, x - 1, prevY, x, y, color);
            if (thicknessJitter > 0) {
                drawLine(c, x - 1, prevY + 1, x, y + 1, color);
            }
            prevY = y;
        }
    }
}
function pointInPolygon(x, y, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];
        const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
        if (intersect)
            inside = !inside;
    }
    return inside;
}
function isPointInVectorGlyph(gx, gy, glyph) {
    let inside = false;
    for (const poly of glyph) {
        if (pointInPolygon(gx, gy, poly))
            inside = !inside;
    }
    return inside;
}
function drawTransformedGlyph(c, char, cx, cy, scaleX, scaleY, angleDeg, shear, color, opts, opacity = RENDERING_CONSTANTS.DEFAULT_OPAQUE) {
    const rad = angleDeg * RENDERING_CONSTANTS.RADIAN_CONVERSION;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const useVector = opts.useVector;
    const gw = (useVector ? VECTOR_GLYPH_WIDTH : GLYPH_WIDTH) * scaleX;
    const gh = (useVector ? VECTOR_GLYPH_HEIGHT : GLYPH_HEIGHT) * scaleY;
    const GW = useVector ? VECTOR_GLYPH_WIDTH : GLYPH_WIDTH;
    const GH = useVector ? VECTOR_GLYPH_HEIGHT : GLYPH_HEIGHT;
    const halfW = (gw / 2) * Math.abs(cos) + (gh / 2) * Math.abs(sin) + 2;
    const halfH = (gw / 2) * Math.abs(sin) + (gh / 2) * Math.abs(cos) + 2;
    const top = cy - gh / 2;
    const minX = Math.round(cx - halfW);
    const maxX = Math.round(cx + halfW);
    const minY = Math.round(top - halfH);
    const maxY = Math.round(top + gh + halfH);
    let vectorGlyph;
    let bitmapGlyph;
    if (useVector) {
        vectorGlyph = getVectorGlyph(opts.vectorGlyphs, char);
        if (!vectorGlyph)
            throw new Error(`unsupported character: "${char}"`);
    }
    else {
        bitmapGlyph = getGlyph(opts.glyphs, char);
        if (!bitmapGlyph)
            throw new Error(`unsupported character: "${char}"`);
    }
    const offsets = RENDERING_CONSTANTS.SUBPIXEL_OFFSETS;
    for (let py = minY; py <= maxY; py++) {
        for (let px = minX; px <= maxX; px++) {
            let hits = 0;
            for (const oy of offsets) {
                for (const ox of offsets) {
                    const dx = px + ox - cx;
                    const dy = py + oy - cy;
                    const rx = dx * cos + dy * sin;
                    const ry = -dx * sin + dy * cos;
                    const sx = rx - shear * ry;
                    const gx = sx / scaleX + GW / 2;
                    const gy = ry / scaleY + GH / 2;
                    if (useVector) {
                        if (isPointInVectorGlyph(gx, gy, vectorGlyph))
                            hits++;
                    }
                    else {
                        const col = Math.floor(gx);
                        const row = Math.floor(gy);
                        if (col >= 0 && col < GW && row >= 0 && row < GH) {
                            const bits = bitmapGlyph[row];
                            if (bits & (1 << (GW - 1 - col)))
                                hits++;
                        }
                    }
                }
            }
            if (hits === 0)
                continue;
            const coverage = hits / RENDERING_CONSTANTS.SUBPIXEL_DIVISOR;
            const a = coverage * opacity;
            if (a >= 1)
                setPixel(c, px, py, color);
            else if (a > 0)
                blendPixel(c, px, py, color, a);
        }
    }
}
function addNoise(c, noise, theme) {
    const bg = theme.bgRef;
    const lineColor = theme.lineColor;
    const lightLineColorRef = [COLOR_REF_FACTORS.LIGHT_BG_LINE_LIGHTNESS, COLOR_REF_FACTORS.LIGHT_BG_LINE_LIGHTNESS, COLOR_REF_FACTORS.LIGHT_BG_LINE_CONTRAST];
    const darkLineColorRef = [COLOR_REF_FACTORS.DARK_BG_LINE_LIGHTNESS, COLOR_REF_FACTORS.DARK_BG_LINE_LIGHTNESS, COLOR_REF_FACTORS.DARK_BG_LINE_CONTRAST];
    const lightLine = lineColor ?? (isLight(bg) ? lightLineColorRef : mix(bg, [RENDERING_CONSTANTS.MAX_RGB_VALUE, RENDERING_CONSTANTS.MAX_RGB_VALUE, RENDERING_CONSTANTS.MAX_RGB_VALUE], COLOR_REF_FACTORS.LIGHT_BG_LINE_MIX));
    const darkLine = lineColor ?? (isLight(bg) ? darkLineColorRef : mix([RENDERING_CONSTANTS.MAX_RGB_VALUE, RENDERING_CONSTANTS.MAX_RGB_VALUE, RENDERING_CONSTANTS.MAX_RGB_VALUE], bg, COLOR_REF_FACTORS.DARK_BG_LINE_MIX));
    const darkSpeck = mix(bg, [0, 0, 0], COLOR_REF_FACTORS.DARK_SPECK_MIX);
    const lightSpeck = mix(bg, [RENDERING_CONSTANTS.MAX_RGB_VALUE, RENDERING_CONSTANTS.MAX_RGB_VALUE, RENDERING_CONSTANTS.MAX_RGB_VALUE], COLOR_REF_FACTORS.LIGHT_SPECK_MIX);
    if (noise.backgroundPattern) {
        const wavesCount = randomInt(WAVE_CONSTANTS.DEFAULT_WAVES_MIN, WAVE_CONSTANTS.DEFAULT_WAVES_MAX);
        drawWaves(c, wavesCount, lightLine);
    }
    for (let i = 0; i < noise.backgroundLines; i++) {
        drawLine(c, randomInt(c.width), randomInt(c.height), randomInt(c.width), randomInt(c.height), lightLine);
    }
    const dotCount = Math.floor((c.width * c.height * noise.dots) / 1000);
    for (let i = 0; i < dotCount; i++) {
        setPixel(c, randomInt(c.width), randomInt(c.height), Math.random() < 0.5 ? darkSpeck : lightSpeck);
    }
    for (let i = 0; i < noise.foregroundLines; i++) {
        drawLine(c, randomInt(c.width), randomInt(c.height), randomInt(c.width), randomInt(c.height), darkLine);
    }
}
function renderCaptchaImage(code, opts) {
    const n = opts.noise;
    const GW = opts.useVector ? VECTOR_GLYPH_WIDTH : GLYPH_WIDTH;
    const GH = opts.useVector ? VECTOR_GLYPH_HEIGHT : GLYPH_HEIGHT;
    const scaleMultiplier = 1.5;
    const baseGap = Math.max(1, Math.round(opts.scale * scaleMultiplier));
    const rotRad = n.rotation * RENDERING_CONSTANTS.RADIAN_CONVERSION;
    const rotAllow = Math.ceil((GW * opts.scale * Math.sin(rotRad)) / 2) + 2;
    const metrics = Array.from(code, () => {
        const minGapOffset = -2;
        const maxGapOffset = 3;
        const jitterOffset = 1;
        return {
            scaleX: opts.scale * randRange(n.widthScale[0], n.widthScale[1]),
            scaleY: opts.scale * randRange(n.heightScale[0], n.heightScale[1]),
            angle: randRange(-n.rotation, n.rotation),
            shear: randRange(-n.shear, n.shear),
            gap: Math.max(0, baseGap + randomInt(minGapOffset, maxGapOffset) - n.charOverlap),
            jitterY: n.jitter > 0 ? randomInt(-opts.scale * n.jitter, opts.scale * n.jitter + jitterOffset) : 0,
            opacity: randRange(n.opacity[0], n.opacity[1]),
        };
    });
    const charW = metrics.map((m) => Math.ceil(GW * m.scaleX));
    const charH = metrics.map((m) => Math.ceil(GH * m.scaleY));
    const maxCharH = Math.max(...charH);
    const totalW = charW.reduce((a, b) => a + b, 0) + metrics.reduce((a, m) => a + m.gap, 0) - (metrics.at(-1)?.gap ?? 0);
    const paddingX = opts.scale * RENDERING_CONSTANTS.PADDING_SCALE_MULTIPLIER;
    const paddingY = opts.scale * RENDERING_CONSTANTS.PADDING_SCALE_MULTIPLIER + rotAllow;
    const width = paddingX * 2 + totalW;
    const height = paddingY * 2 + maxCharH;
    const canvas = createCanvas(width, height, opts.theme);
    const centerY = paddingY + maxCharH / 2;
    let x = paddingX;
    for (let i = 0; i < code.length; i++) {
        const m = metrics[i];
        const cx = x + charW[i] / 2;
        const cy = centerY + m.jitterY;
        const minColorValue = 20;
        const maxColorValue = 110;
        const color = opts.theme.textColor ?? [
            randomInt(minColorValue, maxColorValue),
            randomInt(minColorValue, maxColorValue),
            randomInt(minColorValue, maxColorValue)
        ];
        drawTransformedGlyph(canvas, code[i], cx, cy, m.scaleX, m.scaleY, m.angle, m.shear, color, opts, m.opacity);
        x += charW[i] + m.gap;
    }
    addNoise(canvas, opts.noise, opts.theme);
    if (opts.format === "svg") {
        const svgStr = encodeSvg(canvas);
        const buffer = Buffer.from(svgStr, "utf-8");
        const base64 = buffer.toString("base64");
        return {
            buffer,
            base64,
            dataUrl: `data:image/svg+xml;base64,${base64}`,
            blob: new Blob([new Uint8Array(buffer)], { type: "image/svg+xml" }),
            width,
            height,
            mimeType: "image/svg+xml",
        };
    }
    if (opts.format === "jpeg") {
        const buffer = encodeJpeg(width, height, canvas.pixels);
        const base64 = buffer.toString("base64");
        return {
            buffer,
            base64,
            dataUrl: `data:image/jpeg;base64,${base64}`,
            blob: new Blob([new Uint8Array(buffer)], { type: "image/jpeg" }),
            width,
            height,
            mimeType: "image/jpeg",
        };
    }
    // Fallback to PNG
    const buffer = encodePng(width, height, canvas.pixels);
    const base64 = buffer.toString("base64");
    return {
        buffer,
        base64,
        dataUrl: `data:image/png;base64,${base64}`,
        blob: new Blob([new Uint8Array(buffer)], { type: "image/png" }),
        width,
        height,
        mimeType: "image/png",
    };
}
export function createCaptcha(options = {}) {
    const opts = resolve(options);
    const code = generateCode({ length: opts.length, charset: opts.charset });
    const result = { id: hashCode(code, { secret: opts.secret, algorithm: opts.algorithm }), code };
    if (opts.renderImage) {
        result.image = renderCaptchaImage(code, opts);
    }
    return result;
}
export function renderCaptcha(code, options = {}) {
    const opts = resolve({ ...options, length: code.length });
    return renderCaptchaImage(code, opts);
}
