import {
  adjust,
  blankItem,
  id,
  stamp,
  type Item,
  type KitchenData,
} from "../model";
import { matchItems } from "./aliases";
import { baseQuantity, convert } from "./units";
import type {
  CommitContext,
  DraftOperation,
  HistoryEntry,
  InventoryChange,
  InventorySnapshot,
} from "./inventoryTypes";

export const operationLabels = {
  ADD: "增加",
  CONSUME: "消耗",
  SET_QUANTITY: "修正总量",
  MARK_EMPTY: "用完",
  CREATE: "新增",
  UPDATE: "编辑",
  DELETE: "删除",
};
export function snapshot(data: KitchenData): InventorySnapshot {
  return {
    items: structuredClone(data.items),
    categories: [...data.categories],
  };
}
export function inventorySignature(data: KitchenData) {
  return JSON.stringify({
    items: data.items,
    categories: data.categories,
    aliases: data.aliases,
  });
}
export function formatItem(item: Item | null) {
  return item
    ? `${item.quantity === null ? "数量未知" : `${item.quantity}${item.unit}`} · ${{ available: "确认有货", verify: "待核实", empty: "已用完" }[item.status]}`
    : "无记录";
}
export interface PreviewRow {
  draft: DraftOperation;
  candidates: Item[];
  before: Item | null;
  after: Item | null;
  error?: string;
  warning?: string;
}
function evaluateOperation(
  draft: DraftOperation,
  data: KitchenData,
): PreviewRow {
  const candidates = matchItems(draft.name, data.items, data.aliases);
  const before =
    draft.targetId && draft.targetId !== "new"
      ? (data.items.find((i) => i.id === draft.targetId) ?? null)
      : candidates.length === 1
        ? candidates[0]
        : null;
  const row: PreviewRow = { draft, candidates, before, after: null };
  const fail = (error: string): PreviewRow => ({ ...row, error });
  if (!["ADD", "CONSUME", "SET_QUANTITY", "MARK_EMPTY"].includes(draft.type))
    return fail("不支持的操作类型，请重新识别。");
  if (draft.error) return fail(draft.error);
  if (!draft.name.trim()) return fail("请填写食材名称。");
  if (draft.targetId === "new" && candidates.length)
    return fail("已有匹配食材，请选择已有记录，避免重复新增。");
  if (draft.targetId && draft.targetId !== "new" && !before)
    return fail("选中的食材已不存在，请重新匹配。");
  if (!draft.targetId && candidates.length > 1)
    return fail("匹配到多个食材，请选择本次操作的对象。");
  const n = draft.quantity;
  if (
    draft.type !== "MARK_EMPTY" &&
    (n === null ||
      !Number.isFinite(n) ||
      n < 0 ||
      n > 1e9 ||
      (n === 0 && draft.type !== "SET_QUANTITY") ||
      !draft.unit.trim())
  )
    return fail("请填写有效数量与单位；只有修正总量允许为 0。");
  if (!before && !["ADD", "SET_QUANTITY"].includes(draft.type))
    return fail(
      "库存中没有匹配食材，不能消耗或标记用完。请修改名称或选择食材。",
    );
  if (!before) {
    const value = baseQuantity(n!, draft.unit);
    let temporaryId = `draft-${draft.id}`;
    while (data.items.some((i) => i.id === temporaryId)) temporaryId += "-new";
    row.after = {
      ...blankItem(),
      id: temporaryId,
      name: draft.name.trim(),
      ...value,
      status: n === 0 ? "empty" : "available",
    };
    row.warning = "将新增食材，类别和位置稍后可补充。";
    return row;
  }
  if (draft.type === "MARK_EMPTY") {
    row.after = { ...before, quantity: 0, status: "empty", updatedAt: stamp() };
    return row;
  }
  if (draft.type === "ADD" && before.status === "empty") {
    const amount = convert(n!, draft.unit, before.unit);
    const value =
      amount === null
        ? baseQuantity(n!, draft.unit)
        : { quantity: amount, unit: before.unit };
    row.after = {
      ...before,
      ...value,
      status: "available",
      updatedAt: stamp(),
    };
    if (amount === null)
      row.warning = "原库存已用完，按本次采购量重新建立数量与单位。";
    return row;
  }
  if (draft.type === "SET_QUANTITY") {
    // A stocktake is authoritative, and may explicitly replace the unit.
    const converted = convert(n!, draft.unit, before.unit);
    const value =
      converted === null
        ? baseQuantity(n!, draft.unit)
        : { quantity: converted, unit: before.unit };
    row.after = {
      ...before,
      ...value,
      status: n === 0 ? "empty" : "available",
      updatedAt: stamp(),
    };
    if (converted === null)
      row.warning = "按本次盘点替换总量与单位，不推测包装换算。";
    return row;
  }
  if (before.status === "verify")
    return fail(
      "原库存待核实，请先盘点；可将本条改为“修正总量”并填写实际余量。",
    );
  if (before.quantity === null)
    return fail(
      "原库存数量未知，无法计算。请改为“修正总量”填写实际余量，或排除本条。",
    );
  const amount = convert(n!, draft.unit, before.unit);
  if (amount === null)
    return fail(
      `单位不兼容：库存为“${before.unit || "未指定"}”，输入为“${draft.unit}”。请填写实际总量，不推测包装重量。`,
    );
  if (draft.type === "CONSUME" && amount > before.quantity + 1e-9)
    return fail(
      `库存不足：当前仅 ${before.quantity}${before.unit}，不能消耗 ${amount}${before.unit}。`,
    );
  const expected = before.quantity + (draft.type === "ADD" ? amount : -amount);
  if (Math.abs(expected - Math.round(expected * 1000) / 1000) > 1e-9)
    return fail(
      "该单位下的计算结果超过 3 位小数，请换用更小的单位后盘点总量。",
    );
  row.after = adjust(before, draft.type === "ADD" ? amount : -amount);
  if (!Number.isFinite(row.after.quantity) || row.after.quantity! > 1e12)
    return fail("计算结果过大，请检查数量。");
  return row;
}
/** Sequential simulation, on copies only. Excluded or unsafe rows never affect following rows. */
export function previewBatch(data: KitchenData, drafts: DraftOperation[]) {
  let working = { ...data, items: data.items.map((i) => ({ ...i })) };
  const rows: PreviewRow[] = [];
  for (const draft of drafts) {
    const row = evaluateOperation(draft, working);
    rows.push(row);
    if (!draft.included || row.error || !row.after) continue;
    working = {
      ...working,
      items: row.before
        ? working.items.map((i) => (i.id === row.before!.id ? row.after! : i))
        : [...working.items, row.after],
    };
  }
  return { rows, items: working.items };
}
export function executeBatch(
  data: KitchenData,
  drafts: DraftOperation[],
  expectedSignature: string,
) {
  if (inventorySignature(data) !== expectedSignature)
    throw new Error("预览后库存或别名已改变，请重新解析后确认。");
  const preview = previewBatch(data, drafts);
  const selected = preview.rows.filter((r) => r.draft.included);
  if (!selected.length) throw new Error("请至少选择一条可执行操作。");
  if (selected.some((r) => r.error || !r.after))
    throw new Error("选中项目仍有问题，本次未执行任何操作。");
  const realIds = new Map<string, string>();
  const temporaryIds = new Set(
    selected.filter((r) => !r.before).map((r) => r.after!.id),
  );
  function materialize(item: Item | null): Item | null {
    if (!item) return null;
    if (!temporaryIds.has(item.id)) return { ...item };
    if (!realIds.has(item.id)) realIds.set(item.id, id());
    return { ...item, id: realIds.get(item.id)! };
  }
  const changes: InventoryChange[] = selected.map((r) => ({
    name: r.after!.name,
    type: r.draft.type,
    before: materialize(r.before),
    after: materialize(r.after),
  }));
  const next: KitchenData = {
    ...data,
    items: preview.items.map((i) => materialize(i)!),
    categories:
      preview.items.some((i) => i.category === "其他") &&
      !data.categories.includes("其他")
        ? [...data.categories, "其他"]
        : data.categories,
  };
  return { next, changes };
}
/** All UI inventory writes pass this boundary, including forms and shopping receipts. */
export function recordCommit(
  current: KitchenData,
  next: KitchenData,
  context: CommitContext = {},
): KitchenData {
  const existingIds = new Set(next.items.map((i) => i.id));
  const aliases = Object.fromEntries(
    Object.entries(next.aliases)
      .map(([alias, ids]) => [alias, ids.filter((id) => existingIds.has(id))])
      .filter(([, ids]) => (ids as string[]).length),
  );
  if (context.undo) return { ...next, aliases };
  const before = snapshot(current),
    after = snapshot(next);
  if (JSON.stringify(before.items) === JSON.stringify(after.items))
    return { ...next, aliases, history: current.history };
  const changes = context.changes ?? [
    ...current.items
      .filter((i) => !next.items.some((n) => n.id === i.id))
      .map((i) => ({
        name: i.name,
        type: "DELETE" as const,
        before: i,
        after: null,
      })),
    ...next.items
      .filter(
        (i) =>
          JSON.stringify(i) !==
          JSON.stringify(current.items.find((c) => c.id === i.id)),
      )
      .map((i) => ({
        name: i.name,
        type: current.items.some((c) => c.id === i.id)
          ? ("UPDATE" as const)
          : ("CREATE" as const),
        before: current.items.find((c) => c.id === i.id) ?? null,
        after: i,
      })),
  ];
  const entry: HistoryEntry = {
    id: id(),
    timestamp: stamp(),
    source: context.source || "手动更新库存",
    changes: structuredClone(changes),
    before,
    after,
  };
  return {
    ...next,
    aliases,
    history: [entry, ...current.history].slice(0, 30),
  };
}
export function canUndo(data: KitchenData) {
  const entry = data.history[0];
  return (
    !!entry &&
    !entry.undoneAt &&
    JSON.stringify(snapshot(data)) === JSON.stringify(entry.after)
  );
}
export function undoLatest(data: KitchenData): KitchenData {
  if (!canUndo(data))
    throw new Error("当前库存与最近操作后的状态不一致，不能安全撤销。");
  const latest = data.history[0];
  return {
    ...data,
    items: structuredClone(latest.before.items),
    categories: [...latest.before.categories],
    history: [{ ...latest, undoneAt: stamp() }, ...data.history.slice(1)],
  };
}
