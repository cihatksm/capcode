// capcode — performance benchmark
// Usage: npm run benchmark

import { performance } from "node:perf_hooks";
import { createCaptcha, hashCode, verifyCode } from "./dist/index.js";

const SECRET = "benchmark-secret";
const WARMUP  = 50;
const ITERS   = 300;

// ANSI colours
const BOLD   = "\x1b[1m";
const CYAN   = "\x1b[36m";
const GREEN  = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET  = "\x1b[0m";

/**
 * Runs `fn` for WARMUP iterations (discarded), then ITERS measured iterations.
 * @returns {{ ms: number, opsPerSec: number }}
 */
function bench(label, fn) {
  for (let i = 0; i < WARMUP; i++) fn();

  const t0 = performance.now();
  for (let i = 0; i < ITERS; i++) fn();
  const elapsed = performance.now() - t0;

  const msPerOp  = elapsed / ITERS;
  const opsPerSec = Math.round(1000 / msPerOp);

  const msStr  = msPerOp < 1 ? `${(msPerOp * 1000).toFixed(0)} µs` : `${msPerOp.toFixed(2)} ms`;
  const opsStr = `${opsPerSec.toLocaleString("en-US")} ops/s`;

  console.log(
    `  ${CYAN}${label.padEnd(36)}${RESET}  ${YELLOW}${msStr.padStart(10)}${RESET}  ${GREEN}${opsStr.padStart(16)}${RESET}`,
  );

  return { ms: msPerOp, opsPerSec };
}

console.log();
console.log(`${BOLD}capcode — Performance Benchmark${RESET}`);
console.log(`Warmup: ${WARMUP} iters | Measured: ${ITERS} iters`);
console.log("-".repeat(70));

// ── Image rendering ──────────────────────────────────────────────────────────
console.log(`\n${BOLD}Image Rendering (createCaptcha)${RESET}`);

bench("PNG · easy",   () => createCaptcha({ secret: SECRET, difficulty: "easy",   format: "png" }));
bench("PNG · medium", () => createCaptcha({ secret: SECRET, difficulty: "medium", format: "png" }));
bench("PNG · hard",   () => createCaptcha({ secret: SECRET, difficulty: "hard",   format: "png" }));
bench("SVG · medium", () => createCaptcha({ secret: SECRET, difficulty: "medium", format: "svg" }));
bench("JPEG · medium", () => createCaptcha({ secret: SECRET, difficulty: "medium", format: "jpeg" }));


// ── Token operations ─────────────────────────────────────────────────────────
console.log(`\n${BOLD}Token Operations (hashCode / verifyCode)${RESET}`);

const code = "BENCH2";
bench("hashCode (sha256)",          () => hashCode(code, { secret: SECRET }));
bench("hashCode (sha512)",          () => hashCode(code, { secret: SECRET, algorithm: "sha512" }));

const id256 = hashCode(code, { secret: SECRET });
const id512 = hashCode(code, { secret: SECRET, algorithm: "sha512" });
bench("verifyCode (sha256, pass)",  () => verifyCode(id256, code, { secret: SECRET }));
bench("verifyCode (sha256, fail)",  () => verifyCode(id256, "WRONG1", { secret: SECRET }));
bench("verifyCode (sha512, pass)",  () => verifyCode(id512, code, { secret: SECRET, algorithm: "sha512" }));
bench("verifyCode + maxAge check",  () => verifyCode(id256, code, { secret: SECRET, maxAge: 300 }));

console.log();
console.log("-".repeat(70));
console.log(`${BOLD}Done.${RESET}`);
console.log();
