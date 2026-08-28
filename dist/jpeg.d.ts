/**
 * Encodes an RGB image as a JPEG (Baseline DCT, JFIF 1.01).
 *
 * @param width   - Image width in pixels
 * @param height  - Image height in pixels
 * @param pixels  - RGB pixel data: Uint8Array of length `width * height * 3`
 * @param quality - JPEG quality 1–100 (default: 85)
 * @returns       - Buffer containing the complete JPEG file
 */
export declare function encodeJpeg(width: number, height: number, pixels: Uint8Array, quality?: number): Buffer;
