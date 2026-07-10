export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Turns two drag corners into a positive-extent rectangle, whichever way the drag went. */
export function normalizeRect(a: Point, b: Point): Rect {
  return {
    left:   Math.min(a.x, b.x),
    top:    Math.min(a.y, b.y),
    width:  Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/** Half-angle of the arrowhead, in radians. */
const HEAD_SPREAD = Math.PI / 7;

/**
 * An arrow as a single SVG path: the shaft, then two strokes forming the head.
 *
 * One object means it moves, scales and serialises as a unit, with none of the
 * coordinate-space trouble that comes from grouping a line with a triangle.
 */
export function arrowPath(from: Point, to: Point, headLength: number): string {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);

  const left = {
    x: to.x - headLength * Math.cos(angle - HEAD_SPREAD),
    y: to.y - headLength * Math.sin(angle - HEAD_SPREAD),
  };
  const right = {
    x: to.x - headLength * Math.cos(angle + HEAD_SPREAD),
    y: to.y - headLength * Math.sin(angle + HEAD_SPREAD),
  };

  return [
    `M ${ from.x } ${ from.y } L ${ to.x } ${ to.y }`,
    `M ${ left.x } ${ left.y } L ${ to.x } ${ to.y } L ${ right.x } ${ right.y }`,
  ].join(' ');
}

/** True when a drag is too short to have been deliberate. */
export function isTinyDrag(a: Point, b: Point, threshold: number): boolean {
  return Math.abs(a.x - b.x) < threshold && Math.abs(a.y - b.y) < threshold;
}
