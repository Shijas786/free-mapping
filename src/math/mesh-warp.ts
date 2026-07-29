// ─── Mesh Warp Math ───────────────────────────────────────────────────────────
// Bilinear interpolation for n×m grid of control points.
// Each grid cell is subdivided into 2 triangles in clip-space.
// Isolated here for testability — no WebGL dependencies.

import type { Point } from '../core/types';

export interface MeshVertex {
  /** Normalised output position [0,1] (maps to clip space in shader) */
  sx: number; sy: number;
  /** UV into the source texture [0,1] */
  u: number;  v: number;
}

/**
 * Generate a flat list of triangles (vertex triples) for a mesh surface.
 *
 * @param pts  Control points in row-major order, (rows+1)×(cols+1) entries.
 *             pts[row * (cols+1) + col] = {x, y} in normalised stage coords.
 * @param rows Number of grid rows (cells).
 * @param cols Number of grid cols (cells).
 * @returns Float32Array interleaved [sx, sy, u, v, ...] per vertex,
 *          6 vertices per cell (2 triangles), no index buffer needed.
 */
export function buildMeshGeometry(
  pts: Point[],
  rows: number,
  cols: number
): Float32Array {
  const VERTS_PER_CELL = 6;
  const FLOATS_PER_VERT = 4; // sx, sy, u, v
  const out = new Float32Array(rows * cols * VERTS_PER_CELL * FLOATS_PER_VERT);
  let idx = 0;

  const push = (col: number, row: number) => {
    const c = pts[row * (cols + 1) + col];
    // Source UV is the uniform grid position
    const u = col / cols;
    const v = row / rows;
    out[idx++] = c.x;
    out[idx++] = c.y;
    out[idx++] = u;
    out[idx++] = v;
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Triangle 1: TL, TR, BL
      push(c,     r);
      push(c + 1, r);
      push(c,     r + 1);
      // Triangle 2: TR, BR, BL
      push(c + 1, r);
      push(c + 1, r + 1);
      push(c,     r + 1);
    }
  }
  return out;
}

/**
 * Generate a default uniform grid of control points for a quad.
 * Useful when first converting a quad to a mesh.
 *
 * @param rows  Grid rows
 * @param cols  Grid cols
 * @param corners  4 corners [TL, TR, BR, BL] of the quad in stage space
 */
export function defaultMeshPoints(
  rows: number,
  cols: number,
  corners: [Point, Point, Point, Point]
): Point[] {
  const [tl, tr, br, bl] = corners;
  const pts: Point[] = [];

  for (let r = 0; r <= rows; r++) {
    const tv = r / rows;
    for (let c = 0; c <= cols; c++) {
      const tu = c / cols;
      // Bilinear interpolation of the 4 corners
      const x = (1 - tv) * ((1 - tu) * tl.x + tu * tr.x)
               +    tv    * ((1 - tu) * bl.x + tu * br.x);
      const y = (1 - tv) * ((1 - tu) * tl.y + tu * tr.y)
               +    tv    * ((1 - tu) * bl.y + tu * br.y);
      pts.push({ x, y });
    }
  }
  return pts;
}

/**
 * Convert a quad surface's 4 points into a mesh.
 */
export function quadToMesh(
  points: Point[],
  rows: number,
  cols: number
): Point[] {
  const [tl, tr, br, bl] = points as [Point, Point, Point, Point];
  return defaultMeshPoints(rows, cols, [tl, tr, br, bl]);
}
