import type {
  InventoryParser,
  OperationType,
  ParsedOperation,
} from "./inventoryTypes";
import { canonicalUnit } from "./units";

const numeric =
  "(?:\\d+(?:\\.\\d+)?|[零〇一二两三四五六七八九十百千万]+(?:点[零〇一二两三四五六七八九]+)?|半)";
const unit = "(?:kg|ml|g|l|个|只|根|包|袋|盒|瓶|份)";
const amountFirst = new RegExp(`^(${numeric})\\s*(${unit})\\s*(.+)$`, "i");
const amountLast = new RegExp(`^(.+?)\\s*(${numeric})\\s*(${unit})$`, "i");
const actionPrefix =
  /^(?:(?:今天|刚刚|刚才|刚|又|现在|家里|冰箱里|目前)\s*)*(?:(?:买|补充|购入|买入)(?:了)?|(?:吃|用|消耗)(?:掉|了)?|(?:还剩|剩下|剩|还有|其实只有|只有))/;
export function chineseNumber(text: string): number {
  if (text === "半") return 0.5;
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
  const digits: Record<string, number> = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  const [integer, fraction] = text.split("点");
  // Colloquial approximations such as 三四个 / 一百二 are not exact quantities.
  if (/[一二两三四五六七八九]{2}|[百千][一二两三四五六七八九]$/.test(integer))
    return NaN;
  let total = 0,
    section = 0,
    current = 0;
  for (const char of integer) {
    if (char in digits) current = digits[char];
    else if (char === "万") {
      total += (section + current) * 10000;
      section = 0;
      current = 0;
    } else {
      section += (current || 1) * ({ 十: 10, 百: 100, 千: 1000 }[char] ?? NaN);
      current = 0;
    }
  }
  const integerValue = total + section + current;
  const symbols = "零一二三四五六七八九";
  const spellSection = (n: number) => {
    let output = "",
      pendingZero = false;
    for (const [power, suffix] of [
      [1000, "千"],
      [100, "百"],
      [10, "十"],
      [1, ""],
    ] as const) {
      const digit = Math.floor(n / power) % 10;
      if (digit) {
        if (pendingZero) output += "零";
        output += symbols[digit] + suffix;
        pendingZero = false;
      } else if (output && n % power) pendingZero = true;
    }
    return output;
  };
  const remainder = integerValue % 10000;
  const spelled = (
    integerValue === 0
      ? "零"
      : integerValue < 10000
        ? spellSection(integerValue)
        : spellSection(Math.floor(integerValue / 10000)) +
          "万" +
          (remainder && remainder < 1000 ? "零" : "") +
          spellSection(remainder)
  ).replace(/^一十/, "十");
  const normalized = integer
    .replaceAll("两", "二")
    .replaceAll("〇", "零")
    .replace(/^一十/, "十");
  if (spelled !== normalized) return NaN;
  return (
    integerValue +
    (fraction ? Number("0." + [...fraction].map((c) => digits[c]).join("")) : 0)
  );
}
function unsafeName(name: string) {
  return (
    !name ||
    /[\d，,。；;!?！？]|买|吃|用了|消耗|剩|还有|没有|用完|吃完|没|不要|可能|如果|大概|或者|还是|准备|计划|打算|明天|昨天|之前|上次|每|共|一共/.test(
      name,
    )
  );
}
export function parseNaturalLanguage(text: string): ParsedOperation[] {
  if (!text.trim()) return [];
  if (text.length > 2000)
    return [
      {
        id: "0",
        source: text,
        type: "ADD",
        name: "",
        quantity: null,
        unit: "",
        error: "一次最多输入 2000 字，请分批记录。",
      },
    ];
  let inherited: OperationType | undefined;
  // Only conjunctions inherit a verb. New sentences must state their own action.
  const tokens = text
    .trim()
    .split(/([，,。；;\n！？!?]+|和|以及|、)/)
    .filter(Boolean);
  const result: ParsedOperation[] = [];
  for (const token of tokens) {
    if (/^[，,。；;\n！？!?]+$/.test(token)) {
      inherited = undefined;
      continue;
    }
    if (/^(和|以及|、)$/.test(token)) continue;
    const source = token.trim();
    if (!source) continue;
    let body = source.replace(
      /^(?:(?:今天|刚刚|刚才|刚|又|现在|家里|冰箱里|目前)\s*)+/,
      "",
    );
    let type: OperationType | undefined;
    let name = "",
      quantity: number | null = null,
      parsedUnit = "";
    const empty =
      body.match(/^(.+?)(?:吃完了?|用完了?|没有了)$/) ??
      body.match(/^没(.+?)了$/);
    if (empty) {
      type = "MARK_EMPTY";
      name = empty[1].trim();
    } else {
      const add = body.match(/^(?:买|补充|购入|买入)(?:了)?\s*/);
      const consume = body.match(/^(?:吃|用|消耗)(?:掉|了)?\s*/);
      const set = body.match(/^(?:还剩|剩下|剩|还有|其实只有|只有)\s*/);
      const suffixSet = body.match(
        /^(.+?)(?:还剩|剩下|还有|其实只有|只有)\s*(.+)$/,
      );
      if (add) {
        type = "ADD";
        body = body.slice(add[0].length);
      } else if (consume) {
        type = "CONSUME";
        body = body.slice(consume[0].length);
      } else if (set) {
        type = "SET_QUANTITY";
        body = body.slice(set[0].length);
      } else if (suffixSet) {
        type = "SET_QUANTITY";
        body = suffixSet[2] + suffixSet[1];
      } else if (inherited && !actionPrefix.test(body)) type = inherited;
      const match = body.match(amountFirst);
      const reverse = !match && body.match(amountLast);
      if (match) {
        quantity = chineseNumber(match[1]);
        parsedUnit = canonicalUnit(match[2]);
        name = match[3].trim();
      } else if (reverse) {
        name = reverse[1].trim();
        quantity = chineseNumber(reverse[2]);
        parsedUnit = canonicalUnit(reverse[3]);
      } else name = body.trim();
    }
    let error: string | undefined;
    if (!type) error = "未识别到明确动作，请写“买了 / 用了 / 还剩 / 用完了”。";
    else if (unsafeName(name))
      error =
        "食材或语意不明确，请拆成“动作 + 数量 + 单位 + 食材”，不支持否定、条件或计划表达。";
    else if (type !== "MARK_EMPTY" && quantity === null)
      error = "缺少可识别的数量或单位，请补充，例如“买了2个鸡蛋”。";
    else if (
      quantity !== null &&
      (!Number.isFinite(quantity) ||
        quantity < 0 ||
        quantity > 1e9 ||
        (quantity === 0 && type !== "SET_QUANTITY"))
    )
      error = "数量必须为有效正数；盘点修正允许为 0。";
    result.push({
      id: String(result.length),
      source,
      type: type ?? "ADD",
      name,
      quantity,
      unit: parsedUnit,
      error,
    });
    inherited = error ? undefined : type;
  }
  return result;
}
export const localInventoryParser: InventoryParser = {
  parse: parseNaturalLanguage,
};
