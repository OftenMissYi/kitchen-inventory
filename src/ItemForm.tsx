import { useState, type FormEvent } from "react";
import { type Item, locations, stamp } from "./model";
export default function ItemForm({
  item,
  categories,
  onSave,
  onClose,
}: {
  item: Item;
  categories: string[];
  onSave: (v: Item) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(item);
  const set = (patch: Partial<Item>) => setValue({ ...value, ...patch });
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!value.name.trim()) return;
    onSave({
      ...value,
      name: value.name.trim(),
      quantity: value.status === "empty" ? 0 : value.quantity,
      status: value.quantity === 0 ? "empty" : value.status,
      updatedAt: stamp(),
    });
  }
  return (
    <form onSubmit={submit} className="form">
      <label>
        食材名称 <span className="muted">必填</span>
        <input
          autoFocus
          required
          maxLength={150}
          value={value.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="例如：鸡蛋 / Eier"
        />
      </label>
      <div className="form-grid">
        <label>
          数量
          <input
            type="number"
            min="0"
            step="0.001"
            value={value.quantity ?? ""}
            onChange={(e) =>
              set({
                quantity: e.target.value === "" ? null : Number(e.target.value),
              })
            }
            placeholder="留空表示未知"
          />
        </label>
        <label>
          单位
          <input
            list="units"
            value={value.unit}
            onChange={(e) => set({ unit: e.target.value })}
            placeholder="个、g、包…"
          />
          <datalist id="units">
            {["个", "只", "份", "g", "kg", "包", "瓶", "盒", "ml", "L"].map(
              (x) => (
                <option key={x}>{x}</option>
              ),
            )}
          </datalist>
        </label>
      </div>
      <p className="field-help">
        只知道家里有？数量可以不填，其余信息随时补充。
      </p>
      <div className="form-grid">
        <label>
          类别
          <select
            value={value.category}
            onChange={(e) => set({ category: e.target.value })}
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          存储位置
          <select
            value={value.location}
            onChange={(e) =>
              set({ location: e.target.value as Item["location"] })
            }
          >
            {locations.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          保质期
          <input
            type="date"
            value={value.expiry}
            onChange={(e) => set({ expiry: e.target.value })}
          />
        </label>
        <label>
          库存状态
          <select
            value={value.status}
            onChange={(e) =>
              set({
                status: e.target.value as Item["status"],
                quantity:
                  e.target.value === "empty"
                    ? 0
                    : value.quantity === 0
                      ? null
                      : value.quantity,
              })
            }
          >
            <option value="available">确认有货</option>
            <option value="verify">待核实</option>
            <option value="empty">已用完</option>
          </select>
        </label>
      </div>
      <label>
        备注
        <textarea
          value={value.notes}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="例如：已开封、重量未知"
          rows={2}
        />
      </label>
      <footer className="modal-footer">
        <button type="button" onClick={onClose}>
          取消
        </button>
        <button className="primary" type="submit">
          保存食材
        </button>
      </footer>
    </form>
  );
}
