/** Exact arithmetic on declared decimal numbers and rational strings. */
export type Q = readonly [bigint, bigint];
const gcd = (a: bigint, b: bigint): bigint =>
  b === 0n ? (a < 0n ? -a : a) : gcd(b, a % b);
export const q = (n: bigint, d = 1n): Q => {
  if (!d) throw new Error("zero denominator");
  const g = gcd(n, d) * (d < 0n ? -1n : 1n);
  return [n / g, d / g];
};
export const Z = q(0n),
  ONE = q(1n);
export function rational(x: string | number): Q {
  const s = String(x);
  if (/^[+-]?\d+\/[1-9]\d*$/.test(s)) {
    const [n, d] = s.split("/");
    return q(BigInt(n), BigInt(d));
  }
  const m = /^([+-]?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(s);
  if (!m) throw new Error("invalid rational");
  const exp = Number(m[4] ?? 0) - (m[3]?.length ?? 0);
  if (Math.abs(exp) > 400 || s.length > 512)
    throw new Error("rational exceeds encoding cap");
  return q(
    BigInt((m[1] || "") + m[2] + (m[3] ?? "")) *
      (exp > 0 ? 10n ** BigInt(exp) : 1n),
    exp < 0 ? 10n ** BigInt(-exp) : 1n,
  );
}
export const add = (a: Q, b: Q) => q(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
export const neg = (a: Q) => q(-a[0], a[1]);
export const sub = (a: Q, b: Q) => add(a, neg(b));
export const mul = (a: Q, b: Q) => q(a[0] * b[0], a[1] * b[1]);
export const div = (a: Q, b: Q) => q(a[0] * b[1], a[1] * b[0]);
export const cmp = (a: Q, b: Q) => {
  const d = a[0] * b[1] - b[0] * a[1];
  return d < 0n ? -1 : d > 0n ? 1 : 0;
};
export const sum = (xs: Q[]) => xs.reduce(add, Z);
export const show = (a: Q) => (a[1] === 1n ? String(a[0]) : `${a[0]}/${a[1]}`);
export const approx = (a: Q) => Number(a[0]) / Number(a[1]);
/** Exact Gauss-Jordan; undefined for inconsistent or underdetermined systems. */
export function solve(rows: Q[][], n: number): Q[] | undefined {
  const a = rows.map((r) => [...r]);
  let rank = 0;
  const pivots: number[] = [];
  for (let c = 0; c < n; c++) {
    const k = a.findIndex((r, i) => i >= rank && cmp(r[c], Z) !== 0);
    if (k < 0) continue;
    [a[rank], a[k]] = [a[k], a[rank]];
    const pivot = a[rank][c];
    a[rank] = a[rank].map((v) => div(v, pivot));
    for (let i = 0; i < a.length; i++)
      if (i !== rank) {
        const f = a[i][c];
        a[i] = a[i].map((v, j) => sub(v, mul(f, a[rank][j])));
      }
    pivots.push(c);
    rank++;
  }
  if (
    a.some(
      (r) => r.slice(0, n).every((x) => cmp(x, Z) === 0) && cmp(r[n], Z) !== 0,
    ) ||
    rank < n
  )
    return undefined;
  const x = Array<Q>(n).fill(Z);
  pivots.forEach((c, i) => (x[c] = a[i][n]));
  return x;
}
