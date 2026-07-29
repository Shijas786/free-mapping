// ─── Structured Light Gray Code Pattern Generator & Decoder ────────────────────

/** Convert binary integer to Gray code */
export function binaryToGray(n: number): number {
  return n ^ (n >> 1);
}

/** Convert Gray code integer back to binary */
export function grayToBinary(g: number): number {
  let mask = g >> 1;
  while (mask !== 0) {
    g ^= mask;
    mask >>= 1;
  }
  return g;
}

/**
 * Generate a sequence of Gray code stripe patterns for a given resolution (bits).
 * E.g., for 1024px width, bits = 10 (10 vertical patterns + 10 inverted patterns).
 */
export function generateGrayCodePatterns(
  width: number,
  height: number,
  bits = 8
): { canvas: HTMLCanvasElement; bit: number; inverted: boolean; isVertical: boolean }[] {
  const patterns: { canvas: HTMLCanvasElement; bit: number; inverted: boolean; isVertical: boolean }[] = [];

  // 1. Vertical stripes (x-axis decoding)
  for (let bit = 0; bit < bits; bit++) {
    for (const inverted of [false, true]) {
      const cvs = document.createElement('canvas');
      cvs.width = width; cvs.height = height;
      const ctx = cvs.getContext('2d')!;
      const imgData = ctx.createImageData(width, height);
      const data = imgData.data;

      for (let x = 0; x < width; x++) {
        const normX = Math.floor((x / width) * (1 << bits));
        const gc = binaryToGray(normX);
        const bitVal = (gc >> (bits - 1 - bit)) & 1;
        const val = (bitVal ^ (inverted ? 1 : 0)) ? 255 : 0;

        for (let y = 0; y < height; y++) {
          const idx = (y * width + x) * 4;
          data[idx] = val; data[idx + 1] = val; data[idx + 2] = val; data[idx + 3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);
      patterns.push({ canvas: cvs, bit, inverted, isVertical: true });
    }
  }

  // 2. Horizontal stripes (y-axis decoding)
  for (let bit = 0; bit < bits; bit++) {
    for (const inverted of [false, true]) {
      const cvs = document.createElement('canvas');
      cvs.width = width; cvs.height = height;
      const ctx = cvs.getContext('2d')!;
      const imgData = ctx.createImageData(width, height);
      const data = imgData.data;

      for (let y = 0; y < height; y++) {
        const normY = Math.floor((y / height) * (1 << bits));
        const gc = binaryToGray(normY);
        const bitVal = (gc >> (bits - 1 - bit)) & 1;
        const val = (bitVal ^ (inverted ? 1 : 0)) ? 255 : 0;

        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          data[idx] = val; data[idx + 1] = val; data[idx + 2] = val; data[idx + 3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);
      patterns.push({ canvas: cvs, bit, inverted, isVertical: false });
    }
  }

  return patterns;
}
