export type Rarity = 'N' | 'R' | 'SR' | 'SSR';
export type * from './shop-experience';
/** ledger.live and snapshot.cashJournal: actual spendable cash delta, separate from supplier debt. */
export interface CashEntry {entryId:string;day:number;minute:number;kind:string;label:string;amount:number;debtDelta:number;balance:number;debt:number;grossIncome?:number}
export interface LiveLedger {day:number;cash:number;debt:number;items:CashEntry[]}
export interface TaskView {taskId:string;scope:'starter'|'daily';title:string;goal:number;target:number;guide:string;progress:number;reward:number;completed:boolean;claimed:boolean;autoClaim:true}
export interface StrengthPriceTier {id:string;label:string;version:string}
export type HostError = { code: string; message: string; retryable: boolean; details?: unknown };
export type Result<T = unknown> = {ok:true; revision:number; data:T} | {ok:false; error:HostError};
export interface CommandRequest { requestId:string; type:string; payload?:Record<string,unknown>; quoteId?:string; previewId?:string }
/** Distinct productId + unit rows only; duplicate rows are INVALID_INPUT. Quantity is a strict integer, 1..20. */
export interface SupplierBasketLine {productId:string;unit:'pack'|'box';quantity:number}
export interface SupplierBasketQuote {
  quoteId:string;kind:'supplier-basket';
  lines:Array<SupplierBasketLine & {themeName:string;unitAmount:number;total:number;productVersion:string;priceVersion:string}>;
  totalDebit:number;cashDebit:number;creditDebit:number;availableCash:number;supplierCreditAvailable:number;validUntil:{day:number;minute:number};
}
/** supplier.placeBasketOrder has empty payload and automatically uses supplier credit for the cash shortfall. */
export interface SupplierBasketOrderResult {
  fulfillment:'received';inventoryRefs:string[];
  orderIds:string[];
  orders:Array<{orderId:string;productId:string;themeName:string;productVersion:string;unit:'pack'|'box';quantity:number;unitCost:number;cost:number;total:number;status:'received';fulfillment:'instant';inventoryRefs:string[];receivedAt:{day:number;minute:number};dueAt:number;product:Record<string,unknown>}>;
  totalDebit:number;cashDebit:number;creditDebit:number;
}
/** inventory.list({grouped:true}); each group is one card + printing + location. */
export interface GroupedCardInventory {
  cardKey:string;name:string;imageUrl?:string;currentRarity:Rarity;printedRarity:Rarity;
  printVersion:string;location:string;inventoryRef:string;inventoryRefs:string[];availableRefs:string[];
  owned:number;available:number;protected:number;locked:number;listed:number;referencePrice:{amount:number};
}
/** inventory.sealedSummary never contains manufactured card/packet results. */
export interface SealedInventoryGroup {
  groupId:string;productId:string;productVersion:string;kind:'pack'|'box';name:string;
  owned:number;warehouse:number;available:number;onShelf:number;protected:number;locked:number;
  inventoryRefs:string[];retailRefs:string[];retired:boolean;suggestedRetail:number|null;
  spec:{cardsPerPack?:number;packsPerBox?:number;boxCounts?:Record<Rarity,number>;guarantees?:string[]};
}
export interface SealedInventorySummary {items:SealedInventoryGroup[];total:number}
/** query('player.skins'); command({type:'player.setSkin',payload:{appearanceId}}). Cosmetic, archived with world.player. */
export interface PlayerSkins { current:string; items:Array<{appearanceId:string;name:string;selected:boolean}> }
/** query player.favorites; command player.setFavorite({cardKey,favorite}). Not inventory protection. */
export interface PlayerFavorites {cardKeys:string[]}
/** room.settings; room.setTableFee({amount:number|null}). null restores base + table upgrades. */
export interface TableSettings {amount:number;automaticAmount:number;source:'automatic'|'manual';revision:number;min:0;max:1000}
/** Applied only when creating a world, before its first day-start archive; never on load/import. */
export interface StarterGiftConfig {enabled:boolean;unit:'pack'|'box';quantity:number;productId:string|null}
export interface StarterGift {version:1;status:'granted'|'disabled';productId?:string;productVersion?:string;name?:string;unit?:'pack'|'box';quantity?:number;inventoryRefs?:string[];day?:number}
/** combat.joinQueue({mode,inventoryRefs,tableId?}), combat.leaveQueue(), combat.setWaitMode({mode}). Waiting itself never pauses the world. */
export interface MatchQueueEntry {queueId:string;ownerId:string;tableId:string|null;mode:'bo3'|'kof';inventoryRefs:string[];lineup?:Array<{cardKey:string;name:string;inventoryRef:string}>;fee:number;createdAt:number;expiresAt:number;waitMode:'manual'|'wander'}
/** combat.queue. Match creation is separate from queue entry and requires an actual compatible opponent. */
export interface MatchQueueView {player:MatchQueueEntry|null;waiting:Array<{queueId:string;ownerId:string;name:string;mode:'bo3'|'kof';tableId:string|null;fee:number;expiresAt:number}>;playerMatch:Record<string,unknown>|null}
/** One session for a whole KOF/BO3 match; persisted applied prevents repeated thirty-minute advancement. NPC matches are serial. */
export interface MatchTimeSession {startedAt:{day:number;minute:number};minutes:30;applied:boolean;appliedAt?:{day:number;minute:number}}
export interface HostEvent { contractVersion:'card-shop-ui/1.0'; worldId:string; branchId:string; seq:number; revision:number; type:string; data:unknown }
export interface PauseLease {leaseId:string; ownerId:string; reason:string}
/** inventory.list({location:'trash'}) returns the shared bin, one row per actual card. */
export interface TrashCardView {
  inventoryRef:string; kind:'card'; cardKey:string; name:string; imageUrl?:string;
  printedRarity:Rarity; location:'trash'; owned:1; discardedBy?:string; discardedByName?:string; discardedDay?:number;
}
/** backend-rules.customerBehavior; missing fields use the shipped defaults, including in old saves. */
export interface CustomerBehaviorConfig {
  openingSeconds:number; sortingSeconds:number; searchSeconds:number;
  /** Optional in old saves; defaults are 18 / 120 / 12 active simulation seconds. */
  lingerSeconds?:number;maxVisitSeconds?:number;pathStallSeconds?:number;
  keepCopies:number; minimumKeptCards:number; discardChance:Record<Rarity,number>;
  scavengerChance:number; poorWallet:number; poorInitialWallet:number;
  pickupLimit:number; pickupCooldownMinutes:number;
  names:string[];
}
/** saves.days and saves.loadDay always target an actual 08:00 start snapshot. */
export interface DayStartArchive {id:string;archiveId:string;day:number;minute:480;slot:'start';branchId:string;source:'day-start';restoresDayStart:true;status:'readable'}
/** Startup registry is separate from a connected Host. Each profile has its own world database. */
export interface ProfileSummary {profileId:string;name:string;createdAt:number;worldId:string|null;day:number;minute:number;phase:string;cash:number|null;revision:number|null;days:number}
export interface UpgradeView {
  upgradeId:string; name:string; description:string; level:number; maxLevel:number;
  nextCost:number; dailyCost:number; effect:string; unlocked:boolean; unlockHint:string;
}
export interface NeighborOrderView {
  orderId:string; kind:'purchase'|'offer'; personId:string; actorId:string; cardKey:string;
  inventoryRef?:string; quantity:1; amount:number; status:'offered'|'accepted'|'completed'|'expired'|'declined';
  day:number; expiresDay:number; fundsHeld:number;
}
export interface ManagementPeopleView {
  items:Array<{personId:string;name:string;role:string;wage:number;hired:boolean;mood:string;note:string}>;
  neighbors:Array<{personId:string;name:string;relation:number;portrait:string;dialog:string;pending:NeighborOrderView|null}>;
  customers:Array<{actorId:string;name:string;appearanceId:string;budget:number;ownedCards:number;activity:string;roomId:string;x:number;y:number}>;
}
export interface NeighborAction {
  personId:string; action:'talk'|'hire'|'schedule'|'accept'|'deliver'|'decline'|'buy';
  orderId?:string; inventoryRef?:string; onDuty?:boolean;
}
export interface CombatEligibleView {
  mode:'bo3'|'kof'; slots:number;
  items:Array<{inventoryRef:string;cardKey:string;generalId:string;name:string;rarity:Rarity;eligible:boolean;
    imageUrl?:string;favorite:boolean;reasons:Array<{code:string;message:string}>;disabledReasons:Array<{code:string;message:string}>;reviewStatus:string}>;
}
export interface CardShopHost {
  connect(input:{contractVersion:'card-shop-ui/1.0';clientId:string}):Promise<{
    contractVersion:'card-shop-ui/1.0';worldId:string;branchId:string;sessionId:string;revision:number;
    currency:{code:string;label:string;minorUnit:number};capabilities:Record<string,boolean>;initialSnapshot:unknown
  }>;
  query<T=unknown>(name:string,input?:Record<string,unknown>):Promise<Result<T>>;
  command<T=unknown>(input:CommandRequest):Promise<Result<T> & {requestId:string}>;
  subscribe(listener:(event:HostEvent)=>void):()=>void;
  pause:{acquire(input:{ownerId:string;reason:string}):Promise<PauseLease>;release(leaseId:string):Promise<void>};
  world:{input(input:{sessionId:string;inputSeq:number;roomId:string;navVersion:string;direction?:'up'|'down'|'left'|'right';vector?:{x:number;y:number};destination?:{x:number;y:number};stop?:boolean}):void};
  battle:{mount(input:{container:HTMLElement;matchId:string;signal?:AbortSignal}):Promise<{dispose():void|Promise<void>}>};
  disconnect():Promise<void>;
}
