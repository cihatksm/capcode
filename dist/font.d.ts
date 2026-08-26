export type GlyphMap = Record<string, readonly number[]>;
export declare const DEFAULT_GLYPHS: GlyphMap;
export declare const GLYPH_WIDTH = 5;
export declare const GLYPH_HEIGHT = 7;
export declare function getGlyph(glyphs: GlyphMap, char: string): readonly number[] | undefined;
export declare function validateGlyphs(glyphs: GlyphMap, charset: string): void;
