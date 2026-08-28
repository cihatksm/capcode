// src/jpeg.ts — Pure TypeScript Baseline-DCT JPEG encoder (zero dependencies)
// Implements JFIF 1.01. Input: RGB Uint8Array (3 bytes per pixel, row-major).

// ── Standard JPEG quantization tables (Annex K, quality-50 baseline) ────────

const LUMA_Q_BASE = new Uint8Array([
  16, 11, 10, 16,  24,  40,  51,  61,
  12, 12, 14, 19,  26,  58,  60,  55,
  14, 13, 16, 24,  40,  57,  69,  56,
  14, 17, 22, 29,  51,  87,  80,  62,
  18, 22, 37, 56,  68, 109, 103,  77,
  24, 35, 55, 64,  81, 104, 113,  92,
  49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103,  99,
]);

const CHROMA_Q_BASE = new Uint8Array([
  17, 18, 24, 47, 99, 99, 99, 99,
  18, 21, 26, 66, 99, 99, 99, 99,
  24, 26, 56, 99, 99, 99, 99, 99,
  47, 66, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
]);

// ── Zigzag scan order: maps zigzag index → natural 8×8 index (y*8+x) ────────
const ZZ = new Uint8Array([
   0,  1,  8, 16,  9,  2,  3, 10, 17, 24, 32, 25, 18, 11,  4,  5,
  12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13,  6,  7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51,
  58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
]);

// ── Standard Huffman tables (JPEG Spec Annex K) ──────────────────────────────

// DC - Luminance
const DC_L_BITS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const DC_L_VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

// DC - Chrominance
const DC_C_BITS = [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0];
const DC_C_VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

// AC - Luminance
const AC_L_BITS = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 125];
const AC_L_VALS = [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
  0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0,
  0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
  0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
  0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
  0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5,
  0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa,
];

// AC - Chrominance
const AC_C_BITS = [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 119];
const AC_C_VALS = [
  0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71,
  0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0,
  0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26,
  0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48,
  0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68,
  0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87,
  0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5,
  0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3,
  0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
  0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa,
];

// ── Precomputed DCT cosine values ─────────────────────────────────────────────
// COS_TBL[u * 8 + x] = cos((2x+1) * u * π / 16)
const COS_TBL = (() => {
  const t = new Float64Array(64);
  for (let u = 0; u < 8; u++) {
    for (let x = 0; x < 8; x++) {
      t[u * 8 + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
    }
  }
  return t;
})();

const DCT_NORM  = 0.25;            // 1/4 normalization factor
const INV_SQRT2 = 1 / Math.SQRT2; // C(0) scaling factor

// ── 2D Forward DCT (direct definition, suitable for small captcha blocks) ────
function dct2d(src: Float32Array, dst: Float32Array): void {
  for (let v = 0; v < 8; v++) {
    const cv = v === 0 ? INV_SQRT2 : 1;
    for (let u = 0; u < 8; u++) {
      const cu = u === 0 ? INV_SQRT2 : 1;
      let sum = 0;
      for (let y = 0; y < 8; y++) {
        const cosV = COS_TBL[v * 8 + y];
        for (let x = 0; x < 8; x++) {
          sum += src[y * 8 + x] * COS_TBL[u * 8 + x] * cosV;
        }
      }
      dst[v * 8 + u] = DCT_NORM * cu * cv * sum;
    }
  }
}

// ── Huffman table builder ─────────────────────────────────────────────────────
interface HuffTable {
  codes: Uint16Array; // Huffman code for each symbol
  lens:  Uint8Array;  // Code length in bits (0 = symbol not in table)
}

function buildHuffTable(bits: readonly number[], vals: readonly number[]): HuffTable {
  const codes = new Uint16Array(256);
  const lens  = new Uint8Array(256);
  let code = 0;
  let k = 0;
  for (let len = 1; len <= 16; len++) {
    for (let j = 0; j < bits[len - 1]; j++) {
      const sym   = vals[k++];
      codes[sym]  = code;
      lens[sym]   = len;
      code++;
    }
    code <<= 1;
  }
  return { codes, lens };
}

// ── Bit stream writer with JPEG byte-stuffing ─────────────────────────────────
class BitStream {
  private out: number[] = [];
  private buf  = 0; // accumulated bits (not yet flushed to out)
  private fill = 0; // number of valid bits in buf

  write(code: number, len: number): void {
    // Mask to `len` bits and accumulate
    this.buf  = (this.buf << len) | (code & ((1 << len) - 1));
    this.fill += len;
    // Drain full bytes
    while (this.fill >= 8) {
      this.fill -= 8;
      const b = (this.buf >> this.fill) & 0xff;
      this.out.push(b);
      if (b === 0xff) this.out.push(0x00); // JPEG byte stuffing
    }
  }

  flush(): void {
    // Pad the last partial byte with 1-bits (JPEG standard)
    if (this.fill > 0) {
      const b = ((this.buf << (8 - this.fill)) | (0xff >> this.fill)) & 0xff;
      this.out.push(b);
      if (b === 0xff) this.out.push(0x00);
      this.fill = 0;
      this.buf  = 0;
    }
  }

  bytes(): readonly number[] { return this.out; }
}

// ── JPEG amplitude helpers ─────────────────────────────────────────────────────

// Number of bits needed to represent |n|  (returns 0 for n === 0)
function magnitudeBits(n: number): number {
  const abs = n < 0 ? -n : n;
  let bits = 0;
  let v = abs;
  while (v > 0) { bits++; v >>= 1; }
  return bits;
}

// JPEG amplitude code: positive n → n itself; negative n → n + (1<<bits) - 1
function ampCode(n: number, bits: number): number {
  return n >= 0 ? n : n + (1 << bits) - 1;
}

// ── Encode a single 8×8 DCT block ─────────────────────────────────────────────
function encodeBlock(
  bs: BitStream,
  dct: Float32Array,     // 64 DCT coefficients in natural 8×8 order
  quant: Uint8Array,     // 64 quantization values in natural 8×8 order
  dcTab: HuffTable,
  acTab: HuffTable,
  prevDC: number,
): number {
  // Quantize and zigzag-scan into coef[]
  const coef = new Int16Array(64);
  for (let i = 0; i < 64; i++) {
    coef[i] = Math.round(dct[ZZ[i]] / quant[ZZ[i]]);
  }

  // ── DC coefficient: difference from previous block's DC ──────────────────
  const dc     = coef[0] - prevDC;
  const dcBits = magnitudeBits(dc);
  bs.write(dcTab.codes[dcBits], dcTab.lens[dcBits]);
  if (dcBits > 0) bs.write(ampCode(dc, dcBits), dcBits);

  // ── AC coefficients: run-length + Huffman ─────────────────────────────────
  // Find the last non-zero AC coefficient to determine where EOB goes
  let lastNZ = 0;
  for (let i = 1; i < 64; i++) {
    if (coef[i] !== 0) lastNZ = i;
  }

  let run = 0;
  for (let i = 1; i < 64; i++) {
    if (i > lastNZ) {
      // All remaining coefficients are zero → EOB
      bs.write(acTab.codes[0x00], acTab.lens[0x00]);
      break;
    }
    if (coef[i] === 0) {
      run++;
      if (run === 16) {
        // ZRL: run of exactly 16 zeros
        bs.write(acTab.codes[0xf0], acTab.lens[0xf0]);
        run = 0;
      }
    } else {
      const acBits = magnitudeBits(coef[i]);
      const sym    = (run << 4) | acBits;
      bs.write(acTab.codes[sym], acTab.lens[sym]);
      bs.write(ampCode(coef[i], acBits), acBits);
      run = 0;
    }
  }

  return coef[0]; // Return new DC value for next block
}

// ── JPEG marker helpers ────────────────────────────────────────────────────────

function u16be(arr: number[], v: number): void {
  arr.push((v >> 8) & 0xff, v & 0xff);
}

function writeDQT(arr: number[], tableId: number, table: Uint8Array): void {
  arr.push(0xff, 0xdb);            // DQT marker
  u16be(arr, 67);                  // Length: 2 + 1 + 64
  arr.push(tableId);               // Precision(0=8-bit) | table id
  for (let i = 0; i < 64; i++) arr.push(table[ZZ[i]]); // zigzag order
}

function writeDHT(arr: number[], tc: number, th: number, bits: readonly number[], vals: readonly number[]): void {
  arr.push(0xff, 0xc4);            // DHT marker
  u16be(arr, 2 + 1 + 16 + vals.length);
  arr.push((tc << 4) | th);
  for (let i = 0; i < 16; i++) arr.push(bits[i]);
  for (const v of vals) arr.push(v);
}

// ── Quantization table scaling (standard IJG quality formula) ────────────────
function scaleQuant(base: Uint8Array, quality: number): Uint8Array {
  const q     = Math.max(1, Math.min(100, quality));
  const scale = q < 50 ? Math.floor(5000 / q) : 200 - q * 2;
  const out   = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    out[i] = Math.max(1, Math.min(255, Math.floor((base[i] * scale + 50) / 100)));
  }
  return out;
}

// ── RGB → YCbCr color conversion ─────────────────────────────────────────────
function rgbToYCbCr(r: number, g: number, b: number): [number, number, number] {
  const y  =  0.29900 * r + 0.58700 * g + 0.11400 * b;
  const cb = -0.16874 * r - 0.33126 * g + 0.50000 * b + 128;
  const cr =  0.50000 * r - 0.41869 * g - 0.08131 * b + 128;
  return [y, cb, cr];
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Encodes an RGB image as a JPEG (Baseline DCT, JFIF 1.01).
 *
 * @param width   - Image width in pixels
 * @param height  - Image height in pixels
 * @param pixels  - RGB pixel data: Uint8Array of length `width * height * 3`
 * @param quality - JPEG quality 1–100 (default: 85)
 * @returns       - Buffer containing the complete JPEG file
 */
export function encodeJpeg(
  width:   number,
  height:  number,
  pixels:  Uint8Array,
  quality = 85,
): Buffer {
  const lumaQ   = scaleQuant(LUMA_Q_BASE,   quality);
  const chromaQ = scaleQuant(CHROMA_Q_BASE, quality);

  const dcL = buildHuffTable(DC_L_BITS, DC_L_VALS);
  const dcC = buildHuffTable(DC_C_BITS, DC_C_VALS);
  const acL = buildHuffTable(AC_L_BITS, AC_L_VALS);
  const acC = buildHuffTable(AC_C_BITS, AC_C_VALS);

  // ── Build JPEG header ───────────────────────────────────────────────────────
  const hdr: number[] = [];

  // SOI — Start of Image
  hdr.push(0xff, 0xd8);

  // APP0 — JFIF application segment
  hdr.push(0xff, 0xe0);
  u16be(hdr, 16);
  hdr.push(0x4a, 0x46, 0x49, 0x46, 0x00); // "JFIF\0"
  hdr.push(1, 1);  // version 1.1
  hdr.push(0);     // units: none
  u16be(hdr, 1); u16be(hdr, 1); // pixel aspect ratio 1:1
  hdr.push(0, 0);  // no thumbnail

  // DQT — quantization tables (luma id=0, chroma id=1)
  writeDQT(hdr, 0, lumaQ);
  writeDQT(hdr, 1, chromaQ);

  // SOF0 — Start of Frame (Baseline DCT, 3 components, 4:4:4 sampling)
  hdr.push(0xff, 0xc0);
  u16be(hdr, 17);
  hdr.push(8);             // sample precision: 8-bit
  u16be(hdr, height);
  u16be(hdr, width);
  hdr.push(3);             // number of components
  hdr.push(1, 0x11, 0);   // Y:  1×1 sampling, quant table 0
  hdr.push(2, 0x11, 1);   // Cb: 1×1 sampling, quant table 1
  hdr.push(3, 0x11, 1);   // Cr: 1×1 sampling, quant table 1

  // DHT — Huffman tables
  writeDHT(hdr, 0, 0, DC_L_BITS, DC_L_VALS); // DC luma
  writeDHT(hdr, 0, 1, DC_C_BITS, DC_C_VALS); // DC chroma
  writeDHT(hdr, 1, 0, AC_L_BITS, AC_L_VALS); // AC luma
  writeDHT(hdr, 1, 1, AC_C_BITS, AC_C_VALS); // AC chroma

  // SOS — Start of Scan
  hdr.push(0xff, 0xda);
  u16be(hdr, 12);
  hdr.push(3);             // 3 components
  hdr.push(1, 0x00);       // Y:  DC table 0, AC table 0
  hdr.push(2, 0x11);       // Cb: DC table 1, AC table 1
  hdr.push(3, 0x11);       // Cr: DC table 1, AC table 1
  hdr.push(0, 63, 0);      // Ss=0, Se=63, Ah=Al=0 (baseline scan)

  // ── Encode image blocks ─────────────────────────────────────────────────────
  const bs = new BitStream();

  const srcY  = new Float32Array(64);
  const srcCb = new Float32Array(64);
  const srcCr = new Float32Array(64);
  const dctY  = new Float32Array(64);
  const dctCb = new Float32Array(64);
  const dctCr = new Float32Array(64);

  const blocksX = Math.ceil(width  / 8);
  const blocksY = Math.ceil(height / 8);

  let prevDCY = 0, prevDCCb = 0, prevDCCr = 0;

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      // Fill 8×8 source block, replicating edge pixels for out-of-bounds
      for (let py = 0; py < 8; py++) {
        for (let px = 0; px < 8; px++) {
          const sx  = Math.min(bx * 8 + px, width  - 1);
          const sy  = Math.min(by * 8 + py, height - 1);
          const off = (sy * width + sx) * 3;
          const [y, cb, cr] = rgbToYCbCr(pixels[off], pixels[off + 1], pixels[off + 2]);
          const bi = py * 8 + px;
          srcY[bi]  = y  - 128; // level shift
          srcCb[bi] = cb - 128;
          srcCr[bi] = cr - 128;
        }
      }

      dct2d(srcY,  dctY);
      dct2d(srcCb, dctCb);
      dct2d(srcCr, dctCr);

      prevDCY  = encodeBlock(bs, dctY,  lumaQ,   dcL, acL, prevDCY);
      prevDCCb = encodeBlock(bs, dctCb, chromaQ, dcC, acC, prevDCCb);
      prevDCCr = encodeBlock(bs, dctCr, chromaQ, dcC, acC, prevDCCr);
    }
  }

  bs.flush();

  // EOI — End of Image
  return Buffer.concat([
    Buffer.from(hdr),
    Buffer.from(bs.bytes() as number[]),
    Buffer.from([0xff, 0xd9]),
  ]);
}
