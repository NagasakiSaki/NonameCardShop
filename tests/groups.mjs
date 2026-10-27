// Declarative test inventory; aliases stay available for existing developer commands.
export const DEFAULT_GROUPS=['unit','backend','frontend','dev'];
export const groups={
  "unit": [
    "tools/test-business.cjs",
    "tools/test-modules.cjs",
    "tools/test-balance.cjs",
    "tests/server.mjs",
    "tests/boxes.cjs"
  ],
  "ui": [
    "tests/trade-cards.mjs",
    "tests/trade-opening.mjs",
    "tests/trade-card-detail.mjs",
    "tests/trade-formal.mjs",
    "tests/profile-menu.mjs",
    "tests/gameplay-ui.mjs",
    "tests/portrait-preview.mjs",
    "tests/playability-integration.mjs",
    "tests/high-quality-pass.mjs",
    "tests/trade-workspace-scroll.mjs",
  ],
  "frontend": [
    "tests/operations-v7-browser.mjs",
    "tests/room-format-selection-browser.mjs",
    "tests/scroll-and-album-browser.mjs",
    "tests/native-modes-browser.mjs",
    "tests/bright-frontend-browser.mjs",
    "tests/band-only-appearances.mjs",
    "tests/character-art.mjs",
    "tests/customer-trash-browser.mjs",
    "tests/frontend-movement.mjs",
    "tests/dialogue-navigation.mjs",
    "tests/room-interruption.mjs",
    "tests/frontend-skins.mjs",
    "tests/frontend/assets.mjs",
    "tests/mount-errors.mjs",
    "tests/interaction-queue.mjs",
    "tests/frontend-next/card-trade.mjs",
    "tests/trade-cards.mjs",
    "tests/trade-opening.mjs",
    "tests/trade-card-detail.mjs",
    "tests/trade-formal.mjs",
    "tests/profile-menu.mjs",
    "tests/gameplay-ui.mjs",
    "tests/portrait-sources.mjs",
    "tests/portrait-preview.mjs",
    "tests/playability-integration.mjs",
    "tests/high-quality-pass.mjs",
    "tests/trade-workspace-scroll.mjs",
    "tests/workspace-short-screen.mjs",
    "tests/workspace-virtualization.mjs",
    "tests/world-story-browser.mjs",
    "tests/long-term-browser.mjs",
    "tests/pack-roster-browser.mjs",
    "tests/storage-retry-browser.mjs"
  ],
  "legacy": [
    "tests/economy.cjs",
    "tests/management.cjs",
    "tests/boxes-ui.cjs",
    "tests/saves-ui.cjs"
  ],
  "engine": [
    "tests/duel.cjs"
  ],
  "dev": [
    "tests/frontend-development.mjs",
    "tests/service-health.mjs",
    "tests/character-kit/cli.mjs"
  ],
  "desktop": [
    "tests/desktop-host.cjs"
  ],
  "history": [
    "tests/profile-menu.mjs",
    "tests/day-starts.mjs"
  ],
  "backend": [
    "tests/rooms-and-strength.mjs",
    "tests/backend.mjs",
    "tests/backend-views.mjs",
    "tests/customer-identity.mjs",
    "tests/customer-trash.mjs",
    "tests/battle-lifecycle.mjs",
    "tests/storage-archives-browser.mjs",
    "tests/basket.mjs",
    "tests/customer-visits.mjs",
    "tests/day-starts.mjs",
    "tests/gameplay-adjustments.mjs",
    "tests/shop-experience.mjs",
    "tests/customer-demand.mjs",
    "tests/narrative-runtime.mjs",
    "tests/core4-foundations.mjs",
    "tests/core4-economy.mjs",
    "tests/resource-balance.mjs",
    "tests/campaign-loan.mjs",
    "tests/long-term-operations.mjs",
    "tests/ideal-yield-and-editions.mjs",
    "tests/project-structure.mjs",
    "tests/package-closure.mjs",
    "tests/contract-samples.mjs",
    "tests/eligibility-query.mjs",
    "tests/policy-preservation.mjs",
    "tests/profile-registry.mjs",
    "tests/npc-day-loop.mjs",
    "tests/catalog-cache.mjs",
    "tests/operations-v7.mjs",
    "tests/operations-v7-mount.mjs",
    "tests/native-modes-unit.mjs",
    "tests/three-formats.mjs",
    "tests/native-modes-series.mjs",
    "tests/native-legacy-regression.mjs"
  ],
  "release": [
    "tests/desktop-host.cjs"
  ],
  "roomsAndStrength": [
    "tests/rooms-and-strength.mjs",
    "tests/resource-balance.mjs",
    "tests/backend-views.mjs",
    "tests/operations-v7.mjs",
    "tests/operations-v7-mount.mjs",
    "tests/operations-v7-browser.mjs",
    "tests/day-starts.mjs",
    "tests/customer-visits.mjs",
    "tests/native-modes-unit.mjs",
    "tests/backend.mjs",
    "tests/room-format-selection-browser.mjs",
    "tests/three-formats.mjs",
    "tests/service-health.mjs",
    "tests/scroll-and-album-browser.mjs"
  ],
  "operationsV7": [
    "tests/operations-v7.mjs",
    "tests/operations-v7-mount.mjs",
    "tests/operations-v7-browser.mjs",
    "tests/day-starts.mjs",
    "tests/customer-visits.mjs",
    "tests/native-modes-unit.mjs",
    "tests/backend.mjs",
    "tests/room-format-selection-browser.mjs",
    "tests/three-formats.mjs"
  ],
  "nativeModes": [
    "tests/native-modes-unit.mjs",
    "tests/native-modes-browser.mjs",
    "tests/native-modes-series.mjs",
    "tests/native-legacy-regression.mjs"
  ],
  "audit": [
    "tests/battle-lifecycle.mjs",
    "tests/storage-archives-browser.mjs"
  ],
  "trading": [
    "tests/basket.mjs",
    "tests/trade-cards.mjs",
    "tests/trade-opening.mjs",
    "tests/trade-card-detail.mjs",
    "tests/trade-formal.mjs",
    "tests/playability-integration.mjs",
    "tests/trade-workspace-scroll.mjs",
    "tests/workspace-short-screen.mjs",
    "tests/workspace-virtualization.mjs"
  ],
  "npc": [
    "tests/customer-visits.mjs",
    "tests/gameplay-adjustments.mjs",
    "tests/shop-experience.mjs"
  ],
  "npcNatural": [
    "tests/npc-natural-browser.mjs"
  ],
  "core4": [
    "tests/core4-foundations.mjs",
    "tests/core4-economy.mjs",
    "tests/resource-balance.mjs",
  ],
  "cv6": [
    "tools/cv6/tests/run-tests.mjs",
    "tests/cv6-first-deliveries.mjs",
    "tests/feedback/feedback.test.mjs",
    "tests/cv6-frontend.mjs",
    "tests/customer-demand.mjs"
  ],
  "narrative": [
    "tests/narrative-runtime.mjs",
    "tests/world-story-browser.mjs"
  ],
  "longTerm": [
    "tests/campaign-loan.mjs",
    "tests/long-term-operations.mjs",
    "tests/long-term-browser.mjs"
  ],
  "idealYield": [
    "tests/ideal-yield-and-editions.mjs",
    "tests/pack-roster-browser.mjs"
  ],
  "structure": [
    "tests/project-structure.mjs",
    "tests/package-closure.mjs",
    "tests/catalog-cache.mjs",
    "tests/storage-retry-browser.mjs"
  ]
};
