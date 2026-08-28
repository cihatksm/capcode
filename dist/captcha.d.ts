import { type GlyphMap, type VectorGlyphMap } from "./font.js";
export declare const DEFAULT_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export type Difficulty = "easy" | "medium" | "hard";
export type RGB = readonly [number, number, number];
export interface GradientOptions {
    from: RGB;
    to: RGB;
    angle?: number;
}
export interface ThemeOptions {
    textColor?: RGB;
    backgroundColor?: RGB;
    lineColor?: RGB;
    backgroundGradient?: GradientOptions;
}
export interface NoiseOptions {
    dots?: number;
    backgroundLines?: number;
    foregroundLines?: number;
    charOverlap?: number;
    backgroundPattern?: boolean;
    jitter?: number;
    rotation?: number;
    shear?: number;
    widthScale?: [number, number];
    heightScale?: [number, number];
    /** Per-character opacity range [min, max] (0-1). Default varies by difficulty. */
    opacity?: [number, number];
}
export interface CaptchaOptions {
    length?: number;
    charset?: string;
    secret?: string;
    scale?: number;
    algorithm?: string;
    difficulty?: Difficulty;
    noise?: NoiseOptions;
    /** Bitmap font (5×7). If provided, bitmap rendering is used. */
    glyphs?: GlyphMap;
    /** Vector font - smooth polygons. Takes precedence over `glyphs` if both given. */
    vectorGlyphs?: VectorGlyphMap;
    theme?: ThemeOptions;
    renderImage?: boolean;
    format?: "png" | "svg" | "jpeg";
    /**
     * Maximum token age in seconds. If provided, `verifyCode` rejects tokens older
     * than this value. Tokens issued by older capcode versions (no timestamp) are
     * also rejected when `maxAge` is set.
     */
    maxAge?: number;
}
type SharedVisualOptions = Pick<CaptchaOptions, "scale" | "difficulty" | "noise" | "glyphs" | "vectorGlyphs" | "theme" | "format">;
export interface RenderCaptchaOptions extends SharedVisualOptions {
    code?: string;
}
/** Generates a cryptographically random code from the charset. */
export declare function generateCode(options?: CaptchaOptions): string;
/**
 * Produces a verifiable id for a code as a signed, opaque token.
 *
 * Token format (v2): `nonce.ts.tag`
 *   - `nonce`  16-byte random hex, prevents precomputation
 *   - `ts`     Unix timestamp (seconds) encoded as base-36, compact and URL-safe
 *   - `tag`    HMAC(secret, `nonce:ts:normalizedCode`)
 */
export declare function hashCode(code: string, options?: CaptchaOptions): string;
/**
 * Verifies a user-supplied `code` against a previously issued `id`.
 * Uses constant-time comparison. Requires the same `secret`.
 *
 * Supports both token formats:
 *   - v2 `nonce.ts.tag`  — issued by capcode with TTL support
 *   - v1 `nonce.tag`     — legacy format; accepted only when `maxAge` is NOT set
 */
export declare function verifyCode(id: string, code: string, options?: CaptchaOptions): boolean;
export interface CaptchaImage {
    buffer: Buffer;
    base64: string;
    dataUrl: string;
    blob: Blob;
    width: number;
    height: number;
    mimeType: string;
}
export interface CaptchaResult {
    id: string;
    code: string;
    image?: CaptchaImage;
}
export declare function createCaptcha(options?: CaptchaOptions): CaptchaResult;
export declare function renderCaptcha(code: string, options?: RenderCaptchaOptions): CaptchaImage;
export {};
