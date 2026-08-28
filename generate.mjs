import { writeFileSync } from "node:fs";
import { createCaptcha } from "./dist/index.js";

const examples = [
  { name: "easy", opts: { difficulty: "easy", secret: "demo", length: 6 } },
  { name: "medium", opts: { difficulty: "medium", secret: "demo", length: 6 } },
  { name: "hard", opts: { difficulty: "hard", secret: "demo", length: 6 } },
  { name: "no-image", opts: { difficulty: "medium", secret: "demo", length: 6, renderImage: false } },
  { name: "custom-theme", opts: { difficulty: "hard", secret: "demo", length: 6, theme: { textColor: [40, 120, 200], backgroundColor: [245, 240, 230] } } },
  { name: "scale-16", opts: { difficulty: "medium", secret: "demo", length: 8, scale: 16 } },
  { name: "sha512", opts: { difficulty: "hard", secret: "demo", length: 6, algorithm: "sha512" } },
  { name: "gradient", opts: { difficulty: "medium", secret: "demo", length: 6, theme: { backgroundGradient: { from: [235, 245, 255], to: [180, 210, 240] }, textColor: [30, 50, 90] } } },
  { name: "gradient-angle", opts: { difficulty: "hard", secret: "demo", length: 6, theme: { backgroundGradient: { from: [255, 230, 200], to: [200, 160, 220], angle: 120 } } } },
];

for (const { name, opts } of examples) {
  const { code, image } = createCaptcha(opts);
  if (image) {
    writeFileSync(new URL(`./examples/${name}.png`, import.meta.url), image.buffer);
    if (['easy'].includes(name)) {
      writeFileSync(new URL(`./${name}.png`, import.meta.url), image.buffer);
    }
    console.log(`examples/${name}.png  (code=${code}, ${image.width}x${image.height})`);
  } else {
    console.log(`examples/${name}: image NOT rendered (renderImage=false) — code=${code}`);
  }
}

// Test SVG format captcha creation (synchronous)
const svgCaptcha = createCaptcha({ difficulty: "medium", secret: "demo", length: 6, format: "svg" });
if (svgCaptcha.image) {
  writeFileSync(new URL("./examples/easy-svg.svg", import.meta.url), svgCaptcha.image.buffer);
  console.log(`examples/easy-svg.svg rendered (code=${svgCaptcha.code}, format=svg)`);
}

// Test JPEG format captcha creation (sync, pure TypeScript — no sharp)
const jpegCaptcha = createCaptcha({ difficulty: "medium", secret: "demo", length: 6, format: "jpeg" });
if (jpegCaptcha.image) {
  writeFileSync(new URL("./examples/easy-jpeg.jpg", import.meta.url), jpegCaptcha.image.buffer);
  console.log(`examples/easy-jpeg.jpg  (code=${jpegCaptcha.code}, format=jpeg)`);
}

console.log("\nDone. Open the files in examples/ to inspect visually.");
