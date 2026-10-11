/** Rive stores four tendon indices and normalized byte weights per point. Index 0 is the identity transform. */
export type Influence = { index: number; weight: number };

export function unpackInfluences(indices: number, values: number): Influence[] {
  return Array.from({ length: 4 }, (_, slot) => ({ index: (indices >>> (slot * 8)) & 255, weight: ((values >>> (slot * 8)) & 255) / 255 }));
}

export function packInfluences(input: Influence[]): { indices: number; values: number } {
  const merged = new Map<number, number>();
  for (const { index, weight } of input) {
    if (!Number.isInteger(index) || index < 0 || index > 255 || !Number.isFinite(weight) || weight < 0)
      throw new Error('Influences require a tendon index from 0 to 255 and a finite, nonnegative weight.');
    if (weight > 0) merged.set(index, (merged.get(index) ?? 0) + weight);
  }
  const items = [...merged]
    .map(([index, weight]) => ({ index, weight }))
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
    .slice(0, 4);
  if (!items.length) throw new Error('Keep at least one nonzero influence.');
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  if (!Number.isFinite(total)) throw new Error('Total influence weight must be finite.');
  const bytes = items.map((item) => Math.floor((item.weight / total) * 255));
  const order = items.map((item, i) => ({ i, remainder: (item.weight / total) * 255 - bytes[i] })).sort((a, b) => b.remainder - a.remainder || a.i - b.i);
  const remaining = 255 - bytes.reduce((sum, value) => sum + value, 0);
  for (let i = 0; i < remaining; i++) bytes[order[i].i]++;
  return {
    indices: items.reduce((packed, item, slot) => (packed | (item.index << (slot * 8))) >>> 0, 0),
    values: bytes.reduce((packed, value, slot) => (packed | (value << (slot * 8))) >>> 0, 0),
  };
}

/** Sets one influence's normalized share and proportionally redistributes the remainder. */
export function adjustInfluence(input: Influence[], index: number, amount: number): Influence[] {
  if (!Number.isFinite(amount)) throw new Error('Weight must be finite.');
  amount = Math.max(0, Math.min(1, amount));
  const other = input
    .filter((item) => item.index !== index && item.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);
  const total = other.reduce((sum, item) => sum + item.weight, 0);
  if (!total)
    return index !== 0 && amount < 1
      ? [
          { index, weight: amount },
          { index: 0, weight: 1 - amount },
        ]
      : amount
        ? [{ index, weight: 1 }]
        : input;
  return [{ index, weight: amount }, ...other.map((item) => ({ index: item.index, weight: (item.weight / total) * (1 - amount) }))];
}

export function pointSegmentDistance(x: number, y: number, a: readonly number[], b: readonly number[]) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const t = dx || dy ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
}
