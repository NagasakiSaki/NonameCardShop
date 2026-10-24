/** Compatible additions to card-shop-ui/1.0; authoritative backend data, not Mock APIs. */
export type FeedbackReason = 'out-of-stock'|'budget'|'price'|'queue-timeout'|'table-full'|'no-offer'|'closed'|'technical';
export type VisitOutcome = 'purchased'|'played'|'scavenged'|'unconverted'|'interrupted';
export type ExperienceMetric = 'ordered'|'received'|'opened'|'sales'|'marketSales'|'shelved'|'daysClosed'|'regularTalks'|'upgrades'|'communityEvents';
export interface CustomerIntent {kind:'shopping'|'single'|'sealed'|'scavenge'|'event';label:string;cardKey?:string;productId?:string;unit?:'pack'|'box'}
export interface ExperienceStep {
  id:string;day:number;title:string;text:string;guide:string;optional:boolean;
  goals:Array<{metric:ExperienceMetric;target:number}>;
}
export interface CommunityEventDefinition {id:string;title:string;description:string;minDay:number;requiredPlayers:2;matchesRequired:number}
export interface ShopExperienceConfig {version:1;storyLimit:number;steps:ExperienceStep[];event:CommunityEventDefinition}
export interface ExperienceGuide {
  version:1;day:number;skipped:boolean;note:string;
  steps:Array<ExperienceStep & {available:boolean;completed:boolean;goals:Array<{metric:ExperienceMetric;target:number;progress:number;completed:boolean}>}>;
  next:ExperienceGuide['steps'][number]|null;
}
export interface CommunityEvent {
  eventId:string;title:string;description:string;day:number;minDay:number;requiredPlayers:2;
  status:'scheduled'|'completed'|'ended';actorIds:string[];completedMatches:number;matchesRequired:number;matchIds:string[];
}
export interface ExperienceEvents {
  day:number;available:boolean;reasons:Array<{code:string;message:string}>;
  proposal:CommunityEventDefinition;eligibleActors:Array<{actorId:string;name:string}>;items:CommunityEvent[];
}
export interface ExperienceStory {
  storyId:string;sourceEventId:string;type:'recovered-card'|'recovered-card-win'|'community-event';
  day:number;minute:number;text:string;actorId?:string;actorName:string;
  discardedBy?:string;cardKey?:string;cardName?:string;imageUrl?:string;inventoryRef?:string;
  matchId?:string;simulated?:boolean;eventId?:string;title?:string;
}
export interface ExperienceSnapshot {
  coverage:'complete'|'partial';guideSkipped:boolean;arrived:number;departed:number;lastStoryId:string|null;
  event:Pick<CommunityEvent,'eventId'|'title'|'status'|'completedMatches'|'matchesRequired'>|null;
}
export interface ExperienceProduct {
  productId:string;name:string;kind:'pack'|'box';sold:number;revenue:number;stockoutVisits:number;
  /** Only on the current day; counts are physical pack/box units, not equivalent packets. */
  warehouse?:number;availableWarehouse?:number;onShelf?:number;inTransit?:number;
  averageStrength?:number|null;priceTier?:{id:string;label:string;version:string}|null;referenceWholesale?:number|null;
}
export interface ManagementInsights {
  day:number;coverage:'complete'|'partial';trackingSince:{day:number;minute:number};
  visits:{arrived:number;departed:number;active:number;outcomes:Record<VisitOutcome,number>;
    unconvertedReasons:Array<{code:FeedbackReason;label:string;count:number}>;
    issueVisits:Array<{code:FeedbackReason;label:string;count:number}>;note:string};
  products:ExperienceProduct[];
  suggestions:Array<{code:string;text:string;evidence:Record<string,number>;guide:string}>;
  cash:{opening:number;closing:number|null;change:number|null;debtChange:number|null;taskRewards:number};
  /** Omitted for historical days; identities and appearance never determine wallet/behavior. */
  customers?:Array<{actorId:string;name:string;category:string;intent:CustomerIntent|null;activity:string;label:string;lastIssue:FeedbackReason|null}>;
}
