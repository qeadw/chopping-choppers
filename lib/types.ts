// Game type definitions

export interface Position {
  x: number;
  y: number;
}

export interface Velocity {
  x: number;
  y: number;
}

export interface Player {
  position: Position;
  velocity: Velocity;
  speed: number;
  width: number;
  height: number;
  facingRight: boolean;
  isChopping: boolean;
  chopTimer: number;
}

export interface Tree {
  id: string;
  x: number;
  y: number;
  type: TreeType;
  variant: number;
  health: number;
  maxHealth: number;
  respawnTimer: number;
  isDead: boolean;
}

export enum TreeType {
  SmallPine = 0,
  LargePine = 1,
  Oak = 2,
  DeadTree = 3,
}

// Wood value, health, and hitbox by tree type
export const TREE_STATS: Record<TreeType, { health: number; woodDrop: number; hitboxRadius: number }> = {
  [TreeType.SmallPine]: { health: 2, woodDrop: 1, hitboxRadius: 6 },
  [TreeType.LargePine]: { health: 4, woodDrop: 3, hitboxRadius: 8 },
  [TreeType.Oak]: { health: 5, woodDrop: 4, hitboxRadius: 10 },
  [TreeType.DeadTree]: { health: 1, woodDrop: 1, hitboxRadius: 5 },
};

export interface WoodDrop {
  id: string;
  x: number;
  y: number;
  amount: number;
  lifetime: number;
  bobOffset: number;
}

export interface Chunk {
  x: number;
  y: number;
  trees: Tree[];
}

export interface ChunkKey {
  chunkX: number;
  chunkY: number;
}

export interface Camera {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  chop: boolean;
  interact: boolean;
}

export interface Upgrades {
  axePower: number;      // Damage per chop (starts at 1)
  moveSpeed: number;     // Speed multiplier (starts at 1)
  chopSpeed: number;     // Chop speed multiplier (starts at 1)
  carryCapacity: number; // Max wood capacity (starts at 20)
}

export const UPGRADE_COSTS = {
  axePower: [50, 150, 400, 1000, 2500],
  moveSpeed: [75, 200, 500, 1200],
  chopSpeed: [100, 300, 800, 2000],
  carryCapacity: [30, 100, 250, 600, 1500],
};

// Worker (hirable helper) types
export enum WorkerState {
  Idle = 'idle',
  MovingToTree = 'moving_to_tree',
  Chopping = 'chopping',
  Collecting = 'collecting',
  ReturningToChipper = 'returning',
  Selling = 'selling',
}

export interface Worker {
  id: string;
  position: Position;
  velocity: Velocity;
  state: WorkerState;
  targetTree: Tree | null;
  targetDrop: WoodDrop | null;
  wood: number;
  chopTimer: number;
  facingRight: boolean;
  carryCapacity: number;
  speed: number;
  chopPower: number;
}

export const WORKER_COSTS = [100, 250, 500, 1000, 2000, 4000, 8000, 15000];

export interface ChipperZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

export interface GameState {
  player: Player;
  camera: Camera;
  chunks: Map<string, Chunk>;
  input: InputState;
  wood: number;
  money: number;
  upgrades: Upgrades;
  woodDrops: WoodDrop[];
  chipper: ChipperZone;
  particles: Particle[];
  floatingTexts: FloatingText[];
  totalWoodChopped: number;
  totalMoneyEarned: number;
  workers: Worker[];
}

export interface SpriteSheet {
  trees: HTMLCanvasElement[];
  treeStumps: HTMLCanvasElement[];
  player: HTMLCanvasElement;
  playerChop: HTMLCanvasElement;
  worker: HTMLCanvasElement;
  workerChop: HTMLCanvasElement;
  workerCarry: HTMLCanvasElement;
  wood: HTMLCanvasElement;
  chipper: HTMLCanvasElement;
  axe: HTMLCanvasElement;
}

export interface GameConfig {
  chunkSize: number;
  treeCount: number;
  playerSpeed: number;
  renderDistance: number;
  pixelScale: number;
  chopRange: number;
  chopCooldown: number;
  woodPickupRange: number;
  treeRespawnTime: number;
  woodPricePerUnit: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  chunkSize: 512,
  treeCount: 225,  // 15x original density!
  playerSpeed: 150,
  renderDistance: 2,
  pixelScale: 3,
  chopRange: 40,
  chopCooldown: 0.4,
  woodPickupRange: 30,
  treeRespawnTime: 30,
  woodPricePerUnit: 5,
};
