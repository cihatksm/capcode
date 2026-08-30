# capcode - Node.js CAPTCHA Generator (PNG / SVG / JPEG)

> Zero-dependency Node.js CAPTCHA library with HMAC-SHA256 signed tokens & TTL. Stateless, pure TypeScript alternative to `svg-captcha` and `captcha-canvas` — no native dependencies, no Redis/session required.

Generates a random code → renders it as a **PNG / SVG / JPEG** image → produces a **signed, opaque token** (`HMAC-SHA256`) → verifies user input against the token. The token cannot be reversed without the `secret`. Tokens carry a timestamp and support expiry (`maxAge`). Perfect for **Express.js, Fastify, Next.js** and any Node.js framework.

**Zero dependencies.** Uses only Node.js built-ins (`crypto`, `zlib`). All formats (PNG, SVG, JPEG) are generated in pure TypeScript. By [Cihat Kösem](https://cihatksm.com).

![example](easy.png)

## Install

```bash
npm install capcode
```

## Usage

```js
import { createCaptcha, verifyCode } from "capcode";

// 1) Create a captcha
const captcha = createCaptcha({ secret: process.env.CAPTCHA_SECRET });

captcha.id;                  // signed opaque token `nonce.ts.tag` (code cannot be recovered without the secret)
captcha.code;                // plaintext code (KEEP SERVER-SIDE ONLY)
captcha.image.buffer;        // image Buffer (PNG by default)
captcha.image.base64;        // base64 string
captcha.image.dataUrl;       // data URL for <img src="...">
captcha.image.blob;          // Web Blob
captcha.image.mimeType;      // "image/png" | "image/svg+xml" | "image/jpeg"
captcha.image.width;         // rendered width (px)
captcha.image.height;        // rendered height (px)

// 2) Send id + image to the client, NEVER the code
//    (e.g. Express: res.json({ id: captcha.id, image: captcha.image.dataUrl }))

// 3) When the user submits, verify
const ok = verifyCode(captcha.id, userInput, { secret: process.env.CAPTCHA_SECRET });
// ok === true → correct code
```

### Token expiry (maxAge)

```js
// Produce a token that carries a timestamp (always embedded in v2 format)
const captcha = createCaptcha({ secret: process.env.CAPTCHA_SECRET });

// Verify and reject if more than 5 minutes (300 s) have passed
const ok = verifyCode(captcha.id, userInput, {
  secret: process.env.CAPTCHA_SECRET,
  maxAge: 300,
});
```

Tokens issued without `maxAge` **never expire automatically** — you control the policy at verify time.

### Important

- A `secret` is **required**. The id is a signed token produced with **HMAC-SHA256**; all three functions (`createCaptcha`, `hashCode`, `verifyCode`) throw without it.
- The token is **opaque**: it leaks neither the code nor its length, and a random `nonce` makes every token unique even for identical codes.
- `verifyCode` uses a **timing-safe** comparison.
- Input is normalized: `" a b 3x "` → `"AB3X"` (whitespace stripped, upper-cased).
- **Keep the `secret` server-side only.** Never ship it to the client.

## Why capcode? (Comparison with Alternatives)

Unlike most CAPTCHA libraries that only render graphics and force you to manage session state or Redis stores, `capcode` handles the entire authentication lifecycle statelessly while maintaining zero external dependencies.

| Feature / Capability | `capcode` | `svg-captcha` | `captcha-canvas` | `trek-captcha` |
|:---|:---:|:---:|:---:|:---:|
| **Zero Dependencies** | ✅ **Yes** (0 deps) | ✅ **Yes** (0 deps) | ❌ No (requires `node-canvas`) | ❌ No (native binary) |
| **No Native / C++ Builds** | ✅ **Pure JS/TS** | ✅ Pure JS | ❌ Needs Cairo/Pango/Python | ❌ Native Rust binary |
| **Output Formats** | **PNG, SVG, JPEG** | SVG only | PNG, JPEG, SVG | PNG only |
| **Built-in Stateless Verification** | ✅ **HMAC-SHA256/512** | ❌ (returns plain text) | ❌ (returns plain text) | ❌ (returns plain text) |
| **Token Expiry (TTL / `maxAge`)** | ✅ **Built-in** | ❌ (manual session/DB) | ❌ (manual session/DB) | ❌ (manual session/DB) |
| **Timing-Safe Comparison** | ✅ **Built-in** | ❌ None | ❌ None | ❌ None |
| **Anti-OCR Geometric Distortion** | ✅ Rotation, shear, scale jitter, overlap, chaotic waves | ⚠️ Basic curve & points | ⚠️ Basic distortion | ⚠️ Basic wave lines |
| **Ready-to-use Output Helpers** | ✅ `buffer`, `base64`, `dataUrl`, `blob`, `mimeType` | ❌ SVG text only | ⚠️ Buffer / stream | ⚠️ Buffer only |
| **TypeScript Support** | ✅ **Native** (included) | ⚠️ `@types/svg-captcha` | ✅ Native | ⚠️ `@types/trek-captcha` |

## Anti-OCR hardening

Every image randomizes its geometry to defeat OCR/segmentation:

- **Geometric deformation**: per-character rotation, horizontal shear, and randomized width / height scaling.
- **Overlapping characters**: adjacent letters overlap, breaking segmentation.
- **Noise layers**: wavy background pattern, light lines behind text, darker lines over text, and salt-and-pepper dots.
- **Dynamic jitter**: wave line thickness varies per segment to prevent frequency analysis.
- **Random letter spacing**: gap between characters is randomized per image.
- **Font variety**: supply your own bitmap `glyphs` to vary the typeface between deployments. Default charset excludes easily-confused characters (`I`, `O`, `0`, `1`).

## API

### `createCaptcha(options?)` → `CaptchaResult`

| Option         | Type              | Default                              | Description |
|----------------|-------------------|--------------------------------------|-------------|
| `length`       | number            | `6`                                  | Code length (1–64) |
| `charset`      | string            | `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`   | Allowed characters (must exist in `glyphs`) |
| `secret`       | string            | **required**                          | HMAC key — all three functions throw if omitted |
| `scale`        | number            | `8`                                  | Base pixel scale (1–16) |
| `algorithm`    | string            | `sha256`                             | Hash algorithm (`sha512`, ...) |
| `difficulty`   | `Difficulty`      | `"medium"`                           | `easy` / `medium` / `hard` |
| `noise`        | `NoiseOptions`    | —                                    | Fine-grained overrides on top of the difficulty preset |
| `glyphs`       | `GlyphMap`        | built-in 5×7 bitmap font             | Custom bitmap font |
| `theme`        | `ThemeOptions`    | —                                    | `textColor` / `backgroundColor` / `lineColor` as `[r,g,b]` |
| `format`       | `"png"` \| `"svg"` \| `"jpeg"` | `"png"` | Output image format |
| `maxAge`       | number            | —                                    | Max token age in seconds — **set at verify time**, not here |
| `renderImage`  | boolean           | `true`                               | Set `false` to skip rendering (returns no `image`) |

Returned object: `{ id, code, image?: { buffer, base64, dataUrl, blob, mimeType, width, height } }`

### `generateCode(options?)` → `string`
Generates only a cryptographically random code.

### `hashCode(code, options?)` → `string`
Normalizes a code and returns a **signed opaque token** `nonce.ts.tag` (requires `secret`). The `ts` field is a compact base-36 Unix timestamp enabling TTL verification.

### `verifyCode(id, code, options?)` → `boolean`
Recomputes the token for the given code and the `secret`, then compares it to `id` in constant time. Optionally enforces `maxAge` (seconds). Returns `false` for malformed or expired tokens; throws if no `secret` is supplied.

## Token format

```
v2 (current):  nonce.ts.tag
v1 (legacy):   nonce.tag          ← still verified; rejected when maxAge is set
```

- `nonce` — 32 hex chars (16 random bytes), prevents precomputation
- `ts` — Unix timestamp in base-36, compact and URL-safe  
- `tag` — HMAC(secret, `nonce:ts:normalizedCode`)

## Output formats

| Format | `mimeType`       | Notes |
|--------|------------------|-------|
| `png`  | `image/png`      | Default, lossless |
| `svg`  | `image/svg+xml`  | Scalable, smallest file size |
| `jpeg` | `image/jpeg`     | Lossy, pure TypeScript — no extra deps |

```js
createCaptcha({ secret, format: "svg" });
createCaptcha({ secret, format: "jpeg" }); // pure TS, no sharp needed
```

## Visual difficulty

| Difficulty | Dots density | Background lines | Foreground lines | Char overlap | Wavy pattern | Rotation | Shear |
|------------|--------------|------------------|------------------|--------------|--------------|----------|-------|
| `easy`     | 0.5          | 1                | 0                | 0            | no           | 0°       | 0     |
| `medium`   | 2.5          | 2                | 1                | 0            | no           | 8°       | 0.12  |
| `hard`     | 6            | 4                | 3                | 1 (px)       | yes          | 20°      | 0.3   |

Per-character width/height scaling is also randomized within ~±10–20%.

`noise` overrides example:

```js
createCaptcha({
  difficulty: "medium",
  noise: { dots: 10, foregroundLines: 5, rotation: 25, shear: 0.4, widthScale: [0.8, 1.3] },
});
```

## Custom font

Provide a `glyphs` map where each value is an array of 7 numbers, each a 5-bit row (MSB = leftmost pixel):

```js
import { createCaptcha, DEFAULT_GLYPHS } from "capcode";

const glyphs = { ...DEFAULT_GLYPHS, "#": [0x04, 0x04, 0x0a, 0x04, 0x11, 0x11, 0x11] };
createCaptcha({ charset: "A#2", glyphs, secret: "s" });
```

## Theme / colors

The `theme` option controls the rendered colors as `[r, g, b]` (0–255):

```js
createCaptcha({
  theme: {
    textColor: [40, 120, 200],       // exact color used for the glyphs
    backgroundColor: [245, 240, 230], // canvas background
    lineColor: [120, 90, 200],        // overrides noise-line color (optional)
  },
  secret: "s",
});
```

- `textColor` — when omitted, each character is drawn in a random dark shade to resist OCR.
- `backgroundColor` — canvas background (default white).
- `lineColor` — if set, both background and foreground noise lines use this color; otherwise lines are auto-picked to contrast with the background.

Colors outside the 0–255 range throw a `RangeError`.

## Test

```bash
npm test
```

## Benchmark

```bash
npm run benchmark
```

Measures captcha rendering (easy / medium / hard, PNG and SVG) and token operations (hashCode / verifyCode).

## Security

> **Audited: `0.0.2` — 2026-08-29.** Zero dependencies, no native build, HMAC-SHA256 opaque tokens with TTL and `timingSafeEqual`. Full report: [`SECURITY.md`](./SECURITY.md).

**Quick hardening:**
```js
// Always enforce TTL at verify time
verifyCode(id, userInput, { secret: SECRET, maxAge: 300, algorithm: "sha256" });
// Keep SECRET ≥32 bytes server-side only, pin "capcode": "0.0.2" exactly
```

One low-severity note: future timestamps (`ts > now + 60s`) should be rejected — see `SECURITY.md#3.2` for wrapper fix until upstream patch. No backdoor, `npm audit` 0 vulns.

Report issues at `https://github.com/cihatksm/capcode/issues`.

## FAQ

### How to add CAPTCHA to Express.js / Node.js?
Use `createCaptcha({ secret })` to generate `id` + `image.dataUrl`, send both to the client, then verify with `verifyCode(id, userInput, { secret, maxAge: 300 })`. No session or Redis needed — see [Usage](#usage).

### capcode vs svg-captcha vs captcha-canvas?
Unlike `svg-captcha` (SVG only, plain text) and `captcha-canvas` (requires `node-canvas` native build), `capcode` supports **PNG, SVG and JPEG** in pure TypeScript, with built-in **HMAC-SHA256 stateless verification, TTL and timing-safe comparison**. See [Why capcode?](#why-capcode-comparison-with-alternatives).

### Does capcode support JPEG and SVG?
Yes. `createCaptcha({ secret, format: "svg" })` or `format: "jpeg"` — both generated without extra dependencies. See [Output formats](#output-formats).

### Is capcode secure for production?
Yes. Audited `0.0.2` (2026-08-29), zero dependencies, `timingSafeEqual`, opaque `nonce.ts.tag` tokens. See [SECURITY.md](./SECURITY.md).

## License

MIT
