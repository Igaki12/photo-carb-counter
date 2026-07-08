export function normalizeVector(vector: number[]): number[] {
  const norm = Math.hypot(...vector);
  return norm > 0 ? vector.map((value) => value / norm) : vector;
}

export function dotProduct(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let total = 0;
  for (let index = 0; index < length; index += 1) {
    total += a[index] * b[index];
  }
  return total;
}
