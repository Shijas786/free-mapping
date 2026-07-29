// ─── Homography Math ──────────────────────────────────────────────────────────
// Computes a 3×3 homography matrix mapping a unit quad [0,1]² to 4 arbitrary points.
// This is needed for the warp shader to map texture UVs through perspective.

import type { Point } from '../core/types';

type Mat3 = [
  number, number, number,
  number, number, number,
  number, number, number
];

/** Solve Ax = b using Gaussian elimination. A is 8×8, b is 8×1. */
function gaussElim(A: number[][], b: number[]): number[] {
  const n = b.length;
  // augment
  for (let i = 0; i < n; i++) A[i].push(b[i]);

  for (let col = 0; col < n; col++) {
    // pivot
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(A[row][col]) > Math.abs(A[maxRow][col])) maxRow = row;
    }
    [A[col], A[maxRow]] = [A[maxRow], A[col]];

    const pivot = A[col][col];
    if (Math.abs(pivot) < 1e-12) continue;

    for (let row = col + 1; row < n; row++) {
      const factor = A[row][col] / pivot;
      for (let c = col; c <= n; c++) A[row][c] -= factor * A[col][c];
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = A[i][n];
    for (let j = i + 1; j < n; j++) x[i] -= A[i][j] * x[j];
    x[i] /= A[i][i];
  }
  return x;
}

/**
 * Compute homography from unit square (src) to 4 destination points (dst).
 * Points order: [TL, TR, BR, BL] in normalised [0,1] stage space.
 *
 * Returns a column-major 9-float array (mat3 in GLSL).
 */
export function computeHomography(dst: Point[]): Mat3 {
  // src = unit square corners
  const srcPts = [
    [0, 0], [1, 0], [1, 1], [0, 1],
  ];

  // Build 8×8 system per the DLT algorithm
  const rows: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const [sx, sy] = srcPts[i];
    const dx = dst[i].x;
    const dy = dst[i].y;

    rows.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
    b.push(dx);
    rows.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
    b.push(dy);
  }

  const h = gaussElim(rows, b);
  // h = [h00,h01,h02, h10,h11,h12, h20,h21] — h22 = 1
  return [
    h[0], h[3], h[6],
    h[1], h[4], h[7],
    h[2], h[5], 1,
  ];
}

/**
 * Apply a 3×3 homography matrix to a 2-D point.
 * Returns projected (x, y) in dst space.
 */
export function applyHomography(H: Mat3, p: Point): Point {
  const w = H[2] * p.x + H[5] * p.y + H[8];
  return {
    x: (H[0] * p.x + H[3] * p.y + H[6]) / w,
    y: (H[1] * p.x + H[4] * p.y + H[7]) / w,
  };
}

/**
 * Invert a 3×3 matrix (row-major).
 */
export function invertMat3(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, k] = m;
  const det = a * (e * k - f * h) - b * (d * k - f * g) + c * (d * h - e * g);
  const inv = 1 / det;
  return [
    (e * k - f * h) * inv, (c * h - b * k) * inv, (b * f - c * e) * inv,
    (f * g - d * k) * inv, (a * k - c * g) * inv, (c * d - a * f) * inv,
    (d * h - e * g) * inv, (b * g - a * h) * inv, (a * e - b * d) * inv,
  ];
}
