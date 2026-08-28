# Security Report — capcode

> **Version audited:** `0.0.2` (2026-08-29)  
> **Auditor:** Internal review (triggered by AI-assistant flag: *“0.0.2 çok yeni — 126 indirme, zero-deps avantaj ama audit edilmeli”*)  
> **Scope:** `src/captcha.ts`, `src/png.ts`, `src/jpeg.ts`, `src/svg.ts`, `src/font.ts`, `package.json`, `dist/` output, `npm audit`  
> **Verdict:** ✅ **Safe to use with recommended hardening** — no backdoor, no obfuscation, zero-deps claim verified. One low-severity TTL issue noted and mitigated.

---

## 1. Executive Summary

`capcode` stateless CAPTCHA üretimi ve doğrulaması sunar: rastgele kod → PNG/SVG/JPEG → `HMAC-SHA256` ile imzalı opak token (`nonce.ts.tag`) → `timingSafeEqual` ile doğrulama. Sadece Node.js built-in’leri (`node:crypto`, `node:zlib`) kullanılır, native bağımlılık yoktur.

| Claim | Result |
|-------|--------|
| **Zero dependencies** | ✅ Verified — `package.json:49` only `devDependencies` |
| **No canvas / no native build** | ✅ Verified — pure TS encoders `src/png.ts:1`, `src/jpeg.ts:1`, `src/svg.ts:1` |
| **Stateless HMAC verification** | ✅ Verified — `src/captcha.ts:327` / `347` |
| **Very new / low download count** | ⚠️ True (0.0.2, 126 downloads at audit time) — pin version, review updates |

`npm audit` **0 vulnerabilities**, `npm test` **18/18 pass**.

---

## 2. Threat Model

| Threat | Mitigation in capcode | Residual Responsibility (Integrator) |
|--------|----------------------|--------------------------------------|
| **Token forgery without secret** | HMAC-SHA256 over `nonce:ts:code` with 16-byte random nonce `src/captcha.ts:332` | Keep `secret` server-side only, ≥32 bytes, rotated periodically |
| **Token replay / infinite lifetime** | `maxAge` TTL check `src/captcha.ts:378` | **Always** pass `maxAge` at `verifyCode` time (e.g. 300s) |
| **Timing side-channel** | `timingSafeEqual` `src/captcha.ts:392` | None |
| **OCR / segmentation** | Per-char rotation/shear/scale jitter, overlap, wavy noise `src/captcha.ts:652-706` | Choose `difficulty: "hard"` for high-value flows |
| **Brute-force** | Not in scope (stateless) | Add rate-limit + IP throttling + single-use token cache |
| **Supply-chain** | 0 deps, no `postinstall`, minimal `files` `package.json:8` | Pin `0.0.2` exactly, verify `npm provenance` on update |

Out of scope: DDoS, client-side bypass (user can always request new image), accessibility.

---

## 3. Detailed Findings

### 3.1 Token Design — PASS

**Location:** `src/captcha.ts:322-336` (`hashCode`), `src/captcha.ts:347-393` (`verifyCode`)

```
v2: nonce.ts.tag   nonce=32 hex (16 random bytes), ts=base36 unix seconds, tag=HMAC(secret, "nonce:ts:NORMALIZED_CODE")
v1: nonce.tag      legacy, rejected when maxAge set
```

* `normalizeCode()` `src/captcha.ts:192` strips whitespace and uppercases — prevents trivial bypass (`" a b 3x "` → `"AB3X"`).
* `randomBytes(16)` is CSPRNG, prevents precomputation.
* `v2` always embeds timestamp; `v1` intentionally rejected with `maxAge` `src/captcha.ts:369` → forces TTL.
* Regex validation `src/captcha.ts:374-375` strictly allows hex/base36.

**Severity: None — design is sound and follows stateless signed-token best practice (similar to JWT HMAC).**

### 3.2 Verification — PASS with Note

* `secret` required, throws if missing `src/captcha.ts:351`.
* Recomputes HMAC with caller-supplied `code` then `timingSafeEqual` `src/captcha.ts:386-392` with length check — constant-time.
* Malformed `id.split(".")` length ≠2/3 → `false` `src/captcha.ts:371`.

**Low-severity issue — Future timestamp not rejected:**

```ts
// src/captcha.ts:378-381
if (maxAge !== undefined && ts !== null) {
  const issuedAtSeconds = parseInt(ts, 36);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - issuedAtSeconds > maxAge) return false;
}
```

If an attacker forges `ts = now + 3600`, then `now - ts = -3600`, condition is `false`, token passes even with `maxAge: 300`. Live-verified:

```js
const future = nonce + "." + futureTs + "." + hmac(nonce+":"+futureTs+":ABCD");
verifyCode(future, "ABCD", { secret, maxAge: 300 }) // → true (should be false)
```

**Recommendation:** Reject future tokens beyond clock skew (e.g. 60s):

```ts
if (issuedAtSeconds > nowSeconds + 60) return false;
```

**Severity: Low** — requires attacker to know `secret` to forge HMAC anyway; but with leaked `secret` or weak secret, extends window. Fix in next patch; integrator can add wrapper check meanwhile.

### 3.3 Input Validation — PASS

* `length 1–64`, `scale 1–16` enforced `RangeError` `src/captcha.ts:269-270`.
* `charset` ≥2 chars `src/captcha.ts:271`, `glyphs` validated against charset `src/captcha.ts:282-288`.
* `theme` RGB `0–255` `src/captcha.ts:256`.
* `noise.jitter 0–3`, `opacity 0–1` `src/captcha.ts:218-228`.

### 3.4 Cryptography — PASS

* Only `node:crypto` (`createHmac`, `timingSafeEqual`, `randomInt`, `randomBytes`) `src/captcha.ts:1` — no custom crypto.
* Default `sha256`, `sha512` opt-in `src/captcha.ts:267`. No downgrade via token (algorithm not embedded in token — server decides).
* `dist/` contains no `eval`, `child_process`, `fetch` (verified by scan).

### 3.5 Image Encoders — PASS

| Format | File | Verdict |
|--------|------|---------|
| PNG | `src/png.ts:32` — manual IHDR/IDAT/IEND + `deflateSync` + CRC32 `src/png.ts:3-13` | ✅ Valid PNG signature `89 50 4E 47`, deterministic |
| JPEG | `src/jpeg.ts:288` — Baseline DCT, JFIF 1.01, 4:4:4, standard quant/Huffman tables | ✅ Valid SOI `FF D8` / EOI `FF D9`, quality 85 default |
| SVG | `src/svg.ts:9` — dominant-color `rect` + grouped `path` per color | ✅ `<svg` output, size-optimized via row coalescing |

No native `canvas`/`sharp` dependency — confirmed advantage over `captcha-canvas` / `trek-captcha`.

### 3.6 Dependencies & Supply Chain — PASS

* `package.json:49` dev-only, `files: ["dist","README.md"]` minimal publish, no `postinstall`/`preinstall`.
* `npm audit: 0 vulnerabilities`, `tsconfig.json:7` `strict: true`.
* Repository `git log` clean (5 commits), no minified obfuscation in `src/`.

---

## 4. Hardening Checklist for Production

```js
import { createCaptcha, verifyCode } from "capcode";

// 1. Pin exact version in package.json
// "capcode": "0.0.2"  — avoid ^

// 2. Strong secret, env only
const SECRET = process.env.CAPTCHA_SECRET; // ≥32 random bytes, e.g. `openssl rand -hex 32`
if (!SECRET || SECRET.length < 32) throw new Error("weak secret");

// 3. Always enforce TTL at verify time (not create time)
const captcha = createCaptcha({ secret: SECRET, difficulty: "hard", format: "png" });
// send captcha.id + captcha.image.dataUrl to client

const ok = verifyCode(captcha.id, userInput, {
  secret: SECRET,
  algorithm: "sha256", // lock algorithm
  maxAge: 300,         // 5 minutes
});

// 4. Single-use + rate-limit (outside library)
if (ok) {
  if (usedTokens.has(captcha.id)) return false; // replay protection
  usedTokens.add(captcha.id);
}

// 5. Optional wrapper for future-timestamp fix until upstream patch
function safeVerify(id, code, opts) {
  const parts = id.split(".");
  if (parts.length === 3) {
    const ts = parseInt(parts[1], 36);
    if (ts > Math.floor(Date.now()/1000) + 60) return false;
  }
  return verifyCode(id, code, opts);
}
```

Additional:
* Use `difficulty: "hard"` for login/payment, `medium` for low-risk forms.
* Set `charset` without ambiguous chars (default `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` already excludes `I/O/0/1`).
* Log `verifyCode` failures and throttle IP after N attempts.

---

## 5. Disclosure & Maintenance

* **Reporting:** Open an issue at `https://github.com/cihatksm/capcode/issues` or contact maintainer `cihatksm`. Do not disclose unpatched high-severity issues publicly.
* **Update policy:** Review `CHANGELOG`/`Releases` before bumping version; run `npm audit` and `npm test` in CI.
* **Next audit due:** On next minor bump or after TTL fix is merged — re-verify `src/captcha.ts:378`.

---

## 6. References

* Source reviewed: `src/captcha.ts:1-767`, `src/png.ts`, `src/jpeg.ts:1-396`, `src/svg.ts:1-78`, `src/font.ts`
* Tests: `test/captcha.test.mjs:1-153` (18 tests), `benchmark.mjs`, `generate.mjs`
* Standards: HMAC (RFC 2104), PNG (RFC 2083), JPEG JFIF 1.01, SVG 1.1

*This report can be included in `README.md` under “Security” or kept as standalone `SECURITY.md` per GitHub convention.*
