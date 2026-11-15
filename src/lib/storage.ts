import { parseBackup, STORAGE_KEY, type KitchenData } from "../model";
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
/** One serialized write contains both inventory and history. No partial batch writes. */
export function persistData(
  storage: StorageAdapter,
  expectedRaw: string | null,
  next: KitchenData,
): string {
  if (storage.getItem(STORAGE_KEY) !== expectedRaw)
    throw new Error("其他标签页已修改数据，请刷新页面后重试；本次未写入。");
  const raw = JSON.stringify(next);
  parseBackup(raw);
  storage.setItem(STORAGE_KEY, raw);
  return raw;
}
