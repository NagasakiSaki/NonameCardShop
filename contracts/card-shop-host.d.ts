export type Rarity = 'N' | 'R' | 'SR' | 'SSR';
export type HostError = { code: string; message: string; retryable: boolean; details?: unknown };
export type Result<T = unknown> = {ok:true; revision:number; data:T} | {ok:false; error:HostError};
export interface CommandRequest { requestId:string; type:string; payload?:Record<string,unknown>; quoteId?:string; previewId?:string }
export interface HostEvent { contractVersion:'card-shop-ui/1.0'; worldId:string; branchId:string; seq:number; revision:number; type:string; data:unknown }
export interface PauseLease {leaseId:string; ownerId:string; reason:string}
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
    reasons:Array<{code:string;message:string}>;disabledReasons:Array<{code:string;message:string}>;reviewStatus:string}>;
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
  world:{input(input:{sessionId:string;inputSeq:number;roomId:string;navVersion:string;direction?:'up'|'down'|'left'|'right';destination?:{x:number;y:number};stop?:boolean}):void};
  battle:{mount(input:{container:HTMLElement;matchId:string;signal?:AbortSignal}):Promise<{dispose():void|Promise<void>}>};
  disconnect():Promise<void>;
}
