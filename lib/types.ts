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

// Wood value, health, hitbox, and spawn chance by tree type (health x8 for 1 damage per hit base)
export const TREE_STATS: Record<TreeType, { health: number; woodDrop: number; hitboxRadius: number; spawnChance: string }> = {
  [TreeType.SmallPine]: { health: 16, woodDrop: 1, hitboxRadius: 6, spawnChance: '50%' },
  [TreeType.LargePine]: { health: 32, woodDrop: 3, hitboxRadius: 8, spawnChance: '25%' },
  [TreeType.Oak]: { health: 40, woodDrop: 4, hitboxRadius: 10, spawnChance: '12.5%' },
  [TreeType.DeadTree]: { health: 8, woodDrop: 1, hitboxRadius: 5, spawnChance: '6.25%' },
  [TreeType.Birch]: { health: 24, woodDrop: 2, hitboxRadius: 6, spawnChance: '3.125%' },
  [TreeType.Willow]: { health: 48, woodDrop: 5, hitboxRadius: 12, spawnChance: '1.56%' },
  [TreeType.CherryBlossom]: { health: 64, woodDrop: 8, hitboxRadius: 10, spawnChance: '0.78%' },
  [TreeType.GiantRedwood]: { health: 120, woodDrop: 15, hitboxRadius: 14, spawnChance: '0.39%' },
  [TreeType.AncientOak]: { health: 160, woodDrop: 25, hitboxRadius: 16, spawnChance: '0.2%' },
  [TreeType.MagicTree]: { health: 240, woodDrop: 50, hitboxRadius: 12, spawnChance: '0.1%' },
  [TreeType.CrystalTree]: { health: 400, woodDrop: 500, hitboxRadius: 10, spawnChance: '0.01%' },
  [TreeType.VoidTree]: { health: 600, woodDrop: 1000, hitboxRadius: 14, spawnChance: '0.001%' },
  [TreeType.CosmicTree]: { health: 1000, woodDrop: 2500, hitboxRadius: 12, spawnChance: '0.0001%' },
  [TreeType.DivineTree]: { health: 1500, woodDrop: 5000, hitboxRadius: 16, spawnChance: '0.00001%' },
  [TreeType.WorldTree]: { health: 2500, woodDrop: 12500, hitboxRadius: 35, spawnChance: '0.000001%' },
};

export interface WoodDrop {
  id: string;
  x: number;
  y: number;
  amount: number;
  lifetime: number;
  bobOffset: number;
}

export interface AppleDrop {
  id: string;
  x: number;
  y: number;
}

export interface ApplePile {
  x: number;
  y: number;
  count: number;
}

export interface AppleBuff {
  active: boolean;
  remainingTime: number;
  speedMultiplier: number;
  damageMultiplier: number;
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

// Tree chop milestones - bonuses for chopping certain amounts of trees
// Each milestone gives a small buff. Scale amount needed by rarity.
export const TREE_CHOP_MILESTONES: Record<TreeType, { perMilestone: number; bonusType: 'speed' | 'power' | 'chopSpeed'; bonusPercent: number }> = {
  [TreeType.SmallPine]: { perMilestone: 1000, bonusType: 'speed', bonusPercent: 1 },         // +1% speed per 1000
  [TreeType.LargePine]: { perMilestone: 500, bonusType: 'power', bonusPercent: 1 },          // +1% power per 500
  [TreeType.Oak]: { perMilestone: 250, bonusType: 'chopSpeed', bonusPercent: 1 },            // +1% chop speed per 250
  [TreeType.DeadTree]: { perMilestone: 500, bonusType: 'speed', bonusPercent: 2 },           // +2% speed per 500
  [TreeType.Birch]: { perMilestone: 200, bonusType: 'power', bonusPercent: 2 },              // +2% power per 200
  [TreeType.Willow]: { perMilestone: 100, bonusType: 'chopSpeed', bonusPercent: 2 },         // +2% chop speed per 100
  [TreeType.CherryBlossom]: { perMilestone: 50, bonusType: 'speed', bonusPercent: 3 },       // +3% speed per 50
  [TreeType.GiantRedwood]: { perMilestone: 25, bonusType: 'power', bonusPercent: 3 },        // +3% power per 25
  [TreeType.AncientOak]: { perMilestone: 10, bonusType: 'chopSpeed', bonusPercent: 3 },      // +3% chop speed per 10
  [TreeType.MagicTree]: { perMilestone: 5, bonusType: 'speed', bonusPercent: 5 },            // +5% speed per 5
  [TreeType.CrystalTree]: { perMilestone: 3, bonusType: 'power', bonusPercent: 5 },          // +5% power per 3
  [TreeType.VoidTree]: { perMilestone: 2, bonusType: 'chopSpeed', bonusPercent: 5 },         // +5% chop speed per 2
  [TreeType.CosmicTree]: { perMilestone: 1, bonusType: 'speed', bonusPercent: 10 },          // +10% speed per 1
  [TreeType.DivineTree]: { perMilestone: 1, bonusType: 'power', bonusPercent: 10 },          // +10% power per 1
  [TreeType.WorldTree]: { perMilestone: 1, bonusType: 'chopSpeed', bonusPercent: 15 },       // +15% chop speed per 1
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
  MovingToApple = 'moving_to_apple',
  CollectingApple = 'collecting_apple',
  ReturningWithApple = 'returning_with_apple',
  Escorting = 'escorting',  // Following the player in squad mode
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
  // Search expansion
  searchRadius: number;      // Extra chunks to search (0-5)
  // Apple collection (collectors only)
  targetApple: AppleDrop | null;
  carryingApple: boolean;
  // Escort/squad mode
  isEscorting: boolean;      // Whether this worker is following the player
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
  restSpeed: [100, 250, 600, 1500],
  workDuration: [150, 400, 1000, 2500],
  workerSpeed: [75, 200, 500, 1250],
  workerPower: [125, 300, 750, 2000],
};

export enum WaypointType {
  Chopper = 'chopper',
  Collector = 'collector',
  CollectorWood = 'collector_wood',  // Alternative waypoint for wood collection
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
  // Chunk completion tiers (each tier unlocks the next challenge level)
  bronzeChunks: Set<string>;   // Tier 1: First clear (bronze bordered)
  silverChunks: Set<string>;   // Tier 2: Clear bronze challenge 2x (silver bordered)
  goldChunks: Set<string>;     // Tier 3: Clear silver challenge 4x (gold bordered)
  platinumChunks: Set<string>; // Tier 4: Clear gold challenge 8x (platinum bordered)
  challengeChunks: Set<string>; // Chunks with challenge mode enabled
  chunkToggleCooldowns: Map<string, number>; // Cooldown timers for chunk toggles (5 min)
  choppersEnabled: boolean;  // Whether choppers are active
  collectorsEnabled: boolean; // Whether collectors are active
  waypoints: Waypoint[];  // Worker waypoints for directing them
  playerWaypoint: { x: number; y: number } | null;  // Player navigation waypoint
  // Apple feature
  appleDrops: AppleDrop[];
  applePile: ApplePile;
  appleBuff: AppleBuff;
  // Tree checklist - tracks which tree types have been chopped
  choppedTreeTypes: Set<TreeType>;
  // Tree chopped counts - tracks how many of each type have been chopped
  treeChoppedCounts: Map<TreeType, number>;
  // Apple drop notification
  appleDropNotification: { active: boolean; timer: number };
  // Chunks with tree respawning disabled (high tier chunks only)
  noRespawnChunks: Set<string>;
  // UI visibility
  uiHidden: boolean;
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
  apple: HTMLCanvasElement;
  applePile: HTMLCanvasElement;
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
