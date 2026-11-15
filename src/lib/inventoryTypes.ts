import type { Item } from "../model";

export type OperationType = "ADD" | "CONSUME" | "SET_QUANTITY" | "MARK_EMPTY";
export interface ParsedOperation {
  id: string;
  source: string;
  type: OperationType;
  name: string;
  quantity: number | null;
  unit: string;
  error?: string;
}
export interface DraftOperation extends ParsedOperation {
  included: boolean;
  /** Undefined resolves conservatively; "new" explicitly creates an unmatched item. */
  targetId?: string;
}
export interface InventorySnapshot {
  items: Item[];
  categories: string[];
}
export interface InventoryChange {
  name: string;
  type: OperationType | "CREATE" | "UPDATE" | "DELETE";
  before: Item | null;
  after: Item | null;
}
export interface HistoryEntry {
  id: string;
  timestamp: string;
  source: string;
  changes: InventoryChange[];
  before: InventorySnapshot;
  after: InventorySnapshot;
  undoneAt?: string;
}
export interface CommitContext {
  source?: string;
  changes?: InventoryChange[];
  undo?: boolean;
}
/** Future remote implementations must return untrusted proposals, never execute writes. */
export interface InventoryParser {
  parse(text: string): ParsedOperation[] | Promise<ParsedOperation[]>;
}
