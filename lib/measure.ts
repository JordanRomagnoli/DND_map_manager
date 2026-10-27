// Righello e aree d'effetto (sfera, cono, linea) misurati come al tavolo: in quadretti interi.
// Nessuna dipendenza: lo usa il canvas e lo testa tests/measure.test.mjs.

export type MeasureKind = 'ruler' | 'sphere' | 'cone' | 'line';

export interface Measure {
  kind: MeasureKind;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface MeasureShape {
  sx: number; // origine
  sy: number;
  ex: number; // estremo (fine del righello, bordo dell'area nella direzione trascinata)
  ey: number;
  cells: number; // lunghezza o raggio in quadretti
  contains: (x: number, y: number) => boolean; // il punto è dentro l'area? (sempre false per il righello)
}

// Il righello va da centro a centro dei quadretti. Sfera e cono partono dall'incrocio della griglia più vicino,
// la linea dal bordo del quadretto di partenza (così copre una sola fila). La lunghezza si arrotonda a
// quadretti interi (almeno uno). Il cono è largo in fondo quanto è lungo (5e).
export function measureShape(m: Measure, grid: number): MeasureShape {
  if (m.kind === 'ruler') {
    const center = (v: number) => (Math.floor(v / grid) + 0.5) * grid;
    const [sx, sy, ex, ey] = [center(m.x1), center(m.y1), center(m.x2), center(m.y2)];
    return { sx, sy, ex, ey, cells: Math.round(Math.hypot(ex - sx, ey - sy) / grid), contains: () => false };
  }

  const snap = m.kind === 'line' ? (v: number) => (Math.floor(v / grid) + 0.5) * grid : (v: number) => Math.round(v / grid) * grid;
  const [ox, oy] = [snap(m.x1), snap(m.y1)];
  const cells = Math.max(1, Math.round(Math.hypot(m.x2 - ox, m.y2 - oy) / grid));
  const len = cells * grid;
  const angle = Math.atan2(m.y2 - oy, m.x2 - ox);
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  const back = m.kind === 'line' ? grid / 2 : 0; // la linea parte dal bordo del suo quadretto
  const [sx, sy] = [ox - cos * back, oy - sin * back];
  const eps = 1e-6; // i bordi esatti contano come dentro

  const contains = (x: number, y: number) => {
    const [dx, dy] = [x - sx, y - sy];
    if (m.kind === 'sphere') return Math.hypot(dx, dy) <= len + eps;
    const along = dx * cos + dy * sin;
    const perp = Math.abs(-dx * sin + dy * cos);
    if (along < -eps || along > len + eps) return false;
    return m.kind === 'cone' ? along > eps && perp <= along / 2 + eps : perp <= grid / 2 + eps;
  };

  return { sx, sy, ex: sx + cos * len, ey: sy + sin * len, cells, contains };
}

// Centri dei quadretti dentro l'area: quelli da evidenziare
export function cellsInShape(shape: MeasureShape, grid: number): { x: number; y: number }[] {
  const reach = shape.cells + 1;
  const col0 = Math.floor(shape.sx / grid) - reach;
  const row0 = Math.floor(shape.sy / grid) - reach;
  const cells = [];
  for (let col = col0; col <= col0 + reach * 2; col++) {
    for (let row = row0; row <= row0 + reach * 2; row++) {
      const [x, y] = [(col + 0.5) * grid, (row + 0.5) * grid];
      if (shape.contains(x, y)) cells.push({ x, y });
    }
  }
  return cells;
}
