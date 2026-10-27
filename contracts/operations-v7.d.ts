/** Additive Host operations. requestId uses letters, digits, underscores and hyphens only. */
export type CombatFormatId='kof'|'doudizhu-bo3'|'versus2v2-bo3';
export interface WorldProof {worldId:string;branchId:string;resourceRevision?:number}
/**
 * dialogue.offer 返回的当前对话（没有对话时为 null）。kind 由运行时写入，共四种：
 * - `talk`：普通顾客/经营伙伴闲聊，choices 含 challenge / allies / close；
 * - `stage-challenge`：高手约战，choices 为 accept|rematch / tomorrow；
 * - `debt-intro`：海玲（bd-umiri）开局借款说明，choices 为 begin；
 * - `debt-challenge`：每期还款目标会谈，choices 视进度出现 accept|rematch / goals / settled / tomorrow。
 * 债主两种 kind 的 text/choices/roleLabel 由 data/lender-dialogue.zh-CN.json 与当前目标生成，
 * 不是固定文案；`available` 只在 talk 的 allies 选项上可能出现。
 */
export interface DialogueChoice {optionId:string;text:string;available?:boolean}
export interface DialogueOffer {
  offerId:string;actorId:string;kind:'talk'|'stage-challenge'|'debt-intro'|'debt-challenge';proof:WorldProof;
  speakerName:string;portrait:string;nameColor?:string;roleLabel:string;text:string;
  choices:DialogueChoice[];
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
