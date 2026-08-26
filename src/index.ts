export {
  createCaptcha,
  renderCaptcha,
  generateCode,
  hashCode,
  verifyCode,
  DEFAULT_CHARSET,
} from "./captcha.js";

export type {
  CaptchaOptions,
  RenderCaptchaOptions,
  CaptchaResult,
  CaptchaImage,
  Difficulty,
  NoiseOptions,
  ThemeOptions,
  GradientOptions,
  RGB,
} from "./captcha.js";

export { DEFAULT_GLYPHS } from "./font.js";
export type { GlyphMap } from "./font.js";
