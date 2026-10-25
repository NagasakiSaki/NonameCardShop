/**
 * V7 Starter Gift Module
 *
 * Rules:
 * - Granted only ONCE per new save repository, before the first day ends.
 * - Always 1 box of the initial unlocked theme ('yijiang').
 * - Follows V7 starter collation (60N / 42R / 18SR / 0SSR, min 1 R per pack, no SSR).
 * - Costs 0, suggested retail 4790, clearly recorded in world.starterGift.
 * - Existing saves that already received starter gift never receive it again.
 */

import { planCollation, makeSealedV7 } from './collation-policy.mjs';
import defaultPolicy from '../../data/v7/economy-policy.json' with { type: 'json' };

export function grantStarterGiftV7(world, policy = defaultPolicy, catalog) {
  if (world.starterGift && world.starterGift.status === 'granted') {
    return {
      ok: false,
      alreadyGranted: true,
      data: world.starterGift,
      message: '开局赠礼已发放过，不可重复领取。'
    };
  }

  const giftConfig = policy.starterGift || defaultPolicy.starterGift;
  if (!giftConfig.enabled) {
    world.starterGift = { version: 1, status: 'disabled' };
    return { ok: false, message: '开局赠礼已配置为禁用。' };
  }

  const productId = giftConfig.productId || 'yijiang';
  const unit = giftConfig.unit || 'box';

  // Build collation plan with only yijiang unlocked (triggers starter box recipe: 60N/42R/18SR/0SSR)
  const collation = planCollation({
    productId,
    unlockedProductIds: [productId],
    catalog,
    policy
  });

  if (!collation.ok) {
    throw new Error(`STARTER_GIFT_ERROR: Failed to plan collation: ${collation.error.message}`);
  }

  const suggestedRetail = unit === 'box' ? 4790 : 210;
  const cost = 0;

  // Make sealed item
  const item = makeSealedV7(world, collation, unit, cost, suggestedRetail, catalog, 'player');
  item.acquisition = 'starter-gift';

  const record = {
    version: 1,
    status: 'granted',
    productId,
    productVersion: collation.data.productVersion,
    unit,
    quantity: giftConfig.quantity || 1,
    inventoryRefs: [item.inventoryRef],
    day: world.clock?.day || 1,
    policyVersion: policy.version,
    recordedAt: new Date().toISOString()
  };

  world.starterGift = record;

  if (Array.isArray(world.log)) {
    world.log.push({
      type: 'starterGiftGranted',
      day: record.day,
      productId,
      unit,
      inventoryRefs: record.inventoryRefs,
      cost,
      suggestedRetail
    });
  }

  return {
    ok: true,
    data: record,
    item
  };
}
