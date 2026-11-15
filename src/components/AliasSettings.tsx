import { useState } from "react";
import { Plus, X } from "lucide-react";
import { normalizeName } from "../lib/aliases";
import type { InventoryProps } from "./QuickEntry";
export default function AliasSettings({
  data,
  commit,
  notify,
}: InventoryProps) {
  const [alias, setAlias] = useState("");
  const [target, setTarget] = useState("");
  return (
    <section className="settings-card">
      <h2>食材别名</h2>
      <p>
        内置支持蛋、西红柿、Tomatenmark、Parmesan
        等名称。自定义别名绑定具体库存；同一别名有多个对象时，记账前会要求选择。
      </p>
      <div className="category-list">
        {Object.entries(data.aliases).flatMap(([name, ids]) =>
          ids.map((itemId) => (
            <span key={`${name}-${itemId}`}>
              {name} → {data.items.find((i) => i.id === itemId)?.name}
              <button
                aria-label={`删除别名${name}`}
                onClick={() => {
                  const remaining = ids.filter((i) => i !== itemId);
                  const aliases = { ...data.aliases };
                  if (remaining.length) aliases[name] = remaining;
                  else delete aliases[name];
                  if (commit({ ...data, aliases })) notify("别名已移除");
                }}
              >
                <X size={14} />
              </button>
            </span>
          )),
        )}
      </div>
      <form
        className="alias-form"
        onSubmit={(e) => {
          e.preventDefault();
          const name = normalizeName(alias);
          if (!name || !data.items.some((i) => i.id === target)) return;
          const aliases = {
            ...data.aliases,
            [name]: Array.from(
              new Set([...(data.aliases[name] ?? []), target]),
            ),
          };
          if (commit({ ...data, aliases })) {
            setAlias("");
            notify("别名已保存");
          }
        }}
      >
        <label>
          平时怎么叫
          <input
            required
            maxLength={80}
            value={alias}
            placeholder="例如：我的意面"
            onChange={(e) => setAlias(e.target.value)}
          />
        </label>
        <label>
          对应食材
          <select
            required
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">选择库存食材</option>
            {data.items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} · {i.unit || "单位未知"}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">
          <Plus size={16} />
          添加别名
        </button>
      </form>
    </section>
  );
}
