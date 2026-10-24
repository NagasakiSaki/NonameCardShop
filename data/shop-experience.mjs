// Editable defaults; each world archives its own copy. These guides do not issue money.
export const DEFAULT_SHOP_EXPERIENCE = {
  version: 1,
  storyLimit: 40,
  steps: [
    {id:'stock-first',day:1,title:'准备第一批商品',text:'在柜台进货并签收，再把密封商品摆上货架。',guide:'store.counter',optional:false,goals:[{metric:'ordered',target:1},{metric:'received',target:1},{metric:'shelved',target:1}]},
    {id:'first-customer',day:1,title:'迎接第一笔生意',text:'开门后观察顾客购物；如果没有成交，查看原因再调整。',guide:'store.retail',optional:false,goals:[{metric:'sales',target:1}]},
    {id:'keep-or-sell',day:1,title:'给自己的收藏开个头',text:'在拆包台开一包，决定哪些留作收藏、哪些以后交易。不需要抽中特定牌。',guide:'store.opening',optional:true,goals:[{metric:'opened',target:1}]},
    {id:'close-first',day:1,title:'为明天做准备',text:'打烊后查看经营利润、奖励与流失原因，再决定明天补什么货。',guide:'',optional:false,goals:[{metric:'daysClosed',target:1}]},
    {id:'meet-regular',day:2,title:'认识一位熟客',text:'和熟客聊聊，看看已经流通的牌里有没有他需要的卡。',guide:'store.secondaryMarket',optional:false,goals:[{metric:'regularTalks',target:1}]},
    {id:'improve-shop',day:2,title:'解决一个经营瓶颈',text:'选择增加陈列、改善展示或雇人；资金不足可以先正常营业，不阻挡其他操作。',guide:'',optional:true,goals:[{metric:'upgrades',target:1}]},
    {id:'secondary-sale',day:2,title:'做成一笔单卡交易',text:'重复卡可留一上架。挂单还不是收入，成交后才计入经营。',guide:'store.secondaryMarket',optional:true,goals:[{metric:'marketSales',target:1}]},
    {id:'community-day',day:3,title:'办一次新手交流会',text:'有两位持有可参赛流通卡的顾客后，可以邀请他们来打牌。活动可跳过，不要求店长亲自参赛。',guide:'battleRoom.service',optional:true,goals:[{metric:'communityEvents',target:1}]},
  ],
  event: {id:'community-intro',title:'新手交流会',minDay:3,requiredPlayers:2,matchesRequired:1,description:'邀请两位已有合法持卡的顾客到店，完成一场后台模拟比赛；按正常规则收桌费，不生成卡牌或额外奖金。'},
};
