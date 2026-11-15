import { useState, type FormEvent } from "react";
import { ArrowRight, Check, Pencil, X } from "lucide-react";
import type { KitchenData } from "../model";
import { localInventoryParser } from "../lib/naturalLanguageParser";
import {
  executeBatch,
  formatItem,
  inventorySignature,
  operationLabels,
  previewBatch,
} from "../lib/inventoryTransactions";
import type {
  CommitContext,
  DraftOperation,
  OperationType,
} from "../lib/inventoryTypes";

export interface InventoryProps {
  data: KitchenData;
  commit: (
    next: KitchenData,
    recovery?: boolean,
    context?: CommitContext,
  ) => boolean;
  notify: (message: string) => void;
}
export default function QuickEntry({ data, commit, notify }: InventoryProps) {
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<DraftOperation[] | null>(null);
  const [baseline, setBaseline] = useState("");
  const [parsing, setParsing] = useState(false);
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const preview = drafts ? previewBatch(data, drafts) : null;
  const stale = !!drafts && baseline !== inventorySignature(data);
  const safeIds = new Set(
    preview?.rows
      .filter((r) => r.draft.included && !r.error)
      .map((r) => r.draft.id),
  );
  async function parse(e?: FormEvent) {
    e?.preventDefault();
    if (!text.trim() || parsing) return;
    setParsing(true);
    setMessage("");
    try {
      const proposals = (await localInventoryParser.parse(text)).map((op) => ({
        ...op,
        included: true,
      }));
      const results = previewBatch(data, proposals);
      setDrafts(
        proposals.map((op, index) => ({
          ...op,
          included: !results.rows[index].error,
        })),
      );
      setBaseline(inventorySignature(data));
      setEditingId(null);
    } catch {
      setMessage("解析未完成，原输入已保留，请稍后重试。");
    } finally {
      setParsing(false);
    }
  }
  function edit(id: string, patch: Partial<DraftOperation>) {
    setDrafts(
      (current) =>
        current?.map((op) =>
          op.id === id
            ? { ...op, ...patch, error: undefined, included: true }
            : op,
        ) ?? null,
    );
    setMessage("");
  }
  function execute() {
    if (!drafts) return;
    try {
      const selected = drafts.map((op) => ({
        ...op,
        included: safeIds.has(op.id),
      }));
      const { next, changes } = executeBatch(data, selected, baseline);
      if (commit(next, false, { source: text, changes })) {
        const remaining = drafts.filter((op) => !safeIds.has(op.id));
        // Keep excluded or unrecognized clauses available, rather than discarding them.
        setText(remaining.map((op) => op.source).join("，"));
        setDrafts(null);
        setMessage(
          `已执行 ${changes.length} 项。${remaining.length ? `${remaining.length} 项未执行，原文已保留。` : ""}可在下方撤销最近操作。`,
        );
        notify(`已更新 ${changes.length} 项库存，可撤销`);
      } else setMessage("本次未保存，请查看页面上方错误提示。");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "无法执行，本次库存未修改。");
    }
  }
  return (
    <section className="quick-entry" aria-labelledby="quick-title">
      <div className="quick-heading">
        <h2 id="quick-title">
          <Pencil size={17} />
          快速记一笔
        </h2>
        <span>先预览，确认后再入账</span>
      </div>
      <form className="quick-input" onSubmit={parse}>
        <textarea
          aria-label="自然语言库存记录"
          value={text}
          maxLength={2000}
          rows={2}
          placeholder="例如：买了6个鸡蛋，吃了2根香肠，肉末用完了"
          onChange={(e) => {
            setText(e.target.value);
            setDrafts(null);
            setMessage("");
          }}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing &&
              e.keyCode !== 229
            ) {
              e.preventDefault();
              void parse();
            }
          }}
        />
        <button
          className="primary"
          disabled={!text.trim() || parsing}
          type="submit"
        >
          {parsing ? "识别中…" : "识别操作"}
          <ArrowRight size={16} />
        </button>
      </form>
      <p className="quick-help">
        Enter 预览，Shift + Enter
        换行。支持购买、消耗、盘点和用完；未知数量不做猜测。
      </p>
      {message && (
        <p className="quick-message" role="status">
          {message}
        </p>
      )}
      {preview && (
        <div className="nl-preview" aria-label="识别结果预览">
          <div className="preview-heading">
            <strong>识别到 {preview.rows.length} 项操作</strong>
            <span>{safeIds.size} 项可提交，其余不会执行</span>
          </div>
          {stale && (
            <p className="nl-problem" role="alert">
              库存或别名已变更，请重新点击“识别操作”，检查新的预计结果。
            </p>
          )}
          {preview.rows.map((row) => (
            <div
              key={row.draft.id}
              className={`nl-row ${row.error ? "needs-review" : ""}`}
            >
              <div className="nl-row-main">
                <input
                  type="checkbox"
                  aria-label={`提交第${Number(row.draft.id) + 1}项`}
                  disabled={!!row.error || stale}
                  checked={row.draft.included && !row.error}
                  onChange={(e) =>
                    setDrafts(
                      (current) =>
                        current?.map((op) =>
                          op.id === row.draft.id
                            ? { ...op, included: e.target.checked }
                            : op,
                        ) ?? null,
                    )
                  }
                />
                <div className="nl-item">
                  <strong>
                    {row.before?.name || row.draft.name || "未识别食材"}
                  </strong>
                  <small>原文：{row.draft.source}</small>
                </div>
                <span className="nl-operation">
                  {operationLabels[row.draft.type]}
                  {row.draft.type !== "MARK_EMPTY" &&
                  row.draft.quantity !== null
                    ? ` ${row.draft.type === "CONSUME" ? "−" : row.draft.type === "ADD" ? "+" : ""}${row.draft.quantity}${row.draft.unit}`
                    : ""}
                </span>
                <button
                  className="icon-btn"
                  aria-label={`修改第${Number(row.draft.id) + 1}项`}
                  onClick={() =>
                    setEditingId(
                      editingId === row.draft.id ? null : row.draft.id,
                    )
                  }
                >
                  <Pencil size={16} />
                </button>
              </div>
              {row.error ? (
                <p className="nl-problem">未提交：{row.error}</p>
              ) : (
                <p className="nl-change">
                  {formatItem(row.before)} <ArrowRight size={13} />{" "}
                  {formatItem(row.after)}
                  {!row.draft.included && <span>（已排除）</span>}
                </p>
              )}
              {row.warning && <p className="quick-help">{row.warning}</p>}
              {((row.candidates.length > 1 && !row.draft.targetId) ||
                editingId === row.draft.id) && (
                <div className="nl-editor">
                  <label>
                    对应库存
                    <select
                      aria-label={`第${Number(row.draft.id) + 1}项对应库存`}
                      value={row.draft.targetId ?? ""}
                      onChange={(e) =>
                        edit(row.draft.id, {
                          targetId: e.target.value || undefined,
                        })
                      }
                    >
                      <option value="">
                        自动匹配{row.candidates.length > 1 ? "（请选择）" : ""}
                      </option>
                      {!row.candidates.length && (
                        <option value="new">新增食材（仅增加或修正）</option>
                      )}
                      {data.items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name} · {i.quantity ?? "未知"}
                          {i.unit} · {i.location}
                        </option>
                      ))}
                    </select>
                  </label>
                  {editingId === row.draft.id && (
                    <>
                      <label>
                        食材名称
                        <input
                          aria-label={`第${Number(row.draft.id) + 1}项食材名称`}
                          value={row.draft.name}
                          onChange={(e) =>
                            edit(row.draft.id, {
                              name: e.target.value,
                              targetId: undefined,
                            })
                          }
                        />
                      </label>
                      <label>
                        操作
                        <select
                          aria-label={`第${Number(row.draft.id) + 1}项操作`}
                          value={row.draft.type}
                          onChange={(e) =>
                            edit(row.draft.id, {
                              type: e.target.value as OperationType,
                            })
                          }
                        >
                          {(
                            [
                              "ADD",
                              "CONSUME",
                              "SET_QUANTITY",
                              "MARK_EMPTY",
                            ] as const
                          ).map((type) => (
                            <option key={type} value={type}>
                              {operationLabels[type]}
                            </option>
                          ))}
                        </select>
                      </label>
                      {row.draft.type !== "MARK_EMPTY" && (
                        <>
                          <label>
                            数量
                            <input
                              type="number"
                              min={
                                row.draft.type === "SET_QUANTITY" ? 0 : 0.001
                              }
                              step="0.001"
                              aria-label={`第${Number(row.draft.id) + 1}项数量`}
                              value={row.draft.quantity ?? ""}
                              onChange={(e) =>
                                edit(row.draft.id, {
                                  quantity:
                                    e.target.value === ""
                                      ? null
                                      : Number(e.target.value),
                                })
                              }
                            />
                          </label>
                          <label>
                            单位
                            <input
                              aria-label={`第${Number(row.draft.id) + 1}项单位`}
                              value={row.draft.unit}
                              onChange={(e) =>
                                edit(row.draft.id, { unit: e.target.value })
                              }
                            />
                          </label>
                        </>
                      )}
                      <p className="quick-help">
                        “修正总量”表示实际剩余总数，不是本次增加或消耗量。
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
          <div className="preview-footer">
            <button
              onClick={() => {
                setDrafts(null);
                setMessage("已取消，库存未改变，原输入已保留。");
              }}
            >
              <X size={15} />
              取消本次
            </button>
            <button
              className="primary"
              disabled={!safeIds.size || stale}
              onClick={execute}
            >
              <Check size={16} />
              确认执行 {safeIds.size} 项
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
