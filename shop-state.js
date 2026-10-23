/* All card movements and money changes share one persisted save. */
window.ShopModel = (() => {
  const START_CASH = 1200;
  const SELL_PRICE = { C: 8, U: 16, R: 48, SR: 160, UR: 480 };
  function counts(value) {
    const result = {};
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [id, n] of Object.entries(value)) if (Number.isSafeInteger(n) && n > 0 && n < 1000000000 && !["__proto__", "constructor", "prototype"].includes(id)) result[id] = n;
    }
    return result;
  }
  function normalise(value) {
    const saved = value && typeof value === "object" ? value : {};
    const shop = saved.shop || {};
    const result = {
      collection: counts(saved.collection), trash: counts(saved.trash), display: counts(saved.display),
      stock: counts(saved.stock), packDisplay: counts(saved.packDisplay),
      shop: {
        cash: Number.isSafeInteger(shop.cash) && shop.cash >= 0 ? shop.cash : (window.ShopBusiness?.config.economy.startingCash ?? START_CASH),
        packsOpened: Number.isSafeInteger(shop.packsOpened) && shop.packsOpened >= 0 ? shop.packsOpened : 0,
        discarded: Number.isSafeInteger(shop.discarded) && shop.discarded >= 0 ? shop.discarded : 0,
        recovered: Number.isSafeInteger(shop.recovered) && shop.recovered >= 0 ? shop.recovered : 0,
        sold: Number.isSafeInteger(shop.sold) && shop.sold >= 0 ? shop.sold : 0,
        revenue: Number.isSafeInteger(shop.revenue) && shop.revenue >= 0 ? shop.revenue : 0,
      },
      player: { x: Number.isFinite(saved.player?.x) ? saved.player.x : 480, y: Number.isFinite(saved.player?.y) ? saved.player.y : 500 },
      receipts: Array.isArray(saved.receipts) ? saved.receipts.slice(-30) : [],
    };
    if(window.ShopBusiness)ShopBusiness.initialise(result,saved);
    if(window.ShopModules)ShopModules.initialise(result,saved);
    return result;
  }
  function total(items) { return Object.values(items).reduce((sum, n) => sum + n, 0); }
  function transfer(save, from, to, id, n = 1) {
    if (!["collection", "trash", "display"].includes(from) || !["collection", "trash", "display"].includes(to) || from === to || !Number.isSafeInteger(n) || n <= 0 || !(save[from][id] >= n)) return false;
    if(from === "collection" && window.ShopModules && ShopModules.value("inventory.available",save,save.collection[id]||0,{cardId:id})<n)return false;
    if (to === "display" && (save.business?.phase === "closed" || ShopBusiness.shelfUsed(save)+n>ShopBusiness.capacity(save))) return false;
    save[from][id] -= n;
    if (!save[from][id]) delete save[from][id];
    save[to][id] = (save[to][id] || 0) + n;
    if (to === "trash") save.shop.discarded += n;
    if (from === "trash") save.shop.recovered += n;
    window.ShopBusiness?.noteTransfer(save,from,to,id,n);
    return true;
  }
  function price(pack) { return window.ShopBusiness?ShopBusiness.wholesale(pack):0; }
  function buy(save, pack) {
    return ShopBusiness.openPack(save,pack);
  }
  function sellOne(save, card) {
    const result=ShopBusiness.sell(save,"card",card?.id);
    return result.ok?result.amount:0;
  }
  return { START_CASH, SELL_PRICE, normalise, total, transfer, price, buy, sellOne };
})();
