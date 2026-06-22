/** Pure PCM helpers (no DOM/network) so they're unit-testable in plain Node. */

/** Concatenate Float32 PCM parts into one buffer, preserving order. */
export function concatFloat32(parts: Float32Array[]): Float32Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}
