/** Additive Host operations. requestId uses letters, digits, underscores and hyphens only. */
export type CombatFormatId='bo3'|'kof'|'doudizhu-bo3'|'versus2v2-bo3';
export interface WorldProof {worldId:string;branchId:string;resourceRevision?:number}
export interface DialogueOffer {
  offerId:string;actorId:string;kind:'talk'|'stage-challenge';proof:WorldProof;
  speakerName:string;portrait:string;nameColor?:string;roleLabel:string;text:string;
  choices:Array<{optionId:string;text:string;available?:boolean}>;
}
export interface PrepareSeries {
  formatId:CombatFormatId;reserveRefs:string[];opponentId?:string|null;
  tableId?:string|null;proof?:WorldProof;
}
export interface SelectRound {
  matchId:string;roundId:string;expectedRevision?:number;
  selections:Array<{seatId:string;inventoryRef:string}>;proof?:WorldProof;
}
export interface AllyDuty {allyId:string;dutyId:'attraction'|'checkout'|'wholesale'|null;proof?:WorldProof}
export interface AllyEffects {attractionRate:number;checkoutReductionRate:number;wholesaleDiscountRate:number}
/** Separate mounted-engine operation, never a UI-reported win or a series mutation. */
export interface BattleControl {matchId:string;action:'takeover'|'release';seatId?:string;requestId:string}
/** Queries remain read-only; series without matchId returns the active series, or null. */
export interface OperationsV7Queries {
  'combat.formats':Record<string,unknown>;
  'combat.series':Record<string,unknown>|null;
  'combat.roundPlan':import('./native-round').NativeRoundPlan|Record<string,unknown>;
  'dialogue.offer':DialogueOffer|null;
  'progression.status':Record<string,unknown>;
  'challenges.status':Record<string,unknown>;
  'allies.list':Record<string,unknown>;
}
