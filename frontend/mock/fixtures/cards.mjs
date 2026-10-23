// frontend/mock/fixtures/cards.mjs — 演示卡库。只读真实卡表 /data/cards.json 生成演示 DTO。
// 注意：这里的评分阈值是 Mock 专用演示规则，不代表正式分级；正式分级由主模型 Host 提供。

let cache = null;

const FALLBACK = [
  { id: "pot_heqi", name: "势贺齐", pack: "bingshi", group: "wu", hp: 4, img: "pot_heqi.jpg",
    skills: [{ id: "potshanxi", name: "闪袭", description: "出牌阶段每名角色限一次，你可将一张当【决斗】使用。" }], power: { score: 51.2, confidence: 0.38 } },
  { id: "caocao", name: "曹操", pack: "standard", group: "wei", hp: 4, img: "caocao.jpg",
    skills: [{ id: "jianxiong", name: "奸雄", description: "当你受到伤害后，你可以获得对你造成伤害的牌。" }], power: { score: 62.4, confidence: 0.9 } },
  { id: "liubei", name: "刘备", pack: "standard", group: "shu", hp: 4, img: "liubei.jpg",
    skills: [{ id: "rende", name: "仁德", description: "出牌阶段，你可以将任意张手牌交给其他角色。" }], power: { score: 58.1, confidence: 0.9 } },
  { id: "sunquan", name: "孙权", pack: "standard", group: "wu", hp: 4, img: "sunquan.jpg",
    skills: [{ id: "zhiheng", name: "制衡", description: "出牌阶段限一次，你可以弃置任意张牌，然后摸等量的牌。" }], power: { score: 66.3, confidence: 0.9 } },
  { id: "lvbu", name: "吕布", pack: "standard", group: "qun", hp: 4, img: "lvbu.jpg",
    skills: [{ id: "wushuang", name: "无双", description: "锁定技，你使用的【杀】需要两张【闪】才能抵消。" }], power: { score: 71.8, confidence: 0.9 } },
];

const GROUP_LABEL = { wei: "魏", shu: "蜀", wu: "吴", qun: "群", jin: "晋", shen: "神", key: "KEY", devil: "魔", western: "西" };

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 演示分级：按全局分数阈值切四档（正式实现归主模型）。 */
export function demoRarity(score) {
  if (score == null) return "N";
  if (score >= 70) return "SSR";
  if (score >= 55) return "SR";
  if (score >= 38) return "R";
  return "N";
}

function reviewStatus(confidence) {
  if (confidence == null) return "needs-review";
  if (confidence >= 0.75) return "calibrated";
  if (confidence >= 0.35) return "estimated";
  return "needs-review";
}

export async function loadCardLibrary() {
  if (cache) return cache;
  let raw = null;
  try {
    const response = await fetch("/data/cards.json", { cache: "no-cache" });
    if (response.ok) raw = await response.json();
  } catch {
    raw = null;
  }
  const source = raw && Array.isArray(raw.cards) && raw.cards.length ? raw.cards : FALLBACK;
  const cards = source.map((card, index) => {
    const score = card.power && typeof card.power.score === "number" ? card.power.score : null;
    return {
      cardKey: "mock:" + card.id,
      generalId: card.id,
      skillVersion: "mock-skill-v1",
      name: card.name,
      imageUrl: "/img/" + (card.img || index + ".jpg"),
      currentRarity: demoRarity(score),
      printedRarity: demoRarity(score),
      globalScore: score == null ? null : Math.round(score * 10) / 10,
      ratingVersion: "mock-demo-rating-1",
      reviewStatus: reviewStatus(card.power && card.power.confidence),
      faction: GROUP_LABEL[card.group] || card.group,
      factionKey: card.group,
      pack: card.pack,
      hp: card.hp,
      skills: (card.skills || []).map((skill) => ({
        key: skill.key || card.pack + ":" + skill.id,
        name: skill.name,
        description: skill.description,
        code: null,
      })),
      confidence: card.power ? card.power.confidence : null,
      duel: card.power ? card.power.duel : null,
      kof: card.power ? card.power.kof : null,
    };
  });
  const packs = raw && Array.isArray(raw.packs) ? raw.packs : [];
  const byKey = new Map(cards.map((card) => [card.cardKey, card]));
  cache = { cards, byKey, packs, rng: seeded(20261023) };
  return cache;
}
