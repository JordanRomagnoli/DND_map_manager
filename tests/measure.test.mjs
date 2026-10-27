// Test della geometria di righello e aree d'effetto: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureShape, cellsInShape } from '../lib/measure.ts';

const G = 50; // lato del quadretto in pixel

test('il righello conta i quadretti da centro a centro', () => {
  const shape = measureShape({ kind: 'ruler', x1: 10, y1: 10, x2: 160, y2: 40 }, G);
  assert.deepEqual([shape.sx, shape.sy, shape.ex, shape.ey], [25, 25, 175, 25]);
  assert.equal(shape.cells, 3);
  assert.deepEqual(cellsInShape(shape, G), [], 'il righello non colpisce quadretti');
});

test('una sfera di raggio 1 colpisce i 4 quadretti attorno all\'incrocio', () => {
  const shape = measureShape({ kind: 'sphere', x1: 98, y1: 103, x2: 150, y2: 100 }, G);
  assert.deepEqual([shape.sx, shape.sy, shape.cells], [100, 100, 1]);
  assert.equal(cellsInShape(shape, G).length, 4);
});

test('una linea lunga 4 verso destra colpisce 4 quadretti in fila', () => {
  const shape = measureShape({ kind: 'line', x1: 0, y1: 100, x2: 210, y2: 110 }, G);
  const hit = cellsInShape(shape, G);
  assert.equal(shape.cells, 4);
  // parte dal quadretto cliccato e copre una sola fila, senza andare oltre la fine
  assert.deepEqual(hit.map((c) => [c.x, c.y]), [[25, 125], [75, 125], [125, 125], [175, 125]]);
});

test('il cono si allarga: più quadretti in fondo che all\'inizio', () => {
  const shape = measureShape({ kind: 'cone', x1: 0, y1: 0, x2: 300, y2: 0 }, G);
  const hit = cellsInShape(shape, G);
  const column = (x) => hit.filter((c) => c.x === x).length;
  assert.equal(shape.cells, 6);
  assert.ok(column(275) > column(75));
  assert.ok(hit.every((c) => c.x > 0), 'niente dietro l\'origine');
});
