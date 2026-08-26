import { inflateSync } from "node:zlib";
import { renderCaptcha, DEFAULT_GLYPHS } from "../dist/index.js";

const code = "AAAA"; // aynı harf tekrar -> tek glyph net görünür
const img = renderCaptcha(code, {
  scale: 4,
  difficulty: "easy",
  noise: { dots: 0, backgroundLines: 0, foregroundLines: 0, rotation: 0, shear: 0, backgroundPattern: false, jitter: 0 },
});

// decode PNG -> pixels
let off = 8, width = 0, height = 0;
const idat = [];
const buf = img.buffer;
while (off < buf.length) {
  const len = buf.readUInt32BE(off);
  const type = buf.toString("ascii", off + 4, off + 8);
  const data = buf.subarray(off + 8, off + 8 + len);
  if (type === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); }
  else if (type === "IDAT") idat.push(data);
  else if (type === "IEND") break;
  off += 12 + len;
}
const raw = inflateSync(Buffer.concat(idat));
const stride = width * 3;
const out = new Uint8Array(width * height * 3);
let prev = new Uint8Array(stride);
let p = 0;
for (let y = 0; y < height; y++) {
  const filter = raw[p++];
  const line = raw.subarray(p, p + stride);
  p += stride;
  const cur = new Uint8Array(stride);
  for (let i = 0; i < stride; i++) {
    const a = i >= 3 ? cur[i - 3] : 0;
    const b = prev[i];
    const c = i >= 3 ? prev[i - 3] : 0;
    const x = line[i];
    let v;
    if (filter === 0) v = x;
    else if (filter === 1) v = x + a;
    else if (filter === 2) v = x + b;
    else if (filter === 3) v = x + ((a + b) >> 1);
    else { const pa=Math.abs(b-c),pb=Math.abs(a-c),pc=Math.abs(a+b-2*c); const pr=pa<=pb&&pa<=pc?a:pb<=pc?b:c; v=x+pr; }
    cur[i] = v & 0xff;
  }
  out.set(cur, y * stride);
  prev = cur;
}

// ASCII dump (convert RGB -> ink if dark enough)
let ascii = "";
for (let y = 0; y < height; y++) {
  let row = "";
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 3;
    const lum = (out[i] + out[i+1] + out[i+2]) / 3;
    row += lum < 128 ? "#" : " ";
  }
  ascii += row + "\n";
}
console.log(`size: ${width}x${height}\n`);
console.log(ascii);
