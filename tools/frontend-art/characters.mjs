// tools/frontend-art/characters.mjs — 地图角色四向行走图集与对话立绘。
// 24×32 原生像素；3 列 × 4 行 = 12 帧：行序 down/left/right/up，列序 迈左/待机/迈右（第 1 列待机）。
// 光源统一在左上：左列提亮、右侧两列压暗、贴地一行环境遮蔽。
import { Img, PALETTE as P, mix } from "./pixkit.mjs";

export const FRAME_W = 24;
export const FRAME_H = 32;
export const ANCHOR = [12, 30];
export const DIRECTIONS = ["down", "left", "right", "up"];
export const WALK_COLUMNS = [0, 1, 2, 1];

const INK = P.ink;
const DEEP = (c, t = 0.34) => mix(c, INK, t);
const LIT = (c, t = 0.22) => mix(c, P.white, t);

const SKIN_TONES = {
  warm: { base: P.skin, light: P.skinLight, shade: P.skinShade },
  fair: { base: "#f9ddbc", light: "#ffeed8", shade: "#d9a87b" },
  tan: { base: "#cf9764", light: "#e8b98a", shade: "#a06a3f" },
  deep: { base: "#a2704a", light: "#c08f63", shade: "#78492c" },
};

/** 七套基本角色。身体结构共享，发型/服装轮廓/肤色/标志物各自区分，不是换色。 */
export const CHARACTERS = [
  {
    id: "owner", name: "店长", role: "店主", skinTone: "warm", face: "calm",
    hair: P.hairBrown, hairLight: P.hairBrownLight, hairStyle: "short",
    top: P.clothGreen, pants: P.woodDark, shoes: INK,
    apron: P.apron, apronShade: P.apronShade, strap: P.woodDark,
    badge: P.gold, accessory: "keys",
    traits: ["帆布围裙", "胸前店徽", "腰间钥匙"],
  },
  {
    id: "rookie", name: "新手顾客", role: "新手", skinTone: "fair", face: "wide",
    hair: P.hairBlack, hairLight: P.hairBlackLight, hairStyle: "short",
    top: P.clothRed, pants: P.clothMustard, shoes: P.clothCream,
    cap: P.clothGreen, capLight: P.clothGreenLight,
    accessory: "starterBox", backpack: true,
    traits: ["绿色鸭舌帽", "手拎入门牌盒"],
  },
  {
    id: "collector", name: "收藏家", role: "收藏", skinTone: "fair", face: "narrow",
    hair: P.hairSilver, hairLight: P.hairSilverLight, hairStyle: "longBob",
    top: P.clothPurple, pants: P.woodDark, shoes: INK,
    coat: P.clothPurple, coatTrim: P.gold, coatHem: true,
    glasses: true, accessory: "binder",
    traits: ["银灰长发", "金边领口", "腋下收藏册"],
  },
  {
    id: "competitor", name: "竞技玩家", role: "竞技", skinTone: "tan", face: "sharp",
    hair: P.hairBlack, hairLight: P.hairBlackLight, hairStyle: "spiky",
    top: P.clothTeal, pants: P.clothGray, shoes: P.white,
    headband: P.clothRed, shorts: true, wristband: P.clothRed, accessory: "deckBox",
    traits: ["红色头带", "运动短裤", "腰侧牌盒"],
  },
  {
    id: "passerby", name: "路过顾客", role: "路过", skinTone: "deep", face: "plain",
    hair: P.hairBlonde, hairLight: P.hairBlondeLight, hairStyle: "parted",
    top: P.clothMustard, pants: P.clothBlue, shoes: P.clothMustard,
    shortSleeve: true, accessory: "none",
    traits: ["短袖便装", "布拖鞋"],
  },
  {
    id: "regular", name: "熟客", role: "熟客", skinTone: "warm", face: "warm",
    hair: P.hairRed, hairLight: P.hairRedLight, hairStyle: "ponytail",
    top: P.clothGreen, pants: P.woodDark, shoes: P.inkSoft,
    scarf: P.clothCream, hairClip: P.clothBlueLight, accessory: "none",
    traits: ["高马尾与发夹", "米色围巾"],
  },
  {
    id: "bigspender", name: "高预算顾客", role: "大客户", skinTone: "fair", face: "cold",
    hair: P.hairBlack, hairLight: P.hairBlackLight, hairStyle: "short",
    top: INK, pants: INK, shoes: INK,
    hat: P.inkSoft, hatBand: P.gold, furCollar: P.clothGrayLight,
    coat: P.clothBlue, coatTrim: P.gold, coatHem: true, accessory: "case",
    traits: ["宽檐礼帽", "亮面高领外套", "手提收藏箱"],
  },
];

const skinOf = (spec) => SKIN_TONES[spec.skinTone] || SKIN_TONES.warm;

function mirror(img) {
  const out = new Img(img.w, img.h);
  for (let y = 0; y < img.h; y += 1) {
    for (let x = 0; x < img.w; x += 1) {
      const si = (y * img.w + (img.w - 1 - x)) * 4;
      const di = (y * img.w + x) * 4;
      out.data[di] = img.data[si];
      out.data[di + 1] = img.data[si + 1];
      out.data[di + 2] = img.data[si + 2];
      out.data[di + 3] = img.data[si + 3];
    }
  }
  return out;
}

// ---------------------------------------------------------------- 头

function headDown(img, spec) {
  const s = skinOf(spec);
  img.rect(7, 4, 10, 10, s.base);
  img.rect(7, 4, 1, 9, s.light);           // 左脸受光
  img.rect(16, 5, 1, 9, s.shade);
  img.hline(8, 15, 13, s.shade);           // 下巴
  img.rect(6, 10, 1, 2, s.base);
  img.rect(17, 10, 1, 2, s.base);
  img.px(6, 11, s.shade);
  img.px(17, 11, s.shade);
  img.rect(10, 14, 4, 1, s.shade);         // 脖子
}

function faceDown(img, spec) {
  const s = skinOf(spec);
  const kind = spec.face || "calm";
  img.rect(9, 9, 2, 2, INK);
  img.rect(13, 9, 2, 2, INK);
  img.px(9, 9, P.white);
  img.px(13, 9, P.white);
  img.px(10, 10, mix(INK, P.clothBlue, 0.5));
  img.px(14, 10, mix(INK, P.clothBlue, 0.5));
  if (kind === "wide") {
    img.px(8, 9, s.light);
    img.px(15, 9, s.light);
    img.rect(9, 9, 2, 2, P.white);
    img.rect(13, 9, 2, 2, P.white);
    img.px(9, 10, INK);
    img.px(14, 10, INK);
    img.rect(10, 12, 3, 1, DEEP(s.base, 0.55));
    img.px(11, 12, P.white);
  } else if (kind === "narrow" || kind === "cold") {
    img.rect(9, 9, 2, 1, INK);
    img.rect(13, 9, 2, 1, INK);
    img.px(11, 12, DEEP(s.base, 0.45));
    img.px(12, 12, DEEP(s.base, 0.45));
  } else if (kind === "sharp") {
    img.px(9, 8, DEEP(spec.hair, 0.1));
    img.px(13, 8, DEEP(spec.hair, 0.1));
    img.px(10, 12, DEEP(s.base, 0.45));
    img.px(11, 13, DEEP(s.base, 0.5));
  } else if (kind === "warm") {
    img.px(9, 9, INK);
    img.px(10, 9, s.base);
    img.px(13, 9, INK);
    img.px(14, 9, s.base);
    img.rect(10, 12, 2, 1, DEEP(s.base, 0.5));
    img.px(12, 13, DEEP(s.base, 0.5));
  } else {
    img.px(11, 11, s.shade);
    img.hline(10, 13, 12, DEEP(s.base, 0.42));
    img.px(10, 11, mix(P.blush, s.base, 0.5));
    img.px(13, 11, mix(P.blush, s.base, 0.5));
  }
  if (spec.glasses) {
    img.hline(8, 11, 9, P.inkSoft);
    img.hline(12, 15, 9, P.inkSoft);
    img.vline(8, 9, 10, P.inkSoft);
    img.vline(15, 9, 10, P.inkSoft);
  }
  img.px(7, 11, s.shade);
  img.px(16, 11, s.shade);
}

function faceSide(img, spec) {
  const s = skinOf(spec);
  img.rect(8, 9, 2, 2, INK);
  img.px(8, 9, P.white);
  img.px(6, 10, s.base);                   // 鼻尖
  img.px(6, 11, s.shade);
  img.px(9, 11, s.shade);
  img.px(8, 12, DEEP(s.base, 0.42));
  img.px(10, 7, s.light);
}

function drawHairFront(img, spec) {
  const hair = spec.hair;
  const light = spec.hairLight;
  const under = DEEP(hair, 0.34);
  const style = spec.hairStyle;
  // 圆顶 + 削角
  img.rect(8, 1, 8, 1, hair);
  img.rect(7, 2, 10, 4, hair);
  img.px(6, 3, hair);
  img.px(17, 3, hair);
  img.hline(8, 15, 1, light);
  img.rect(9, 1, 3, 1, light);
  img.px(8, 2, light);
  img.px(9, 2, light);
  img.px(16, 4, under);
  // 发丝分缝
  img.vline(11, 2, 3, light);
  img.px(12, 3, under);
  // 鬓角
  img.rect(7, 6, 1, 7, hair);
  img.rect(16, 6, 1, 7, hair);
  img.px(7, 12, under);
  img.px(16, 12, under);
  // 刘海
  if (style === "spiky") {
    img.px(8, 0, hair);
    img.px(12, 0, hair);
    img.px(15, 0, hair);
    img.rect(8, 5, 2, 2, hair);
    img.rect(14, 5, 2, 2, hair);
    img.rect(11, 5, 2, 1, hair);
    img.px(9, 6, under);
    img.px(15, 6, under);
  } else if (style === "parted") {
    img.rect(7, 5, 4, 2, hair);
    img.rect(13, 5, 4, 1, hair);
    img.px(11, 5, hair);
    img.hline(8, 10, 5, light);
    img.hline(12, 15, 5, under);
  } else if (style === "ponytail") {
    img.rect(7, 5, 3, 2, hair);
    img.rect(14, 5, 3, 2, hair);
    img.rect(10, 5, 4, 1, hair);
    img.px(9, 5, light);
    img.rect(17, 7, 2, 11, hair);          // 发尾垂到肩下
    img.px(17, 7, light);
    img.px(18, 17, under);
    img.rect(16, 6, 1, 3, hair);
    if (spec.hairClip) img.rect(17, 8, 2, 1, spec.hairClip);
  } else if (style === "longBob") {
    img.rect(7, 5, 2, 9, hair);
    img.rect(15, 5, 2, 9, hair);
    img.rect(9, 5, 3, 2, hair);
    img.rect(13, 5, 2, 2, hair);
    img.px(8, 5, light);
    img.rect(6, 8, 1, 6, hair);
    img.rect(17, 8, 1, 6, hair);
    img.px(6, 13, under);
    img.px(17, 13, under);
  } else {
    img.rect(7, 5, 3, 1, hair);
    img.rect(14, 5, 3, 1, hair);
    img.rect(10, 5, 2, 1, hair);
    img.px(8, 6, under);
    img.px(13, 5, light);
  }
}

function drawHairBack(img, spec) {
  const hair = spec.hair;
  const light = spec.hairLight;
  const under = DEEP(hair, 0.34);
  const style = spec.hairStyle;
  img.rect(7, 1, 10, 12, hair);
  img.rect(8, 1, 8, 1, hair);
  img.hline(8, 15, 1, light);
  img.rect(7, 1, 1, 12, under);
  img.rect(16, 1, 1, 12, under);
  img.rect(9, 2, 3, 1, light);
  img.hline(11, 13, 8, under);
  img.px(12, 3, under);
  img.px(12, 4, under);
  if (style === "ponytail") {
    img.rect(10, 12, 4, 9, hair);
    img.px(10, 13, light);
    img.rect(9, 12, 1, 2, hair);
    img.px(11, 20, under);
    img.px(13, 20, under);
    if (spec.hairClip) img.rect(11, 13, 2, 1, spec.hairClip);
  } else if (style === "longBob") {
    img.rect(6, 8, 2, 8, hair);
    img.rect(16, 8, 2, 8, hair);
    img.rect(8, 12, 8, 1, under);
    img.px(8, 9, light);
  } else if (style === "spiky") {
    img.px(8, 0, hair);
    img.px(12, 0, hair);
    img.px(15, 0, hair);
    img.rect(9, 11, 6, 1, under);
  } else {
    img.rect(8, 11, 8, 1, under);
    img.px(9, 10, light);
    img.px(14, 10, light);
  }
  img.rect(9, 13, 6, 1, skinOf(spec).shade);   // 后颈
}

function drawHairSide(img, spec) {
  const hair = spec.hair;
  const light = spec.hairLight;
  const under = DEEP(hair, 0.34);
  const style = spec.hairStyle;
  img.rect(7, 1, 9, 5, hair);
  img.rect(8, 1, 7, 1, hair);
  img.hline(8, 15, 1, light);
  img.px(8, 2, light);
  if (style === "ponytail") {
    img.rect(12, 5, 4, 10, hair);
    img.px(13, 6, light);
    img.px(13, 15, under);
    img.rect(7, 5, 2, 3, hair);
  } else if (style === "longBob") {
    img.rect(6, 5, 3, 6, hair);
    img.rect(12, 5, 3, 10, hair);
    img.px(8, 6, light);
    img.px(13, 14, under);
  } else if (style === "spiky") {
    img.px(8, 0, hair);
    img.px(12, 0, hair);
    img.rect(7, 5, 3, 2, hair);
    img.rect(11, 5, 4, 2, hair);
    img.px(9, 2, light);
  } else if (style === "parted") {
    img.rect(7, 5, 3, 3, hair);
    img.rect(11, 5, 4, 1, hair);
    img.px(8, 6, light);
    img.px(13, 5, under);
  } else {
    img.rect(7, 5, 3, 2, hair);
    img.rect(12, 5, 3, 2, hair);
    img.px(8, 5, light);
    img.px(13, 6, under);
  }
}

function drawHeadGear(img, spec, dir) {
  if (spec.cap) {
    const cap = spec.cap;
    const light = spec.capLight || LIT(cap);
    const dark = DEEP(cap, 0.3);
    if (dir === "up") {
      img.rect(7, 1, 10, 7, cap);
      img.hline(8, 15, 1, light);
      img.hline(7, 16, 7, dark);
      img.rect(9, 3, 4, 1, light);
    } else if (dir === "left" || dir === "right") {
      img.rect(7, 1, 9, 7, cap);
      img.hline(8, 15, 1, light);
      img.rect(3, 7, 9, 1, dark);              // 帽檐朝前
      img.hline(7, 15, 7, dark);
      img.px(9, 3, light);
    } else {
      img.rect(7, 1, 10, 7, cap);
      img.hline(8, 15, 1, light);
      img.rect(7, 7, 10, 1, dark);
      img.rect(8, 8, 8, 1, DEEP(cap, 0.16));
      img.rect(9, 3, 4, 1, light);
      img.px(14, 5, DEEP(cap, 0.14));
    }
  }
  if (spec.hat) {
    const hat = spec.hat;
    if (dir === "left" || dir === "right") {
      img.rect(2, 6, 16, 2, hat);
      img.rect(7, 0, 9, 6, hat);
      img.hline(8, 15, 0, LIT(hat, 0.18));
      img.rect(8, 4, 7, 1, spec.hatBand);
      img.hline(2, 17, 7, DEEP(hat, 0.3));
    } else {
      img.rect(3, 6, 18, 2, hat);
      img.rect(7, 0, 10, 6, hat);
      img.hline(8, 15, 0, LIT(hat, 0.18));
      img.rect(7, 4, 10, 1, spec.hatBand);
      img.hline(3, 20, 7, DEEP(hat, 0.3));
    }
  }
  if (spec.headband) {
    if (dir === "left" || dir === "right") {
      img.rect(6, 5, 10, 1, spec.headband);
      img.rect(14, 5, 2, 3, spec.headband);
    } else {
      img.rect(6, 5, 12, 1, spec.headband);
      img.px(17, 6, spec.headband);
    }
  }
}

// ---------------------------------------------------------------- 腿

/** 下半身帧表：(左鞋 x0, 左鞋底, 右鞋 x0, 右鞋底)。鞋高 2px。 */
const LEG_TABLE = {
  0: { left: 7, leftBottom: 29, right: 12, rightBottom: 30 },
  1: { left: 8, leftBottom: 30, right: 12, rightBottom: 30 },
  2: { left: 8, leftBottom: 30, right: 13, rightBottom: 29 },
};

function drawLegsFront(img, spec, frame) {
  const pants = spec.pants;
  const pantsDark = DEEP(pants, 0.34);
  const shoes = spec.shoes;
  const shoeDark = DEEP(shoes, 0.4);
  const s = skinOf(spec);
  const t = LEG_TABLE[frame];

  // 髋部
  img.rect(8, 24, 8, 2, pants);
  img.rect(8, 24, 8, 1, LIT(pants, 0.14));
  img.vline(11, 24, 27, pantsDark);
  img.vline(12, 24, 27, DEEP(pants, 0.2));

  if (spec.shorts) {
    img.rect(8, 26, 8, 1, pantsDark);
    img.rect(8, 27, 3, 1, s.base);
    img.rect(13, 27, 3, 1, s.base);
    img.px(8, 27, s.shade);
    img.px(15, 27, s.shade);
  } else {
    img.rect(8, 26, 3, 2, pants);
    img.rect(13, 26, 3, 2, pantsDark);
    img.rect(11, 26, 1, 2, pantsDark);
    img.rect(12, 26, 1, 2, pants);
  }

  // 鞋：迈步侧整体上移 1px 并外扩 1px，支撑侧压到 30
  const drawShoe = (x0, bottom, lit) => {
    img.rect(x0, bottom - 1, 4, 2, shoes);
    img.hline(x0, x0 + 3, bottom, shoeDark);
    img.px(x0, bottom - 1, lit);
    if (spec.shoes === P.clothCream || spec.shoes === P.white) img.hline(x0, x0 + 3, bottom - 1, shoes);
  };
  drawShoe(t.left, t.leftBottom, LIT(shoes, 0.35));
  drawShoe(t.right, t.rightBottom, LIT(shoes, 0.25));
}

function drawLegsSide(img, spec, frame) {
  const pants = spec.pants;
  const pantsDark = DEEP(pants, 0.34);
  const shoes = spec.shoes;
  const shoeDark = DEEP(shoes, 0.4);
  const s = skinOf(spec);

  img.rect(8, 24, 7, 2, pants);
  img.rect(8, 24, 7, 1, LIT(pants, 0.14));
  if (spec.shorts) {
    img.rect(8, 26, 7, 1, pantsDark);
    img.rect(9, 27, 4, 1, s.base);
  } else {
    img.rect(9, 26, 3, 2, pants);
    img.rect(12, 26, 3, 2, pantsDark);
  }
  const front = frame === 0 ? { x: 6, bottom: 29 } : { x: 7, bottom: 30 };
  const back = frame === 2 ? { x: 13, bottom: 29 } : { x: 12, bottom: 30 };
  img.rect(front.x, front.bottom - 1, 5, 2, shoes);
  img.hline(front.x, front.x + 4, front.bottom, shoeDark);
  img.px(front.x, front.bottom - 1, LIT(shoes, 0.35));
  img.rect(back.x, back.bottom - 1, 4, 2, shoes);
  img.hline(back.x, back.x + 3, back.bottom, shoeDark);
}

// ---------------------------------------------------------------- 躯干

function drawTorsoFront(img, spec, frame, dir) {
  const top = spec.top;
  const topDark = DEEP(top, 0.3);
  const s = skinOf(spec);
  const swingL = frame === 0 ? -1 : frame === 2 ? 1 : 0;
  const swingR = -swingL;
  const sleeveLen = spec.shortSleeve ? 3 : 7;

  // 手臂
  img.rect(5, 15, 2, sleeveLen, topDark);
  img.rect(5, 15, 1, sleeveLen, top);
  img.rect(17, 15, 2, sleeveLen, topDark);
  img.rect(18, 15, 1, sleeveLen, DEEP(top, 0.44));
  const handY = 14 + sleeveLen + swingL;
  const handY2 = 14 + sleeveLen + swingR;
  img.rect(5, handY, 2, 2, s.base);
  img.rect(17, handY2, 2, 2, s.base);
  img.px(5, handY + 1, s.shade);
  img.px(18, handY2 + 1, s.shade);
  if (spec.wristband) {
    img.rect(5, handY - 1, 2, 1, spec.wristband);
    img.rect(17, handY2 - 1, 2, 1, spec.wristband);
  }

  // 躯干
  img.rect(7, 15, 10, 9, top);
  img.rect(7, 15, 1, 9, LIT(top, 0.2));
  img.rect(15, 15, 2, 9, topDark);
  img.hline(8, 15, 23, DEEP(top, 0.45));

  if (spec.apron && dir === "up") {
    img.rect(9, 15, 1, 7, spec.strap);
    img.rect(14, 15, 1, 7, spec.strap);
    img.rect(9, 21, 6, 1, spec.strap);
    img.px(11, 22, spec.apronShade);
    img.px(12, 22, spec.apronShade);
  } else if (spec.apron) {
    img.rect(8, 16, 8, 7, spec.apron);
    img.rect(8, 16, 8, 1, LIT(spec.apron, 0.25));
    img.rect(15, 16, 1, 7, spec.apronShade);
    img.rect(10, 19, 4, 3, spec.apronShade);
    img.hline(10, 13, 19, DEEP(spec.apronShade, 0.3));
    img.px(9, 15, spec.strap);
    img.px(14, 15, spec.strap);
  }
  if (spec.scarf) {
    img.hline(7, 16, 14, spec.scarf);
    img.hline(7, 16, 15, LIT(spec.scarf, 0.2));
    img.rect(8, 16, 3, 3, spec.scarf);
    img.hline(8, 10, 19, DEEP(spec.scarf, 0.25));
  }
  if (spec.furCollar) {
    img.hline(6, 17, 14, spec.furCollar);
    img.hline(6, 17, 15, DEEP(spec.furCollar, 0.2));
    img.px(7, 16, spec.furCollar);
    img.px(16, 16, spec.furCollar);
  }
  if (spec.coat) {
    img.rect(7, 18, 10, 6, spec.coat);
    img.rect(7, 18, 1, 6, LIT(spec.coat, 0.14));
    img.rect(15, 18, 2, 6, DEEP(spec.coat, 0.3));
    img.rect(11, 18, 2, 6, spec.coatTrim);
    if (spec.coatHem) {
      img.rect(6, 24, 12, 2, spec.coat);
      img.rect(6, 24, 12, 1, DEEP(spec.coat, 0.2));
      img.hline(6, 17, 25, spec.coatTrim);
    }
  }
  if (spec.accessory === "keys") {
    img.rect(16, 20, 2, 3, P.metal);
    img.px(16, 21, P.gold);
    img.px(16, 20, LIT(P.metal, 0.4));
  }
  if (spec.accessory === "starterBox") {
    const bx = dir === "up" ? 15 : 3;
    img.rect(bx, 20, 4, 5, P.clothRed);
    img.rect(bx, 20, 4, 1, LIT(P.clothRed, 0.25));
    img.hline(bx, bx + 3, 22, P.clothCream);
  }
  if (spec.accessory === "binder") {
    const bx = dir === "up" ? 14 : 3;
    img.rect(bx, 17, 5, 8, P.clothBlue);
    img.rect(bx, 17, 1, 8, LIT(P.clothBlue, 0.25));
    img.hline(bx, bx + 4, 19, P.gold);
  }
  if (spec.accessory === "deckBox") {
    img.rect(16, 21, 4, 3, P.clothPurple);
    img.hline(16, 19, 22, P.gold);
  }
  if (spec.accessory === "case") {
    const bx = dir === "up" ? 2 : 17;
    img.rect(bx, 18, 5, 8, P.woodDeep);
    img.rect(bx, 18, 5, 1, P.gold);
    img.rect(bx + 1, 21, 3, 4, INK);
    img.px(bx + 1, 25, P.gold);
  }
  if (spec.badge && dir === "down") {
    img.px(12, 17, spec.badge);
    img.px(12, 18, DEEP(spec.badge, 0.25));
  }
  if (spec.badge && dir !== "down" && dir !== "up") img.px(10, 17, spec.badge);
  if (spec.backpack && dir === "up") {
    img.rect(8, 16, 8, 7, P.clothMustard);
    img.rect(8, 16, 8, 1, LIT(P.clothMustard, 0.2));
    img.hline(8, 15, 20, DEEP(P.clothMustard, 0.3));
    img.px(9, 17, P.woodDark);
    img.px(14, 17, P.woodDark);
  }
}

function drawTorsoSide(img, spec, frame) {
  const top = spec.top;
  const topDark = DEEP(top, 0.3);
  const s = skinOf(spec);
  const swing = frame === 0 ? -1 : frame === 2 ? 1 : 0;
  const sleeveLen = spec.shortSleeve ? 3 : 7;
  img.rect(9, 15, 2, sleeveLen, topDark);
  img.rect(9, 15, 1, sleeveLen, top);
  const handY = 14 + sleeveLen + swing;
  img.rect(9, handY, 2, 2, s.base);
  img.px(9, handY + 1, s.shade);
  if (spec.wristband) img.rect(9, handY - 1, 2, 1, spec.wristband);

  img.rect(8, 15, 8, 9, top);
  img.rect(8, 15, 1, 9, LIT(top, 0.2));
  img.rect(14, 15, 2, 9, topDark);
  img.hline(8, 15, 23, DEEP(top, 0.45));

  if (spec.apron) {
    img.rect(9, 16, 6, 7, spec.apron);
    img.rect(9, 16, 6, 1, LIT(spec.apron, 0.25));
    img.rect(13, 16, 2, 7, spec.apronShade);
    img.rect(10, 19, 3, 3, spec.apronShade);
  }
  if (spec.scarf) {
    img.hline(8, 16, 14, spec.scarf);
    img.rect(9, 15, 3, 3, spec.scarf);
  }
  if (spec.furCollar) {
    img.hline(8, 16, 14, spec.furCollar);
    img.hline(8, 16, 15, DEEP(spec.furCollar, 0.2));
  }
  if (spec.coat) {
    img.rect(8, 18, 8, 6, spec.coat);
    img.rect(8, 18, 1, 6, LIT(spec.coat, 0.14));
    img.rect(14, 18, 2, 6, DEEP(spec.coat, 0.3));
    img.vline(12, 18, 23, spec.coatTrim);
    if (spec.coatHem) {
      img.rect(7, 24, 10, 2, spec.coat);
      img.hline(7, 16, 25, spec.coatTrim);
    }
  }
  if (spec.accessory === "keys") {
    img.rect(12, 20, 2, 3, P.metal);
    img.px(12, 21, P.gold);
  }
  if (spec.accessory === "starterBox") {
    img.rect(5, 20, 4, 5, P.clothRed);
    img.hline(5, 8, 22, P.clothCream);
    img.rect(5, 20, 4, 1, LIT(P.clothRed, 0.25));
  }
  if (spec.accessory === "binder") {
    img.rect(4, 17, 4, 8, P.clothBlue);
    img.hline(4, 7, 19, P.gold);
  }
  if (spec.accessory === "deckBox") img.rect(12, 21, 3, 3, P.clothPurple);
  if (spec.accessory === "case") {
    img.rect(3, 18, 5, 8, P.woodDeep);
    img.rect(3, 18, 5, 1, P.gold);
    img.rect(4, 21, 3, 4, INK);
  }
  if (spec.badge) img.px(10, 17, spec.badge);
}

// ---------------------------------------------------------------- 组装

export function drawActor(spec, dir, frame) {
  const img = new Img(FRAME_W, FRAME_H);
  if (dir === "down") {
    headDown(img, spec);
    drawLegsFront(img, spec, frame);
    drawTorsoFront(img, spec, frame, "down");
    faceDown(img, spec);
    drawHairFront(img, spec);
    drawHeadGear(img, spec, "down");
  } else if (dir === "up") {
    headDown(img, spec);
    drawLegsFront(img, spec, frame);
    drawTorsoFront(img, spec, frame, "up");
    drawHairBack(img, spec);
    drawHeadGear(img, spec, "up");
  } else {
    const s = skinOf(spec);
    img.rect(7, 4, 9, 10, s.base);
    img.rect(7, 4, 1, 9, s.light);
    img.rect(15, 5, 1, 9, s.shade);
    img.hline(8, 15, 13, s.shade);
    img.rect(10, 14, 4, 1, s.shade);
    drawLegsSide(img, spec, frame);
    drawTorsoSide(img, spec, frame);
    faceSide(img, spec);
    drawHairSide(img, spec);
    drawHeadGear(img, spec, "left");
    img.rect(12, 10, 1, 2, s.base);
    img.px(12, 11, s.shade);
    if (dir === "right") {
      const flipped = mirror(img);
      finish(flipped);
      return flipped;
    }
  }
  finish(img);
  return img;
}

function finish(img) {
  img.outline(INK);
  for (let x = 0; x < FRAME_W; x += 1) {
    const i = (30 * img.w + x) * 4;
    if (img.data[i + 3] !== 0) {
      for (let k = 0; k < 3; k += 1) img.data[i + k] = mix([img.data[i], img.data[i + 1], img.data[i + 2], 255], INK, 0.25)[k];
    }
  }
  return img;
}

/** 3 列 × 4 行，共 12 帧。 */
export function drawActorSheet(spec) {
  const sheet = new Img(FRAME_W * 3, FRAME_H * 4);
  DIRECTIONS.forEach((dir, row) => {
    for (let col = 0; col < 3; col += 1) {
      sheet.blit(drawActor(spec, dir, col), col * FRAME_W, row * FRAME_H);
    }
  });
  return sheet;
}

// ---------------------------------------------------------------- 立绘

function drawPortraitFace(c, spec) {
  const s = skinOf(spec);
  const iris = (spec.face === "cold" ? mix(INK, P.goldShade, 0.55)
    : spec.face === "sharp" ? mix(INK, P.clothTeal, 0.5)
      : mix(INK, P.clothBlue, 0.5));
  const brow = DEEP(spec.hair, 0.12);
  const kind = spec.face || "calm";
  if (kind === "wide") {
    c.rect(15, 19, 7, 7, P.white);
    c.rect(26, 19, 7, 7, P.white);
    c.rect(17, 21, 4, 4, INK);
    c.rect(28, 21, 4, 4, INK);
    c.rect(18, 22, 2, 2, iris);
    c.rect(29, 22, 2, 2, iris);
    c.px(18, 22, P.white);
    c.px(29, 22, P.white);
    c.rect(16, 17, 5, 1, brow);
    c.rect(27, 17, 5, 1, brow);
    c.rect(21, 29, 7, 4, DEEP(s.base, 0.6));
    c.hline(22, 26, 30, P.white);
    c.hline(22, 26, 32, LIT(s.base, 0.2));
  } else if (kind === "narrow") {
    c.rect(17, 22, 5, 3, INK);
    c.rect(27, 22, 5, 3, INK);
    c.px(18, 22, P.white);
    c.px(28, 22, P.white);
    c.hline(16, 22, 20, brow);
    c.hline(26, 32, 20, brow);
    c.hline(21, 27, 31, DEEP(s.base, 0.5));
    c.px(21, 32, DEEP(s.base, 0.5));
    c.px(27, 32, DEEP(s.base, 0.5));
  } else if (kind === "sharp") {
    c.rect(17, 21, 5, 4, INK);
    c.rect(27, 21, 5, 4, INK);
    c.px(18, 22, P.white);
    c.px(28, 22, P.white);
    c.rect(19, 23, 2, 2, iris);
    c.rect(29, 23, 2, 2, iris);
    c.hline(16, 22, 19, brow);
    c.px(16, 18, brow);
    c.px(17, 18, brow);
    c.hline(26, 32, 19, brow);
    c.px(31, 18, brow);
    c.hline(21, 26, 31, DEEP(s.base, 0.5));
    c.px(27, 32, DEEP(s.base, 0.5));
  } else if (kind === "plain") {
    c.rect(17, 21, 5, 4, INK);
    c.rect(27, 21, 5, 4, INK);
    c.px(18, 21, P.white);
    c.px(28, 21, P.white);
    c.rect(19, 23, 2, 2, iris);
    c.rect(29, 23, 2, 2, iris);
    c.hline(16, 22, 19, brow);
    c.hline(26, 32, 19, brow);
    c.hline(21, 26, 31, DEEP(s.base, 0.45));
    c.px(20, 32, DEEP(s.base, 0.45));
    c.px(27, 32, DEEP(s.base, 0.45));
  } else if (kind === "warm") {
    c.hline(16, 21, 22, INK);
    c.hline(17, 20, 23, INK);
    c.hline(27, 32, 22, INK);
    c.hline(28, 31, 23, INK);
    c.hline(15, 22, 20, brow);
    c.hline(26, 33, 20, brow);
    c.hline(21, 27, 31, DEEP(s.base, 0.5));
    c.px(20, 32, DEEP(s.base, 0.5));
    c.px(28, 32, DEEP(s.base, 0.5));
  } else if (kind === "cold") {
    c.rect(17, 21, 5, 4, P.white);
    c.rect(27, 21, 5, 4, P.white);
    c.rect(17, 21, 5, 2, INK);
    c.rect(27, 21, 5, 2, INK);
    c.rect(18, 23, 3, 1, INK);
    c.rect(28, 23, 3, 1, INK);
    c.px(19, 22, P.white);
    c.px(29, 22, P.white);
    c.hline(16, 22, 19, brow);
    c.hline(26, 32, 19, brow);
    c.hline(21, 26, 31, DEEP(s.base, 0.55));
  } else {
    c.rect(17, 21, 5, 4, INK);
    c.rect(27, 21, 5, 4, INK);
    c.px(18, 21, P.white);
    c.px(28, 21, P.white);
    c.rect(19, 23, 2, 2, iris);
    c.rect(29, 23, 2, 2, iris);
    c.hline(16, 22, 19, brow);
    c.hline(26, 32, 19, brow);
    c.hline(21, 27, 31, DEEP(s.base, 0.5));
    c.px(21, 32, DEEP(s.base, 0.5));
    c.px(27, 32, DEEP(s.base, 0.5));
  }
}

/** 96×96 立绘：48×48 逻辑网格 ×2。同发型、同服装、同肤色、同标志物。 */
export function drawPortrait(spec) {
  const c = new Img(48, 48);
  const s = skinOf(spec);
  const top = spec.top;
  const topDark = DEEP(top, 0.3);

  // 肩与躯干
  c.rect(5, 38, 38, 10, top);
  c.rect(5, 38, 38, 2, LIT(top, 0.16));
  c.rect(5, 45, 38, 3, topDark);
  c.rect(17, 35, 14, 5, s.base);
  c.rect(17, 38, 14, 2, s.shade);

  if (spec.apron) {
    c.rect(13, 38, 22, 10, spec.apron);
    c.rect(13, 38, 22, 1, LIT(spec.apron, 0.25));
    c.rect(33, 38, 2, 10, spec.apronShade);
    c.rect(20, 41, 8, 7, spec.apronShade);
    c.hline(20, 27, 41, DEEP(spec.apronShade, 0.3));
    c.rect(16, 36, 2, 3, spec.strap);
    c.rect(30, 36, 2, 3, spec.strap);
  }
  if (spec.furCollar) {
    c.rect(8, 35, 32, 3, spec.furCollar);
    c.rect(8, 38, 4, 6, spec.furCollar);
    c.rect(36, 38, 4, 6, spec.furCollar);
    c.hline(9, 39, 37, DEEP(spec.furCollar, 0.22));
  }
  if (spec.scarf) {
    c.rect(15, 35, 18, 3, spec.scarf);
    c.hline(15, 32, 35, LIT(spec.scarf, 0.2));
    c.rect(17, 38, 5, 8, spec.scarf);
    c.hline(17, 21, 45, DEEP(spec.scarf, 0.25));
  }
  if (spec.coat) {
    c.rect(3, 35, 7, 13, spec.coat);
    c.rect(38, 35, 7, 13, spec.coat);
    c.vline(9, 35, 47, spec.coatTrim);
    c.vline(38, 35, 47, spec.coatTrim);
    c.rect(3, 35, 7, 1, LIT(spec.coat, 0.2));
  }

  // 头
  c.rect(12, 8, 24, 27, s.base);
  c.rect(12, 8, 3, 26, s.light);
  c.rect(34, 9, 2, 25, s.shade);
  c.rect(10, 20, 2, 6, s.base);
  c.rect(36, 20, 2, 6, s.base);
  c.px(10, 25, s.shade);
  c.px(37, 25, s.shade);
  c.rect(12, 32, 24, 3, s.shade);
  c.rect(14, 34, 20, 1, s.shade);
  c.rect(23, 25, 2, 4, s.shade);
  c.rect(22, 28, 4, 1, s.base);
  drawPortraitFace(c, spec);
  c.hline(13, 34, 33, s.shade);
  c.rect(21, 33, 2, 1, mix(P.blush, s.base, 0.3));
  c.rect(30, 33, 2, 1, mix(P.blush, s.base, 0.3));

  if (spec.glasses) {
    c.hline(16, 22, 20, P.inkSoft);
    c.hline(16, 22, 26, P.inkSoft);
    c.hline(26, 32, 20, P.inkSoft);
    c.hline(26, 32, 26, P.inkSoft);
    c.vline(16, 20, 26, P.inkSoft);
    c.vline(22, 20, 26, P.inkSoft);
    c.vline(26, 20, 26, P.inkSoft);
    c.vline(32, 20, 26, P.inkSoft);
    c.hline(23, 25, 22, P.inkSoft);
  }

  // 发型
  const hair = spec.hair;
  const light = spec.hairLight;
  const style = spec.hairStyle;
  const under = DEEP(hair, 0.28);
  c.rect(11, 5, 26, 7, hair);
  c.rect(11, 5, 26, 2, light);
  c.rect(11, 12, 4, 12, hair);
  c.rect(33, 12, 4, 12, hair);
  c.rect(11, 12, 4, 2, under);
  c.rect(33, 12, 4, 2, under);
  c.px(14, 7, light);
  c.px(15, 7, light);
  c.vline(23, 5, 8, under);
  if (style === "longBob") {
    c.rect(9, 20, 3, 18, hair);
    c.rect(36, 20, 3, 18, hair);
    c.rect(13, 12, 8, 5, hair);
    c.rect(27, 12, 8, 5, hair);
    c.rect(17, 12, 3, 3, light);
  } else if (style === "spiky") {
    c.rect(11, 3, 26, 4, hair);
    c.px(14, 1, hair); c.px(19, 0, hair); c.px(24, 1, hair); c.px(29, 2, hair);
    c.rect(13, 12, 7, 5, hair);
    c.rect(28, 12, 7, 5, hair);
    c.rect(19, 12, 4, 4, hair);
    c.px(16, 4, light);
  } else if (style === "ponytail") {
    c.rect(35, 8, 7, 14, hair);
    c.rect(36, 20, 6, 12, hair);
    c.px(37, 10, light);
    c.rect(14, 12, 6, 4, hair);
    c.rect(28, 12, 6, 4, hair);
    c.rect(18, 12, 12, 2, hair);
  } else if (style === "parted") {
    c.rect(11, 12, 8, 5, hair);
    c.rect(27, 12, 6, 3, hair);
    c.rect(17, 12, 10, 2, hair);
    c.px(15, 13, light);
    c.hline(18, 25, 12, under);
  } else {
    c.rect(13, 12, 6, 4, hair);
    c.rect(29, 12, 6, 4, hair);
    c.rect(19, 12, 10, 3, hair);
    c.px(16, 12, light);
    c.px(26, 13, light);
  }
  if (spec.cap) {
    c.rect(10, 3, 28, 7, spec.cap);
    c.rect(10, 3, 28, 2, spec.capLight || LIT(spec.cap, 0.2));
    c.rect(4, 10, 40, 3, DEEP(spec.cap, 0.22));
    c.rect(12, 13, 4, 8, hair);
    c.rect(32, 13, 4, 8, hair);
  }
  if (spec.hat) {
    c.rect(1, 9, 46, 3, spec.hat);
    c.rect(1, 11, 46, 1, DEEP(spec.hat, 0.3));
    c.rect(10, 0, 28, 9, spec.hat);
    c.rect(10, 0, 28, 2, LIT(spec.hat, 0.18));
    c.rect(10, 7, 28, 2, spec.hatBand);
    c.rect(12, 11, 4, 8, hair);
    c.rect(32, 11, 4, 8, hair);
  }
  if (spec.headband) {
    c.rect(11, 15, 26, 2, spec.headband);
    c.hline(11, 36, 15, LIT(spec.headband, 0.2));
    c.rect(35, 15, 3, 5, spec.headband);
  }
  if (spec.hairClip) c.rect(34, 17, 4, 2, spec.hairClip);

  // 标志物
  if (spec.badge) {
    c.rect(29, 40, 5, 5, spec.badge);
    c.px(30, 41, LIT(spec.badge, 0.5));
    c.px(33, 44, DEEP(spec.badge, 0.3));
  }
  if (spec.accessory === "keys") {
    c.rect(34, 42, 3, 6, P.metal);
    c.rect(35, 43, 1, 2, P.gold);
  }
  if (spec.accessory === "binder") {
    c.rect(38, 30, 9, 14, P.clothBlue);
    c.rect(38, 30, 9, 1, LIT(P.clothBlue, 0.3));
    c.hline(38, 46, 34, P.gold);
  }
  if (spec.accessory === "case") {
    c.rect(39, 28, 9, 16, P.woodDeep);
    c.rect(39, 28, 9, 1, P.gold);
    c.rect(40, 32, 7, 8, INK);
    c.px(41, 30, P.gold);
  }
  if (spec.accessory === "deckBox") {
    c.rect(3, 38, 7, 9, P.clothPurple);
    c.hline(3, 9, 39, P.gold);
  }
  if (spec.accessory === "starterBox") {
    c.rect(3, 36, 8, 11, P.clothRed);
    c.rect(3, 36, 8, 1, LIT(P.clothRed, 0.25));
    c.hline(3, 10, 39, P.clothCream);
  }

  c.outline(INK);
  return c.scale(2);
}
