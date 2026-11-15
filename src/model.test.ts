import test from "node:test";
import assert from "node:assert/strict";
import { adjust, blankItem, parseBackup, receive, seedData } from "./model";
test("初始数据忠实保留确认状态与未知数量", () => {
  const d = seedData();
  assert.equal(d.items.filter((i) => i.status === "available").length, 8);
  assert.equal(d.items.filter((i) => i.status === "verify").length, 16);
  assert.ok(
    d.items
      .filter((i) => i.status === "verify")
      .every((i) => i.quantity === null),
  );
  assert.equal(d.items.find((i) => i.name === "广式香肠")?.quantity, null);
  assert.ok(d.items.every((i) => i.expiry === "" && i.location === "未确定"));
});
test("鸡蛋 10 减 2 为 8，数量不会为负，零库存标记用完", () => {
  const egg = { ...blankItem(), name: "鸡蛋", quantity: 10, unit: "个" };
  assert.equal(adjust(egg, -2).quantity, 8);
  assert.equal(adjust(egg, -20).quantity, 0);
  assert.equal(adjust(egg, -20).status, "empty");
  assert.equal(adjust({ ...egg, quantity: null }, -1).quantity, null);
});
test("备份往返保留库存、购物清单与类别", () => {
  const d = seedData();
  d.items.unshift({ ...blankItem(), name: "鸡蛋", quantity: 10, unit: "个" });
  assert.deepEqual(parseBackup(JSON.stringify(d)), d);
});
test("购物入库合并已知数量、清除已购买记录、重复入库无副作用", () => {
  const d = seedData();
  d.items = [{ ...blankItem(), name: "鸡蛋", quantity: 8, unit: "个" }];
  d.shopping = [
    {
      id: "a",
      name: "鸡蛋",
      quantity: 10,
      unit: "个",
      category: "其他",
      purchased: true,
    },
    {
      id: "b",
      name: "牛奶",
      quantity: null,
      unit: "",
      category: "其他",
      purchased: false,
    },
  ];
  const next = receive(d);
  assert.equal(next.items[0].quantity, 18);
  assert.equal(next.shopping.length, 1);
  assert.deepEqual(receive(next), next);
  assert.equal(d.items[0].quantity, 8);
});
test("未知数量不能在入库时被假定为零；用完后可按采购数量补充", () => {
  const d = seedData();
  d.items = [{ ...blankItem(), name: "香肠" }];
  d.shopping = [
    {
      id: "a",
      name: "香肠",
      quantity: 2,
      unit: "",
      category: "其他",
      purchased: true,
    },
  ];
  assert.equal(receive(d).items[0].quantity, null);
  d.items[0].status = "empty";
  d.items[0].quantity = 0;
  assert.equal(receive(d).items[0].quantity, 2);
  d.items[0].status = "verify";
  d.items[0].quantity = 5;
  assert.equal(receive(d).items[0].quantity, null);
});
test("导入拒绝无效结构、负数、重复 ID 和虚假日期", () => {
  assert.throws(() => parseBackup("{}"));
  const d = seedData();
  d.items[0].quantity = -1;
  assert.throws(() => parseBackup(JSON.stringify(d)));
  d.items[0].quantity = 1;
  d.items[0].expiry = "2026-02-30";
  assert.throws(() => parseBackup(JSON.stringify(d)));
  d.items[0].expiry = "";
  d.items.push(d.items[0]);
  assert.throws(() => parseBackup(JSON.stringify(d)));
});
