import type { RGB } from "./captcha.js";

interface Canvas {
  width: number;
  height: number;
  pixels: Uint8Array;
}

export function encodeSvg(canvas: Canvas): string {
  const { width, height, pixels } = canvas;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`;

  // Draw background by analyzing pixel groupings to optimize SVG size
  // Since we have a pixel matrix, we can output rectangles for non-matching pixels to reduce file size.
  // First, find the dominant color as the main background rect
  const colorCounts: Record<string, number> = {};
  for (let i = 0; i < pixels.length; i += 3) {
    const key = `${pixels[i]},${pixels[i+1]},${pixels[i+2]}`;
    colorCounts[key] = (colorCounts[key] || 0) + 1;
  }
  
  let dominantColor = "255,255,255";
  let maxCount = 0;
  for (const [color, count] of Object.entries(colorCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantColor = color;
    }
  }

  const [dr, dg, db] = dominantColor.split(",").map(Number);
  svg += `<rect width="100%" height="100%" fill="rgb(${dr},${dg},${db})"/>`;

  // Draw other pixels as tiny 1x1 rectangles (grouped by color to reduce SVG tags)
  const colorsMap: Record<string, [number, number][]> = {};
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      
      if (r === dr && g === dg && b === db) continue;
      const colorKey = `rgb(${r},${g},${b})`;
      if (!colorsMap[colorKey]) {
        colorsMap[colorKey] = [];
      }
      colorsMap[colorKey].push([x, y]);
    }
  }

  for (const [color, pts] of Object.entries(colorsMap)) {
    // Group consecutive pixels on the same row into a single rectangle to optimize size
    let currentRect: { x: number; y: number; w: number } | null = null;
    let paths = "";

    for (const [x, y] of pts) {
      if (currentRect && currentRect.y === y && currentRect.x + currentRect.w === x) {
        currentRect.w++;
      } else {
        if (currentRect) {
          paths += `M${currentRect.x} ${currentRect.y}h${currentRect.w}v1h-${currentRect.w}z `;
        }
        currentRect = { x, y, w: 1 };
      }
    }
    if (currentRect) {
      paths += `M${currentRect.x} ${currentRect.y}h${currentRect.w}v1h-${currentRect.w}z `;
    }

    if (paths) {
      svg += `<path d="${paths.trim()}" fill="${color}"/>`;
    }
  }

  svg += "</svg>";
  return svg;
}
