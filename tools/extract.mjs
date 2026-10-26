// 从无名杀 v1.11.6 的 character/*.js 抽取武将数据，输出 data/cards.json
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {projectRoot,nonameRoot,characterRoot} from './lib/noname-source.mjs';

globalThis.window = globalThis;
globalThis.document = {
  createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }),
  addEventListener() {},
  querySelector: () => null,
};
globalThis.localStorage = { getItem: () => null, setItem() {} };

const APP = nonameRoot;
const CHARS_DIR = characterRoot;
const OUT = path.join(projectRoot,"data/cards.json");

// ---------- 卡包谱系（分类设计） ----------
const LINEAGES = [
  {
    id: "canon",
    name: "正史",
    subtitle: "官方主线，一代一代长出来的骨架",
    desc: "从 2008 年标准包开始的官方正统线。这一系的武将构成三国杀的基本盘，几乎所有人都认识。",
  },
  {
    id: "chronicle",
    name: "列传",
    subtitle: "为某个人物、某段故事单独立传",
    desc: "以人物或系列为单位单独成包，强度与设计都更放得开，是官方线的延长线。",
  },
  {
    id: "realms",
    name: "列国",
    subtitle: "OL、十周年、移动版，各自演化的平行世界",
    desc: "同一个武将在不同服务器有不同的版本。这一系的本质是分叉：同名不同人，同人不同命。",
  },
  {
    id: "apocrypha",
    name: "异闻",
    subtitle: "联动、线下、DIY，不属于任何服务器的边缘",
    desc: "联动 IP、实体限定、社区创作。获取渠道最窄，也最容易绝版，是收藏价值最高的一档。",
  },
];

const PACK_LINEAGE = {
  standard: "canon",
  shenhua: "canon",
  extra: "canon",
  yijiang: "canon",
  refresh: "canon",
  sp: "chronicle",
  sp2: "chronicle",
  newjiang: "chronicle",
  onlyOL: "realms",
  yingbian: "realms",
  clan: "realms",
  huicui: "realms",
  xianding: "realms",
  mobile: "realms",
  shiji: "realms",
  sb: "realms",
  bingshi: "realms",
  tw: "realms",
  collab: "apocrypha",
  old: "apocrypha",
  offline: "apocrypha",
  jsrg: "apocrypha",
  sxrm: "apocrypha",
  sixiang: "apocrypha",
  diy: "apocrypha",
  key: "apocrypha",
};

// tier 仅保留旧分类兼容；实际稀有度与价格由独立强度及卡包规则生成。
// 源扩展分类不会参与强度评分。
// 空白初始稀有度由 build-balance.cjs 在导出后统一替换。
const PACK_TIER = {
  standard: 1, shenhua: 1, extra: 1, yijiang: 1, refresh: 2,
  sp: 2, sp2: 2, newjiang: 2,
  onlyOL: 3, yingbian: 3, clan: 3, huicui: 3, xianding: 3,
  mobile: 3, shiji: 3, sb: 3, bingshi: 3, tw: 3,
  collab: 4, old: 2, offline: 4, jsrg: 4, sxrm: 4, sixiang: 4, diy: 4, key: 4,
};

const RARITY_ORDER = ["C", "U", "R", "SR", "UR"];
function assignRarities(cards) { for (const card of cards) card.rarity="C"; }
// ---------- 读取 package.js 里的中文包名 ----------
let PACK_NAMES = {};
try {
  const src = fs.readFileSync(path.join(APP, "game/package.js"), "utf8");
  const win = {};
  new Function("window", src)(win);
  PACK_NAMES = win.noname_package?.character || {};
} catch (e) {
  console.warn("读取 package.js 失败：", e.message);
}

// ---------- 逐个导入武将包 ----------
const { captured } = await import("noname");

const files = fs.readdirSync(CHARS_DIR).filter((f) => f.endsWith(".js"));
const packs = [];
const cards = [];
const failed = [];
const skipped = [];

for (const file of files) {
  const before = captured.length;
  try {
    await import(pathToFileURL(path.join(CHARS_DIR, file)).href);
  } catch (e) {
    failed.push({ file, error: String(e).slice(0, 160) });
    continue;
  }
  const fresh = captured.splice(before);
  const pkg = fresh.find((x) => x.type === "character" && x.data);
  if (!pkg) {
    skipped.push({ file, reason: fresh[0]?.error || "无 character 包" });
    continue;
  }
  const data = pkg.data;
  const packId = data.name || file.replace(/\.js$/, "");
  const translate = data.translate || {};
  const titles = data.characterTitle || {};
  const chs = data.character || {};

  let count = 0;
  const packCards = [];
  for (const [cid, c] of Object.entries(chs)) {
    if (!c || typeof c !== "object") continue;
    if (c.isBoss || c.isMinion) continue;
    const name = translate[cid] || cid;
    const img = c.img ? path.basename(c.img) : `${cid}.jpg`;
    packCards.push({
      id: cid,
      name,
      pack: packId,
      group: c.group || "unknown",
      hp: c.hp ?? 4,
      maxHp: c.maxHp ?? c.hp ?? 4,
      lord: !!c.isZhugong,
      skills: (c.skills || []).map((s) => ({ id: s, name: translate[s] || s })),
      title: titles[cid] || "",
      img,
      rarity: "C",
    });
    count++;
  }

  assignRarities(packCards, PACK_TIER[packId] || 2);
  for (const c of packCards) {
    delete c.lord;
    cards.push(c);
  }

  const dist = {};
  for (const r of RARITY_ORDER) dist[r] = 0;
  for (const card of packCards) dist[card.rarity]++;

  packs.push({
    id: packId,
    name: PACK_NAMES[packId] || packId,
    lineage: PACK_LINEAGE[packId] || "apocrypha",
    tier: PACK_TIER[packId] || 2,
    count,
    rarities: dist,
  });
}

// 卡包里没被 package.js 命名的，用文件名兜底
for (const p of packs) {
  if (p.name === p.id) p.name = PACK_NAMES[p.id] || p.id;
}

packs.sort((a, b) => {
  const la = LINEAGES.findIndex((l) => l.id === a.lineage);
  const lb = LINEAGES.findIndex((l) => l.id === b.lineage);
  return la - lb || b.count - a.count;
});

const out = {
  generatedAt: new Date().toISOString(),
  source: "无名杀 v1.11.6（GPL-3.0，数据版权归原作者与社区）",
  lineages: LINEAGES.map((l) => ({
    ...l,
    packs: packs.filter((p) => p.lineage === l.id).map((p) => p.id),
  })),
  packs,
  cards,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out), "utf8");
// Catalogue extraction is followed by the same audited model used by the game.
// Initial C assignments above are temporary extraction placeholders.
await import('./build-balance.cjs');

console.log(`武将包：${packs.length} 个`);
console.log(`武将卡：${cards.length} 张`);
console.log(`失败：${failed.length}，跳过：${skipped.length}`);
if (failed.length) console.log(failed);
if (skipped.length) console.log(skipped);
console.log("稀有度分布：");
const total = {};
for (const c of JSON.parse(fs.readFileSync(OUT,"utf8")).cards) total[c.rarity] = (total[c.rarity] || 0) + 1;
console.log(total);
console.log("按谱系：");
for (const l of out.lineages) {
  const n = cards.filter((c) => l.packs.includes(c.pack)).length;
  console.log(`  ${l.name}：${l.packs.length} 包 / ${n} 张`);
}
