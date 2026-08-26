import { writeFileSync } from "node:fs";
import { createCaptcha, renderCaptcha, generateCode } from "../dist/index.js";

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
    writeFileSync(new URL(`../examples/${name}.png`, import.meta.url), image.buffer);
    console.log(`examples/${name}.png  (code=${code}, ${image.width}x${image.height})`);
  } else {
    console.log(`examples/${name}: image NOT rendered (renderImage=false) — code=${code}`);
  }
}

// renderCaptcha ile harici kod render örneği
const code = generateCode({ length: 5, secret: "demo" });
const img = renderCaptcha(code, { difficulty: "hard", scale: 10 });
writeFileSync(new URL("../examples/render-captcha.png", import.meta.url), img.buffer);
console.log(`examples/render-captcha.png  (rendered code=${code}, ${img.width}x${img.height})`);

console.log("\nDone. Open the .png files in examples/ to inspect visually.");
