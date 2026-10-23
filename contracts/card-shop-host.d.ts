export type Rarity = 'N' | 'R' | 'SR' | 'SSR';
export type HostError = { code: string; message: string; retryable: boolean; details?: unknown };
export type Result<T = unknown> = {ok:true; revision:number; data:T} | {ok:false; error:HostError};
export interface CommandRequest { requestId:string; type:string; payload?:Record<string,unknown>; quoteId?:string; previewId?:string }
export interface HostEvent { contractVersion:'card-shop-ui/1.0'; worldId:string; branchId:string; seq:number; revision:number; type:string; data:unknown }
export interface PauseLease {leaseId:string; ownerId:string; reason:string}
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
  battle:{mount(input:{container:HTMLElement;matchId:string}):Promise<{dispose():void}>};
  disconnect():Promise<void>;
}
