interface Canvas {
    width: number;
    height: number;
    pixels: Uint8Array;
}
export declare function encodeSvg(canvas: Canvas): string;
export {};
