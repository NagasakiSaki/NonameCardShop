// Mock only: not a v2 DTO or global rarity model. Amounts are integer cents.
// Artwork and skill descriptions come from the existing card database; rarity, prices and holdings are invented UI fixtures.
export const cards = [
  {
    "id": "caocao",
    "name": "曹操",
    "artUrl": "/img/caocao.jpg",
    "rarity": "R",
    "ownedCount": 3,
    "availableCount": 2,
    "price": 2800,
    "marketStock": 6,
    "faction": "魏",
    "theme": "标准",
    "skills": [
      {
        "name": "奸雄",
        "description": "当你受到伤害后，你可以获得对你造成伤害的牌。"
      },
      {
        "name": "护驾",
        "description": "主公技，当你需要使用或打出一张【闪】时，你可以令其他魏势力角色选择是否打出一张【闪】。若有角色响应，则你视为使用或打出了一张【闪】。"
      }
    ]
  },
  {
    "id": "guanyu",
    "name": "关羽",
    "artUrl": "/img/guanyu.jpg",
    "rarity": "R",
    "ownedCount": 1,
    "availableCount": 0,
    "price": 1800,
    "marketStock": 3,
    "faction": "蜀",
    "theme": "标准",
    "skills": [
      {
        "name": "武圣",
        "description": "你可以将一张红色牌当做【杀】使用或打出。"
      }
    ]
  },
  {
    "id": "liubei",
    "name": "刘备",
    "artUrl": "/img/liubei.jpg",
    "rarity": "N",
    "ownedCount": 8,
    "availableCount": 7,
    "price": 1200,
    "marketStock": 12,
    "faction": "蜀",
    "theme": "标准",
    "skills": [
      {
        "name": "仁德",
        "description": "出牌阶段，你可以将任意张手牌交给其他角色。当你以此法于一回合内给出第二张牌时，你回复1点体力。"
      },
      {
        "name": "激将",
        "description": "主公技，当你需要使用或打出【杀】时，你可以令其他蜀势力角色依次选择是否打出一张【杀】。若有角色响应，则你视为使用或打出了此【杀】。"
      }
    ]
  },
  {
    "id": "sunquan",
    "name": "孙权",
    "artUrl": "/img/sunquan.jpg",
    "rarity": "SR",
    "ownedCount": 2,
    "availableCount": 1,
    "price": 8600,
    "marketStock": 2,
    "faction": "吴",
    "theme": "标准",
    "skills": [
      {
        "name": "制衡",
        "description": "出牌阶段限一次，你可以弃置任意张牌，然后摸等量的牌。"
      },
      {
        "name": "救援",
        "description": "主公技，锁定技，其他吴势力角色对你使用的【桃】的回复值+1。"
      }
    ]
  },
  {
    "id": "zhaoyun",
    "name": "赵云",
    "artUrl": "/img/zhaoyun.jpg",
    "rarity": "R",
    "ownedCount": 4,
    "availableCount": 2,
    "price": 2400,
    "marketStock": 7,
    "faction": "蜀",
    "theme": "标准",
    "skills": [
      {
        "name": "龙胆",
        "description": "你可以将【杀】当做【闪】，或将【闪】当做【杀】使用或打出。"
      }
    ]
  },
  {
    "id": "diaochan",
    "name": "貂蝉",
    "artUrl": "/img/diaochan.jpg",
    "rarity": "SR",
    "ownedCount": 0,
    "availableCount": 0,
    "price": 6800,
    "marketStock": 4,
    "faction": "群",
    "theme": "标准",
    "skills": [
      {
        "name": "离间",
        "description": "出牌阶段限一次，你可以弃置一张牌，视为一名男性角色对另一名男性角色使用一张【决斗】（不可被【无懈可击】响应）。"
      },
      {
        "name": "闭月",
        "description": "结束阶段，你可以摸一张牌。"
      }
    ]
  },
  {
    "id": "lvbu",
    "name": "吕布",
    "artUrl": "/img/lvbu.jpg",
    "rarity": "SR",
    "ownedCount": 2,
    "availableCount": 1,
    "price": 7200,
    "marketStock": 3,
    "faction": "群",
    "theme": "标准",
    "skills": [
      {
        "name": "无双",
        "description": "锁定技，①当你使用【杀】指定一名角色为目标后，其需使用两张【闪】才能抵消；②当你使用【决斗】指定其他角色为目标后，或成为其他角色使用【决斗】的目标后，其每次响应需打出两张【杀】。"
      }
    ]
  },
  {
    "id": "shen_guanyu",
    "name": "神关羽",
    "artUrl": "/img/shen_guanyu.jpg",
    "rarity": "SSR",
    "ownedCount": 1,
    "availableCount": 0,
    "price": 28500,
    "marketStock": 1,
    "faction": "神",
    "theme": "经典神将",
    "skills": [
      {
        "name": "武神",
        "description": "锁定技。①你的红桃手牌均视为【杀】。②你使用红桃【杀】无距离和次数限制且不可被响应。"
      },
      {
        "name": "武魂",
        "description": "锁定技，当你受到伤害后，伤害来源获得X个“梦魇”标记（X为伤害点数）。当你死亡时，你选择一名“梦魇”标记数量最多的其他角色。该角色进行判定：若判定结果不为【桃】或【桃园结义】，则该角色死亡。"
      }
    ]
  },
  {
    "id": "zhangfei",
    "name": "张飞",
    "artUrl": "/img/zhangfei.jpg",
    "rarity": "R",
    "ownedCount": 5,
    "availableCount": 4,
    "price": 2200,
    "marketStock": 5,
    "faction": "蜀",
    "theme": "标准",
    "skills": [
      {
        "name": "咆哮",
        "description": "锁定技，出牌阶段，你使用【杀】没有数量限制。"
      }
    ]
  },
  {
    "id": "machao",
    "name": "马超",
    "artUrl": "/img/machao.jpg",
    "rarity": "N",
    "ownedCount": 1,
    "availableCount": 0,
    "price": 1600,
    "marketStock": 8,
    "faction": "蜀",
    "theme": "标准",
    "skills": [
      {
        "name": "马术",
        "description": "锁定技，你计算与其他角色的距离时-1。"
      },
      {
        "name": "铁骑",
        "description": "当你使用【杀】指定目标后，你可以进行判定。若结果为红色，则此【杀】不可被闪避。"
      }
    ]
  },
  {
    "id": "huangyueying",
    "name": "黄月英",
    "artUrl": "/img/huangyueying.jpg",
    "rarity": "R",
    "ownedCount": 2,
    "availableCount": 1,
    "price": 3200,
    "marketStock": 4,
    "faction": "蜀",
    "theme": "标准",
    "skills": [
      {
        "name": "集智",
        "description": "当你使用普通锦囊牌时，你可以摸一张牌。"
      },
      {
        "name": "奇才",
        "description": "锁定技，你使用锦囊牌无距离限制。"
      }
    ]
  },
  {
    "id": "shen_caocao",
    "name": "神曹操",
    "artUrl": "/img/shen_caocao.jpg",
    "rarity": "SSR",
    "ownedCount": 0,
    "availableCount": 0,
    "price": 32000,
    "marketStock": 2,
    "faction": "神",
    "theme": "经典神将",
    "skills": [
      {
        "name": "归心",
        "description": "当你受到1点伤害后，你可以按照你选择的区域优先度随机获得每名其他角色区域里的一张牌，然后你翻面。"
      },
      {
        "name": "飞影",
        "description": "锁定技，其他角色计算与你的距离时+1。"
      }
    ]
  }
];
export const products = [
  {
    "id": "standard-pack",
    "theme": "standard",
    "name": "标准 · 散包",
    "subtitle": "初遇群英",
    "kind": "pack",
    "artUrl": "/frontend-next/experiments/card-trade/assets/standard-pack.png",
    "unitPrice": 2400,
    "stock": 48,
    "packsPerBox": 24,
    "cardsPerPack": 5,
    "suggestedRetail": 3360,
    "warehouse": 8,
    "onShelf": 6,
    "inTransit": 0
  },
  {
    "id": "standard-box",
    "theme": "standard",
    "name": "标准 · 密封盒",
    "subtitle": "初遇群英",
    "kind": "box",
    "artUrl": "/frontend-next/experiments/card-trade/assets/standard-box.png",
    "unitPrice": 52800,
    "stock": 12,
    "packsPerBox": 24,
    "cardsPerPack": 5,
    "suggestedRetail": 73920,
    "warehouse": 2,
    "onShelf": 1,
    "inTransit": 0
  },
  {
    "id": "refresh-pack",
    "theme": "refresh",
    "name": "界限突破 · 散包",
    "subtitle": "锋芒再起",
    "kind": "pack",
    "artUrl": "/frontend-next/experiments/card-trade/assets/refresh-pack.png",
    "unitPrice": 3100,
    "stock": 48,
    "packsPerBox": 24,
    "cardsPerPack": 5,
    "suggestedRetail": 4340,
    "warehouse": 8,
    "onShelf": 6,
    "inTransit": 0
  },
  {
    "id": "refresh-box",
    "theme": "refresh",
    "name": "界限突破 · 密封盒",
    "subtitle": "锋芒再起",
    "kind": "box",
    "artUrl": "/frontend-next/experiments/card-trade/assets/refresh-box.png",
    "unitPrice": 68200,
    "stock": 12,
    "packsPerBox": 24,
    "cardsPerPack": 5,
    "suggestedRetail": 95480,
    "warehouse": 2,
    "onShelf": 1,
    "inTransit": 0
  },
  {
    "id": "shenhua-pack",
    "theme": "shenhua",
    "name": "神话再临 · 散包",
    "subtitle": "风林火山",
    "kind": "pack",
    "artUrl": "/frontend-next/experiments/card-trade/assets/shenhua-pack.png",
    "unitPrice": 3600,
    "stock": 48,
    "packsPerBox": 24,
    "cardsPerPack": 5,
    "suggestedRetail": 5040,
    "warehouse": 8,
    "onShelf": 6,
    "inTransit": 0
  },
  {
    "id": "shenhua-box",
    "theme": "shenhua",
    "name": "神话再临 · 密封盒",
    "subtitle": "风林火山",
    "kind": "box",
    "artUrl": "/frontend-next/experiments/card-trade/assets/shenhua-box.png",
    "unitPrice": 79200,
    "stock": 12,
    "packsPerBox": 24,
    "cardsPerPack": 5,
    "suggestedRetail": 110880,
    "warehouse": 2,
    "onShelf": 1,
    "inTransit": 0
  },
  {
    "id": "extra-pack",
    "theme": "extra",
    "name": "神将 · 散包",
    "subtitle": "璀璨神域",
    "kind": "pack",
    "artUrl": "/frontend-next/experiments/card-trade/assets/extra-pack.png",
    "unitPrice": 4800,
    "stock": 48,
    "packsPerBox": 24,
    "cardsPerPack": 5,
    "suggestedRetail": 6720,
    "warehouse": 8,
    "onShelf": 6,
    "inTransit": 0
  },
  {
    "id": "extra-box",
    "theme": "extra",
    "name": "神将 · 密封盒",
    "subtitle": "璀璨神域",
    "kind": "box",
    "artUrl": "/frontend-next/experiments/card-trade/assets/extra-box.png",
    "unitPrice": 105600,
    "stock": 12,
    "packsPerBox": 24,
    "cardsPerPack": 5,
    "suggestedRetail": 147840,
    "warehouse": 2,
    "onShelf": 1,
    "inTransit": 0
  },
  {
    "id": "yijiang-pack",
    "theme": "yijiang",
    "name": "一将成名 · 散包",
    "subtitle": "名将列传",
    "kind": "pack",
    "artUrl": "/frontend-next/experiments/card-trade/assets/yijiang-pack.png",
    "unitPrice": 3300,
    "stock": 48,
    "packsPerBox": 24,
    "cardsPerPack": 5,
    "suggestedRetail": 4620,
    "warehouse": 8,
    "onShelf": 6,
    "inTransit": 0
  },
  {
    "id": "yijiang-box",
    "theme": "yijiang",
    "name": "一将成名 · 密封盒",
    "subtitle": "名将列传",
    "kind": "box",
    "artUrl": "/frontend-next/experiments/card-trade/assets/yijiang-box.png",
    "unitPrice": 72600,
    "stock": 12,
    "packsPerBox": 24,
    "cardsPerPack": 5,
    "suggestedRetail": 101640,
    "warehouse": 2,
    "onShelf": 1,
    "inTransit": 0
  },
  {
    "id": "mobile-pack",
    "theme": "mobile",
    "name": "移动版 · 散包",
    "subtitle": "掌上战歌",
    "kind": "pack",
    "artUrl": "/frontend-next/experiments/card-trade/assets/mobile-pack.png",
    "unitPrice": 3900,
    "stock": 48,
    "packsPerBox": 24,
    "cardsPerPack": 5,
    "suggestedRetail": 5460,
    "warehouse": 8,
    "onShelf": 6,
    "inTransit": 0
  },
  {
    "id": "mobile-box",
    "theme": "mobile",
    "name": "移动版 · 密封盒",
    "subtitle": "掌上战歌",
    "kind": "box",
    "artUrl": "/frontend-next/experiments/card-trade/assets/mobile-box.png",
    "unitPrice": 85800,
    "stock": 12,
    "packsPerBox": 24,
    "cardsPerPack": 5,
    "suggestedRetail": 120120,
    "warehouse": 2,
    "onShelf": 1,
    "inTransit": 0
  }
];
export const initialBalance = 5620000;
