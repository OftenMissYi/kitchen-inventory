const units: Record<string, { base: string; factor: number }> = {
  g: { base: "g", factor: 1 },
  kg: { base: "g", factor: 1000 },
  ml: { base: "ml", factor: 1 },
  l: { base: "ml", factor: 1000 },
};
export function canonicalUnit(unit: string): string {
  const normalized = unit.trim().toLowerCase();
  return normalized === "l" ? "L" : normalized;
}
export function convert(
  quantity: number,
  from: string,
  to: string,
): number | null {
  if (canonicalUnit(from) === canonicalUnit(to)) return quantity;
  const a = units[from.toLowerCase()],
    b = units[to.toLowerCase()];
  if (!a || !b || a.base !== b.base) return null;
  return (quantity * a.factor) / b.factor;
}
export function baseQuantity(quantity: number, unit: string) {
  const u = units[unit.toLowerCase()];
  return u
    ? { quantity: quantity * u.factor, unit: u.base }
    : { quantity, unit: canonicalUnit(unit) };
}
