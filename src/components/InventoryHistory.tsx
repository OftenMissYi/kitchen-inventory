import { useState } from "react";
import { History, RotateCcw } from "lucide-react";
import {
  canUndo,
  formatItem,
  operationLabels,
  undoLatest,
} from "../lib/inventoryTransactions";
import type { InventoryProps } from "./QuickEntry";
import Modal from "../Modal";

export default function InventoryHistory({
  data,
  commit,
  notify,
}: InventoryProps) {
  const [confirm, setConfirm] = useState(false);
  const latest = data.history[0];
  return (
    <section className="history-section" aria-label="库存操作历史">
      <details>
        <summary>
          <History size={15} />
          最近操作{" "}
          <span>
            {data.history.length
              ? `保留最近 ${data.history.length} 批`
              : "尚无记录"}
          </span>
        </summary>
        <div className="history-list">
          {!data.history.length && (
            <p className="quick-help">
              确认执行后，原始输入和库存变化会记录在这里。原有库存无需重新录入。
            </p>
          )}
          {data.history.map((h) => (
            <article className="history-entry" key={h.id}>
              <div>
                <time dateTime={h.timestamp}>
                  {new Date(h.timestamp).toLocaleString("zh-CN")}
                </time>
                <span>
                  {h.undoneAt ? "已撤销" : `${h.changes.length} 项变化`}
                </span>
              </div>
              <p className="history-source">{h.source}</p>
              <ul>
                {h.changes.map((c, index) => (
                  <li key={index}>
                    <strong>
                      {c.name} · {operationLabels[c.type]}
                    </strong>
                    <span>
                      {formatItem(c.before)} → {formatItem(c.after)}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </details>
      {latest && (
        <button
          className="undo-button"
          disabled={!canUndo(data)}
          onClick={() => setConfirm(true)}
        >
          <RotateCcw size={14} />
          {latest.undoneAt ? "最近操作已撤销" : "撤销最近操作"}
        </button>
      )}
      {confirm && (
        <Modal title="撤销最近一次库存操作？" onClose={() => setConfirm(false)}>
          <p className="confirm-text">
            将恢复这一批操作前的完整库存。购物清单保持当前状态，已入库商品不会重新放回购物清单。
          </p>
          <p className="history-source">{latest?.source}</p>
          <footer className="modal-footer">
            <button onClick={() => setConfirm(false)}>取消</button>
            <button
              className="primary"
              onClick={() => {
                try {
                  if (commit(undoLatest(data), false, { undo: true })) {
                    notify("已恢复操作前的库存");
                    setConfirm(false);
                  }
                } catch (e) {
                  notify(e instanceof Error ? e.message : "无法撤销");
                  setConfirm(false);
                }
              }}
            >
              确认撤销
            </button>
          </footer>
        </Modal>
      )}
    </section>
  );
}
