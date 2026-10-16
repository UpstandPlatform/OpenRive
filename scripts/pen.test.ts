import assert from 'node:assert/strict';
import { vertexFromPen } from '@openrive/rive/factory';

const incoming = vertexFromPen('path', { x: 10, y: 20, inX: 0, inY: -8 });
assert.equal(incoming.type, 'CubicDetachedVertex', 'a vertical incoming handle must create a cubic vertex');
assert.equal(incoming.props.inDistance, 8);

const outgoing = vertexFromPen('path', { x: 10, y: 20, outX: 0, outY: 6 });
assert.equal(outgoing.type, 'CubicDetachedVertex', 'a vertical outgoing handle must create a cubic vertex');
assert.equal(outgoing.props.outDistance, 6);

const straight = vertexFromPen('path', { x: 10, y: 20 });
assert.equal(straight.type, 'StraightVertex', 'vertices without handles should remain straight');
console.log('Pen vertices preserve vertical tangent handles.');
