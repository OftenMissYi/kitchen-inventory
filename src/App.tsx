import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  CookingPot,
  Leaf,
  Minus,
  Package,
  Plus,
  Search,
  Settings2,
  ShoppingBasket,
  SlidersHorizontal,
  Trash2,
  Pencil,
  X,
  Snowflake,
  Refrigerator,
  Archive,
  CircleCheck,
  RotateCcw,
} from "lucide-react";
import {
  adjust,
  blankItem,
  expiryDays,
  id,
  locations,
  parseBackup,
  receive,
  seedData,
  stamp,
  STORAGE_KEY,
  type Item,
  type KitchenData,
  type ShoppingItem,
  type Status,
} from "./model";
import { useKitchen } from "./useKitchen";
import Modal from "./Modal";
import ItemForm from "./ItemForm";
import QuickEntry from "./components/QuickEntry";
import InventoryHistory from "./components/InventoryHistory";
import AliasSettings from "./components/AliasSettings";

const statusNames = {
  available: "确认有货",
  verify: "待核实",
  empty: "已用完",
};
type Page = "inventory" | "shopping" | "settings";
function download(raw: string, filename: string) {
  const url = URL.createObjectURL(
    new Blob([raw], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function CategoryIcon({ category }: { category: string }) {
  return category === "蔬菜" ? (
    <Leaf size={20} />
  ) : category === "冷冻食品" ? (
    <Snowflake size={20} />
  ) : category === "调味料" ? (
    <CookingPot size={20} />
  ) : (
    <Package size={20} />
  );
}

export default function App() {
  const { data, commit, error } = useKitchen();
  const [page, setPage] = useState<Page>("inventory");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("全部类别");
  const [location, setLocation] = useState("全部位置");
  const [status, setStatus] = useState<Status | "all">("all");
  const [onlyExpiry, setOnlyExpiry] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [shoppingOpen, setShoppingOpen] = useState(false);
  const [change, setChange] = useState<{
    item: Item;
    direction: number;
  } | null>(null);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    text: string;
    action: () => void;
  } | null>(null);
  const [toast, setToast] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const importInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timeout);
  }, [toast]);
  function save(next: KitchenData, message: string, recovery = false) {
    if (commit(next, recovery, { source: message })) {
      setToast(message);
      return true;
    }
    return false;
  }
  function update(item: Item) {
    return save(
      { ...data, items: data.items.map((i) => (i.id === item.id ? item : i)) },
      "库存已更新",
    );
  }
  function addShopping(item: Item) {
    if (
      data.shopping.some((s) => s.name === item.name && s.unit === item.unit)
    ) {
      setToast("购物清单中已有这项食材");
      return;
    }
    save(
      {
        ...data,
        shopping: [
          ...data.shopping,
          {
            id: id(),
            name: item.name,
            unit: item.unit,
            quantity: null,
            category: item.category,
            purchased: false,
          },
        ],
      },
      "已加入购物清单，购买数量可在清单填写",
    );
  }
  const available = data.items.filter((i) => i.status === "available");
  const expiring = available.filter((i) => {
    const days = expiryDays(i.expiry);
    return days !== null && days <= 3;
  });
  const visible = data.items.filter(
    (i) =>
      (status === "all" || i.status === status) &&
      (category === "全部类别" || i.category === category) &&
      (location === "全部位置" || i.location === location) &&
      (!onlyExpiry || expiring.some((e) => e.id === i.id)) &&
      `${i.name} ${i.notes}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  const purchased = data.shopping.filter((s) => s.purchased).length;
  function switchPage(next: Page) {
    setPage(next);
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error("文件过大，请选择小于 5 MB 的备份。");
      const next = parseBackup(await file.text());
      setConfirmation({
        title: "导入这份备份？",
        text: `包含 ${next.items.length} 项库存、${next.shopping.length} 项购物记录、${next.history.length} 批操作历史及自定义别名。导入会替换当前数据，建议先导出备份。`,
        action: () => {
          save(next, "备份已恢复", true);
          setCategory("全部类别");
        },
      });
    } catch (e) {
      setToast(e instanceof Error ? e.message : "无法读取文件");
    }
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            switchPage("inventory");
          }}
        >
          <span className="brand-mark">
            <CookingPot size={25} />
          </span>
          <span>
            小厨房<small>Kitchen Inventory</small>
          </span>
        </a>
        <div className="sidebar-caption">我的日常</div>
        <nav aria-label="主导航">
          <button
            className={page === "inventory" ? "nav-item active" : "nav-item"}
            onClick={() => switchPage("inventory")}
          >
            <Archive size={19} />
            厨房库存<span>{available.length}</span>
          </button>
          <button
            className={page === "shopping" ? "nav-item active" : "nav-item"}
            onClick={() => switchPage("shopping")}
          >
            <ShoppingBasket size={19} />
            购物清单<span>{data.shopping.length}</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="small-note">
            <Leaf size={20} />
            <strong>好好吃饭，少一点浪费。</strong>
            <p>
              记住家里有什么，
              <br />
              下一餐就更有头绪。
            </p>
          </div>
          <button
            className={page === "settings" ? "nav-item active" : "nav-item"}
            onClick={() => switchPage("settings")}
          >
            <Settings2 size={19} />
            设置与备份
          </button>
          <div className="local-indicator">
            <span />
            仅保存在此浏览器
          </div>
        </div>
      </aside>
      <main>
        <div className="topbar">
          <span>
            我的厨房 <ChevronRight size={14} />{" "}
            {page === "inventory"
              ? "库存总览"
              : page === "shopping"
                ? "购物清单"
                : "设置与备份"}
          </span>
          <span className="desktop-only">简单记录，安心做饭</span>
        </div>
        <div className="content">
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button
                onClick={() => {
                  try {
                    download(
                      localStorage.getItem(STORAGE_KEY) ?? "{}",
                      "kitchen-recovery.json",
                    );
                  } catch {
                    setToast("浏览器禁止读取本地存储");
                  }
                }}
              >
                下载原始数据
              </button>
            </div>
          )}
          <header className="page-heading">
            <div>
              <h1>
                {page === "inventory"
                  ? "厨房库存"
                  : page === "shopping"
                    ? "购物清单"
                    : "设置与备份"}
              </h1>
              <p>
                {page === "inventory"
                  ? "家里有什么，一眼就知道。"
                  : page === "shopping"
                    ? "出门前记一下，买好后轻松入库。"
                    : "照顾好你的厨房记录。"}
              </p>
            </div>
            {page !== "settings" && (
              <button
                className="primary"
                onClick={() =>
                  page === "inventory"
                    ? setEditing(blankItem())
                    : setShoppingOpen(true)
                }
              >
                <Plus size={18} />
                {page === "inventory" ? "添加食材" : "添加商品"}
              </button>
            )}
          </header>
          {page === "inventory" && (
            <>
              <QuickEntry data={data} commit={commit} notify={setToast} />
              <InventoryHistory data={data} commit={commit} notify={setToast} />
              <div className="summary-grid">
                <button
                  className="summary"
                  onClick={() => {
                    setStatus("available");
                    setOnlyExpiry(false);
                  }}
                >
                  <span className="summary-icon">
                    <Package size={21} />
                  </span>
                  <div>
                    <span>确认有货</span>
                    <strong>
                      {available.length}
                      <small>项食材</small>
                    </strong>
                  </div>
                </button>
                <button
                  className="summary"
                  onClick={() => {
                    setStatus("verify");
                    setOnlyExpiry(false);
                  }}
                >
                  <span className="summary-icon neutral">
                    <CircleHelp size={21} />
                  </span>
                  <div>
                    <span>待核实</span>
                    <strong>
                      {data.items.filter((i) => i.status === "verify").length}
                      <small>项待确认</small>
                    </strong>
                  </div>
                </button>
                <button
                  className="summary"
                  onClick={() => {
                    setStatus("available");
                    setOnlyExpiry(!onlyExpiry);
                  }}
                >
                  <span className="summary-icon amber">
                    <ClipboardList size={21} />
                  </span>
                  <div>
                    <span>保质期提醒</span>
                    <strong>
                      {expiring.length}
                      <small>项需要留意</small>
                    </strong>
                  </div>
                </button>
              </div>
              {expiring.length > 0 && (
                <div className="expiry-banner">
                  <CircleHelp size={18} />
                  <span>
                    {expiring.length} 项食材已到期或将在 3
                    天内到期，做饭前记得检查一下。
                  </span>
                  <button
                    onClick={() => {
                      setOnlyExpiry(!onlyExpiry);
                      setStatus("available");
                    }}
                  >
                    {onlyExpiry ? "查看全部" : "查看食材"}
                  </button>
                </div>
              )}
              <section className="inventory-panel" aria-label="食材列表">
                <div className="panel-top">
                  <div className="tabs" role="group" aria-label="库存状态">
                    {(["all", "available", "verify", "empty"] as const).map(
                      (s) => (
                        <button
                          key={s}
                          aria-pressed={status === s}
                          className={status === s ? "selected" : ""}
                          onClick={() => {
                            setStatus(s);
                            setOnlyExpiry(false);
                          }}
                        >
                          {s === "all" ? "全部食材" : statusNames[s]}
                          <span>
                            {s === "all"
                              ? data.items.length
                              : data.items.filter((i) => i.status === s).length}
                          </span>
                        </button>
                      ),
                    )}
                  </div>
                </div>
                <div className="filters">
                  <div className="search-box">
                    <Search size={18} />
                    <input
                      aria-label="搜索食材"
                      placeholder="搜索食材或备注…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && (
                      <button
                        aria-label="清空搜索"
                        onClick={() => setSearch("")}
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                  <div className="select-filters">
                    <SlidersHorizontal size={16} />
                    <select
                      aria-label="按类别筛选"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      <option>全部类别</option>
                      {data.categories.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                    <select
                      aria-label="按位置筛选"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                    >
                      <option>全部位置</option>
                      {locations.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {onlyExpiry && (
                  <button
                    className="filter-chip"
                    onClick={() => setOnlyExpiry(false)}
                  >
                    仅保质期提醒 <X size={14} />
                  </button>
                )}
                <div className="table-head">
                  <span>食材 / 类别</span>
                  <span>库存数量</span>
                  <span>存储位置</span>
                  <span>状态 / 保质期</span>
                  <span>快捷操作</span>
                </div>
                {visible.map((item) => {
                  const days = expiryDays(item.expiry);
                  return (
                    <article
                      key={item.id}
                      className={`inventory-row ${item.status === "empty" ? "is-empty" : ""}`}
                    >
                      <div className="item-info">
                        <span className="food-icon">
                          <CategoryIcon category={item.category} />
                        </span>
                        <div>
                          <button
                            className="item-name"
                            onClick={() => setEditing(item)}
                          >
                            {item.name}
                          </button>
                          <p>
                            {item.category}
                            {item.notes && <span> · {item.notes}</span>}
                          </p>
                        </div>
                      </div>
                      <div className="quantity-cell">
                        <span
                          className={
                            item.quantity === null ? "unknown" : "quantity"
                          }
                        >
                          {item.quantity === null ? (
                            "数量未知"
                          ) : (
                            <>
                              {item.quantity}
                              <small>{item.unit}</small>
                            </>
                          )}
                        </span>
                        <div className="quantity-buttons">
                          <button
                            aria-label={`减少${item.name}`}
                            title="减少数量"
                            disabled={
                              item.quantity === null || item.quantity === 0
                            }
                            onClick={() => update(adjust(item, -1))}
                          >
                            <Minus size={13} />
                          </button>
                          <button
                            aria-label={`增加${item.name}`}
                            title="增加数量"
                            onClick={() =>
                              item.quantity === null
                                ? setEditing(item)
                                : update(adjust(item, 1))
                            }
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                      </div>
                      <div className="location-cell">
                        {item.location === "冷冻" ? (
                          <Snowflake size={14} />
                        ) : item.location === "冷藏" ? (
                          <Refrigerator size={14} />
                        ) : (
                          <Archive size={14} />
                        )}{" "}
                        {item.location}
                      </div>
                      <div className="status-cell">
                        <span className={`badge ${item.status}`}>
                          <i />
                          {statusNames[item.status]}
                        </span>
                        {item.expiry && (
                          <small
                            className={
                              days !== null &&
                              days <= 3 &&
                              item.status === "available"
                                ? "expiry-text"
                                : "muted"
                            }
                          >
                            {days !== null && days < 0
                              ? "已到期 · "
                              : days === 0
                                ? "今天到期 · "
                                : ""}
                            {item.expiry}
                          </small>
                        )}
                      </div>
                      <div className="row-actions">
                        {item.status === "verify" ? (
                          <button
                            className="icon-btn"
                            title="确认有货"
                            aria-label={`确认${item.name}有货`}
                            onClick={() =>
                              update({
                                ...item,
                                status: "available",
                                quantity:
                                  item.quantity === 0 ? null : item.quantity,
                                updatedAt: stamp(),
                              })
                            }
                          >
                            <Check size={17} />
                          </button>
                        ) : (
                          <button
                            className="icon-btn"
                            title="标记用完"
                            aria-label={`标记${item.name}用完`}
                            disabled={item.status === "empty"}
                            onClick={() =>
                              update({
                                ...item,
                                quantity: 0,
                                status: "empty",
                                updatedAt: stamp(),
                              })
                            }
                          >
                            <CircleCheck size={17} />
                          </button>
                        )}
                        <button
                          className="icon-btn"
                          title="记录消耗 / 补充"
                          aria-label={`记录${item.name}数量变化`}
                          onClick={() => setChange({ item, direction: -1 })}
                        >
                          <SlidersHorizontal size={17} />
                        </button>
                        <button
                          className="icon-btn"
                          title="加入购物清单"
                          aria-label={`将${item.name}加入购物清单`}
                          onClick={() => addShopping(item)}
                        >
                          <ShoppingBasket size={17} />
                        </button>
                        <button
                          className="icon-btn"
                          title="编辑"
                          aria-label={`编辑${item.name}`}
                          onClick={() => setEditing(item)}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-btn delete"
                          title="删除"
                          aria-label={`删除${item.name}`}
                          onClick={() =>
                            setConfirmation({
                              title: `删除“${item.name}”？`,
                              text: "这会移除该食材记录。只是吃完了？可以使用“标记用完”保留它。",
                              action: () =>
                                save(
                                  {
                                    ...data,
                                    items: data.items.filter(
                                      (i) => i.id !== item.id,
                                    ),
                                  },
                                  "食材已删除",
                                ),
                            })
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </article>
                  );
                })}
                {!visible.length && (
                  <div className="empty-state">
                    <Package size={32} />
                    <h3>这里还没有食材</h3>
                    <p>添加一项食材，或调整搜索和筛选条件。</p>
                    <button
                      onClick={() => {
                        setSearch("");
                        setCategory("全部类别");
                        setLocation("全部位置");
                        setStatus("all");
                        setOnlyExpiry(false);
                      }}
                    >
                      清除筛选
                    </button>
                  </div>
                )}
                <div className="table-footer">
                  共 {visible.length} 项食材
                  <span>数量未知也没关系，可以慢慢补齐。</span>
                </div>
              </section>
              <div className="bottom-tip">
                <CircleHelp size={15} />
                <span>
                  历史购买记录已标为“待核实”，确认后才会计入有货库存。未填写保质期的食材不会收到到期提醒。
                </span>
              </div>
            </>
          )}
          {page === "shopping" && (
            <>
              <div className="shopping-intro">
                <ShoppingBasket size={24} />
                <div>
                  <strong>
                    {data.shopping.length - purchased} 项待购买，{purchased}{" "}
                    项已购买
                  </strong>
                  <p>
                    勾选实际买到的商品，再加入厨房库存。未知的原有数量会继续保留为未知。
                  </p>
                </div>
                <button
                  className="primary"
                  disabled={!purchased}
                  onClick={() =>
                    save(receive(data), `已将 ${purchased} 项购买记录加入库存`)
                  }
                >
                  <CheckCheck size={18} />
                  已购买商品入库
                </button>
              </div>
              <section className="shopping-panel">
                {data.shopping.map((s) => (
                  <div
                    className={`shopping-row ${s.purchased ? "purchased" : ""}`}
                    key={s.id}
                  >
                    <input
                      type="checkbox"
                      aria-label={`${s.name}已购买`}
                      checked={s.purchased}
                      onChange={(e) =>
                        save(
                          {
                            ...data,
                            shopping: data.shopping.map((x) =>
                              x.id === s.id
                                ? { ...x, purchased: e.target.checked }
                                : x,
                            ),
                          },
                          e.target.checked
                            ? "已标记购买，可一键入库"
                            : "已取消购买标记",
                        )
                      }
                    />
                    <div className="shopping-name">
                      <strong>{s.name}</strong>
                      <small>{s.category}</small>
                    </div>
                    <label className="shopping-quantity">
                      <span>计划数量</span>
                      <input
                        aria-label={`${s.name}计划数量`}
                        type="number"
                        min="0.001"
                        step="0.001"
                        placeholder="未知"
                        value={s.quantity ?? ""}
                        onChange={(e) => {
                          const n =
                            e.target.value === ""
                              ? null
                              : Number(e.target.value);
                          if (n !== null && (!Number.isFinite(n) || n <= 0))
                            return;
                          commit({
                            ...data,
                            shopping: data.shopping.map((x) =>
                              x.id === s.id ? { ...x, quantity: n } : x,
                            ),
                          });
                        }}
                      />
                    </label>
                    <input
                      className="shopping-unit"
                      aria-label={`${s.name}单位`}
                      placeholder="单位"
                      value={s.unit}
                      onChange={(e) =>
                        commit({
                          ...data,
                          shopping: data.shopping.map((x) =>
                            x.id === s.id ? { ...x, unit: e.target.value } : x,
                          ),
                        })
                      }
                    />
                    <button
                      className="icon-btn"
                      aria-label={`移除${s.name}`}
                      onClick={() =>
                        setConfirmation({
                          title: `移除“${s.name}”？`,
                          text: "仅从购物清单移除，不会影响库存。",
                          action: () =>
                            save(
                              {
                                ...data,
                                shopping: data.shopping.filter(
                                  (x) => x.id !== s.id,
                                ),
                              },
                              "已从清单移除",
                            ),
                        })
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                ))}
                {!data.shopping.length && (
                  <div className="empty-state">
                    <ShoppingBasket size={36} />
                    <h3>下次采购，从这里开始</h3>
                    <p>手动添加商品，或在库存中点击购物篮。</p>
                    <button onClick={() => setShoppingOpen(true)}>
                      <Plus size={16} />
                      添加第一件商品
                    </button>
                  </div>
                )}
              </section>
            </>
          )}
          {page === "settings" && (
            <div className="settings-stack">
              <AliasSettings data={data} commit={commit} notify={setToast} />
              <section className="settings-card">
                <h2>数据与备份</h2>
                <p>
                  数据保存在当前浏览器。更换设备或清理浏览器前，请先导出备份。
                </p>
                <div className="settings-actions">
                  <button
                    onClick={() => {
                      download(
                        JSON.stringify(data, null, 2),
                        `kitchen-backup-${new Date().toISOString().slice(0, 10)}.json`,
                      );
                      setToast("备份已导出");
                    }}
                  >
                    <ArrowDownToLine size={18} />
                    导出 JSON
                  </button>
                  <button onClick={() => importInput.current?.click()}>
                    <ArrowUpFromLine size={18} />
                    导入 JSON
                  </button>
                  <input
                    ref={importInput}
                    type="file"
                    accept="application/json,.json"
                    hidden
                    onChange={(e) => {
                      void importFile(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </div>
              </section>
              <section className="settings-card">
                <h2>食材类别</h2>
                <p>
                  按自己的做饭习惯整理。删除类别后，其下的食材会移到“其他”。
                </p>
                <div className="category-list">
                  {data.categories.map((c) => (
                    <span key={c}>
                      {c}
                      {c !== "其他" && (
                        <>
                          <button
                            aria-label={`重命名${c}`}
                            onClick={() => {
                              const next = window
                                .prompt("新的类别名称", c)
                                ?.trim();
                              if (!next || next === c) return;
                              if (data.categories.includes(next)) {
                                setToast("该类别已存在");
                                return;
                              }
                              save(
                                {
                                  ...data,
                                  categories: data.categories.map((x) =>
                                    x === c ? next : x,
                                  ),
                                  items: data.items.map((i) =>
                                    i.category === c
                                      ? { ...i, category: next }
                                      : i,
                                  ),
                                  shopping: data.shopping.map((i) =>
                                    i.category === c
                                      ? { ...i, category: next }
                                      : i,
                                  ),
                                },
                                "类别已重命名",
                              );
                              setCategory("全部类别");
                            }}
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            aria-label={`删除${c}类别`}
                            onClick={() =>
                              setConfirmation({
                                title: `删除“${c}”类别？`,
                                text: "食材记录会保留，并移至“其他”。",
                                action: () => {
                                  save(
                                    {
                                      ...data,
                                      categories: [
                                        ...data.categories.filter(
                                          (x) => x !== c && x !== "其他",
                                        ),
                                        "其他",
                                      ],
                                      items: data.items.map((i) =>
                                        i.category === c
                                          ? { ...i, category: "其他" }
                                          : i,
                                      ),
                                      shopping: data.shopping.map((i) =>
                                        i.category === c
                                          ? { ...i, category: "其他" }
                                          : i,
                                      ),
                                    },
                                    "类别已删除",
                                  );
                                  setCategory("全部类别");
                                },
                              })
                            }
                          >
                            <X size={14} />
                          </button>
                        </>
                      )}
                    </span>
                  ))}
                </div>
                <form
                  className="inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const c = categoryName.trim();
                    if (!c) return;
                    if (data.categories.includes(c)) {
                      setToast("该类别已存在");
                      return;
                    }
                    if (
                      save(
                        { ...data, categories: [...data.categories, c] },
                        "类别已添加",
                      )
                    )
                      setCategoryName("");
                  }}
                >
                  <input
                    aria-label="新类别名称"
                    placeholder="新类别名称"
                    maxLength={30}
                    value={categoryName}
                    onChange={(e) => setCategoryName(e.target.value)}
                  />
                  <button type="submit">
                    <Plus size={16} />
                    添加类别
                  </button>
                </form>
              </section>
              <section className="settings-card">
                <h2>重新开始</h2>
                <p>
                  恢复最初的 8 项确认库存和 16
                  项待核实记录，同时清空购物清单、操作历史与自定义别名。
                </p>
                <button
                  className="danger"
                  onClick={() =>
                    setConfirmation({
                      title: "恢复初始库存？",
                      text: "当前全部库存、购物清单、操作历史、自定义别名和类别会被替换。此操作不可撤销，请先导出备份。",
                      action: () => {
                        save(seedData(), "已恢复初始库存", true);
                        setCategory("全部类别");
                      },
                    })
                  }
                >
                  <RotateCcw size={16} />
                  重置示例数据
                </button>
              </section>
            </div>
          )}
          <footer className="page-footer">
            <span>小厨房</span>
            <span>让每一份食材，都被好好记得。</span>
          </footer>
        </div>
      </main>
      {editing && (
        <Modal
          title={
            data.items.some((i) => i.id === editing.id)
              ? "编辑食材"
              : "添加食材"
          }
          onClose={() => setEditing(null)}
        >
          <ItemForm
            item={editing}
            categories={
              data.categories.includes("其他")
                ? data.categories
                : [...data.categories, "其他"]
            }
            onClose={() => setEditing(null)}
            onSave={(item) => {
              const items = data.items.some((i) => i.id === item.id)
                ? data.items.map((i) => (i.id === item.id ? item : i))
                : [item, ...data.items];
              if (
                save(
                  {
                    ...data,
                    categories: data.categories.includes(item.category)
                      ? data.categories
                      : [...data.categories, item.category],
                    items,
                  },
                  "食材已保存",
                )
              )
                setEditing(null);
            }}
          />
        </Modal>
      )}
      {shoppingOpen && (
        <Modal title="添加待购商品" onClose={() => setShoppingOpen(false)}>
          <ShoppingForm
            categories={data.categories}
            onSave={(item) => {
              if (
                save(
                  { ...data, shopping: [...data.shopping, item] },
                  "已添加到购物清单",
                )
              )
                setShoppingOpen(false);
            }}
          />
        </Modal>
      )}
      {change && (
        <Modal
          title={`记录数量变化 · ${change.item.name}`}
          onClose={() => setChange(null)}
        >
          <ChangeForm
            item={change.item}
            onSave={(item) => {
              if (update(item)) setChange(null);
            }}
          />
        </Modal>
      )}
      {confirmation && (
        <Modal title={confirmation.title} onClose={() => setConfirmation(null)}>
          <p className="confirm-text">{confirmation.text}</p>
          <footer className="modal-footer">
            <button autoFocus onClick={() => setConfirmation(null)}>
              取消
            </button>
            <button
              className="primary"
              onClick={() => {
                confirmation.action();
                setConfirmation(null);
              }}
            >
              确认操作
            </button>
          </footer>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          <span>{toast}</span>
          <button aria-label="关闭提示" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function ShoppingForm({
  categories,
  onSave,
}: {
  categories: string[];
  onSave: (i: ShoppingItem) => void;
}) {
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name")).trim();
    if (!name) return;
    onSave({
      id: id(),
      name,
      quantity: f.get("quantity") === "" ? null : Number(f.get("quantity")),
      unit: String(f.get("unit")),
      category: String(f.get("category")),
      purchased: false,
    });
  }
  return (
    <form className="form" onSubmit={submit}>
      <label>
        商品名称
        <input name="name" autoFocus required placeholder="下次想买什么？" />
      </label>
      <div className="form-grid">
        <label>
          计划数量
          <input
            type="number"
            name="quantity"
            min="0.001"
            step="0.001"
            placeholder="未知，可留空"
          />
        </label>
        <label>
          单位
          <input name="unit" placeholder="个、包、g…" />
        </label>
      </div>
      <label>
        类别
        <select
          name="category"
          defaultValue={categories.includes("其他") ? "其他" : categories[0]}
        >
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <footer className="modal-footer">
        <button type="submit" className="primary">
          加入购物清单
        </button>
      </footer>
    </form>
  );
}
function ChangeForm({
  item,
  onSave,
}: {
  item: Item;
  onSave: (i: Item) => void;
}) {
  const [direction, setDirection] = useState(-1);
  const [amount, setAmount] = useState("2");
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(amount);
        if (item.quantity === null || !Number.isFinite(n) || n <= 0) return;
        onSave(adjust(item, direction * n));
      }}
    >
      <p>
        当前：{item.quantity ?? "数量未知"} {item.unit}
      </p>
      {item.quantity === null ? (
        <>
          <p className="field-help">
            当前余量未知，不能直接计算。可以编辑食材填写实际数量，或标记用完。
          </p>
          <button
            type="button"
            className="primary"
            onClick={() =>
              onSave({
                ...item,
                quantity: 0,
                status: "empty",
                updatedAt: stamp(),
              })
            }
          >
            全部用完
          </button>
        </>
      ) : (
        <>
          <div className="segmented">
            <button
              type="button"
              className={direction === -1 ? "selected" : ""}
              onClick={() => setDirection(-1)}
            >
              消耗
            </button>
            <button
              type="button"
              className={direction === 1 ? "selected" : ""}
              onClick={() => setDirection(1)}
            >
              补充
            </button>
          </div>
          <label>
            {direction === -1 ? "消耗数量" : "补充数量"}（
            {item.unit || "未指定单位"}）
            <input
              autoFocus
              type="number"
              required
              min="0.001"
              max={direction === -1 ? item.quantity : undefined}
              step="0.001"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <footer className="modal-footer">
            <button type="submit" className="primary">
              确认{direction === -1 ? "消耗" : "补充"}
            </button>
          </footer>
        </>
      )}
    </form>
  );
}
