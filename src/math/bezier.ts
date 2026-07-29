// ─── Bézier Curve & Surface Math ─────────────────────────────────────────────
import type { Point } from '../core/types';

export interface BezierPoint extends Point {
  /** Tangent handle in (relative or absolute) stage coords */
  handleIn?: Point;
  /** Tangent handle out (relative or absolute) stage coords */
  handleOut?: Point;
}

/**
 * Evaluate cubic Bézier curve at parameter t in [0, 1].
 * B(t) = (1-t)³ P0 + 3(1-t)² t C1 + 3(1-t) t² C2 + t³ P1
 */
export function evaluateCubicBezier(
  p0: Point,
  c1: Point,
  c2: Point,
  p1: Point,
  t: number
): Point {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x: mt3 * p0.x + 3 * mt2 * t * c1.x + 3 * mt * t2 * c2.x + t3 * p1.x,
    y: mt3 * p0.y + 3 * mt2 * t * c1.y + 3 * mt * t2 * c2.y + t3 * p1.y,
  };
}

/**
 * Sample n points along a cubic Bézier segment.
 */
export function sampleCubicBezierSegment(
  p0: Point,
  c1: Point,
  c2: Point,
  p1: Point,
  samples = 16
): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= samples; i++) {
    points.push(evaluateCubicBezier(p0, c1, c2, p1, i / samples));
  }
  return points;
}

/**
 * Convert a closed loop of Bézier points with handles into a densely sampled polygon.
 */
export function bezierLoopToPolygon(bPts: BezierPoint[], samplesPerSeg = 12): Point[] {
  if (bPts.length < 2) return bPts;
  const poly: Point[] = [];

  for (let i = 0; i < bPts.length; i++) {
    const curr = bPts[i];
    const next = bPts[(i + 1) % bPts.length];

    const c1 = curr.handleOut ?? curr;
    const c2 = next.handleIn ?? next;

    const seg = sampleCubicBezierSegment(curr, c1, c2, next, samplesPerSeg);
    // Exclude last point of segment (except on final segment) to avoid duplicates
    poly.push(...seg.slice(0, -1));
  }
  return poly;
}
