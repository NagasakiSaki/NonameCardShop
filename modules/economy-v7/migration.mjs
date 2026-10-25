/**
 * V7 Legacy Save Migration Module
 *
 * Safely migrates existing saves to V7 economy rules without data wipe:
 * - Upgrades pricing policy to V7 explicit 210/360/510
 * - Retires newjiang, offline, standard; ensures yijiang is preserved
 * - Preserves existing physical items (cards, packs, boxes):
 *   - Contents, printed rarities, historical costs, and player manual retail prices remain frozen
 *   - Boxes already printed are NEVER re-rolled
 * - Withdraws any retired sealed items from retail shelves back to stock (not deleted!)
 * - Preserves in-flight supplier orders (never alters previously accepted prices/amounts)
 * - Retains existing starter gift status (never duplicates starter box)
 * - Initializes progression state with initial unlocked 'yijiang' if missing
 * - Tags NPCs with V7 buyer classes without wiping existing balances
 */

import defaultPolicy from '../../data/v7/economy-policy.json' with { type: 'json' };
import defaultStages from '../../data/v7/stage-catalog.json' with { type: 'json' };
import { determineBuyerClass } from './budget.mjs';

export function migrateSaveEconomyState(world, policy = defaultPolicy, stageCatalog = defaultStages.stages) {
  if (!world || typeof world !== 'object') {
    throw new Error('MIGRATION_ERROR: Invalid world object.');
  }

  const reports = {
    migrated: false,
    rulesUpdated: false,
    totalItemsPreserved: 0,
    retiredItemsWithdrawn: 0,
    ordersPreserved: 0,
    npcsUpdated: 0,
    progressionInitialized: false,
    starterGiftPreserved: false
  };

  if (!world.rules) world.rules = {};

  // 1. Check if already migrated to V7
  const isAlreadyV7 = world.rules.strengthPricing?.version === policy.pricing.version;

  // 2. Upgrade rules & pricing
  world.rules.strengthPricing = {
    version: policy.pricing.version,
    boxDiscount: policy.boxDiscount,
    tiers: policy.pricing.tiers.map(t => ({ ...t }))
  };
  reports.rulesUpdated = true;

  // 3. Update distribution & retired packs
  if (!world.rules.distribution) world.rules.distribution = {};
  const existingExcluded = Array.isArray(world.rules.distribution.excludedPacks)
    ? world.rules.distribution.excludedPacks
    : [];

  const retiredAll = new Set([...existingExcluded, ...policy.retiredProductIds.allRetired]);
  // Ensure yijiang is explicitly NOT excluded
  retiredAll.delete('yijiang');

  world.rules.distribution.excludedPacks = Array.from(retiredAll);

  // 4. Migrate and preserve inventory items
  if (world.items && typeof world.items === 'object') {
    const retiredSet = new Set(policy.retiredProductIds.allRetired);

    for (const [ref, item] of Object.entries(world.items)) {
      reports.totalItemsPreserved++;

      // If a retired sealed product is currently listed on the retail shelf, withdraw it back to stock
      if (item.location === 'retail' && retiredSet.has(item.productId)) {
        item.location = 'stock';
        if (item.lock && String(item.lock).startsWith('shelf')) {
          item.lock = null;
        }
        reports.retiredItemsWithdrawn++;

        if (Array.isArray(world.log)) {
          world.log.push({
            type: 'retiredProductWithdrawnFromRetail',
            inventoryRef: ref,
            productId: item.productId,
            day: world.clock?.day || 1
          });
        }
      }
      // Historical costs, printed rarities, specs, and retail prices remain unchanged
    }
  }

  // 5. In-flight supplier orders: preserve agreed price and amounts
  if (Array.isArray(world.orders)) {
    for (const order of world.orders) {
      reports.ordersPreserved++;
      // Freeze existing orders; do not alter amount or unitAmount
    }
  }

  // 6. Progression namespace initialization
  if (!world.progression) {
    world.progression = {
      version: 1,
      policyVersion: 'v7-stage-policy-1',
      revision: 1,
      unlockedProductIds: [...policy.initialUnlockedProductIds],
      activeStageId: 'stage-01',
      allies: [],
      receipts: {},
      stages: stageCatalog.map(s => ({ ...s }))
    };
    reports.progressionInitialized = true;
  } else {
    // Progression exists; ensure yijiang is present in unlockedProductIds
    if (!world.progression.unlockedProductIds.includes('yijiang')) {
      world.progression.unlockedProductIds.push('yijiang');
    }
  }

  // 7. Starter gift check
  if (world.starterGift) {
    reports.starterGiftPreserved = true;
  }

  // 8. NPCs: assign buyer classes without resetting available cash
  if (Array.isArray(world.npcs)) {
    for (const npc of world.npcs) {
      if (!npc.wallet) npc.wallet = { available: 1200 };
      if (!npc.wallet.buyerClass) {
        npc.wallet.buyerClass = determineBuyerClass(npc.actorId, policy);
        reports.npcsUpdated++;
      }
    }
  }

  reports.migrated = true;
  reports.timestamp = new Date().toISOString();

  return {
    ok: true,
    data: reports
  };
}

/**
 * Audits a legacy inventory for retired products and compatibility.
 */
export function auditLegacyInventory(world, policy = defaultPolicy) {
  const retiredSet = new Set(policy.retiredProductIds.allRetired);
  const retiredItems = [];
  const activeItems = [];

  for (const item of Object.values(world.items || {})) {
    if (retiredSet.has(item.productId)) {
      retiredItems.push({
        inventoryRef: item.inventoryRef,
        kind: item.kind,
        productId: item.productId,
        location: item.location,
        cost: item.cost,
        retailPrice: item.retailPrice
      });
    } else {
      activeItems.push(item.inventoryRef);
    }
  }

  return {
    totalItems: (world.items ? Object.keys(world.items).length : 0),
    retiredCount: retiredItems.length,
    activeCount: activeItems.length,
    retiredItems
  };
}
