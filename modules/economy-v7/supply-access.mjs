/**
 * V7 Supply Access Module
 *
 * Implements supply evaluation and permissions:
 * - Distinguishes between LOCKED (progression gate) and RETIRED (out of production)
 * - Initial world only unlocks 'yijiang'
 * - Procurement, basket addition, and employee auto-restocking require unlocked status
 * - Retired products (newjiang, offline, standard + legacy) are withdrawn from procurement and new retail
 * - Existing physical cards and boxes of retired themes remain usable, openable, and tradable
 */

import defaultPolicy from '../../data/v7/economy-policy.json' with { type: 'json' };
import defaultStages from '../../data/v7/stage-catalog.json' with { type: 'json' };

/**
 * Evaluates whether a product ID is accessible for supply/procurement.
 *
 * Signature matches shared contract:
 * evaluateSupplyAccess({ productId, progression, retired, policy, stageCatalog })
 *
 * Returns result envelope:
 * { ok: true, data: { productId, allowed: true, status: 'unlocked' } }
 * or
 * { ok: false, error: { code: 'PRODUCT_RETIRED'|'PRODUCT_LOCKED', message, retryable: false }, status }
 */
export function evaluateSupplyAccess({
  productId,
  progression = null,
  retired = null,
  policy = defaultPolicy,
  stageCatalog = defaultStages.stages
}) {
  if (!productId || typeof productId !== 'string') {
    return {
      ok: false,
      status: 'invalid',
      error: { code: 'INVALID_PRODUCT_ID', message: '必须指定有效的产品ID。', retryable: false }
    };
  }

  const retiredList = Array.isArray(retired)
    ? retired
    : policy.retiredProductIds?.allRetired || defaultPolicy.retiredProductIds.allRetired;

  // 1. Check if retired
  if (retiredList.includes(productId)) {
    return {
      ok: false,
      status: 'retired',
      error: {
        code: 'PRODUCT_RETIRED',
        message: `商品主题【${productId}】已停产，不再提供采购与新零售上架。现有实物可正常开包与转让。`,
        retryable: false
      }
    };
  }

  // 2. Check progression unlocked products
  const unlockedIds = Array.isArray(progression?.unlockedProductIds)
    ? progression.unlockedProductIds
    : policy.initialUnlockedProductIds || ['yijiang'];

  if (!unlockedIds.includes(productId)) {
    const stage = stageCatalog.find(s => s.productId === productId);
    const stageHint = stage
      ? `击败第 ${stage.ordinal} 阶段的高手挑战（${stage.displayName}，预计第 ${stage.dueDay} 天来访）后开放供货。`
      : '请先完成对应的成长阶段挑战以解锁供货。';

    return {
      ok: false,
      status: 'locked',
      stageInfo: stage
        ? {
            ordinal: stage.ordinal,
            stageId: stage.stageId,
            challengerId: stage.challengerId,
            challengerName: stage.displayName,
            dueDay: stage.dueDay,
            formatId: stage.formatId
          }
        : null,
      error: {
        code: 'PRODUCT_LOCKED',
        message: `商品主题【${productId}】尚未解锁，${stageHint}`,
        retryable: false
      }
    };
  }

  // 3. Unlocked and available
  return {
    ok: true,
    status: 'unlocked',
    data: {
      productId,
      allowed: true,
      status: 'unlocked'
    }
  };
}

/**
 * Validates a specific supply or inventory operation for permission rules.
 *
 * Operations:
 * - 'procure': Placing supplier order (requires unlocked & not retired)
 * - 'basket_add': Adding to wholesale procurement basket (requires unlocked & not retired)
 * - 'auto_restock': Automated employee restocking (requires unlocked & not retired)
 * - 'retail_list': Putting item on shop retail shelf (requires not retired; item must already exist in stock)
 * - 'unseal_box': Opening a box from stock into packs (always allowed for existing stock)
 * - 'open_pack': Opening a pack into cards (always allowed for existing stock)
 * - 'use_card': Using card in duel/match (always allowed for existing cards)
 * - 'secondary_market_trade': Trading single card on market (always allowed for existing cards)
 */
export function validateSupplyOperation(operation, context) {
  const { productId, progression, retired, policy, stageCatalog, item } = context;

  // Safe operations on existing physical inventory: never blocked by retired or progression lock
  if (['unseal_box', 'open_pack', 'use_card', 'secondary_market_trade'].includes(operation)) {
    if (item && item.lock) {
      return {
        ok: false,
        error: { code: 'ITEM_LOCKED', message: '物品已被锁定或正在使用中。', retryable: false }
      };
    }
    return { ok: true, data: { operation, allowed: true } };
  }

  // Retail shelf listing: cannot list retired products for new retail
  if (operation === 'retail_list') {
    const retiredList = Array.isArray(retired)
      ? retired
      : policy?.retiredProductIds?.allRetired || defaultPolicy.retiredProductIds.allRetired;

    if (retiredList.includes(productId)) {
      return {
        ok: false,
        error: {
          code: 'PRODUCT_RETIRED',
          message: `主题【${productId}】已停产，不可再上架零售货架，请保留在仓库或拆包。`,
          retryable: false
        }
      };
    }
    return { ok: true, data: { operation, allowed: true } };
  }

  // Procurement operations ('procure', 'basket_add', 'auto_restock')
  const access = evaluateSupplyAccess({ productId, progression, retired, policy, stageCatalog });
  if (!access.ok) {
    return access;
  }

  return { ok: true, data: { operation, allowed: true } };
}

/**
 * Validates all items in a procurement basket before checkout.
 */
export function validateBasketSupply(basketItems, context) {
  const failures = [];
  for (const item of basketItems) {
    const check = evaluateSupplyAccess({
      productId: item.productId,
      progression: context.progression,
      retired: context.retired,
      policy: context.policy,
      stageCatalog: context.stageCatalog
    });

    if (!check.ok) {
      failures.push({
        productId: item.productId,
        unit: item.unit,
        quantity: item.quantity,
        status: check.status,
        error: check.error,
        stageInfo: check.stageInfo || null
      });
    }
  }

  if (failures.length > 0) {
    return {
      ok: false,
      error: {
        code: failures[0].error.code,
        message: `购物车中有 ${failures.length} 项商品无法采购：${failures.map(f => f.error.message).join('；')}`,
        retryable: false
      },
      failures
    };
  }

  return { ok: true, data: { validCount: basketItems.length } };
}

/**
 * Filters a catalog of pack themes into categorized views:
 * - available: Can be ordered immediately
 * - locked: Visible in supplier catalog with challenge lock hint
 * - retired: Hidden from supplier procurement catalog
 */
export function categorizeSupplyCatalog(packs, progression, policy = defaultPolicy, stageCatalog = defaultStages.stages) {
  const available = [];
  const locked = [];
  const retired = [];

  for (const pack of packs) {
    const access = evaluateSupplyAccess({
      productId: pack.id,
      progression,
      policy,
      stageCatalog
    });

    if (access.ok) {
      available.push({ ...pack, supplyStatus: 'available' });
    } else if (access.status === 'locked') {
      locked.push({
        ...pack,
        supplyStatus: 'locked',
        lockReason: access.error.message,
        stageInfo: access.stageInfo
      });
    } else if (access.status === 'retired') {
      retired.push({
        ...pack,
        supplyStatus: 'retired',
        retireReason: access.error.message
      });
    }
  }

  return { available, locked, retired };
}
