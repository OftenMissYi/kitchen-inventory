import { useRef, useState } from "react";
import { type KitchenData, parseBackup, seedData, STORAGE_KEY } from "./model";
import { recordCommit } from "./lib/inventoryTransactions";
import { persistData } from "./lib/storage";
import type { CommitContext } from "./lib/inventoryTypes";
export function useKitchen() {
  const [initial] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const data = raw === null ? seedData() : parseBackup(raw);
      if (raw === null) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return {
        data,
        error: "",
        raw: raw === null ? JSON.stringify(data) : raw,
      };
    } catch {
      return {
        data: {
          version: 2,
          history: [],
          aliases: {},
          items: [],
          shopping: [],
          categories: ["其他"],
        } as KitchenData,
        error:
          "无法读取本地数据。原始数据未被覆盖，请先下载原始数据，或导入有效备份恢复。",
        raw: null,
      };
    }
  });
  const [data, setData] = useState(initial.data);
  const [error, setError] = useState(initial.error);
  const lastRaw = useRef(initial.raw);
  const current = useRef(data);
  function commit(
    next: KitchenData,
    recovery = false,
    context: CommitContext = {},
  ) {
    if (initial.error && error && !recovery) return false;
    try {
      const prepared = recovery
        ? next
        : recordCommit(current.current, next, context);
      lastRaw.current = persistData(
        localStorage,
        recovery ? localStorage.getItem(STORAGE_KEY) : lastRaw.current,
        prepared,
      );
      current.current = prepared;
      setData(prepared);
      setError("");
      return true;
    } catch (e) {
      setError(
        e instanceof Error && e.message.includes("其他标签页")
          ? e.message
          : "保存失败：数据校验未通过或浏览器存储不可用。请导出备份后重试。",
      );
      return false;
    }
  }
  return { data, commit, error };
}
