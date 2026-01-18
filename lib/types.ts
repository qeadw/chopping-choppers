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
  Birch = 4,
  Willow = 5,
  CherryBlossom = 6,
  GiantRedwood = 7,
  AncientOak = 8,
  MagicTree = 9,
  CrystalTree = 10,    // 10x rarer than Magic
  VoidTree = 11,       // 10x rarer than Crystal
  CosmicTree = 12,     // 10x rarer than Void
  DivineTree = 13,     // 10x rarer than Cosmic
  WorldTree = 14,      // 10x rarer than Divine (legendary!)
}

// Wood value, health, and hitbox by tree type (health x8 for 1 damage per hit base)
export const TREE_STATS: Record<TreeType, { health: number; woodDrop: number; hitboxRadius: number }> = {
  [TreeType.SmallPine]: { health: 16, woodDrop: 1, hitboxRadius: 6 },
  [TreeType.LargePine]: { health: 32, woodDrop: 3, hitboxRadius: 8 },
  [TreeType.Oak]: { health: 40, woodDrop: 4, hitboxRadius: 10 },
  [TreeType.DeadTree]: { health: 8, woodDrop: 1, hitboxRadius: 5 },
  [TreeType.Birch]: { health: 24, woodDrop: 2, hitboxRadius: 6 },
  [TreeType.Willow]: { health: 48, woodDrop: 5, hitboxRadius: 12 },
  [TreeType.CherryBlossom]: { health: 64, woodDrop: 8, hitboxRadius: 10 },
  [TreeType.GiantRedwood]: { health: 120, woodDrop: 15, hitboxRadius: 14 },
  [TreeType.AncientOak]: { health: 160, woodDrop: 25, hitboxRadius: 16 },
  [TreeType.MagicTree]: { health: 240, woodDrop: 50, hitboxRadius: 12 },
  [TreeType.CrystalTree]: { health: 400, woodDrop: 500, hitboxRadius: 10 },
  [TreeType.VoidTree]: { health: 600, woodDrop: 1000, hitboxRadius: 14 },
  [TreeType.CosmicTree]: { health: 1000, woodDrop: 2500, hitboxRadius: 12 },
  [TreeType.DivineTree]: { health: 1500, woodDrop: 5000, hitboxRadius: 16 },
  [TreeType.WorldTree]: { health: 2500, woodDrop: 12500, hitboxRadius: 20 },
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
  zoom: number;  // Zoom level (1 = normal, <1 = zoomed out)
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
  carryCapacity: number; // Level (starts at 1), effective = 10 * 1.5^(level-1)
}

export const UPGRADE_COSTS = {
  axePower: [50, 150, 400, 1000, 2500],
  moveSpeed: [75, 200, 500, 1200],
  chopSpeed: [100, 300, 800, 2000],
  carryCapacity: [30, 100, 250, 600, 1500],
};

// Worker (hirable helper) types
export enum WorkerType {
  Chopper = 'chopper',
  Collector = 'collector',
}

export enum WorkerState {
  Idle = 'idle',
  MovingToTree = 'moving_to_tree',
  Chopping = 'chopping',
  MovingToDrop = 'moving_to_drop',
  Collecting = 'collecting',
  ReturningToChipper = 'returning',
  Selling = 'selling',
  GoingToRest = 'going_to_rest',
  Resting = 'resting',
}

export interface Worker {
  id: string;
  type: WorkerType;
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
  // Fatigue system
  treesChopped: number;      // Trees chopped since last rest
  stamina: number;           // Current stamina (0-100)
  maxStamina: number;        // Max stamina before needing rest
  restTimer: number;         // Time left resting
  baseRestTime: number;      // Base rest duration for this worker type
  // Stuck detection
  stuckTimer: number;        // How long the worker has been stuck
  lastPosition: Position;    // Position last frame for stuck detection
  phaseTimer: number;        // Time remaining to phase through trees
}

export const CHOPPER_COSTS = [100, 150, 225, 350, 500, 750, 1100];
export const COLLECTOR_COSTS = [150, 225, 350, 500, 750, 1100, 1650];

export interface ChipperZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Shack {
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

export interface WorkerUpgrades {
  restSpeed: number;      // How fast workers recover (multiplier)
  workDuration: number;   // How long workers can work before rest (multiplier)
  workerSpeed: number;    // Worker movement speed multiplier
  workerPower: number;    // Worker power (chop damage for choppers, carry capacity for collectors)
}

export const WORKER_UPGRADE_COSTS = {
  restSpeed: [200, 500, 1200, 3000],
  workDuration: [300, 800, 2000, 5000],
  workerSpeed: [150, 400, 1000, 2500],
  workerPower: [250, 600, 1500, 4000],
};

export enum WaypointType {
  Chopper = 'chopper',
  Collector = 'collector',
  Player = 'player',
}

export interface Waypoint {
  id: string;
  x: number;
  y: number;
  type: WaypointType;
}

export interface GameState {
  player: Player;
  camera: Camera;
  chunks: Map<string, Chunk>;
  input: InputState;
  wood: number;
  money: number;
  upgrades: Upgrades;
  workerUpgrades: WorkerUpgrades;
  woodDrops: WoodDrop[];
  chipper: ChipperZone;
  shack: Shack;
  particles: Particle[];
  floatingTexts: FloatingText[];
  totalWoodChopped: number;
  totalMoneyEarned: number;
  workers: Worker[];
  showStumpTimers: boolean;
  worldSeed: number;
  clearedChunks: Set<string>;  // Chunks that were fully cleared at once (gold bordered)
  platinumChunks: Set<string>; // Chunks cleared in challenge mode (platinum bordered)
  challengeChunks: Set<string>; // Chunks with challenge mode enabled (2x health, 2x drops)
  chunkToggleCooldowns: Map<string, number>; // Cooldown timers for chunk toggles (5 min)
  choppersEnabled: boolean;  // Whether choppers are active
  collectorsEnabled: boolean; // Whether collectors are active
  waypoints: Waypoint[];  // Worker waypoints for directing them
  playerWaypoint: { x: number; y: number } | null;  // Player navigation waypoint
}

export interface SpriteSheet {
  trees: HTMLCanvasElement[];
  treeStumps: HTMLCanvasElement[];
  player: HTMLCanvasElement;
  playerChop: HTMLCanvasElement;
  worker: HTMLCanvasElement;
  workerChop: HTMLCanvasElement;
  workerCarry: HTMLCanvasElement;
  workerSleep: HTMLCanvasElement;
  wood: HTMLCanvasElement;
  chipper: HTMLCanvasElement;
  shack: HTMLCanvasElement;
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
  treeCount: 16,   // Base tree count, actual is 12-20 random
  playerSpeed: 150,
  renderDistance: 2,
  pixelScale: 3,
  chopRange: 40,
  chopCooldown: 0.4,
  woodPickupRange: 30,
  treeRespawnTime: 300,  // 5 minutes
  woodPricePerUnit: 5,
};
