import { type GlyphMap } from "./font.js";
export declare const DEFAULT_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
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
/** Generates a cryptographically random code from the charset. */
export declare function generateCode(options?: CaptchaOptions): string;
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
export declare function hashCode(code: string, options?: CaptchaOptions): string;
/**
 * Verifies a user-supplied `code` against a previously issued `id` (from
 * `hashCode` / `createCaptcha`). Uses constant-time comparison.
 *
 * Requires the same `secret` used when the id was created. Without a `secret`
 * verification is refused (throws), because an unsigned token cannot be
 * authenticated.
 */
export declare function verifyCode(id: string, code: string, options?: CaptchaOptions): boolean;
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
export declare function createCaptcha(options?: CaptchaOptions): CaptchaResult;
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
export declare function renderCaptcha(code: string, options?: RenderCaptchaOptions): CaptchaImage;
