// Smart-guide snapping and create-drag geometry used by the stage.
import { dragRect, snapBox, snapPoint } from '../apps/web/src/lib/snap';

let failed = 0;
const eq = (name: string, actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failed++;
    console.error(`FAIL ${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
};

const target = { minX: 100, minY: 100, maxX: 200, maxY: 160 };

// left edge 3px short of the target's left edge: snaps x, leaves y alone
let r = snapBox({ minX: 97, minY: 300, maxX: 117, maxY: 320 }, [target], 6);
eq('snap x delta', r.dx, 3);
eq('snap y untouched', r.dy, 0);
eq('one vertical guide', r.guides.map((g) => [g.axis, g.pos]), [['x', 100]]);
eq('guide spans both boxes', [r.guides[0]!.from, r.guides[0]!.to], [100, 320]);

// centers align
r = snapBox({ minX: 140, minY: 200, maxX: 160, maxY: 210 }, [target], 6);
eq('center snap', [r.dx, r.dy], [0, 0]);
eq('center guide', r.guides.map((g) => [g.axis, g.pos]), [['x', 150]]);

// out of range: nothing happens
r = snapBox({ minX: 300, minY: 300, maxX: 320, maxY: 320 }, [target], 6);
eq('no snap', [r.dx, r.dy, r.guides.length], [0, 0, 0]);

// lanes: only the right edge may snap
r = snapBox({ minX: 50, minY: 0, maxX: 197, maxY: 10 }, [target], 6, { x: [2], y: [] });
eq('lane snap', [r.dx, r.dy], [3, 0]);

// a point snaps its own axes independently
const p = snapPoint(103, 158, [target], 6);
eq('point snap', [p.x, p.y], [100, 160]);

// shift makes a square following the larger side, in the drag direction
eq('shift square', dragRect(10, 10, 50, 20, { shift: true }), { minX: 10, maxX: 50, minY: 10, maxY: 50 });
eq('shift square negative', dragRect(10, 10, 0, -30, { shift: true }), { minX: -30, maxX: 10, minY: -30, maxY: 10 });
// alt grows from the center
eq('alt from center', dragRect(50, 50, 60, 70, { alt: true }), { minX: 40, maxX: 60, minY: 30, maxY: 70 });
eq('alt + shift', dragRect(50, 50, 60, 70, { alt: true, shift: true }), { minX: 30, maxX: 70, minY: 30, maxY: 70 });

if (failed) {
  console.error(`${failed} snap test(s) failed`);
  process.exit(1);
}
console.log('snap tests passed');
