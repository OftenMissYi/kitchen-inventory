import test from "node:test";
import assert from "node:assert/strict";
import {
  blankItem,
  parseBackup,
  receive,
  seedData,
  STORAGE_KEY,
  type KitchenData,
} from "../model";
import {
  parseNaturalLanguage as parse,
  chineseNumber,
} from "./naturalLanguageParser";
import {
  canUndo,
  executeBatch,
  inventorySignature,
  previewBatch,
  recordCommit,
  undoLatest,
} from "./inventoryTransactions";
import { matchItems } from "./aliases";
import { persistData } from "./storage";
import type { DraftOperation } from "./inventoryTypes";

function fixture(): KitchenData {
  return {
    ...seedData(),
    items: [
      { ...blankItem(), id: "egg", name: "鸡蛋", quantity: 10, unit: "个" },
      {
        ...blankItem(),
        id: "mince",
        name: "猪牛混合肉末",
        quantity: 500,
        unit: "g",
      },
      {
        ...blankItem(),
        id: "sausage",
        name: "广式香肠",
        quantity: 4,
        unit: "根",
      },
    ],
  };
}
function drafts(text: string): DraftOperation[] {
  return parse(text).map((o) => ({ ...o, included: true }));
}
function run(data: KitchenData, text: string) {
  const result = executeBatch(data, drafts(text), inventorySignature(data));
  return recordCommit(data, result.next, {
    source: text,
    changes: result.changes,
  });
}
test("增加10个鸡蛋：10 → 20；解析本身不修改库存", () => {
  const d = fixture(),
    before = JSON.stringify(d);
  previewBatch(d, drafts("买了10个鸡蛋"));
  assert.equal(JSON.stringify(d), before);
  assert.equal(run(d, "买了10个鸡蛋").items[0].quantity, 20);
});
test("消耗、盘点、用完保持独立语义", () => {
  const d = fixture();
  assert.equal(run(d, "吃了2个鸡蛋").items[0].quantity, 8);
  assert.equal(run(d, "还剩3个鸡蛋").items[0].quantity, 3);
  assert.equal(run(d, "鸡蛋吃完了").items[0].status, "empty");
  assert.equal(run(d, "鸡蛋吃完了").items[0].quantity, 0);
});
test("质量和体积换算；新增食材转换为基础单位", () => {
  const d = fixture();
  assert.equal(run(d, "买了1kg肉末").items[1].quantity, 1500);
  const next = run(d, "买了0.5kg猪肉和半瓶酱油和1L牛奶");
  assert.equal(next.items.find((i) => i.name === "猪肉")?.quantity, 500);
  assert.equal(next.items.find((i) => i.name === "牛奶")?.quantity, 1000);
  assert.equal(next.items.find((i) => i.name === "牛奶")?.unit, "ml");
  assert.equal(next.items.find((i) => i.name === "酱油")?.quantity, 0.5);
});
test("多食材共享动作与四项混合操作", () => {
  assert.equal(parse("买了6个鸡蛋和2个番茄").length, 2);
  const next = run(
    fixture(),
    "今天买了10个鸡蛋和2个番茄，吃了1根香肠，肉末用完了。",
  );
  assert.equal(next.history[0].changes.length, 4);
  assert.equal(next.items[0].quantity, 20);
  assert.equal(next.items[1].status, "empty");
  assert.equal(next.items[2].quantity, 3);
  assert.equal(next.items.find((i) => i.name === "番茄")?.quantity, 2);
});
test("中文数字和半包解析；主语前置盘点", () => {
  assert.equal(chineseNumber("十二"), 12);
  assert.equal(chineseNumber("两百五十"), 250);
  assert.equal(chineseNumber("一点五"), 1.5);
  const texts = [
    "今天买了一包意面",
    "买了两个洋葱和一盒牛奶",
    "用了半包意面",
    "肉末还有250g",
    "鸡腿其实只有1只",
    "冰箱里还有一包香肠",
    "家里没洋葱了",
  ];
  for (const text of texts)
    assert.ok(
      parse(text).every((o) => !o.error),
      text,
    );
  assert.equal(parse("用了半包意面")[0].quantity, 0.5);
  assert.equal(parse("肉末还有250g")[0].type, "SET_QUANTITY");
});
test("未知重量、单位不兼容、待核实和库存不足均阻止扣减", () => {
  for (const text of ["用了200g肉末", "吃了5个鸡蛋", "消耗了一根广式香肠"]) {
    const d = fixture();
    d.items[1].quantity = null;
    d.items[0].quantity = 3;
    d.items[2].status = "verify";
    const before = JSON.stringify(d);
    assert.throws(() => run(d, text));
    assert.equal(JSON.stringify(d), before);
  }
  const d = fixture();
  d.items[1].unit = "份";
  assert.throws(() => run(d, "用了200g肉末"));
  assert.throws(() => run(d, "吃了2根鸡蛋"));
});
test("已有未知食材不重复创建；可修正实际总量再消耗", () => {
  const d = fixture();
  d.items[0].quantity = null;
  assert.throws(() => run(d, "买了3个鸡蛋"));
  const next = run(d, "还剩10个鸡蛋，吃了2个鸡蛋");
  assert.equal(next.items[0].quantity, 8);
  assert.equal(next.items.length, d.items.length);
});
test("未知食材可新增，但不可消耗不存在的记录", () => {
  const d = fixture();
  assert.equal(run(d, "买了2个番茄").items.length, 4);
  assert.throws(() => run(d, "吃了2个番茄"));
});
test("安全匹配：显式别名、德文、名称归一化和多候选", () => {
  const d = fixture();
  assert.equal(matchItems("蛋", d.items, {}).length, 1);
  d.aliases["早餐蛋"] = ["egg"];
  assert.equal(matchItems("早餐蛋", d.items, d.aliases)[0].id, "egg");
  d.items.push({ ...blankItem(), name: "牛肉末", quantity: 200, unit: "g" });
  assert.equal(matchItems("肉末", d.items, {}).length, 2);
  assert.throws(() => run(d, "用了100g肉末"));
  assert.equal(matchItems("猪肉末", d.items, {}).length, 0);
  assert.equal(
    matchItems("炸鸡腿", [{ ...blankItem(), name: "鸡腿" }], {}).length,
    0,
  );
  assert.equal(
    matchItems("Tomatenmark", [{ ...blankItem(), name: "番茄膏" }], {}).length,
    1,
  );
  assert.equal(
    matchItems(
      "parmesan",
      [{ ...blankItem(), name: "帕尔马干酪 / Parmesan" }],
      {},
    ).length,
    1,
  );
});
test("用户选择消歧对象，只有该记录改变", () => {
  const d = fixture();
  d.items.push({
    ...blankItem(),
    id: "beef",
    name: "牛肉末",
    quantity: 300,
    unit: "g",
  });
  const ops = drafts("用了100g肉末");
  ops[0].targetId = "beef";
  const next = executeBatch(d, ops, inventorySignature(d)).next;
  assert.equal(next.items[1].quantity, 500);
  assert.equal(next.items[3].quantity, 200);
});
test("取消、全排除和单条失败都不产生意外写入", () => {
  const d = fixture(),
    before = JSON.stringify(d);
  const ops = drafts("买了2个鸡蛋，天气不错，吃了100个鸡蛋");
  const preview = previewBatch(d, ops);
  assert.equal(preview.rows.length, 3);
  assert.ok(preview.rows[1].error);
  assert.ok(preview.rows[2].error);
  assert.equal(JSON.stringify(d), before);
  assert.throws(() => executeBatch(d, ops, inventorySignature(d)));
  ops[1].included = false;
  ops[2].included = false;
  const next = executeBatch(d, ops, inventorySignature(d)).next;
  assert.equal(next.items[0].quantity, 12);
  ops[0].included = false;
  assert.throws(() => executeBatch(d, ops, inventorySignature(d)));
});
test("同食材按顺序计算；合并新食材；累积消耗不得超量", () => {
  const d = fixture();
  assert.equal(
    run(d, "买了6个番茄，吃了2个番茄").items.find((i) => i.name === "番茄")
      ?.quantity,
    4,
  );
  assert.throws(() => run(d, "吃了8个鸡蛋，吃了3个鸡蛋"));
});
test("批量历史与撤销完整恢复单位、状态和新建记录", () => {
  const d = fixture();
  d.items[1].quantity = null;
  d.items[1].unit = "份";
  const next = run(d, "肉末还有250g，买了2个番茄，鸡蛋吃完了");
  assert.equal(next.history.length, 1);
  assert.equal(next.history[0].changes.length, 3);
  assert.ok(canUndo(next));
  const restored = undoLatest(next);
  assert.deepEqual(restored.items, d.items);
  assert.ok(restored.history[0].undoneAt);
  assert.equal(canUndo(restored), false);
});
test("后续修改或陈旧预览不允许覆盖；手动操作也记录历史", () => {
  const d = fixture(),
    sig = inventorySignature(d);
  const next = run(d, "吃了2个鸡蛋");
  assert.throws(() => executeBatch(next, drafts("买了2个鸡蛋"), sig));
  const tampered = structuredClone(next);
  tampered.items[0].notes = "后续修改";
  assert.equal(canUndo(tampered), false);
  assert.throws(() => undoLatest(tampered));
  const manual = recordCommit(next, tampered, { source: "编辑食材" });
  assert.equal(manual.history.length, 2);
  assert.deepEqual(undoLatest(manual).items, next.items);
});
test("持久化刷新与导入导出包含库存、历史、别名；兼容 v1", () => {
  const d = fixture();
  d.aliases["蛋"] = ["egg"];
  const next = run(d, "买了3个鸡蛋");
  const map = new Map<string, string>();
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
  const raw = persistData(storage, null, next);
  const loaded = parseBackup(storage.getItem(STORAGE_KEY)!);
  assert.deepEqual(loaded, next);
  assert.equal(loaded.items[0].quantity, 13);
  assert.deepEqual(parseBackup(JSON.stringify(loaded)), loaded);
  const legacy = {
    version: 1,
    items: d.items,
    categories: d.categories,
    shopping: d.shopping,
  };
  const migrated = parseBackup(JSON.stringify(legacy));
  assert.deepEqual(migrated.items, d.items);
  assert.deepEqual(migrated.history, []);
  assert.equal(migrated.version, 2);
  map.set(STORAGE_KEY, "other-tab");
  assert.throws(() => persistData(storage, raw, next));
  assert.equal(map.get(STORAGE_KEY), "other-tab");
});
test("拒绝损坏历史和别名，保留完整事务", () => {
  const next = run(fixture(), "买了2个鸡蛋");
  const bad = structuredClone(next);
  bad.history[0].before.items[0].quantity = -2;
  assert.throws(() => parseBackup(JSON.stringify(bad)));
  next.aliases["失效别名"] = ["missing"];
  assert.throws(() => parseBackup(JSON.stringify(next)));
});
test("否定、计划、条件、缺少数量及拼接句不猜测执行", () => {
  for (const input of [
    "没买2个鸡蛋",
    "明天买2个鸡蛋",
    "如果买2个鸡蛋",
    "买了鸡蛋",
    "买了2个鸡蛋用了1个鸡蛋",
    "买了大概2个鸡蛋",
  ])
    assert.ok(
      parse(input).some((o) => o.error),
      input,
    );
});
test("模糊或异常中文数词不能当作精确数量", () => {
  for (const input of [
    "买了三四个鸡蛋",
    "买了一百二个鸡蛋",
    "买了一零一个鸡蛋",
    "买了十十个鸡蛋",
  ])
    assert.ok(parse(input)[0].error, input);
  assert.equal(chineseNumber("一百零一"), 101);
  assert.equal(chineseNumber("两千零二十"), 2020);
});
test("备份历史中的临时前缀 ID 不会被误改", () => {
  const d = fixture();
  d.items[0].id = "draft-0";
  const next = run(d, "买了2个鸡蛋，买了2个番茄");
  assert.equal(next.items[0].id, "draft-0");
  assert.equal(next.items[0].quantity, 12);
});
test("用完后补充可以重新建立未知单位；小数计算不静默丢失精度", () => {
  const d = fixture();
  d.items[0].quantity = 0;
  d.items[0].unit = "";
  d.items[0].status = "empty";
  assert.equal(run(d, "买了6个鸡蛋").items[0].quantity, 6);
  assert.equal(run(d, "买了6个鸡蛋").items[0].unit, "个");
  assert.throws(() => run(fixture(), "用了0.0001g肉末"));
});
test("原购物入库路径也记录历史，导出后可恢复与撤销", () => {
  const d = fixture();
  d.shopping = [
    {
      id: "buy",
      name: "鸡蛋",
      quantity: 2,
      unit: "个",
      category: "其他",
      purchased: true,
    },
  ];
  const next = recordCommit(d, receive(d), { source: "购物入库" });
  assert.equal(next.items[0].quantity, 12);
  assert.equal(next.shopping.length, 0);
  assert.equal(next.history.length, 1);
  const restored = parseBackup(JSON.stringify(next));
  assert.deepEqual(undoLatest(restored).items, d.items);
  assert.equal(undoLatest(restored).shopping.length, 0);
});
test("存储写入失败不会改写当前数据；仅购物清单修改不丢失历史", () => {
  const d = run(fixture(), "吃了2个鸡蛋");
  const raw = JSON.stringify(d);
  const storage = {
    getItem: () => raw,
    setItem: () => {
      throw new Error("QuotaExceeded");
    },
  };
  assert.throws(() => persistData(storage, raw, run(d, "吃了1个鸡蛋")));
  assert.equal(storage.getItem(), raw);
  const next = recordCommit(d, {
    ...d,
    shopping: [
      {
        id: "s",
        name: "牛奶",
        quantity: null,
        unit: "",
        category: "其他",
        purchased: false,
      },
    ],
  });
  assert.deepEqual(next.history, d.history);
});
