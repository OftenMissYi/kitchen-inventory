import type { HistoryEntry } from "./lib/inventoryTypes";
export type Status = "available" | "verify" | "empty";
export const locations = ["未确定", "冷藏", "冷冻", "常温"] as const;
export type Location = (typeof locations)[number];
export interface Item {
  id: string;
  name: string;
  category: string;
  quantity: number | null;
  unit: string;
  location: Location;
  expiry: string;
  status: Status;
  notes: string;
  updatedAt: string;
}
export interface ShoppingItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string;
  category: string;
  purchased: boolean;
}
export interface KitchenData {
  version: 2;
  items: Item[];
  shopping: ShoppingItem[];
  categories: string[];
  history: HistoryEntry[];
  aliases: Record<string, string[]>;
}
export const STORAGE_KEY = "little-kitchen.v1";
export const stamp = () => new Date().toISOString();
export const id = () => crypto.randomUUID();
export const blankItem = (): Item => ({
  id: id(),
  name: "",
  category: "其他",
  quantity: null,
  unit: "",
  location: "未确定",
  expiry: "",
  status: "available",
  notes: "",
  updatedAt: stamp(),
});
export function seedData(): KitchenData {
  const categories = [
    "肉类",
    "蔬菜",
    "主食",
    "蛋奶",
    "调味料",
    "冷冻食品",
    "熟食",
    "其他",
  ];
  const confirmed: [string, string, number | null, string, string][] = [
    ["猪牛混合肉末", "肉类", 1, "份", "重量未知"],
    ["鸡腿", "肉类", 2, "只", ""],
    ["广式香肠", "肉类", null, "", ""],
    ["小肉丸", "肉类", null, "", ""],
    ["冷冻三色蔬菜丁", "冷冻食品", null, "", "豌豆、胡萝卜、玉米"],
    ["剩余的炸鸡和洋葱圈", "熟食", null, "", ""],
    ["番茄膏", "调味料", null, "", "已开封"],
    ["帕尔马干酪", "蛋奶", null, "", ""],
  ];
  const historical: [string, string][] = [
    ["大米", "主食"],
    ["意面", "主食"],
    ["阳春面", "主食"],
    ["乌冬面", "主食"],
    ["鸡蛋", "蛋奶"],
    ["土豆", "蔬菜"],
    ["洋葱", "蔬菜"],
    ["姜、蒜", "蔬菜"],
    ["五花肉、培根", "肉类"],
    ["豆瓣酱", "调味料"],
    ["豆豉", "调味料"],
    ["老干妈", "调味料"],
    ["甜面酱", "调味料"],
    ["芝麻酱", "调味料"],
    ["黄灯笼辣椒酱", "调味料"],
    ["蚝油、料酒、花椒等调味品", "调味料"],
  ];
  return {
    version: 2,
    history: [],
    aliases: {},
    categories,
    shopping: [],
    items: [
      ...confirmed.map(([name, category, quantity, unit, notes]) => ({
        ...blankItem(),
        name,
        category,
        quantity,
        unit,
        notes,
      })),
      ...historical.map(([name, category]) => ({
        ...blankItem(),
        name,
        category,
        status: "verify" as Status,
      })),
    ],
  };
}
export function adjust(item: Item, amount: number): Item {
  if (item.quantity === null) return item;
  const quantity =
    Math.round(Math.max(0, item.quantity + amount) * 1000) / 1000;
  return {
    ...item,
    quantity,
    status: quantity === 0 ? "empty" : "available",
    updatedAt: stamp(),
  };
}
export function receive(data: KitchenData): KitchenData {
  const items = data.items.map((i) => ({ ...i }));
  for (const purchase of data.shopping.filter((s) => s.purchased)) {
    const existing = items.find(
      (i) =>
        i.name.trim().toLocaleLowerCase() ===
          purchase.name.trim().toLocaleLowerCase() && i.unit === purchase.unit,
    );
    if (existing) {
      existing.quantity =
        existing.status === "empty"
          ? purchase.quantity
          : existing.status === "verify" ||
              existing.quantity === null ||
              purchase.quantity === null
            ? null
            : Math.round((existing.quantity + purchase.quantity) * 1000) / 1000;
      existing.status = "available";
      existing.updatedAt = stamp();
    } else
      items.unshift({
        ...blankItem(),
        name: purchase.name,
        quantity: purchase.quantity,
        unit: purchase.unit,
        category: purchase.category,
      });
  }
  return {
    ...data,
    items,
    shopping: data.shopping.filter((s) => !s.purchased),
  };
}
export function expiryDays(expiry: string): number | null {
  if (!expiry) return null;
  const now = new Date();
  return Math.round(
    (Date.parse(expiry + "T00:00:00Z") -
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) /
      86400000,
  );
}
export function parseBackup(raw: string): KitchenData {
  const d = JSON.parse(raw);
  const fail = () => {
    throw new Error("备份格式无效。请使用本应用导出的 JSON 文件。");
  };
  if (
    !d ||
    ![1, 2].includes(d.version) ||
    !Array.isArray(d.items) ||
    !Array.isArray(d.shopping) ||
    !Array.isArray(d.categories)
  )
    return fail();
  const str = (v: unknown) => typeof v === "string";
  const qty = (v: unknown) =>
    v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0);
  if (
    !d.categories.length ||
    !d.categories.every((v: unknown) => str(v) && (v as string).trim()) ||
    new Set(d.categories).size !== d.categories.length
  )
    return fail();
  const base = (v: any) =>
    v &&
    str(v.id) &&
    v.id &&
    str(v.name) &&
    v.name.trim() &&
    qty(v.quantity) &&
    str(v.unit) &&
    d.categories.includes(v.category);
  if (
    !d.items.every(
      (v: any) =>
        base(v) &&
        locations.includes(v.location) &&
        ["available", "verify", "empty"].includes(v.status) &&
        str(v.notes) &&
        str(v.updatedAt) &&
        str(v.expiry) &&
        (!v.expiry ||
          (/^\d{4}-\d{2}-\d{2}$/.test(v.expiry) &&
            !Number.isNaN(Date.parse(v.expiry)) &&
            new Date(v.expiry).toISOString().slice(0, 10) === v.expiry)) &&
        (v.status !== "empty" || v.quantity === 0) &&
        (v.status !== "available" || v.quantity !== 0),
    )
  )
    return fail();
  if (
    !d.shopping.every(
      (v: any) =>
        base(v) && typeof v.purchased === "boolean" && v.quantity !== 0,
    )
  )
    return fail();
  if (
    new Set(d.items.map((v: Item) => v.id)).size !== d.items.length ||
    new Set(d.shopping.map((v: ShoppingItem) => v.id)).size !==
      d.shopping.length
  )
    return fail();
  // Version 1 has no history or custom aliases. Keep the existing storage key.
  if (d.version === 1) return { ...d, version: 2, history: [], aliases: {} };
  if (
    !Array.isArray(d.history) ||
    d.history.length > 30 ||
    !d.aliases ||
    typeof d.aliases !== "object" ||
    Array.isArray(d.aliases)
  )
    return fail();
  if (
    !Object.entries(d.aliases).every(
      ([key, ids]) =>
        key.trim() &&
        Array.isArray(ids) &&
        ids.length > 0 &&
        ids.every(
          (id: unknown) => str(id) && d.items.some((i: Item) => i.id === id),
        ),
    )
  )
    return fail();
  const validSnapshot = (snapshot: any) => {
    if (
      !snapshot ||
      !Array.isArray(snapshot.items) ||
      !Array.isArray(snapshot.categories)
    )
      return false;
    try {
      parseBackup(
        JSON.stringify({
          version: 1,
          items: snapshot.items,
          categories: snapshot.categories,
          shopping: [],
        }),
      );
      return true;
    } catch {
      return false;
    }
  };
  const validTime = (v: unknown) =>
    str(v) && Number.isFinite(Date.parse(v as string));
  if (
    !d.history.every(
      (h: any) =>
        h &&
        str(h.id) &&
        h.id &&
        validTime(h.timestamp) &&
        str(h.source) &&
        validSnapshot(h.before) &&
        validSnapshot(h.after) &&
        (!h.undoneAt || validTime(h.undoneAt)) &&
        Array.isArray(h.changes) &&
        h.changes.length > 0 &&
        h.changes.every((c: any) => {
          if (
            !c ||
            !str(c.name) ||
            ![
              "ADD",
              "CONSUME",
              "SET_QUANTITY",
              "MARK_EMPTY",
              "CREATE",
              "UPDATE",
              "DELETE",
            ].includes(c.type) ||
            (!c.before && !c.after)
          )
            return false;
          return (
            (c.before === null ||
              validSnapshot({
                items: [c.before],
                categories: h.before.categories
                  .concat(h.after.categories)
                  .filter(
                    (v: string, i: number, a: string[]) => a.indexOf(v) === i,
                  ),
              })) &&
            (c.after === null ||
              validSnapshot({
                items: [c.after],
                categories: h.before.categories
                  .concat(h.after.categories)
                  .filter(
                    (v: string, i: number, a: string[]) => a.indexOf(v) === i,
                  ),
              }))
          );
        }),
    )
  )
    return fail();
  if (
    new Set(d.history.map((h: HistoryEntry) => h.id)).size !== d.history.length
  )
    return fail();
  return d as KitchenData;
}
