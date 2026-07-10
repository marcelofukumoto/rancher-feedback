import { arrowPath, isTinyDrag, normalizeRect, type Point } from '../geometry';

describe('normalizeRect', () => {
  it('produces positive extents regardless of drag direction', () => {
    const topLeftToBottomRight = normalizeRect({ x: 10, y: 20 }, { x: 40, y: 60 });
    const bottomRightToTopLeft = normalizeRect({ x: 40, y: 60 }, { x: 10, y: 20 });

    expect(topLeftToBottomRight).toEqual({
      left: 10, top: 20, width: 30, height: 40,
    });
    // A drag the other way must yield the same rectangle.
    expect(bottomRightToTopLeft).toEqual(topLeftToBottomRight);
  });

  it('handles a zero-size drag', () => {
    expect(normalizeRect({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({
      left: 5, top: 5, width: 0, height: 0,
    });
  });
});

describe('isTinyDrag', () => {
  it('is true when both axes are under the threshold', () => {
    expect(isTinyDrag({ x: 0, y: 0 }, { x: 3, y: 3 }, 5)).toBe(true);
  });

  it('is false when either axis meets the threshold', () => {
    expect(isTinyDrag({ x: 0, y: 0 }, { x: 5, y: 0 }, 5)).toBe(false);
    expect(isTinyDrag({ x: 0, y: 0 }, { x: 0, y: 6 }, 5)).toBe(false);
  });
});

describe('arrowPath', () => {
  const from: Point = { x: 0, y: 0 };
  const to: Point = { x: 100, y: 0 };

  it('starts at the tail and draws through the tip', () => {
    expect(arrowPath(from, to, 12)).toContain('M 0 0 L 100 0');
  });

  it('draws a two-sided head that meets at the tip', () => {
    // The head sub-path passes through the tip (100,0) between its two barbs.
    expect(arrowPath(from, to, 12)).toMatch(/L 100 0 L/);
  });

  it('places the head barbs behind the tip along a horizontal arrow', () => {
    // For a rightward arrow, both barbs sit at x < tip and are mirrored around y=0.
    const path = arrowPath(from, to, 14);
    const barbs = [...path.matchAll(/M (-?[\d.]+) (-?[\d.]+) L 100 0 L (-?[\d.]+) (-?[\d.]+)/g)][0];

    const [, x1, y1, x2, y2] = barbs.map(Number);

    expect(x1).toBeLessThan(100);
    expect(x2).toBeLessThan(100);
    expect(y1).toBeCloseTo(-y2, 5);
  });
});
