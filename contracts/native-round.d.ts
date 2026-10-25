/** Native-round adapter only. Store Host series/progression integration is separate. */
export type NativeFormatId='doudizhu-bo3'|'versus2v2-bo3';
export interface NativeSeat {seatId:string;teamId:string;role:'landlord'|'farmer'|'teammate';controller:'human'|'ai';generalId:string;sourceRef?:string;loanRef?:string}
export interface NativeRoundPlan {
  version:1;worldId:string;branchId:string;matchId:string;gameId:string;roundId:string;
  formatId:NativeFormatId;engineMode:'doudizhu'|'versus';nativeVariant:'normal'|'two';profileId:string;
  seed:number;reserveDigest:string;playerTeamId:string;controlledSeatId:string;seats:NativeSeat[];
  firstSeatId?:string;controlPolicy?:'optional-ally'|'ai-only';
}
export interface NativeControlRequest {action:'takeover'|'release';seatId?:string;requestId?:string}
export interface NativeControlState {revision:number;primarySeatId:string;activeSeatId:string;pendingSeatId:string|null;enabled:boolean}
export interface NativeRoundMount {
  readonly frame:HTMLIFrameElement;readonly plan:NativeRoundPlan;readonly planHash:string;
  readonly ready:boolean;readonly disposed:boolean;
  control(request:NativeControlRequest):{requestId:string};
  dispose():Promise<void>;
}
/** Controller declares the initial seat. controlled reports the current engine view. */
export interface NativeSeatView extends Omit<NativeSeat,'sourceRef'|'loanRef'> {alive:boolean;hp:number;maxHp:number;handCount:number;controlled:boolean}
export interface NativeRoundEvent {
  type:'ready'|'playing'|'result'|'controlPending'|'controlChanged'|'controlRejected'|'loading'|'error';
  worldId?:string;branchId?:string;matchId?:string;gameId?:string;roundId?:string;planHash?:string;profileId?:string;
  seats?:NativeSeatView[];control?:NativeControlState;requestId?:string;code?:string;message?:string;
  resultId?:string;winningTeamId?:string|null;result?:'win'|'loss'|'draw';
  originVerified?:boolean;sourceVerified?:boolean;completed?:boolean;simulated?:boolean;
}
