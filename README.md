# code-captcha

Generates a random code → renders it to a PNG image → produces a **signed, opaque token** of the code (image id) → verifies user input by checking the token against the supplied code. The token cannot be reversed to the code without the `secret`.

**Zero dependencies.** Uses only Node.js built-ins (`crypto`, `zlib`).

![example](easy.png)

## Install

```bash
npm install code-captcha
```

## Usage

```js
import { createCaptcha, verifyCode } from "code-captcha";

// 1) Create a captcha
const captcha = createCaptcha({ secret: process.env.CAPTCHA_SECRET });

captcha.id;                  // signed opaque token `nonce.tag` (code cannot be recovered without the secret)
captcha.code;                // plaintext code (KEEP SERVER-SIDE ONLY)
captcha.image.buffer;        // PNG Buffer
captcha.image.base64;        // PNG base64 string
captcha.image.dataUrl;       // data URL for <img src="...">
captcha.image.blob;          // Web Blob (image/png)
captcha.image.width/height;  // rendered dimensions

// 2) Send id + image to the client, NEVER the code
//    (e.g. Express: res.json({ id: captcha.id, image: captcha.image.dataUrl }))

// 3) When the user submits, verify
const ok = verifyCode(captcha.id, userInput, { secret: process.env.CAPTCHA_SECRET });
// ok === true -> correct code
```

### Important

- A `secret` is **required**. The id is a signed token (`nonce.tag`) produced with **HMAC-SHA256**; `createCaptcha` / `hashCode` / `verifyCode` refuse to run without it. Without the secret the code space is tiny (≈32^length) and could be brute-forced, so a secret is mandatory.
- The token is **opaque**: it leaks neither the code nor its length, and a random `nonce` makes every token unique even for identical codes (no correlation / precomputation).
- `verifyCode` uses a **timing-safe** comparison.
- Input is normalized: `" a b 3x "` == `"AB3X"` (whitespace removed, upper-cased).
- **Keep the `secret` server-side only.** Never ship it to the client.

## Anti-OCR hardening (per AI recommendations)

Every image randomizes its geometry to defeat OCR/segmentation:

- **Geometric deformation**: per-character rotation, horizontal shear, and independent horizontal/vertical scaling (randomized width & height per character).
- **Overlapping characters**: adjacent letters overlap, breaking segmentation.
- **Noise layers**: wavy background pattern, light lines behind text, darker lines over text, and salt-and-pepper dots.
- **Random letter spacing**: gap between characters is randomized per image.
- **Font variety**: supply your own bitmap `glyphs` to vary the typeface between deployments. Default charset excludes easily-confused characters (`I`, `O`, `0`, `1`).

## API

### `createCaptcha(options?)` → `CaptchaResult`

| Option      | Type              | Default                              | Description |
|-------------|-------------------|--------------------------------------|-------------|
| `length`    | number            | `6`                                  | Code length (1–64) |
| `charset`   | string            | `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`   | Allowed characters (must exist in `glyphs`) |
| `secret`    | string            | **required**                          | HMAC key. `createCaptcha`/`hashCode`/`verifyCode` throw if omitted |
| `scale`     | number            | `8`                                  | Base pixel scale (1–16) |
| `algorithm` | string            | `sha256`                             | Hash algorithm (`sha512`, ...) |
| `difficulty`| `Difficulty`      | `"medium"`                           | `easy` / `medium` / `hard` |
| `noise`     | `NoiseOptions`    | —                                    | Fine-grained overrides on top of the difficulty preset |
| `glyphs`    | `GlyphMap`        | built-in 5×7 font                    | Custom bitmap font |
| `theme`     | `ThemeOptions`    | —                                    | `textColor` / `backgroundColor` / `lineColor` as `[r,g,b]` |

Returned object: `{ id, code, image: { buffer, base64, dataUrl, blob, width, height } }`

### `generateCode(options?)` → `string`
Generates only a cryptographically random code.

### `hashCode(code, options?)` → `string`
Normalizes a code and returns a **signed opaque token** `nonce.tag` (requires `secret`).

### `verifyCode(id, code, options?)` → `boolean`
Recomputes the token for the given code and the `secret`, then compares it to `id` in constant time. Returns `false` for malformed tokens; throws if no `secret` is supplied.

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
import { createCaptcha, DEFAULT_GLYPHS } from "code-captcha";

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

- `textColor` — the given color is used for the text glyphs (when omitted, each character is drawn in a random dark shade to resist OCR).
- `backgroundColor` — canvas background (default white).
- `lineColor` — if set, both background and foreground noise lines use this color; otherwise lines are auto-picked to contrast with the background.

Colors outside the 0–255 range throw a `RangeError`.

## Test

```bash
npm test
```

## License

MIT
