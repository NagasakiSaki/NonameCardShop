// frontend/host/contract-types.d.ts
// 契约 card-shop-ui/1.0 的只读类型镜像。仅用于编辑器提示，前端不引入 TS 编译器。
// 权威定义在 contracts/（主模型维护）；本文件不参与运行。

export type ContractVersion = "card-shop-ui/1.0";
export type Rarity = "N" | "R" | "SR" | "SSR";
export type CardKey = string; // 不透明业务 ID，禁止从中文名或文件名推导

export type HostError = {
  code: string;
  message: string;
  retryable: boolean;
  details?: unknown;
};

export type PauseLease = { leaseId: string; ownerId: string; reason: string };

export type QueryResult<T> =
  | { ok: true; revision: number; data: T }
  | { ok: false; error: HostError };

export type CommandRequest = {
  requestId: string;
  type: string;
  payload?: Record<string, unknown>;
  quoteId?: string;
  previewId?: string;
};

export type CommandResult<T> =
  | { ok: true; requestId: string; revision: number; data: T }
  | { ok: false; requestId: string; error: HostError };

export type HostEvent = {
  contractVersion: ContractVersion;
  worldId: string;
  branchId: string;
  seq: number;
  revision: number;
  type:
    | "snapshotUpdated"
    | "actorsUpdated"
    | "operationUpdated"
    | "notification"
    | "battleStatusChanged"
    | "worldReset"
    | "connectionChanged";
  data: unknown;
};

export type ConnectResult = {
  contractVersion: ContractVersion;
  worldId: string;
  branchId: string;
  sessionId: string;
  revision: number;
  currency: { code: string; label: string; minorUnit: number };
  capabilities: Record<string, boolean>;
  initialSnapshot: ShopSnapshot;
};

export type ClockState = {
  day: number;
  minute: number; // 0..1439
  phase: "preparing" | "open" | "closing" | "closed";
  speed: number;
  running: boolean;
  pauseReasons: Array<{ code: string; label: string }>;
};

export type ShopSnapshot = {
  worldId: string;
  branchId: string;
  revision: number;
  clock: ClockState;
  wallet: { available: number; debt: number; escrowLiability: number };
  allowedActions: string[];
};

export type CardSummary = {
  cardKey: CardKey;
  generalId: string;
  skillVersion: string;
  name: string;
  imageUrl: string;
  currentRarity: Rarity;
  globalScore: number | null;
  ratingVersion: string;
  reviewStatus: "calibrated" | "estimated" | "needs-review";
};

export type InventoryRow = {
  inventoryRef: string;
  cardKey: CardKey;
  printVersion: string;
  printedRarity: Rarity;
  location: string;
  owned: number;
  available: number;
  protected: number;
  locked: number;
  listed: number;
  eligible: boolean;
  disabledReasons: Array<{ code: string; message: string }>;
};

export type ProductSummary = {
  productId: string;
  themeId: string;
  productVersion: string;
  ratingVersion: string;
  priceVersion: string;
  cardsPerPack: number;
  packsPerBox: number;
  poolSummary: Record<Rarity, number>;
  boxCounts: Record<Rarity, number>;
  packExpectedCounts: Record<Rarity, number>;
  packAtLeastOneProbabilities: Record<Rarity, number>;
  guarantees: string[];
  substitutionSummary: string | null;
  availability: "available" | "unavailable";
  unavailableReason: string | null;
};

export type Quote = {
  quoteId: string;
  productVersion?: string;
  priceVersion: string;
  quantity: number;
  unitAmount: number;
  subtotal: number;
  feeAmount: number;
  totalDebit: number;
  totalCredit: number;
  validUntil: { day: number; minute: number } | null;
  explanation: string[];
};

export type WorldInput = {
  sessionId: string;
  inputSeq: number;
  roomId: string;
  navVersion: string;
  direction?: "up" | "down" | "left" | "right";
  vector?: {x:number;y:number};
  destination?: { x: number; y: number };
  stop?: boolean;
};

export type ActorState = {
  actorId: string;
  appearanceId: string;
  roomId: string;
  x: number;
  y: number;
  direction: "up" | "down" | "left" | "right";
  moving: boolean;
  activity: string;
  label?: string;
  navVersion: string;
};

export interface CardShopHost {
  connect(input: { contractVersion: ContractVersion; clientId: string }): Promise<ConnectResult>;
  query<T = unknown>(name: string, input?: Record<string, unknown>): Promise<QueryResult<T>>;
  command<T = unknown>(input: CommandRequest): Promise<CommandResult<T>>;
  subscribe(listener: (event: HostEvent) => void): () => void;
  pause: {
    acquire(input: { ownerId: string; reason: string }): Promise<PauseLease>;
    release(leaseId: string): Promise<void>;
  };
  world: { input(input: WorldInput): void };
  battle: { mount(input: { container: HTMLElement; matchId: string }): Promise<{ dispose(): void }> };
  disconnect(): Promise<void>;
}
