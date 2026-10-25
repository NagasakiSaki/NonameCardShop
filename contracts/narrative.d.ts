/** Additive to card-shop-ui/1.0. Runtime API, state, content revision and engine profile version independently. */
export type NarrativeApiVersion='card-shop-narrative/1';
export type NarrativeNodeType='line'|'choice'|'branch'|'wait'|'action'|'cue'|'transition'|'end'|(string & {});
export type NarrativeStatus='idle'|'disabled'|'unavailable'|'unsupported'|'presenting'|'waiting'|'deferred'|'completed'|'suspended';
export interface NarrativeIdentity {worldId:string;branchId:string}
/** Cursor revision is scoped to this session, not the rapidly changing world revision. */
export interface NarrativeProof extends NarrativeIdentity {sessionId:string;nodeId:string;cursorRevision:number;contentHash:string}
export interface NarrativeSessionView {
  apiVersion:NarrativeApiVersion;status:NarrativeStatus;proof?:NarrativeProof;
  campaignId?:string;chapterId?:string;title?:string;nodeType?:NarrativeNodeType;text?:string;
  speaker?:{personId:string;name:string;appearanceId:string|null;binding:'contact'}|null;
  choices?:Array<{choiceId:string;text:string;available:boolean;reason:string}>;
  wait?:{message:string}|null;cue?:{cueId:string;skippable:boolean}|null;
  confirmation?:{message:string}|null;presentation?:unknown;message?:string|null;
}
export interface NarrativeAvailability {
  apiVersion:NarrativeApiVersion;enabled:boolean;contentAvailable:boolean;diagnostics:string[];
  items:Array<{campaignId:string;chapterId:string;title:string;status:string;available:boolean;reason:string|null}>;
  active:NarrativeSessionView;
  capabilities:{nodes:string[];actions:string[];predicates:string[]};
}
export type NarrativeCommand =
  | {type:'narrative.enable';payload:NarrativeIdentity}
  | {type:'narrative.start';payload:NarrativeIdentity & {campaignId:string;chapterId:string}}
  | {type:'narrative.advance';payload:NarrativeProof & {confirm?:boolean}}
  | {type:'narrative.choose';payload:NarrativeProof & {choiceId:string}}
  | {type:'narrative.defer';payload:NarrativeProof};
/** Add a stable requestId to every command; unknown outcomes reconcile or retry the original requestId. */
export type NarrativeCommandRequest=NarrativeCommand & {requestId:string};
export interface NarrativeActionDescriptor {
  version:1;authorityEffects:string[];confirmationRequired?:boolean;
  /** Required for actions needing confirmation. Pure, player-facing text, with no mutation. */
  describe?:(context:Readonly<unknown>,params:unknown)=>string;
  validate:(params:unknown,flags:ReadonlyMap<string,unknown>)=>string[];
  /** Synchronous on the current world fork. Never call/await Host.command or external services. */
  run:(context:unknown,params:unknown)=>unknown;
  /** Coded, expected business failures restore a savepoint before entering onFailure. */
  handledErrors?:string[];
}
export interface NarrativePredicateDescriptor {
  version:1;validate:(params:unknown)=>string[];
  /** Pure. Tests must assert repeated queries do not mutate world, RNG, money or progress. */
  test:(context:Readonly<unknown>,params:unknown)=>boolean;
}
/** Trusted code only; content files carry IDs and JSON parameters, never functions. */
export interface NarrativeNodeDescriptor {
  version:1;boundary:boolean;
  validate:(node:unknown,checks:{error:(message:string)=>void;ref:(id:unknown,label:string)=>void;condition:(value:unknown)=>string[]})=>void;
  step:(node:unknown,context:unknown)=>{target?:string;boundary?:string};
  advance?:(node:unknown,context:unknown,payload:unknown)=>{target:string};
  present?:(node:unknown,context:Readonly<unknown>)=>unknown;
}
export interface NarrativeExtensions {
  actions?:Record<string,NarrativeActionDescriptor>;
  predicates?:Record<string,NarrativePredicateDescriptor>;
  nodes?:Record<string,NarrativeNodeDescriptor>;
  eventTypes?:string[];
}
