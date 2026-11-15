import type { Item } from "../model";

export const aliasGroups = [
  ["鸡蛋", "蛋", "Eier"],
  ["番茄", "西红柿", "Tomaten"],
  ["番茄膏", "Tomatenmark"],
  ["帕尔马干酪", "Parmesan"],
  ["广式香肠", "香肠"],
  ["猪牛混合肉末", "Hackfleisch gemischt"],
];
export function normalizeName(name: string) {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}
function nameParts(item: Item) {
  return item.name.split(/\s*[/／]\s*/).map(normalizeName);
}
export function matchItems(
  name: string,
  items: Item[],
  aliases: Record<string, string[]>,
): Item[] {
  const exact = items.filter((i) => i.name.trim() === name.trim());
  if (exact.length) return exact;
  const key = normalizeName(name);
  const explicitIds = Object.entries(aliases)
    .filter(([a]) => normalizeName(a) === key)
    .flatMap(([, ids]) => ids);
  if (explicitIds.length)
    return items.filter((i) => explicitIds.includes(i.id));
  const groups = aliasGroups.filter((g) =>
    g.some((n) => normalizeName(n) === key),
  );
  // Generic 肉末 is intentionally ambiguous if more than one mince record exists.
  const names =
    key === "肉末"
      ? ["肉末", "猪牛混合肉末", "猪肉末", "牛肉末", "hackfleisch gemischt"]
      : groups.flat().map(normalizeName);
  const matched = items.filter((i) =>
    nameParts(i).some((n) => names.includes(n)),
  );
  if (matched.length) return matched;
  // No arbitrary substring matching: 鸡腿 never matches 炸鸡腿.
  return items.filter((i) => nameParts(i).includes(key));
}
