import {
  GameState,
  GameConfig,
  DEFAULT_CONFIG,
  SpriteSheet,
  WoodDrop,
  Particle,
  FloatingText,
  Tree,
  TreeType,
  Worker,
  WorkerType,
  WorkerState,
  TREE_STATS,
  UPGRADE_COSTS,
  CHOPPER_COSTS,
  COLLECTOR_COSTS,
  WORKER_UPGRADE_COSTS,
  Position,
  Waypoint,
  WaypointType,
  AppleDrop,
} from '../types';
import { createPlayer, updatePlayer, createCamera, updateCamera, canChop, startChop } from './player';
import { createInputState, setupInputHandlers } from './input';
import { updateChunks, updateTrees, damageTree, generateChunk } from './forest';
import { render } from './renderer';
import { createSpriteSheet } from './sprites';

let dropIdCounter = 0;
let workerIdCounter = 0;
let waypointIdCounter = 0;
let appleIdCounter = 0;

const SAVE_KEY = 'chopping_choppers_save';
const SAVE_INTERVAL = 5000; // Save every 5 seconds
const SAVE_VERSION = 'CC1:';
const OBF_KEY = 'ChoppingChoppers2024';

function obfuscateSave(data: string): string {
  let result = '';
  for (let i = 0; i < data.length; i++) {
    result += String.fromCharCode(data.charCodeAt(i) ^ OBF_KEY.charCodeAt(i % OBF_KEY.length));
  }
  return SAVE_VERSION + btoa(result);
}

function deobfuscateSave(data: string): string {
  if (!data.startsWith(SAVE_VERSION)) return data; // Legacy save
  const encoded = data.slice(SAVE_VERSION.length);
  const decoded = atob(encoded);
  let result = '';
  for (let i = 0; i < decoded.length; i++) {
    result += String.fromCharCode(decoded.charCodeAt(i) ^ OBF_KEY.charCodeAt(i % OBF_KEY.length));
  }
  return result;
}

interface DeadTreeData {
  id: string;
  respawnTimer: number;
}

interface WorkerSaveData {
  type: 'chopper' | 'collector';
  wood: number;
  stamina: number;
  restTimer: number;
  state: string;
}

interface WoodDropSaveData {
  x: number;
  y: number;
  amount: number;
  lifetime: number;
}

interface SaveData {
  money: number;
  wood?: number;  // Player's carried wood
  upgrades: {
    axePower: number;
    moveSpeed: number;
    chopSpeed: number;
    carryCapacity: number;
  };
  workerUpgrades: {
    restSpeed: number;
    workDuration: number;
    workerSpeed: number;
    workerPower: number;
  };
  totalWoodChopped: number;
  totalMoneyEarned: number;
  chopperCount: number;
  collectorCount: number;
  deadTrees?: DeadTreeData[];
  workers?: WorkerSaveData[];
  worldSeed?: number;
  woodDrops?: WoodDropSaveData[];
  clearedChunks?: string[];  // Chunks that were fully cleared at once
  platinumChunks?: string[]; // Chunks cleared in challenge mode
  challengeChunks?: string[]; // Chunks with challenge mode enabled
  chunkToggleCooldowns?: { key: string; time: number }[]; // Cooldown timers
  choppersEnabled?: boolean;
  collectorsEnabled?: boolean;
  waypoints?: { x: number; y: number; type: string }[];
  playerWaypoint?: { x: number; y: number } | null;
  // Apple feature
  appleDrops?: { x: number; y: number }[];
  applePileCount?: number;
  appleBuffRemaining?: number;
  // Tree checklist
  choppedTreeTypes?: number[];
  treeChoppedCounts?: { type: number; count: number }[];
  // No-respawn chunks
  noRespawnChunks?: string[];
}

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private state: GameState;
  private config: GameConfig;
  private sprites: SpriteSheet;
  private lastTime: number = 0;
  private animationId: number = 0;
  private cleanupInput: () => void;
  private pendingChop: boolean = false;
  private upgradeKeyHandler: (e: KeyboardEvent) => void;
  private hireKeyHandler: (e: KeyboardEvent) => void;
  private wheelHandler: (e: WheelEvent) => void;
  private clickHandler: (e: MouseEvent) => void;
  private contextMenuHandler: (e: MouseEvent) => void;
  private beforeUnloadHandler: () => void;
  private visibilityHandler: () => void;
  private saveIntervalId: number = 0;
  private deadTreesMap: Map<string, number> = new Map(); // tree ID -> respawn timer
  private tabAwayTime: number = 0; // Timestamp when user tabbed away
  private catchUpTimeRemaining: number = 0; // Time left to simulate at accelerated rate
  private waypointPlacementMode: WaypointType | null = null; // Current waypoint placement mode
  private regenCooldown: number = 0; // Cooldown timer for regenerate chunks button
  private saveBuffer: string = ''; // Buffer for detecting "save" typed
  public onSaveRequested: (() => void) | null = null; // Callback when save modal requested
  private stopped: boolean = false; // Prevent double-stop from saving twice
  private cheatMenuOpen: boolean = false; // Whether cheat menu is visible
  private treeChecklistOpen: boolean = false; // Whether tree checklist is visible

  // Generate a unique world seed using crypto API for better randomness
  private generateWorldSeed(): number {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const array = new Uint32Array(1);
      crypto.getRandomValues(array);
      return array[0];
    }
    // Fallback to Math.random with timestamp for uniqueness
    return Math.floor(Math.random() * 2147483647) ^ Date.now();
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.config = { ...DEFAULT_CONFIG };
    this.sprites = createSpriteSheet();

    // Initialize game state
    const inputState = createInputState();
    this.cleanupInput = setupInputHandlers(inputState);

    this.state = {
      player: createPlayer(),
      camera: createCamera(
        canvas.width / this.config.pixelScale,
        canvas.height / this.config.pixelScale
      ),
      chunks: new Map(),
      input: inputState,
      wood: 0,
      money: 0,
      upgrades: {
        axePower: 1,
        moveSpeed: 1,
        chopSpeed: 1,
        carryCapacity: 1,  // Level-based, effective = 10 * 1.5^(level-1)
      },
      workerUpgrades: {
        restSpeed: 1,
        workDuration: 1,
        workerSpeed: 1,
        workerPower: 1,
      },
      woodDrops: [],
      chipper: {
        x: -50,
        y: -50,
        width: 36,
        height: 28,
      },
      shack: {
        x: 50,
        y: -50,
        width: 40,
        height: 36,
      },
      particles: [],
      floatingTexts: [],
      totalWoodChopped: 0,
      totalMoneyEarned: 0,
      workers: [],
      showStumpTimers: true,
      worldSeed: this.generateWorldSeed(),
      clearedChunks: new Set<string>(),
      platinumChunks: new Set<string>(),
      challengeChunks: new Set<string>(),
      chunkToggleCooldowns: new Map<string, number>(),
      choppersEnabled: true,
      collectorsEnabled: true,
      waypoints: [],
      playerWaypoint: null,
      // Apple feature
      appleDrops: [],
      applePile: { x: -90, y: -50, count: 0 },  // Left of chipper
      appleBuff: { active: false, remainingTime: 0, speedMultiplier: 5, damageMultiplier: 2 },
      // Tree checklist
      choppedTreeTypes: new Set(),
      treeChoppedCounts: new Map(),
      // Apple drop notification
      appleDropNotification: { active: false, timer: 0 },
      // No-respawn chunks
      noRespawnChunks: new Set(),
      // UI visibility
      uiHidden: false,
    };

    // Load saved progress
    this.loadProgress();

    // Generate initial chunks around player
    updateChunks(this.state.chunks, this.state.camera, this.config, this.state.worldSeed);

    // Setup auto-save
    this.saveIntervalId = window.setInterval(() => this.saveProgress(), SAVE_INTERVAL);

    // Save on page close/refresh
    this.beforeUnloadHandler = () => this.saveProgress();
    window.addEventListener('beforeunload', this.beforeUnloadHandler);

    // Setup upgrade key handler
    this.upgradeKeyHandler = (e: KeyboardEvent) => {
      if (e.key >= '1' && e.key <= '8') {
        this.handleUpgrade(parseInt(e.key));
      }
    };
    window.addEventListener('keydown', this.upgradeKeyHandler);

    // Setup hire worker key handler (J = Chopper, K = Collector, T = Toggle timers)
    // C = Toggle choppers, V = Toggle collectors
    // When zoomed out: Q = Place chopper waypoint, R = Place collector waypoint, X = Clear waypoints
    this.hireKeyHandler = (e: KeyboardEvent) => {
      // Save code detection
      if (e.key.length === 1) {
        this.saveBuffer = (this.saveBuffer + e.key).slice(-4);
        if (this.saveBuffer.toLowerCase() === 'save') {
          this.saveBuffer = '';
          if (this.onSaveRequested) {
            this.onSaveRequested();
          }
          return;
        }
      }

      const key = e.key.toLowerCase();
      if (key === 'j') {
        this.hireWorker(WorkerType.Chopper);
      } else if (key === 'k') {
        this.hireWorker(WorkerType.Collector);
      } else if (key === 't') {
        this.state.showStumpTimers = !this.state.showStumpTimers;
      } else if (key === 'c') {
        // Toggle choppers
        this.state.choppersEnabled = !this.state.choppersEnabled;
        const status = this.state.choppersEnabled ? 'ENABLED' : 'DISABLED';
        this.addFloatingText(this.state.player.position.x, this.state.player.position.y - 30, `Choppers ${status}`, this.state.choppersEnabled ? '#00FF00' : '#FF4444');
      } else if (key === 'v') {
        // Toggle collectors
        this.state.collectorsEnabled = !this.state.collectorsEnabled;
        const status = this.state.collectorsEnabled ? 'ENABLED' : 'DISABLED';
        this.addFloatingText(this.state.player.position.x, this.state.player.position.y - 30, `Collectors ${status}`, this.state.collectorsEnabled ? '#00FF00' : '#FF4444');
      } else if (key === 'q' && this.state.camera.zoom <= 0.15) {
        // Toggle chopper waypoint placement mode
        if (this.waypointPlacementMode === WaypointType.Chopper) {
          this.waypointPlacementMode = null;
        } else {
          this.waypointPlacementMode = WaypointType.Chopper;
          this.addFloatingText(this.state.player.position.x, this.state.player.position.y - 30, 'Click to place CHOPPER waypoint', '#5A9C5A');
        }
      } else if (key === 'r' && this.state.camera.zoom <= 0.15) {
        // Toggle collector waypoint placement mode
        if (this.waypointPlacementMode === WaypointType.Collector) {
          this.waypointPlacementMode = null;
        } else {
          this.waypointPlacementMode = WaypointType.Collector;
          this.addFloatingText(this.state.player.position.x, this.state.player.position.y - 30, 'Click to place COLLECTOR waypoint', '#88AAFF');
        }
      } else if (key === 'f' && this.state.camera.zoom <= 0.15) {
        // Toggle player waypoint placement mode
        if (this.waypointPlacementMode === WaypointType.Player) {
          this.waypointPlacementMode = null;
        } else {
          this.waypointPlacementMode = WaypointType.Player;
          this.addFloatingText(this.state.player.position.x, this.state.player.position.y - 30, 'Click to place PLAYER waypoint', '#FFD700');
        }
      } else if (key === 'y' && this.state.camera.zoom <= 0.15) {
        // Toggle collector wood waypoint placement mode (alternative for wood collection)
        if (this.waypointPlacementMode === WaypointType.CollectorWood) {
          this.waypointPlacementMode = null;
        } else {
          this.waypointPlacementMode = WaypointType.CollectorWood;
          this.addFloatingText(this.state.player.position.x, this.state.player.position.y - 30, 'Click to place WOOD COLLECT waypoint', '#FFAA44');
        }
      } else if (key === 'x' && this.state.camera.zoom <= 0.15) {
        // Clear all waypoints
        this.state.waypoints = [];
        this.state.playerWaypoint = null;
        this.addFloatingText(this.state.player.position.x, this.state.player.position.y - 30, 'Waypoints cleared', '#AAAAAA');
      } else if (key === '`' || key === '~') {
        // Toggle cheat menu
        this.toggleCheatMenu();
      } else if (key === 'l') {
        // Toggle tree checklist
        this.toggleTreeChecklist();
      } else if (e.key === 'F2') {
        // Toggle UI visibility
        e.preventDefault();
        this.state.uiHidden = !this.state.uiHidden;
      } else if (this.cheatMenuOpen) {
        // Cheat menu actions
        if (key === 'm') {
          this.addCheatMoney(1000);
        } else if (key === 'n') {
          this.addCheatMoney(10000);
        } else if (key === 'b') {
          this.addCheatMoney(100000);
        } else if (key === 'g') {
          this.fillTreeChecklist();
          this.addFloatingText(this.state.player.position.x, this.state.player.position.y - 30, 'Tree checklist filled!', '#FF00FF');
        }
      }
    };
    window.addEventListener('keydown', this.hireKeyHandler);

    // Setup zoom handler (mouse wheel)
    this.wheelHandler = (e: WheelEvent) => {
      e.preventDefault();
      const zoomSpeed = 0.1;
      const minZoom = 0.1;  // Can zoom out twice as far
      const maxZoom = 1.0;

      if (e.deltaY > 0) {
        // Zoom out
        this.state.camera.zoom = Math.max(minZoom, this.state.camera.zoom - zoomSpeed);
      } else {
        // Zoom in
        this.state.camera.zoom = Math.min(maxZoom, this.state.camera.zoom + zoomSpeed);
      }
    };
    this.canvas.addEventListener('wheel', this.wheelHandler, { passive: false });

    // Setup click handler for chunk challenge toggle, waypoint placement, and UI buttons
    this.clickHandler = (e: MouseEvent) => {
      // Convert screen coordinates
      const rect = this.canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      // Check for regenerate button click (always works regardless of zoom)
      // Button position matches renderer: upgradeX, padding+260, upgradeWidth, 32
      const padding = 15;
      const upgradeWidth = 230;
      const regenButtonX = this.canvas.width - upgradeWidth - padding;
      const regenButtonY = padding + 260;
      const regenButtonW = upgradeWidth;
      const regenButtonH = 32;

      if (screenX >= regenButtonX && screenX <= regenButtonX + regenButtonW &&
          screenY >= regenButtonY && screenY <= regenButtonY + regenButtonH) {
        if (this.regenCooldown > 0) {
          this.addFloatingText(
            this.state.player.position.x,
            this.state.player.position.y - 30,
            `Cooldown: ${Math.ceil(this.regenCooldown)}s`,
            '#FF6666'
          );
        } else {
          this.regenerateUnloadedChunks();
          this.regenCooldown = 150; // 150 second cooldown
        }
        return;
      }

      // Check for teleport home button click
      const teleportButtonX = regenButtonX;
      const teleportButtonY = regenButtonY + regenButtonH + 8; // 8px gap below regen button
      const teleportButtonW = regenButtonW;
      const teleportButtonH = 32;

      if (screenX >= teleportButtonX && screenX <= teleportButtonX + teleportButtonW &&
          screenY >= teleportButtonY && screenY <= teleportButtonY + teleportButtonH) {
        this.teleportHome();
        return;
      }

      // Rest of click handling only works when fully zoomed out
      if (this.state.camera.zoom > 0.15) return;

      // Calculate effective camera view
      const effectiveWidth = this.state.camera.width / this.state.camera.zoom;
      const effectiveHeight = this.state.camera.height / this.state.camera.zoom;
      const effectiveCameraX = this.state.player.position.x - effectiveWidth / 2;
      const effectiveCameraY = this.state.player.position.y - effectiveHeight / 2;

      // Convert to world coordinates
      const scale = this.config.pixelScale * this.state.camera.zoom;
      const worldX = effectiveCameraX + screenX / scale;
      const worldY = effectiveCameraY + screenY / scale;

      // Check if in waypoint placement mode
      if (this.waypointPlacementMode !== null) {
        if (this.waypointPlacementMode === WaypointType.Player) {
          // Player waypoint - only one, replaces existing
          this.state.playerWaypoint = { x: worldX, y: worldY };
          this.addFloatingText(worldX, worldY, 'Player waypoint placed', '#FFD700');
        } else {
          // Worker waypoint
          const waypoint: Waypoint = {
            id: `waypoint_${waypointIdCounter++}`,
            x: worldX,
            y: worldY,
            type: this.waypointPlacementMode,
          };
          this.state.waypoints.push(waypoint);
          let color = '#88AAFF';
          let typeName = 'Collector';
          if (this.waypointPlacementMode === WaypointType.Chopper) {
            color = '#5A9C5A';
            typeName = 'Chopper';
          } else if (this.waypointPlacementMode === WaypointType.CollectorWood) {
            color = '#FFAA44';
            typeName = 'Wood Collect';
          }
          this.addFloatingText(worldX, worldY, `${typeName} waypoint placed`, color);
        }
        return;
      }

      // Find which chunk was clicked
      const chunkX = Math.floor(worldX / this.config.chunkSize);
      const chunkY = Math.floor(worldY / this.config.chunkSize);

      // Try to toggle challenge mode
      this.toggleChunkChallenge(chunkX, chunkY);
    };
    this.canvas.addEventListener('click', this.clickHandler);

    // Setup right-click handler for no-respawn chunk toggle
    this.contextMenuHandler = (e: MouseEvent) => {
      e.preventDefault();

      // Only work when zoomed out
      if (this.state.camera.zoom > 0.15) return;

      // Convert screen coordinates to world coordinates
      const rect = this.canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const scale = this.config.pixelScale * this.state.camera.zoom;
      const effectiveWidth = this.state.camera.width / this.state.camera.zoom;
      const effectiveHeight = this.state.camera.height / this.state.camera.zoom;
      const effectiveCameraX = this.state.player.position.x - effectiveWidth / 2;
      const effectiveCameraY = this.state.player.position.y - effectiveHeight / 2;
      const worldX = effectiveCameraX + screenX / scale;
      const worldY = effectiveCameraY + screenY / scale;

      // Find which chunk was right-clicked
      const chunkX = Math.floor(worldX / this.config.chunkSize);
      const chunkY = Math.floor(worldY / this.config.chunkSize);
      const chunkKey = `${chunkX},${chunkY}`;

      // Only allow on platinum chunks that are in challenge mode (4x health)
      if (!this.state.platinumChunks.has(chunkKey)) {
        this.addFloatingText(worldX, worldY, 'Platinum chunks only!', '#FF4444');
        return;
      }

      if (!this.state.challengeChunks.has(chunkKey)) {
        this.addFloatingText(worldX, worldY, 'Must be at 4x health!', '#FF4444');
        return;
      }

      // Toggle no-respawn
      if (this.state.noRespawnChunks.has(chunkKey)) {
        this.state.noRespawnChunks.delete(chunkKey);
        this.addFloatingText(worldX, worldY, 'Respawning ENABLED', '#00FF00');
      } else {
        this.state.noRespawnChunks.add(chunkKey);
        this.addFloatingText(worldX, worldY, 'Respawning DISABLED', '#FF8800');
      }
    };
    this.canvas.addEventListener('contextmenu', this.contextMenuHandler);

    // Setup visibility change handler for offline progress
    this.visibilityHandler = () => {
      if (document.hidden) {
        // User tabbed away - record the time
        this.tabAwayTime = Date.now();
        this.saveProgress(); // Save before leaving
      } else if (this.tabAwayTime > 0) {
        // User came back - calculate elapsed time
        const elapsedMs = Date.now() - this.tabAwayTime;
        const elapsedSeconds = elapsedMs / 1000;
        this.tabAwayTime = 0;

        // Cap at 1 hour of catch-up time
        const maxCatchUp = 60 * 60;
        this.catchUpTimeRemaining = Math.min(elapsedSeconds, maxCatchUp);

        if (this.catchUpTimeRemaining > 1) {
          this.addFloatingText(
            this.state.player.position.x,
            this.state.player.position.y - 40,
            `Catching up ${Math.floor(this.catchUpTimeRemaining)}s...`,
            '#88FFFF'
          );
        }
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  start(): void {
    this.lastTime = performance.now();
    this.gameLoop(this.lastTime);
  }

  stop(skipSave: boolean = false): void {
    // Prevent double-stop from saving twice (e.g., import then React cleanup)
    if (this.stopped) return;
    this.stopped = true;

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = 0;
    }
    if (this.saveIntervalId) {
      clearInterval(this.saveIntervalId);
      this.saveIntervalId = 0;
    }
    if (!skipSave) {
      this.saveProgress(); // Save on stop (unless importing)
    }
    this.cleanupInput();
    window.removeEventListener('keydown', this.upgradeKeyHandler);
    window.removeEventListener('keydown', this.hireKeyHandler);
    window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.canvas.removeEventListener('wheel', this.wheelHandler);
    this.canvas.removeEventListener('click', this.clickHandler);
    this.canvas.removeEventListener('contextmenu', this.contextMenuHandler);
  }

  private saveProgress(): void {
    try {
      // Convert deadTreesMap to array for saving
      const deadTrees: DeadTreeData[] = [];
      for (const [id, respawnTimer] of this.deadTreesMap) {
        deadTrees.push({ id, respawnTimer });
      }

      // Save worker data including their carried wood and stamina
      const workers: WorkerSaveData[] = this.state.workers.map(w => ({
        type: w.type === WorkerType.Chopper ? 'chopper' : 'collector',
        wood: w.wood,
        stamina: w.stamina,
        restTimer: w.restTimer,
        state: w.state,
      }));

      // Save wood drops on the ground
      const woodDrops: WoodDropSaveData[] = this.state.woodDrops.map(d => ({
        x: d.x,
        y: d.y,
        amount: d.amount,
        lifetime: d.lifetime,
      }));

      // Save apple drops
      const appleDrops = this.state.appleDrops.map(a => ({ x: a.x, y: a.y }));

      const saveData: SaveData = {
        money: this.state.money,
        wood: this.state.wood,
        upgrades: { ...this.state.upgrades },
        workerUpgrades: { ...this.state.workerUpgrades },
        totalWoodChopped: this.state.totalWoodChopped,
        totalMoneyEarned: this.state.totalMoneyEarned,
        chopperCount: this.state.workers.filter(w => w.type === WorkerType.Chopper).length,
        collectorCount: this.state.workers.filter(w => w.type === WorkerType.Collector).length,
        deadTrees,
        workers,
        worldSeed: this.state.worldSeed,
        woodDrops,
        clearedChunks: Array.from(this.state.clearedChunks),
        platinumChunks: Array.from(this.state.platinumChunks),
        challengeChunks: Array.from(this.state.challengeChunks),
        chunkToggleCooldowns: Array.from(this.state.chunkToggleCooldowns.entries()).map(([key, time]) => ({ key, time })),
        choppersEnabled: this.state.choppersEnabled,
        collectorsEnabled: this.state.collectorsEnabled,
        waypoints: this.state.waypoints.map(w => ({ x: w.x, y: w.y, type: w.type })),
        playerWaypoint: this.state.playerWaypoint,
        // Apple feature
        appleDrops,
        applePileCount: this.state.applePile.count,
        appleBuffRemaining: this.state.appleBuff.remainingTime,
        // Tree checklist
        choppedTreeTypes: Array.from(this.state.choppedTreeTypes),
        treeChoppedCounts: Array.from(this.state.treeChoppedCounts.entries()).map(([type, count]) => ({ type, count })),
        // No-respawn chunks
        noRespawnChunks: Array.from(this.state.noRespawnChunks),
      };
      localStorage.setItem(SAVE_KEY, obfuscateSave(JSON.stringify(saveData)));
    } catch (e) {
      console.warn('Failed to save progress:', e);
    }
  }

  private loadProgress(): void {
    try {
      const saved = localStorage.getItem(SAVE_KEY);
      if (!saved) return;

      const data: SaveData = JSON.parse(deobfuscateSave(saved));

      // Restore money, wood, and stats
      this.state.money = data.money || 0;
      this.state.wood = data.wood || 0;
      this.state.totalWoodChopped = data.totalWoodChopped || 0;
      this.state.totalMoneyEarned = data.totalMoneyEarned || 0;

      // Restore world seed if saved, otherwise keep the randomly generated one
      if (data.worldSeed !== undefined) {
        this.state.worldSeed = data.worldSeed;
      }

      // Restore upgrades
      if (data.upgrades) {
        this.state.upgrades = { ...this.state.upgrades, ...data.upgrades };

        // Migrate old carryCapacity format (stored as 20, 30, 40...) to new level format (1, 2, 3...)
        // Old format started at 20 and incremented by 10. New format uses levels 1-6.
        const cap = this.state.upgrades.carryCapacity;
        if (typeof cap === 'number' && cap >= 20) {
          // Old format: base 20, +10 per upgrade. Convert to level.
          this.state.upgrades.carryCapacity = Math.floor((cap - 10) / 10) + 1;
        }
      }

      // Ensure all upgrades are at least 1 (handle NaN, undefined, 0, or negative)
      if (!this.state.upgrades.axePower || this.state.upgrades.axePower < 1) this.state.upgrades.axePower = 1;
      if (!this.state.upgrades.moveSpeed || this.state.upgrades.moveSpeed < 1) this.state.upgrades.moveSpeed = 1;
      if (!this.state.upgrades.chopSpeed || this.state.upgrades.chopSpeed < 1) this.state.upgrades.chopSpeed = 1;
      if (!this.state.upgrades.carryCapacity || this.state.upgrades.carryCapacity < 1) this.state.upgrades.carryCapacity = 1;
      if (data.workerUpgrades) {
        this.state.workerUpgrades = { ...this.state.workerUpgrades, ...data.workerUpgrades };
      }

      // Ensure all worker upgrades are at least 1 (handle NaN, undefined, 0, or negative)
      if (!this.state.workerUpgrades.restSpeed || this.state.workerUpgrades.restSpeed < 1) this.state.workerUpgrades.restSpeed = 1;
      if (!this.state.workerUpgrades.workDuration || this.state.workerUpgrades.workDuration < 1) this.state.workerUpgrades.workDuration = 1;
      if (!this.state.workerUpgrades.workerSpeed || this.state.workerUpgrades.workerSpeed < 1) this.state.workerUpgrades.workerSpeed = 1;
      if (!this.state.workerUpgrades.workerPower || this.state.workerUpgrades.workerPower < 1) this.state.workerUpgrades.workerPower = 1;

      // Restore dead trees map
      if (data.deadTrees) {
        for (const deadTree of data.deadTrees) {
          this.deadTreesMap.set(deadTree.id, deadTree.respawnTimer);
        }
        // Apply to currently loaded chunks
        this.applyDeadTreesToChunks();
      }

      // Restore wood drops on the ground
      if (data.woodDrops && data.woodDrops.length > 0) {
        for (const dropData of data.woodDrops) {
          this.state.woodDrops.push({
            id: `drop_${dropIdCounter++}`,
            x: dropData.x,
            y: dropData.y,
            amount: dropData.amount,
            lifetime: dropData.lifetime,
            bobOffset: Math.random() * Math.PI * 2,
          });
        }
      }

      // Restore workers with their inventories and stamina
      if (data.workers && data.workers.length > 0) {
        // New save format with worker details
        for (const workerData of data.workers) {
          const type = workerData.type === 'chopper' ? WorkerType.Chopper : WorkerType.Collector;
          this.spawnWorkerSilent(type);
          // Set the wood, stamina, and state on the last spawned worker
          const lastWorker = this.state.workers[this.state.workers.length - 1];
          if (lastWorker) {
            lastWorker.wood = workerData.wood;
            // Restore stamina if saved (backwards compatible)
            if (workerData.stamina !== undefined) {
              lastWorker.stamina = workerData.stamina;
            }
            if (workerData.restTimer !== undefined) {
              lastWorker.restTimer = workerData.restTimer;
            }
            // Restore state - if they were resting, keep them resting
            if (workerData.state === 'resting') {
              lastWorker.state = WorkerState.Resting;
            } else if (workerData.state === 'going_to_rest') {
              lastWorker.state = WorkerState.GoingToRest;
            }
          }
        }
      } else {
        // Legacy save format (just counts)
        for (let i = 0; i < (data.chopperCount || 0); i++) {
          this.spawnWorkerSilent(WorkerType.Chopper);
        }
        for (let i = 0; i < (data.collectorCount || 0); i++) {
          this.spawnWorkerSilent(WorkerType.Collector);
        }
      }

      // Restore cleared chunks (gold bordered)
      if (data.clearedChunks && data.clearedChunks.length > 0) {
        this.state.clearedChunks = new Set(data.clearedChunks);
      }

      // Restore platinum chunks
      if (data.platinumChunks && data.platinumChunks.length > 0) {
        this.state.platinumChunks = new Set(data.platinumChunks);
      }

      // Restore challenge chunks
      if (data.challengeChunks && data.challengeChunks.length > 0) {
        this.state.challengeChunks = new Set(data.challengeChunks);
      }

      // Restore chunk toggle cooldowns
      if (data.chunkToggleCooldowns && data.chunkToggleCooldowns.length > 0) {
        for (const { key, time } of data.chunkToggleCooldowns) {
          this.state.chunkToggleCooldowns.set(key, time);
        }
      }

      // Restore worker enable states
      if (data.choppersEnabled !== undefined) {
        this.state.choppersEnabled = data.choppersEnabled;
      }
      if (data.collectorsEnabled !== undefined) {
        this.state.collectorsEnabled = data.collectorsEnabled;
      }

      // Restore waypoints
      if (data.waypoints && data.waypoints.length > 0) {
        this.state.waypoints = data.waypoints.map(w => ({
          id: `waypoint_${waypointIdCounter++}`,
          x: w.x,
          y: w.y,
          type: w.type as WaypointType,
        }));
      }

      // Restore player waypoint
      if (data.playerWaypoint) {
        this.state.playerWaypoint = data.playerWaypoint;
      }

      // Restore apple feature
      if (data.appleDrops && data.appleDrops.length > 0) {
        this.state.appleDrops = data.appleDrops.map(a => ({
          id: `apple_${appleIdCounter++}`,
          x: a.x,
          y: a.y,
        }));
      }
      if (data.applePileCount !== undefined) {
        this.state.applePile.count = data.applePileCount;
      }
      if (data.appleBuffRemaining !== undefined && data.appleBuffRemaining > 0) {
        this.state.appleBuff.remainingTime = data.appleBuffRemaining;
        this.state.appleBuff.active = true;
      }

      // Restore tree checklist
      if (data.choppedTreeTypes && data.choppedTreeTypes.length > 0) {
        this.state.choppedTreeTypes = new Set(data.choppedTreeTypes);
      }

      // Restore tree chopped counts
      if (data.treeChoppedCounts && data.treeChoppedCounts.length > 0) {
        this.state.treeChoppedCounts = new Map(
          data.treeChoppedCounts.map(({ type, count }) => [type as TreeType, count])
        );
      }

      // Restore no-respawn chunks
      if (data.noRespawnChunks && data.noRespawnChunks.length > 0) {
        this.state.noRespawnChunks = new Set(data.noRespawnChunks);
      }

      console.log('Progress loaded!', {
        money: this.state.money,
        wood: this.state.wood,
        totalWoodChopped: this.state.totalWoodChopped,
        workers: this.state.workers.length,
        worldSeed: this.state.worldSeed,
      });
    } catch (e) {
      console.error('Failed to load progress:', e);
    }
  }

  private applyDeadTreesToChunks(): void {
    for (const chunk of this.state.chunks.values()) {
      for (const tree of chunk.trees) {
        const respawnTimer = this.deadTreesMap.get(tree.id);
        if (respawnTimer !== undefined && !tree.isDead) {
          tree.isDead = true;
          tree.health = 0;
          tree.respawnTimer = respawnTimer;
        }
      }
    }
  }

  private syncDeadTreesMap(): void {
    // Update map with current dead tree states and remove respawned trees
    for (const chunk of this.state.chunks.values()) {
      for (const tree of chunk.trees) {
        if (tree.isDead) {
          // Update respawn timer in map
          this.deadTreesMap.set(tree.id, tree.respawnTimer);
        } else if (this.deadTreesMap.has(tree.id)) {
          // Tree has respawned, remove from map
          this.deadTreesMap.delete(tree.id);
        }
      }
    }
  }

  // Apply challenge health multiplier to trees that just respawned in challenge chunks
  private applyChallengeHealthToRespawnedTrees(): void {
    for (const [key, chunk] of this.state.chunks) {
      if (!this.state.challengeChunks.has(key)) continue;

      // Platinum chunks get 4x health, gold chunks get 2x
      const multiplier = this.state.platinumChunks.has(key) ? 4 : 2;

      for (const tree of chunk.trees) {
        // If tree is alive and has exactly maxHealth, it just respawned - apply multiplier
        if (!tree.isDead && tree.health === tree.maxHealth) {
          tree.health = tree.maxHealth * multiplier;
        }
      }
    }
  }

  // Regenerate all unloaded chunks by clearing their data (except gold/platinum status)
  private regenerateUnloadedChunks(): void {
    // Get set of currently loaded chunk keys
    const loadedChunkKeys = new Set(this.state.chunks.keys());

    // Helper to parse chunk key from tree ID (format: tree_chunkX_chunkY_index)
    const getChunkKeyFromTreeId = (treeId: string): string | null => {
      const match = treeId.match(/^tree_(-?\d+)_(-?\d+)_\d+$/);
      if (match) {
        return `${match[1]},${match[2]}`;
      }
      return null;
    };

    // Helper to get chunk key from world coordinates
    const getChunkKeyFromCoords = (x: number, y: number): string => {
      const chunkX = Math.floor(x / this.config.chunkSize);
      const chunkY = Math.floor(y / this.config.chunkSize);
      return `${chunkX},${chunkY}`;
    };

    // Clear dead trees data for unloaded chunks
    const treesToRemove: string[] = [];
    for (const treeId of this.deadTreesMap.keys()) {
      const chunkKey = getChunkKeyFromTreeId(treeId);
      if (chunkKey && !loadedChunkKeys.has(chunkKey)) {
        treesToRemove.push(treeId);
      }
    }
    for (const treeId of treesToRemove) {
      this.deadTreesMap.delete(treeId);
    }

    // Clear wood drops in unloaded chunks
    this.state.woodDrops = this.state.woodDrops.filter(drop => {
      const chunkKey = getChunkKeyFromCoords(drop.x, drop.y);
      return loadedChunkKeys.has(chunkKey);
    });

    // Clear challenge chunks for unloaded areas (keep gold/platinum status)
    const challengeToRemove: string[] = [];
    for (const key of this.state.challengeChunks) {
      if (!loadedChunkKeys.has(key)) {
        challengeToRemove.push(key);
      }
    }
    for (const key of challengeToRemove) {
      this.state.challengeChunks.delete(key);
    }

    // Clear toggle cooldowns for unloaded chunks
    const cooldownsToRemove: string[] = [];
    for (const key of this.state.chunkToggleCooldowns.keys()) {
      if (!loadedChunkKeys.has(key)) {
        cooldownsToRemove.push(key);
      }
    }
    for (const key of cooldownsToRemove) {
      this.state.chunkToggleCooldowns.delete(key);
    }

    // Show feedback to user
    const clearedCount = treesToRemove.length;
    this.addFloatingText(
      this.state.player.position.x,
      this.state.player.position.y - 30,
      `Regenerated ${clearedCount} trees`,
      '#FFAAAA'
    );
  }

  public getTeleportHomeCost(): number {
    const playerChunkX = Math.floor(this.state.player.position.x / this.config.chunkSize);
    const playerChunkY = Math.floor(this.state.player.position.y / this.config.chunkSize);

    // Home is the 4 chunks around 0,0: (-1,-1), (-1,0), (0,-1), (0,0)
    const isHome = (playerChunkX === -1 || playerChunkX === 0) &&
                   (playerChunkY === -1 || playerChunkY === 0);
    if (isHome) return 0;

    // Distance from home zone (closest point to home)
    const distX = playerChunkX < -1 ? Math.abs(playerChunkX + 1) : (playerChunkX > 0 ? playerChunkX : 0);
    const distY = playerChunkY < -1 ? Math.abs(playerChunkY + 1) : (playerChunkY > 0 ? playerChunkY : 0);
    const chunkDistance = distX + distY;
    return chunkDistance * 8;
  }

  public teleportHome(): boolean {
    const cost = this.getTeleportHomeCost();

    if (cost === 0) {
      this.addFloatingText(
        this.state.player.position.x,
        this.state.player.position.y - 30,
        'Already at home!',
        '#888888'
      );
      return false;
    }

    if (this.state.money < cost) {
      this.addFloatingText(
        this.state.player.position.x,
        this.state.player.position.y - 30,
        `Need $${cost}!`,
        '#FF4444'
      );
      return false;
    }

    // Deduct cost and teleport
    this.state.money -= cost;
    this.state.player.position.x = 0;
    this.state.player.position.y = 0;
    this.state.player.velocity.x = 0;
    this.state.player.velocity.y = 0;

    // Clear player waypoint since we're home
    this.state.playerWaypoint = null;

    // Spawn particles at new location
    this.spawnMoneyParticles(0, 0);

    this.addFloatingText(0, -30, `Teleported! -$${cost}`, '#FFD700');
    return true;
  }

  // Tree checklist methods
  private discoverTreeType(treeType: TreeType): void {
    const wasNew = !this.state.choppedTreeTypes.has(treeType);
    this.state.choppedTreeTypes.add(treeType);

    // Increment tree chopped count
    const currentCount = this.state.treeChoppedCounts.get(treeType) || 0;
    this.state.treeChoppedCounts.set(treeType, currentCount + 1);

    if (wasNew) {
      const treeName = TreeType[treeType].replace(/([A-Z])/g, ' $1').trim();
      this.addFloatingText(
        this.state.player.position.x,
        this.state.player.position.y - 50,
        `NEW: ${treeName}!`,
        '#FFD700'
      );
    }
  }

  public fillTreeChecklist(): void {
    // Add all tree types to the checklist
    for (let i = 0; i <= 14; i++) {
      this.state.choppedTreeTypes.add(i as TreeType);
    }
    this.addFloatingText(
      this.state.player.position.x,
      this.state.player.position.y - 30,
      'Checklist completed!',
      '#FFD700'
    );
  }

  public addCheatMoney(amount: number): void {
    this.state.money += amount;
    this.addFloatingText(
      this.state.player.position.x,
      this.state.player.position.y - 30,
      `+$${amount} (cheat)`,
      '#FF00FF'
    );
  }

  public toggleCheatMenu(): void {
    this.cheatMenuOpen = !this.cheatMenuOpen;
    if (this.cheatMenuOpen) {
      this.treeChecklistOpen = false; // Close checklist when opening cheat menu
    }
  }

  public toggleTreeChecklist(): void {
    this.treeChecklistOpen = !this.treeChecklistOpen;
    if (this.treeChecklistOpen) {
      this.cheatMenuOpen = false; // Close cheat menu when opening checklist
    }
  }

  public isCheatMenuOpen(): boolean {
    return this.cheatMenuOpen;
  }

  public isTreeChecklistOpen(): boolean {
    return this.treeChecklistOpen;
  }

  private spawnWorkerSilent(type: WorkerType): void {
    const { shack, workerUpgrades } = this.state;
    const isCollector = type === WorkerType.Collector;
    const baseMaxStamina = isCollector ? 60 : 100;
    const baseRestTime = 20;  // 20 seconds rest time for all workers

    const startPos = {
      x: shack.x + shack.width / 2 + (Math.random() - 0.5) * 30,
      y: shack.y + shack.height + (Math.random() - 0.5) * 20,
    };

    const worker: Worker = {
      id: `worker_${workerIdCounter++}`,
      type,
      position: { ...startPos },
      velocity: { x: 0, y: 0 },
      state: WorkerState.Idle,
      targetTree: null,
      targetDrop: null,
      wood: 0,
      chopTimer: 0,
      facingRight: true,
      carryCapacity: isCollector ? 10 : 5,  // Collectors carry more since they only collect
      speed: isCollector ? 18 : 20,
      chopPower: isCollector ? 0 : 1,
      treesChopped: 0,
      stamina: baseMaxStamina * workerUpgrades.workDuration,
      maxStamina: baseMaxStamina * workerUpgrades.workDuration,
      restTimer: 0,
      baseRestTime,
      stuckTimer: 0,
      lastPosition: { ...startPos },
      phaseTimer: 0,
      searchRadius: 0,
      // Apple collection (collectors only)
      targetApple: null,
      carryingApple: false,
    };

    this.state.workers.push(worker);
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.state.camera.width = width / this.config.pixelScale;
    this.state.camera.height = height / this.config.pixelScale;
  }

  private gameLoop = (currentTime: number): void => {
    const deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.1);
    this.lastTime = currentTime;

    // Handle catch-up mode (accelerated simulation when returning from tab away)
    if (this.catchUpTimeRemaining > 0) {
      // Simulate at 20x speed, up to 1 second of game time per frame
      const catchUpSpeed = 20;
      const maxCatchUpPerFrame = 1.0;
      const catchUpThisFrame = Math.min(this.catchUpTimeRemaining, maxCatchUpPerFrame);

      // Run multiple smaller updates for stability
      const tickSize = 0.05; // 50ms ticks
      let remaining = catchUpThisFrame;
      while (remaining > 0) {
        const tick = Math.min(remaining, tickSize);
        this.updateWorkers(tick); // Only update workers during catch-up
        this.updateWoodDrops(tick);
        updateTrees(this.state.chunks, tick, this.config, this.state.noRespawnChunks);
        this.applyChallengeHealthToRespawnedTrees();

        // Update cooldowns
        for (const [key, time] of this.state.chunkToggleCooldowns) {
          const newTime = time - tick;
          if (newTime <= 0) {
            this.state.chunkToggleCooldowns.delete(key);
          } else {
            this.state.chunkToggleCooldowns.set(key, newTime);
          }
        }

        remaining -= tick;
      }

      this.catchUpTimeRemaining -= catchUpThisFrame;

      // Show progress
      if (this.catchUpTimeRemaining > 0 && Math.floor(this.catchUpTimeRemaining) % 5 === 0) {
        // Update floating text periodically
      }
    }

    this.update(deltaTime);
    this.render();

    this.animationId = requestAnimationFrame(this.gameLoop);
  };

  private update(deltaTime: number): void {
    // Update player position based on input
    updatePlayer(this.state.player, this.state.input, deltaTime, this.config, this.state.upgrades);

    // Check tree collisions for player
    this.handleTreeCollisions(this.state.player.position, 6);

    // Update camera to follow player
    updateCamera(this.state.camera, this.state.player);

    // Collect protected chunks (worker/waypoint areas that shouldn't be unloaded)
    const protectedChunks = this.getProtectedChunks();

    // Update chunks (generate new ones, remove distant ones, but keep protected chunks)
    updateChunks(this.state.chunks, this.state.camera, this.config, this.state.worldSeed, protectedChunks);

    // Load 3x3 chunks around each worker so they can find trees/drops
    this.loadWorkerChunks();

    // Apply saved dead tree state to newly generated chunks BEFORE syncing
    // This ensures newly loaded chunks get their dead trees marked before sync runs
    this.applyDeadTreesToChunks();

    // Sync deadTreesMap after applying (now sync will only remove actually respawned trees)
    this.syncDeadTreesMap();

    // Update tree respawn timers
    updateTrees(this.state.chunks, deltaTime, this.config, this.state.noRespawnChunks);

    // Ensure trees in challenge chunks have 2x health when they respawn
    this.applyChallengeHealthToRespawnedTrees();

    // Sync again after tree updates (handle respawns)
    this.syncDeadTreesMap();

    // Update chunk toggle cooldowns
    for (const [key, time] of this.state.chunkToggleCooldowns) {
      const newTime = time - deltaTime;
      if (newTime <= 0) {
        this.state.chunkToggleCooldowns.delete(key);
      } else {
        this.state.chunkToggleCooldowns.set(key, newTime);
      }
    }

    // Update regenerate button cooldown
    if (this.regenCooldown > 0) {
      this.regenCooldown = Math.max(0, this.regenCooldown - deltaTime);
    }

    // Handle chopping
    // After chop speed level 5, allow holding to auto-swing
    const autoChopEnabled = this.state.upgrades.chopSpeed >= 5;
    if (this.state.input.chop && (autoChopEnabled || !this.pendingChop)) {
      if (!autoChopEnabled) {
        this.pendingChop = true;
      }
      this.tryChop();
    }
    if (!this.state.input.chop) {
      this.pendingChop = false;
    }

    // Handle selling at chipper and eating apples
    if (this.state.input.interact) {
      this.trySellWood();
      this.tryEatApple();
    }

    // Update apple buff timer
    this.updateAppleBuff(deltaTime);

    // Update wood drop collection
    this.updateWoodDrops(deltaTime);

    // Update workers
    this.updateWorkers(deltaTime);

    // Update particles
    this.updateParticles(deltaTime);

    // Update floating texts
    this.updateFloatingTexts(deltaTime);
  }

  private tryChop(): void {
    if (!canChop(this.state.player)) return;

    const nearestTree = this.findNearestChoppableTree();
    if (!nearestTree) return;

    // Start chop animation
    startChop(this.state.player, this.config, this.state.upgrades);

    // Deal damage to tree (40% compound per level, base damage 1)
    const damage = Math.pow(1.4, this.state.upgrades.axePower - 1);
    const wasDestroyed = damageTree(nearestTree, damage, this.config);

    // Spawn wood particles on hit
    this.spawnWoodParticles(nearestTree.x, nearestTree.y - 20);

    if (wasDestroyed) {
      // Tree was chopped down - spawn wood drop (2x gold challenge, 4x platinum challenge)
      const baseWood = TREE_STATS[nearestTree.type].woodDrop;
      const multiplier = this.getChallengeMultiplier(nearestTree.x, nearestTree.y);
      const woodAmount = baseWood * multiplier;
      this.spawnWoodDrop(nearestTree.x, nearestTree.y, woodAmount);
      this.state.totalWoodChopped += woodAmount;

      // Track tree type in checklist
      this.discoverTreeType(nearestTree.type);

      // Spawn extra particles for tree falling
      this.spawnTreeFallParticles(nearestTree.x, nearestTree.y);

      // Show floating text
      this.addFloatingText(nearestTree.x, nearestTree.y - 30, `+${woodAmount}`, '#8B4513');

      // Rare apple drop (1/10000 chance)
      if (Math.random() < 0.0001) {
        this.spawnAppleDrop(nearestTree.x, nearestTree.y);
      }

      // Check if chunk is now fully cleared
      this.checkChunkCleared(nearestTree.x, nearestTree.y);
    }
  }

  private findNearestChoppableTree(): Tree | null {
    const { player } = this.state;
    let nearest: Tree | null = null;
    let nearestDist = this.config.chopRange;

    for (const chunk of this.state.chunks.values()) {
      for (const tree of chunk.trees) {
        if (tree.isDead) continue;

        const dx = tree.x - player.position.x;
        const dy = tree.y - player.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = tree;
        }
      }
    }

    return nearest;
  }

  private spawnWoodDrop(x: number, y: number, amount: number): void {
    // If too many drops exist, try to merge with a nearby drop first
    const MAX_WOOD_DROPS = 500;
    if (this.state.woodDrops.length >= MAX_WOOD_DROPS) {
      // Find a nearby drop to merge with
      for (const existingDrop of this.state.woodDrops) {
        const dx = existingDrop.x - x;
        const dy = existingDrop.y - y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 50) {
          // Merge into this drop
          existingDrop.amount += amount;
          return;
        }
      }
      // No nearby drop found - remove the oldest drop
      this.state.woodDrops.shift();
    }

    // Scatter drops slightly around the tree base
    const drop: WoodDrop = {
      id: `drop_${dropIdCounter++}`,
      x: x + (Math.random() - 0.5) * 16,
      y: y + (Math.random() - 0.5) * 8,
      amount,
      lifetime: 60, // 60 seconds to pick up
      bobOffset: Math.random() * Math.PI * 2,
    };
    this.state.woodDrops.push(drop);
  }

  private spawnAppleDrop(x: number, y: number): void {
    const apple: AppleDrop = {
      id: `apple_${appleIdCounter++}`,
      x: x + (Math.random() - 0.5) * 20,
      y: y + (Math.random() - 0.5) * 10,
    };
    this.state.appleDrops.push(apple);

    // Show special floating text for rare apple drop
    this.addFloatingText(x, y - 40, 'APPLE!', '#E53935');

    // Trigger apple drop notification popup
    this.state.appleDropNotification = { active: true, timer: 3 };
  }

  private updateWoodDrops(deltaTime: number): void {
    const { player, upgrades } = this.state;

    for (let i = this.state.woodDrops.length - 1; i >= 0; i--) {
      const drop = this.state.woodDrops[i];

      // Clean up empty drops (can happen if collector empties them)
      if (drop.amount <= 0) {
        this.state.woodDrops.splice(i, 1);
        continue;
      }

      // Check if player can pick up
      const dx = drop.x - player.position.x;
      const dy = drop.y - player.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < this.config.woodPickupRange) {
        // Check capacity (base 10, 50% compound per level)
        const effectiveCapacity = Math.floor(10 * Math.pow(1.5, upgrades.carryCapacity - 1));
        const canCarry = Math.min(drop.amount, effectiveCapacity - this.state.wood);
        if (canCarry > 0) {
          this.state.wood += canCarry;
          drop.amount -= canCarry;

          // Show pickup text
          this.addFloatingText(player.position.x, player.position.y - 20, `+${canCarry}`, '#FFD700');

          if (drop.amount <= 0) {
            this.state.woodDrops.splice(i, 1);
          }
        }
      }
    }
  }

  private trySellWood(): void {
    if (this.state.wood <= 0) return;

    const { player, chipper } = this.state;
    const dx = player.position.x - (chipper.x + chipper.width / 2);
    const dy = player.position.y - (chipper.y + chipper.height / 2);
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 60) {
      const earnings = this.state.wood * this.config.woodPricePerUnit;
      this.state.money += earnings;
      this.state.totalMoneyEarned += earnings;

      // Show earnings
      this.addFloatingText(
        chipper.x + chipper.width / 2,
        chipper.y - 20,
        `+$${earnings}`,
        '#FFD700'
      );

      // Spawn money particles
      this.spawnMoneyParticles(chipper.x + chipper.width / 2, chipper.y);

      this.state.wood = 0;

      // Reset interact to prevent repeated selling
      this.state.input.interact = false;
    }
  }

  private tryEatApple(): void {
    const { player, applePile, appleBuff } = this.state;

    // Check if there are apples to eat
    if (applePile.count <= 0) return;

    // Check if player is near apple pile
    const dx = player.position.x - applePile.x;
    const dy = player.position.y - applePile.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 60) {
      // Eat an apple
      this.state.applePile.count--;

      // Add 5 seconds to buff timer
      this.state.appleBuff.remainingTime += 5;

      // Activate buff if not already active
      if (!this.state.appleBuff.active) {
        this.state.appleBuff.active = true;
      }

      // Show eating message
      this.addFloatingText(
        player.position.x,
        player.position.y - 30,
        'BUFF ACTIVE! 5x Speed, 2x Damage',
        '#E53935'
      );

      // Spawn apple-colored particles
      this.spawnAppleParticles(player.position.x, player.position.y);

      // Reset interact to prevent repeated eating
      this.state.input.interact = false;
    }
  }

  private spawnAppleParticles(x: number, y: number): void {
    for (let i = 0; i < 8; i++) {
      const particle: Particle = {
        x,
        y,
        vx: (Math.random() - 0.5) * 80,
        vy: -Math.random() * 60 - 20,
        life: 0.8,
        maxLife: 0.8,
        color: Math.random() > 0.5 ? '#E53935' : '#4CAF50', // Red or green
        size: 3 + Math.random() * 2,
      };
      this.state.particles.push(particle);
    }
  }

  private updateAppleBuff(deltaTime: number): void {
    const { appleBuff, appleDropNotification } = this.state;

    if (appleBuff.active && appleBuff.remainingTime > 0) {
      appleBuff.remainingTime -= deltaTime;

      if (appleBuff.remainingTime <= 0) {
        appleBuff.active = false;
        appleBuff.remainingTime = 0;
        this.addFloatingText(
          this.state.player.position.x,
          this.state.player.position.y - 30,
          'Buff ended!',
          '#888888'
        );
      }
    }

    // Update apple drop notification timer
    if (appleDropNotification.active && appleDropNotification.timer > 0) {
      appleDropNotification.timer -= deltaTime;
      if (appleDropNotification.timer <= 0) {
        appleDropNotification.active = false;
        appleDropNotification.timer = 0;
      }
    }
  }

  private handleUpgrade(key: number): void {
    const { upgrades, workerUpgrades } = this.state;

    let costs: number[];
    let levelIndex: number;
    let upgradeName: string;

    switch (key) {
      case 1:
        costs = UPGRADE_COSTS.axePower;
        levelIndex = upgrades.axePower - 1;
        upgradeName = 'axePower';
        break;
      case 2:
        costs = UPGRADE_COSTS.moveSpeed;
        levelIndex = upgrades.moveSpeed - 1;
        upgradeName = 'moveSpeed';
        break;
      case 3:
        costs = UPGRADE_COSTS.chopSpeed;
        levelIndex = upgrades.chopSpeed - 1;
        upgradeName = 'chopSpeed';
        break;
      case 4:
        costs = UPGRADE_COSTS.carryCapacity;
        levelIndex = upgrades.carryCapacity - 1;
        upgradeName = 'carryCapacity';
        break;
      case 5:
        costs = WORKER_UPGRADE_COSTS.restSpeed;
        levelIndex = workerUpgrades.restSpeed - 1;
        upgradeName = 'restSpeed';
        break;
      case 6:
        costs = WORKER_UPGRADE_COSTS.workDuration;
        levelIndex = workerUpgrades.workDuration - 1;
        upgradeName = 'workDuration';
        break;
      case 7:
        costs = WORKER_UPGRADE_COSTS.workerSpeed;
        levelIndex = workerUpgrades.workerSpeed - 1;
        upgradeName = 'workerSpeed';
        break;
      case 8:
        costs = WORKER_UPGRADE_COSTS.workerPower;
        levelIndex = workerUpgrades.workerPower - 1;
        upgradeName = 'workerPower';
        break;
      default:
        return;
    }

    // Calculate cost (doubles after array ends)
    let cost: number;
    if (levelIndex < costs.length) {
      cost = costs[levelIndex];
    } else {
      const lastCost = costs[costs.length - 1];
      cost = lastCost * Math.pow(2, levelIndex - costs.length + 1);
    }

    if (this.state.money >= cost) {
      this.state.money -= cost;

      switch (upgradeName) {
        case 'axePower':
          upgrades.axePower++;
          break;
        case 'moveSpeed':
          upgrades.moveSpeed++;
          break;
        case 'chopSpeed':
          upgrades.chopSpeed++;
          break;
        case 'carryCapacity':
          upgrades.carryCapacity++;
          break;
        case 'restSpeed':
          workerUpgrades.restSpeed++;
          break;
        case 'workDuration':
          workerUpgrades.workDuration++;
          // Update all workers' max stamina (collectors have base 60, choppers have base 100)
          for (const worker of this.state.workers) {
            const baseStamina = worker.type === WorkerType.Collector ? 60 : 100;
            worker.maxStamina = baseStamina * workerUpgrades.workDuration;
          }
          break;
        case 'workerSpeed':
          workerUpgrades.workerSpeed++;
          break;
        case 'workerPower':
          workerUpgrades.workerPower++;
          break;
      }

      // Show upgrade text
      this.addFloatingText(
        this.state.player.position.x,
        this.state.player.position.y - 30,
        'UPGRADED!',
        '#00FF00'
      );
    }
  }

  private spawnWoodParticles(x: number, y: number): void {
    // Cap particles to prevent memory issues
    const MAX_PARTICLES = 200;
    while (this.state.particles.length >= MAX_PARTICLES - 5) {
      this.state.particles.shift();
    }

    const colors = ['#8B4513', '#A0522D', '#CD853F', '#D2691E'];
    for (let i = 0; i < 5; i++) {
      this.state.particles.push({
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 50,
        vy: -Math.random() * 30 - 20,
        life: 0.5 + Math.random() * 0.3,
        maxLife: 0.5 + Math.random() * 0.3,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 2 + Math.random() * 2,
      });
    }
  }

  private spawnTreeFallParticles(x: number, y: number): void {
    const colors = ['#228B22', '#006400', '#8B4513', '#2E8B57'];
    for (let i = 0; i < 15; i++) {
      this.state.particles.push({
        x: x + (Math.random() - 0.5) * 30,
        y: y - Math.random() * 40,
        vx: (Math.random() - 0.5) * 80,
        vy: -Math.random() * 50 - 10,
        life: 0.8 + Math.random() * 0.4,
        maxLife: 0.8 + Math.random() * 0.4,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 3 + Math.random() * 3,
      });
    }
  }

  private spawnMoneyParticles(x: number, y: number): void {
    for (let i = 0; i < 10; i++) {
      this.state.particles.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 60,
        vy: -Math.random() * 40 - 30,
        life: 0.6 + Math.random() * 0.3,
        maxLife: 0.6 + Math.random() * 0.3,
        color: '#FFD700',
        size: 2 + Math.random() * 2,
      });
    }
  }

  private updateParticles(deltaTime: number): void {
    for (let i = this.state.particles.length - 1; i >= 0; i--) {
      const p = this.state.particles[i];

      p.x += p.vx * deltaTime;
      p.y += p.vy * deltaTime;
      p.vy += 100 * deltaTime; // Gravity
      p.life -= deltaTime;

      if (p.life <= 0) {
        this.state.particles.splice(i, 1);
      }
    }
  }

  private addFloatingText(x: number, y: number, text: string, color: string): void {
    // Cap floating texts to prevent memory issues
    const MAX_FLOATING_TEXTS = 50;
    while (this.state.floatingTexts.length >= MAX_FLOATING_TEXTS) {
      this.state.floatingTexts.shift();
    }

    this.state.floatingTexts.push({
      x,
      y,
      text,
      color,
      life: 1.0,
      maxLife: 1.0,
    });
  }

  private updateFloatingTexts(deltaTime: number): void {
    for (let i = this.state.floatingTexts.length - 1; i >= 0; i--) {
      const t = this.state.floatingTexts[i];
      t.life -= deltaTime;

      if (t.life <= 0) {
        this.state.floatingTexts.splice(i, 1);
      }
    }
  }

  private getWorkerCost(type: WorkerType, count: number): number {
    const costs = type === WorkerType.Chopper ? CHOPPER_COSTS : COLLECTOR_COSTS;
    if (count < costs.length) {
      return costs[count];
    }
    // After the array, keep doubling from the last price
    const lastCost = costs[costs.length - 1];
    const extraWorkers = count - costs.length + 1;
    return lastCost * Math.pow(2, extraWorkers);
  }

  private hireWorker(type: WorkerType): void {
    // Count workers of this type
    const sameTypeCount = this.state.workers.filter(w => w.type === type).length;
    const cost = this.getWorkerCost(type, sameTypeCount);

    if (this.state.money < cost) {
      this.addFloatingText(this.state.player.position.x, this.state.player.position.y - 30, 'Need $' + cost, '#FF4444');
      return;
    }

    this.state.money -= cost;

    // Spawn worker near shack
    const { shack, workerUpgrades } = this.state;

    // Collectors rest longer and more often (lower max stamina, longer rest time)
    const isCollector = type === WorkerType.Collector;
    const baseMaxStamina = isCollector ? 60 : 100;  // Collectors tire faster
    const baseRestTime = 20;  // 20 seconds rest time for all workers

    const startPos = {
      x: shack.x + shack.width / 2 + (Math.random() - 0.5) * 30,
      y: shack.y + shack.height + (Math.random() - 0.5) * 20,
    };

    const worker: Worker = {
      id: `worker_${workerIdCounter++}`,
      type,
      position: { ...startPos },
      velocity: { x: 0, y: 0 },
      state: WorkerState.Idle,
      targetTree: null,
      targetDrop: null,
      wood: 0,
      chopTimer: 0,
      facingRight: true,
      carryCapacity: isCollector ? 10 : 5,  // Collectors carry more since they only collect
      speed: isCollector ? 18 : 20,         // Base worker speed
      chopPower: isCollector ? 0 : 1,   // Choppers much weaker
      // Fatigue system
      treesChopped: 0,
      stamina: baseMaxStamina,
      maxStamina: baseMaxStamina * workerUpgrades.workDuration,
      restTimer: 0,
      baseRestTime,
      stuckTimer: 0,
      lastPosition: { ...startPos },
      phaseTimer: 0,
      searchRadius: 0,
      // Apple collection (collectors only)
      targetApple: null,
      carryingApple: false,
    };

    this.state.workers.push(worker);
    const typeName = isCollector ? 'Collector' : 'Chopper';
    this.addFloatingText(worker.position.x, worker.position.y - 20, `${typeName} HIRED!`, '#00FF00');
    this.spawnMoneyParticles(worker.position.x, worker.position.y);
  }

  private updateWorkers(deltaTime: number): void {
    const { chipper, shack, workerUpgrades } = this.state;
    const chipperCenterX = chipper.x + chipper.width / 2;
    const chipperCenterY = chipper.y + chipper.height / 2;
    const shackCenterX = shack.x + shack.width / 2;
    const shackCenterY = shack.y + shack.height / 2;

    // Create Set of wood drops for O(1) validation lookup
    const woodDropSet = new Set(this.state.woodDrops);

    for (const worker of this.state.workers) {
      // Update chop timer
      if (worker.chopTimer > 0) {
        worker.chopTimer -= deltaTime;
      }

      // Calculate effective speed with upgrades (20% per level) and apple buff
      const appleSpeedMult = this.state.appleBuff.active ? this.state.appleBuff.speedMultiplier : 1;
      const effectiveSpeed = worker.speed * Math.pow(1.2, workerUpgrades.workerSpeed - 1) * appleSpeedMult;

      // Calculate effective power level for 20% multipliers and apple damage buff
      const effectivePower = workerUpgrades.workerPower;
      const appleDamageMult = this.state.appleBuff.active ? this.state.appleBuff.damageMultiplier : 1;

      const isChopper = worker.type === WorkerType.Chopper;
      const isCollector = worker.type === WorkerType.Collector;

      // Check if this worker type is disabled
      const isDisabled = (isChopper && !this.state.choppersEnabled) || (isCollector && !this.state.collectorsEnabled);
      if (isDisabled && worker.state !== WorkerState.Resting && worker.state !== WorkerState.GoingToRest) {
        // Disabled workers just idle but regain 1% max stamina per second
        worker.velocity.x = 0;
        worker.velocity.y = 0;
        worker.targetTree = null;
        worker.targetDrop = null;
        // Passive stamina regen while disabled (1% per second)
        if (worker.stamina < worker.maxStamina) {
          worker.stamina = Math.min(worker.maxStamina, worker.stamina + worker.maxStamina * 0.01 * deltaTime);
        }
        continue;
      }

      // Validate target tree still exists in loaded chunks (may have been unloaded)
      if (worker.targetTree) {
        // O(1) check: compute tree's chunk and verify it's loaded with the tree
        const treeChunkX = Math.floor(worker.targetTree.x / this.config.chunkSize);
        const treeChunkY = Math.floor(worker.targetTree.y / this.config.chunkSize);
        const treeChunkKey = `${treeChunkX},${treeChunkY}`;
        const treeChunk = this.state.chunks.get(treeChunkKey);
        // Tree is invalid if chunk unloaded OR tree died
        if (!treeChunk || worker.targetTree.isDead) {
          worker.targetTree = null;
          worker.state = WorkerState.Idle;
        }
      }

      // Validate target drop still exists (use Set for O(1) lookup)
      if (worker.targetDrop && (worker.targetDrop.amount <= 0 || !woodDropSet.has(worker.targetDrop))) {
        worker.targetDrop = null;
        worker.state = WorkerState.Idle;
      }

      switch (worker.state) {
        case WorkerState.Idle:
          // Check if worker needs rest
          if (worker.stamina <= 0) {
            worker.state = WorkerState.GoingToRest;
            break;
          }

          if (isChopper) {
            // Choppers only look for trees to chop, never collect or sell
            const nearbyTree = this.findNearestTreeForWorker(worker);
            if (nearbyTree) {
              worker.targetTree = nearbyTree;
              worker.state = WorkerState.MovingToTree;
              worker.searchRadius = 0; // Reset search radius on success
            } else {
              // Expand search radius up to 5 extra chunks
              if (worker.searchRadius < 5) {
                worker.searchRadius++;
              }
            }
          } else if (isCollector) {
            // If carrying an apple, go deliver it first
            if (worker.carryingApple) {
              worker.state = WorkerState.ReturningWithApple;
              break;
            }

            // Check for nearby apples first (priority over wood)
            const nearbyApple = this.findNearestApple(worker.position.x, worker.position.y, 800);
            if (nearbyApple) {
              worker.targetApple = nearbyApple;
              worker.state = WorkerState.MovingToApple;
              worker.searchRadius = 0;
              break;
            }

            // Collectors look for wood drops to collect
            const collectorCapacity = Math.floor(worker.carryCapacity * Math.pow(1.8, effectivePower - 1));
            if (worker.wood < collectorCapacity) {
              // Check for CollectorWood waypoints (alternative waypoint for wood collection)
              const woodWaypoints = this.state.waypoints.filter(w => w.type === WaypointType.CollectorWood);

              // Search with expanding range based on searchRadius
              const baseRange = 800;
              const maxRange = baseRange + worker.searchRadius * this.config.chunkSize;

              // If wood waypoints exist, search near the closest waypoint instead
              let searchX = worker.position.x;
              let searchY = worker.position.y;
              let targetWaypoint: { x: number; y: number } | null = null;

              if (woodWaypoints.length > 0) {
                // Find closest wood waypoint
                let closestDist = Infinity;
                for (const wp of woodWaypoints) {
                  const dx = wp.x - worker.position.x;
                  const dy = wp.y - worker.position.y;
                  const dist = dx * dx + dy * dy;
                  if (dist < closestDist) {
                    closestDist = dist;
                    targetWaypoint = wp;
                  }
                }
                if (targetWaypoint) {
                  searchX = targetWaypoint.x;
                  searchY = targetWaypoint.y;
                }
              }

              const nearbyDrop = this.findNearestWoodDrop(searchX, searchY, maxRange);
              if (nearbyDrop) {
                worker.targetDrop = nearbyDrop;
                worker.state = WorkerState.MovingToDrop;
                worker.searchRadius = 0; // Reset search radius on success
              } else if (targetWaypoint) {
                // Move toward waypoint to search for wood there
                const dx = targetWaypoint.x - worker.position.x;
                const dy = targetWaypoint.y - worker.position.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 50 && dist > 0) {
                  worker.velocity.x = (dx / dist) * effectiveSpeed;
                  worker.velocity.y = (dy / dist) * effectiveSpeed;
                  worker.facingRight = dx > 0;
                } else {
                  // At waypoint but no wood, expand search
                  if (worker.searchRadius < 5) {
                    worker.searchRadius++;
                  }
                  worker.velocity.x = 0;
                  worker.velocity.y = 0;
                }
              } else {
                // Expand search radius up to 5 extra chunks
                if (worker.searchRadius < 5) {
                  worker.searchRadius++;
                }
                // Only go sell if search is maxed out and carrying wood
                // Otherwise keep searching or drift toward chipper
                if (worker.wood > 0 && worker.searchRadius >= 5) {
                  worker.state = WorkerState.ReturningToChipper;
                } else {
                  // Move toward chipper if too far away (more than 200 units)
                  const dx = chipperCenterX - worker.position.x;
                  const dy = chipperCenterY - worker.position.y;
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  if (dist > 200 && dist > 0) {
                    // Slowly drift toward chipper
                    worker.velocity.x = (dx / dist) * effectiveSpeed * 0.5;
                    worker.velocity.y = (dy / dist) * effectiveSpeed * 0.5;
                    worker.facingRight = dx > 0;
                  } else {
                    worker.velocity.x = 0;
                    worker.velocity.y = 0;
                  }
                }
              }
            } else {
              // Inventory full, go sell
              worker.state = WorkerState.ReturningToChipper;
            }
          }
          break;

        case WorkerState.MovingToTree:
          // Only choppers use this state
          if (!isChopper) {
            worker.state = WorkerState.Idle;
            break;
          }

          // Check if worker needs rest
          if (worker.stamina <= 0) {
            worker.state = WorkerState.GoingToRest;
            worker.targetTree = null;
            break;
          }

          if (!worker.targetTree || worker.targetTree.isDead) {
            worker.state = WorkerState.Idle;
            worker.targetTree = null;
            break;
          }

          // Move toward tree
          const treeDx = worker.targetTree.x - worker.position.x;
          const treeDy = worker.targetTree.y - worker.position.y;
          const treeDist = Math.sqrt(treeDx * treeDx + treeDy * treeDy);

          if (treeDist < 30) {
            // Close enough to chop
            worker.state = WorkerState.Chopping;
            worker.velocity.x = 0;
            worker.velocity.y = 0;
          } else if (treeDist > 0) {
            // Move toward tree
            worker.velocity.x = (treeDx / treeDist) * effectiveSpeed;
            worker.velocity.y = (treeDy / treeDist) * effectiveSpeed;
            worker.facingRight = treeDx > 0;
          }
          break;

        case WorkerState.Chopping:
          // Only choppers use this state
          if (!isChopper) {
            worker.state = WorkerState.Idle;
            break;
          }

          // Check if worker needs rest
          if (worker.stamina <= 0) {
            worker.state = WorkerState.GoingToRest;
            worker.targetTree = null;
            break;
          }

          if (!worker.targetTree || worker.targetTree.isDead) {
            worker.state = WorkerState.Idle;
            worker.targetTree = null;
            break;
          }

          worker.velocity.x = 0;
          worker.velocity.y = 0;

          // Chop the tree
          if (worker.chopTimer <= 0) {
            // Worker chop cooldown - 5% faster per Work Duration level (compounding)
            // Apple buff also gives 5x attack speed
            const baseChopCooldown = 0.6 * Math.pow(0.95, this.state.workerUpgrades.workDuration - 1);
            worker.chopTimer = baseChopCooldown / appleSpeedMult;
            const chopDamage = worker.chopPower * Math.pow(1.2, effectivePower - 1) * appleDamageMult;  // 1.2x damage per level, apple buff
            const wasDestroyed = damageTree(worker.targetTree, chopDamage, this.config);

            // Drain stamina when chopping
            worker.stamina -= 5;

            this.spawnWoodParticles(worker.targetTree.x, worker.targetTree.y - 20);

            if (wasDestroyed) {
              // 2x drops in gold challenge, 4x in platinum challenge
              const baseWood = TREE_STATS[worker.targetTree.type].woodDrop;
              const multiplier = this.getChallengeMultiplier(worker.targetTree.x, worker.targetTree.y);
              const woodAmount = baseWood * multiplier;
              this.spawnWoodDrop(worker.targetTree.x, worker.targetTree.y, woodAmount);
              this.state.totalWoodChopped += woodAmount;
              // Track tree type in checklist
              this.discoverTreeType(worker.targetTree.type);
              this.spawnTreeFallParticles(worker.targetTree.x, worker.targetTree.y);
              // Rare apple drop (1/10000 chance)
              if (Math.random() < 0.0001) {
                this.spawnAppleDrop(worker.targetTree.x, worker.targetTree.y);
              }
              // Check if chunk is now fully cleared
              this.checkChunkCleared(worker.targetTree.x, worker.targetTree.y);
              worker.treesChopped++;
              worker.targetTree = null;
              worker.state = WorkerState.Idle;  // Go find another tree
            }
          }
          break;

        case WorkerState.MovingToDrop:
          // Only collectors use this state
          if (!isCollector) {
            worker.state = WorkerState.Idle;
            break;
          }

          // Check if worker needs rest
          if (worker.stamina <= 0) {
            worker.state = WorkerState.GoingToRest;
            worker.targetDrop = null;
            break;
          }

          if (!worker.targetDrop || worker.targetDrop.amount <= 0) {
            worker.state = WorkerState.Idle;
            worker.targetDrop = null;
            break;
          }

          // Always check for a closer wood drop and switch if found
          const closerDrop = this.findClosestWoodDrop(worker.position.x, worker.position.y, 400, worker.targetDrop);
          if (closerDrop && closerDrop !== worker.targetDrop) {
            worker.targetDrop = closerDrop;
          }

          // Move toward drop
          const moveDx = worker.targetDrop.x - worker.position.x;
          const moveDy = worker.targetDrop.y - worker.position.y;
          const moveDist = Math.sqrt(moveDx * moveDx + moveDy * moveDy);

          if (moveDist < 20) {
            // Close enough to collect
            worker.state = WorkerState.Collecting;
            worker.velocity.x = 0;
            worker.velocity.y = 0;
          } else if (moveDist > 0) {
            worker.velocity.x = (moveDx / moveDist) * effectiveSpeed;
            worker.velocity.y = (moveDy / moveDist) * effectiveSpeed;
            worker.facingRight = moveDx > 0;
          }
          break;

        case WorkerState.Collecting:
          // Only collectors use this state
          if (!isCollector) {
            worker.state = WorkerState.Idle;
            break;
          }

          worker.velocity.x = 0;
          worker.velocity.y = 0;

          // Check if drop is gone or empty
          if (!worker.targetDrop || worker.targetDrop.amount <= 0) {
            // Remove empty drop from array
            if (worker.targetDrop) {
              const dropIndex = this.state.woodDrops.indexOf(worker.targetDrop);
              if (dropIndex !== -1) {
                this.state.woodDrops.splice(dropIndex, 1);
              }
            }
            worker.targetDrop = null;

            // Check if full, return to chipper
            const capCheck = Math.floor(worker.carryCapacity * Math.pow(1.8, effectivePower - 1));
            if (worker.wood >= capCheck) {
              worker.state = WorkerState.ReturningToChipper;
            } else {
              worker.state = WorkerState.Idle;
            }
            break;
          }

          // Pick up wood in batches - base 5/tick, 50% faster per worker speed upgrade
          // Pickup speed scaled 0.25x (4x slower base interval)
          const collectRate = Math.pow(1.5, workerUpgrades.workerSpeed - 1); // batches per second
          const collectInterval = 1.2 / collectRate; // 1.2s base interval (0.25x of original 0.3s)

          if (worker.chopTimer <= 0) {
            // Pick up multiple wood at once (5 base, scales with speed)
            const effectiveCapacity = Math.floor(worker.carryCapacity * Math.pow(1.8, effectivePower - 1));
            const spaceLeft = effectiveCapacity - worker.wood;
            const batchSize = Math.min(5, spaceLeft, worker.targetDrop.amount); // Grab up to 5 at a time

            if (batchSize > 0) {
              worker.wood += batchSize;
              worker.targetDrop.amount -= batchSize;
              this.addFloatingText(worker.position.x, worker.position.y - 20, `+${batchSize}`, '#8B4513');
              // Drain stamina per batch collected
              worker.stamina -= 1;

              // Reset timer for next pickup
              worker.chopTimer = collectInterval;

              // Check if full now
              if (worker.wood >= effectiveCapacity) {
                // Remove empty drop if needed
                if (worker.targetDrop.amount <= 0) {
                  const dropIndex = this.state.woodDrops.indexOf(worker.targetDrop);
                  if (dropIndex !== -1) {
                    this.state.woodDrops.splice(dropIndex, 1);
                  }
                }
                worker.targetDrop = null;
                worker.state = WorkerState.ReturningToChipper;
              }
            }
          }
          break;

        case WorkerState.ReturningToChipper:
          // Only collectors return to chipper
          if (!isCollector) {
            worker.state = WorkerState.Idle;
            break;
          }

          // Move toward chipper
          const chipDx = chipperCenterX - worker.position.x;
          const chipDy = chipperCenterY - worker.position.y;
          const chipDist = Math.sqrt(chipDx * chipDx + chipDy * chipDy);

          if (chipDist < 40) {
            worker.state = WorkerState.Selling;
            worker.velocity.x = 0;
            worker.velocity.y = 0;
          } else if (chipDist > 0) {
            worker.velocity.x = (chipDx / chipDist) * effectiveSpeed;
            worker.velocity.y = (chipDy / chipDist) * effectiveSpeed;
            worker.facingRight = chipDx > 0;
          }
          break;

        case WorkerState.Selling:
          // Only collectors sell
          if (!isCollector) {
            worker.state = WorkerState.Idle;
            break;
          }

          if (worker.wood > 0) {
            const earnings = worker.wood * this.config.woodPricePerUnit;
            this.state.money += earnings;
            this.state.totalMoneyEarned += earnings;
            this.addFloatingText(chipperCenterX, chipper.y - 20, `+$${earnings}`, '#FFD700');
            this.spawnMoneyParticles(chipperCenterX, chipper.y);
            worker.wood = 0;
          }
          // Check if needs rest after selling
          if (worker.stamina <= 0) {
            worker.state = WorkerState.GoingToRest;
          } else {
            worker.state = WorkerState.Idle;
          }
          break;

        case WorkerState.GoingToRest:
          // Move toward shack
          const shackDx = shackCenterX - worker.position.x;
          const shackDy = shackCenterY - worker.position.y;
          const shackDist = Math.sqrt(shackDx * shackDx + shackDy * shackDy);

          if (shackDist < 30) {
            worker.state = WorkerState.Resting;
            worker.velocity.x = 0;
            worker.velocity.y = 0;
            worker.restTimer = worker.baseRestTime;
            this.addFloatingText(worker.position.x, worker.position.y - 20, 'Zzz...', '#88AAFF');
          } else if (shackDist > 0) {
            worker.velocity.x = (shackDx / shackDist) * effectiveSpeed;
            worker.velocity.y = (shackDy / shackDist) * effectiveSpeed;
            worker.facingRight = shackDx > 0;
          }
          break;

        case WorkerState.Resting:
          worker.velocity.x = 0;
          worker.velocity.y = 0;

          // Recover stamina (20% faster per upgrade level)
          const restMultiplier = Math.pow(1.2, workerUpgrades.restSpeed - 1);
          const restRate = 20 * restMultiplier; // Stamina per second
          worker.stamina += restRate * deltaTime;
          worker.restTimer -= deltaTime * restMultiplier;

          if (worker.restTimer <= 0 && worker.stamina >= worker.maxStamina) {
            worker.stamina = worker.maxStamina;
            worker.treesChopped = 0;
            worker.state = WorkerState.Idle;
            this.addFloatingText(worker.position.x, worker.position.y - 20, 'Ready!', '#00FF00');
          }
          break;

        case WorkerState.MovingToApple:
          // Only collectors use this state
          if (!isCollector) {
            worker.state = WorkerState.Idle;
            break;
          }

          // Check if worker needs rest
          if (worker.stamina <= 0) {
            worker.state = WorkerState.GoingToRest;
            worker.targetApple = null;
            break;
          }

          // Validate target apple still exists
          if (!worker.targetApple || !this.state.appleDrops.includes(worker.targetApple)) {
            worker.state = WorkerState.Idle;
            worker.targetApple = null;
            break;
          }

          // Move toward apple
          const appleDx = worker.targetApple.x - worker.position.x;
          const appleDy = worker.targetApple.y - worker.position.y;
          const appleDist = Math.sqrt(appleDx * appleDx + appleDy * appleDy);

          if (appleDist < 20) {
            // Close enough to collect
            worker.state = WorkerState.CollectingApple;
            worker.velocity.x = 0;
            worker.velocity.y = 0;
          } else if (appleDist > 0) {
            worker.velocity.x = (appleDx / appleDist) * effectiveSpeed;
            worker.velocity.y = (appleDy / appleDist) * effectiveSpeed;
            worker.facingRight = appleDx > 0;
          }
          break;

        case WorkerState.CollectingApple:
          // Only collectors use this state
          if (!isCollector) {
            worker.state = WorkerState.Idle;
            break;
          }

          worker.velocity.x = 0;
          worker.velocity.y = 0;

          // Check if apple is gone
          if (!worker.targetApple || !this.state.appleDrops.includes(worker.targetApple)) {
            worker.state = WorkerState.Idle;
            worker.targetApple = null;
            break;
          }

          // Pick up the apple
          const appleIndex = this.state.appleDrops.indexOf(worker.targetApple);
          if (appleIndex !== -1) {
            this.state.appleDrops.splice(appleIndex, 1);
          }
          worker.carryingApple = true;
          worker.targetApple = null;
          worker.state = WorkerState.ReturningWithApple;
          this.addFloatingText(worker.position.x, worker.position.y - 20, 'Got apple!', '#E53935');
          break;

        case WorkerState.ReturningWithApple:
          // Only collectors use this state
          if (!isCollector) {
            worker.state = WorkerState.Idle;
            break;
          }

          // Check if worker needs rest
          if (worker.stamina <= 0) {
            worker.state = WorkerState.GoingToRest;
            break;
          }

          // Move toward apple pile
          const { applePile } = this.state;
          const pileDx = applePile.x - worker.position.x;
          const pileDy = applePile.y - worker.position.y;
          const pileDist = Math.sqrt(pileDx * pileDx + pileDy * pileDy);

          if (pileDist < 30) {
            // Arrived at pile, deposit apple
            worker.velocity.x = 0;
            worker.velocity.y = 0;
            worker.carryingApple = false;
            this.state.applePile.count++;
            this.addFloatingText(applePile.x, applePile.y - 20, '+1 Apple!', '#E53935');
            worker.state = WorkerState.Idle;
          } else if (pileDist > 0) {
            worker.velocity.x = (pileDx / pileDist) * effectiveSpeed;
            worker.velocity.y = (pileDy / pileDist) * effectiveSpeed;
            worker.facingRight = pileDx > 0;
          }
          break;
      }

      // Apply velocity
      worker.position.x += worker.velocity.x * deltaTime;
      worker.position.y += worker.velocity.y * deltaTime;

      // Update phase timer
      if (worker.phaseTimer > 0) {
        worker.phaseTimer -= deltaTime;
      }

      // Check tree collisions for worker (skip if phasing)
      if (worker.phaseTimer <= 0) {
        this.handleTreeCollisions(worker.position, 5);
      }

      // Stuck detection for collectors - phase through trees
      if (isCollector && worker.state !== WorkerState.Resting && worker.state !== WorkerState.Idle) {
        const dx = worker.position.x - worker.lastPosition.x;
        const dy = worker.position.y - worker.lastPosition.y;
        const movedDist = Math.sqrt(dx * dx + dy * dy);

        // If barely moved but has velocity, increment stuck timer
        if (movedDist < 0.5 * deltaTime && (Math.abs(worker.velocity.x) > 1 || Math.abs(worker.velocity.y) > 1)) {
          worker.stuckTimer += deltaTime;

          // After 3 seconds stuck, enable phasing for 1 second
          if (worker.stuckTimer >= 3) {
            worker.phaseTimer = 1;
            worker.stuckTimer = 0;
            this.addFloatingText(worker.position.x, worker.position.y - 20, '*phase*', '#88FFFF');
          }
        } else {
          // Reset stuck timer if moving normally
          worker.stuckTimer = 0;
        }
      }

      // Stuck detection for choppers - break blocking trees
      if (isChopper && worker.state === WorkerState.MovingToTree) {
        const dx = worker.position.x - worker.lastPosition.x;
        const dy = worker.position.y - worker.lastPosition.y;
        const movedDist = Math.sqrt(dx * dx + dy * dy);

        // If barely moved but has velocity, increment stuck timer
        if (movedDist < 0.5 * deltaTime && (Math.abs(worker.velocity.x) > 1 || Math.abs(worker.velocity.y) > 1)) {
          worker.stuckTimer += deltaTime;

          // After 3 seconds stuck, target the nearest blocking tree
          if (worker.stuckTimer >= 3) {
            worker.stuckTimer = 0;
            // Find the nearest tree to the worker (blocking tree) - only search nearby chunks
            let nearestBlockingTree: Tree | null = null;
            let nearestBlockingDist = 50; // Only consider very close trees as blocking
            const workerChunkX = Math.floor(worker.position.x / this.config.chunkSize);
            const workerChunkY = Math.floor(worker.position.y / this.config.chunkSize);
            // Only search 3x3 chunks around worker
            for (let cdx = -1; cdx <= 1; cdx++) {
              for (let cdy = -1; cdy <= 1; cdy++) {
                const chunkKey = `${workerChunkX + cdx},${workerChunkY + cdy}`;
                const chunk = this.state.chunks.get(chunkKey);
                if (!chunk) continue;
                for (const tree of chunk.trees) {
                  if (tree.isDead) continue;
                  const treeDx = tree.x - worker.position.x;
                  const treeDy = tree.y - worker.position.y;
                  const treeDist = Math.sqrt(treeDx * treeDx + treeDy * treeDy);
                  if (treeDist < nearestBlockingDist) {
                    nearestBlockingDist = treeDist;
                    nearestBlockingTree = tree;
                  }
                }
              }
            }
            if (nearestBlockingTree && nearestBlockingTree !== worker.targetTree) {
              worker.targetTree = nearestBlockingTree;
              this.addFloatingText(worker.position.x, worker.position.y - 20, '*clearing path*', '#5A9C5A');
            }
          }
        } else {
          // Reset stuck timer if moving normally
          worker.stuckTimer = 0;
        }
      }

      // Stuck detection for choppers going to rest (out of stamina) - phase through trees
      if (isChopper && worker.state === WorkerState.GoingToRest) {
        const dx = worker.position.x - worker.lastPosition.x;
        const dy = worker.position.y - worker.lastPosition.y;
        const movedDist = Math.sqrt(dx * dx + dy * dy);

        if (movedDist < 0.5 * deltaTime && (Math.abs(worker.velocity.x) > 1 || Math.abs(worker.velocity.y) > 1)) {
          worker.stuckTimer += deltaTime;

          // After 3 seconds stuck, enable phasing for 1 second
          if (worker.stuckTimer >= 3) {
            worker.phaseTimer = 1;
            worker.stuckTimer = 0;
            this.addFloatingText(worker.position.x, worker.position.y - 20, '*phase*', '#88FFFF');
          }
        } else {
          worker.stuckTimer = 0;
        }
      }

      // Update last position for next frame
      worker.lastPosition.x = worker.position.x;
      worker.lastPosition.y = worker.position.y;
    }
  }

  private findNearestTreeForWorker(worker: Worker): Tree | null {
    let nearest: Tree | null = null;
    let nearestDist = Infinity;

    // Get chopper waypoints
    const chopperWaypoints = this.state.waypoints.filter(w => w.type === WaypointType.Chopper);
    const hasWaypoints = chopperWaypoints.length > 0;

    // Pre-compute tree targeting counts ONCE (avoid O(n²) filter in loop)
    const treeTargetCounts = new Map<Tree, number>();
    for (const w of this.state.workers) {
      if (w !== worker && w.targetTree) {
        treeTargetCounts.set(w.targetTree, (treeTargetCounts.get(w.targetTree) || 0) + 1);
      }
    }

    // If waypoints exist, get the chunks they're in
    const waypointChunks = new Set<string>();
    if (hasWaypoints) {
      for (const wp of chopperWaypoints) {
        const chunkX = Math.floor(wp.x / this.config.chunkSize);
        const chunkY = Math.floor(wp.y / this.config.chunkSize);
        waypointChunks.add(`${chunkX},${chunkY}`);
      }
    }

    // Calculate max range once
    const baseRange = 300;
    const maxRange = baseRange + worker.searchRadius * this.config.chunkSize;
    const maxRangeSq = maxRange * maxRange; // Use squared distance to avoid sqrt

    for (const chunk of this.state.chunks.values()) {
      const chunkKey = `${chunk.x},${chunk.y}`;

      // If waypoints exist, ONLY consider trees in waypoint chunks
      if (hasWaypoints && !waypointChunks.has(chunkKey)) {
        continue;
      }

      for (const tree of chunk.trees) {
        if (tree.isDead) continue;

        // All choppers can stack on the same tree (no limit)
        // This allows groups of choppers to work together efficiently

        const dx = tree.x - worker.position.x;
        const dy = tree.y - worker.position.y;
        const distSq = dx * dx + dy * dy;

        // Without waypoints, limit search range (use squared distance)
        if (!hasWaypoints && distSq > maxRangeSq) continue;

        if (distSq < nearestDist) {
          nearestDist = distSq;
          nearest = tree;
        }
      }
    }

    return nearest;
  }

  private handleTreeCollisions(position: { x: number; y: number }, entityRadius: number): void {
    // Only check chunks near the entity (3x3 grid around entity's chunk)
    const entityChunkX = Math.floor(position.x / this.config.chunkSize);
    const entityChunkY = Math.floor(position.y / this.config.chunkSize);

    for (let cdx = -1; cdx <= 1; cdx++) {
      for (let cdy = -1; cdy <= 1; cdy++) {
        const chunkKey = `${entityChunkX + cdx},${entityChunkY + cdy}`;
        const chunk = this.state.chunks.get(chunkKey);
        if (!chunk) continue;

        for (const tree of chunk.trees) {
          if (tree.isDead) continue;

          const treeRadius = TREE_STATS[tree.type].hitboxRadius;
          const minDist = entityRadius + treeRadius;

          // Tree hitbox is on the trunk, offset up from the base (tree.y)
          const treeHitboxY = tree.y - 15;

          const dx = position.x - tree.x;
          const dy = position.y - treeHitboxY;
          const distSq = dx * dx + dy * dy;
          const minDistSq = minDist * minDist;

          if (distSq < minDistSq && distSq > 0) {
            // Only compute sqrt when actually colliding
            const dist = Math.sqrt(distSq);
            const overlap = minDist - dist;
            const pushX = (dx / dist) * overlap;
            const pushY = (dy / dist) * overlap;

            position.x += pushX;
            position.y += pushY;
          }
        }
      }
    }
  }

  private findNearestWoodDrop(x: number, y: number, maxRange: number): WoodDrop | null {
    let nearest: WoodDrop | null = null;
    let nearestScoreSq = maxRange * maxRange; // Track effective score in squared space
    const maxRangeSq = maxRange * maxRange;

    // Get collector waypoints
    const collectorWaypoints = this.state.waypoints.filter(w => w.type === WaypointType.Collector);
    const waypointPrioritySq = 400 * 400; // Use squared distance

    // Pre-compute drop targeting counts ONCE (avoid O(n²) filter in loop)
    const dropTargetCounts = new Map<WoodDrop, number>();
    for (const w of this.state.workers) {
      if (w.targetDrop) {
        dropTargetCounts.set(w.targetDrop, (dropTargetCounts.get(w.targetDrop) || 0) + 1);
      }
    }

    for (const drop of this.state.woodDrops) {
      if (drop.amount <= 0) continue;

      // Allow up to 2 collectors per wood drop (O(1) lookup now)
      if ((dropTargetCounts.get(drop) || 0) >= 2) continue;

      const dx = drop.x - x;
      const dy = drop.y - y;
      const distSq = dx * dx + dy * dy;

      // Quick range check before expensive operations
      if (distSq > maxRangeSq * 4) continue; // Allow some slack for waypoint priority

      // Calculate effective score (may be reduced by waypoint priority)
      let scoreSq = distSq;

      // If there are waypoints, prioritize drops near waypoints
      if (collectorWaypoints.length > 0) {
        let nearestWaypointDistSq = Infinity;
        for (const wp of collectorWaypoints) {
          const wpDx = drop.x - wp.x;
          const wpDy = drop.y - wp.y;
          const wpDistSq = wpDx * wpDx + wpDy * wpDy;
          if (wpDistSq < nearestWaypointDistSq) nearestWaypointDistSq = wpDistSq;
        }
        // Drops near waypoints get priority (compare squared)
        if (nearestWaypointDistSq < waypointPrioritySq) {
          scoreSq = distSq * 0.09; // 0.3² = 0.09
        }
      }

      if (scoreSq < nearestScoreSq) {
        nearestScoreSq = scoreSq;
        nearest = drop;
      }
    }

    return nearest;
  }

  private findNearestApple(x: number, y: number, maxRange: number): AppleDrop | null {
    let nearest: AppleDrop | null = null;
    let nearestDistSq = maxRange * maxRange;

    // Pre-compute apple targeting counts
    const appleTargetCounts = new Map<AppleDrop, number>();
    for (const w of this.state.workers) {
      if (w.targetApple) {
        appleTargetCounts.set(w.targetApple, (appleTargetCounts.get(w.targetApple) || 0) + 1);
      }
    }

    for (const apple of this.state.appleDrops) {
      // Only allow 1 collector per apple
      if ((appleTargetCounts.get(apple) || 0) >= 1) continue;

      const dx = apple.x - x;
      const dy = apple.y - y;
      const distSq = dx * dx + dy * dy;

      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearest = apple;
      }
    }

    return nearest;
  }

  // Find closest wood drop, including current target but allowing up to 2 collectors per drop
  private findClosestWoodDrop(x: number, y: number, maxRange: number, currentTarget: WoodDrop | null): WoodDrop | null {
    let nearest: WoodDrop | null = null;
    let nearestScoreSq = maxRange * maxRange; // Track effective score in squared space
    const maxRangeSq = maxRange * maxRange;

    // Get collector waypoints
    const collectorWaypoints = this.state.waypoints.filter(w => w.type === WaypointType.Collector);
    const waypointPrioritySq = 400 * 400;

    // Pre-compute drop targeting counts ONCE
    const dropTargetCounts = new Map<WoodDrop, number>();
    for (const w of this.state.workers) {
      if (w.targetDrop) {
        dropTargetCounts.set(w.targetDrop, (dropTargetCounts.get(w.targetDrop) || 0) + 1);
      }
    }

    for (const drop of this.state.woodDrops) {
      if (drop.amount <= 0) continue;

      // Allow current target, but limit other drops to 2 collectors max
      if (drop !== currentTarget) {
        if ((dropTargetCounts.get(drop) || 0) >= 2) continue;
      }

      const dx = drop.x - x;
      const dy = drop.y - y;
      const distSq = dx * dx + dy * dy;

      if (distSq > maxRangeSq * 4) continue;

      // Calculate effective score (may be reduced by waypoint priority)
      let scoreSq = distSq;

      // If there are waypoints, prioritize drops near waypoints
      if (collectorWaypoints.length > 0) {
        let nearestWaypointDistSq = Infinity;
        for (const wp of collectorWaypoints) {
          const wpDx = drop.x - wp.x;
          const wpDy = drop.y - wp.y;
          const wpDistSq = wpDx * wpDx + wpDy * wpDy;
          if (wpDistSq < nearestWaypointDistSq) nearestWaypointDistSq = wpDistSq;
        }
        if (nearestWaypointDistSq < waypointPrioritySq) {
          scoreSq = distSq * 0.09;
        }
      }

      if (scoreSq < nearestScoreSq) {
        nearestScoreSq = scoreSq;
        nearest = drop;
      }
    }

    return nearest;
  }

  // Check if a chunk is now fully cleared (all trees dead) and mark it as gold/platinum bordered
  private checkChunkCleared(treeX: number, treeY: number): void {
    const chunkX = Math.floor(treeX / this.config.chunkSize);
    const chunkY = Math.floor(treeY / this.config.chunkSize);
    const key = `${chunkX},${chunkY}`;

    const chunk = this.state.chunks.get(key);
    if (!chunk) return;

    // Check if ALL trees in this chunk are dead
    const allDead = chunk.trees.every(tree => tree.isDead);
    if (!allDead) return;

    const centerX = chunkX * this.config.chunkSize + this.config.chunkSize / 2;
    const centerY = chunkY * this.config.chunkSize + this.config.chunkSize / 2;

    // Check if in challenge mode - upgrade to platinum
    if (this.state.challengeChunks.has(key)) {
      if (!this.state.platinumChunks.has(key)) {
        this.state.platinumChunks.add(key);
        this.addFloatingText(centerX, centerY, 'PLATINUM CHUNK!', '#E5E4E2');
      }
      // Disable challenge mode after clearing
      this.state.challengeChunks.delete(key);
    } else if (!this.state.clearedChunks.has(key) && !this.state.platinumChunks.has(key)) {
      // First time clear - gold
      this.state.clearedChunks.add(key);
      this.addFloatingText(centerX, centerY, 'CHUNK CLEARED!', '#FFD700');
    }
  }

  // Toggle challenge mode on a gold/platinum chunk (only when fully zoomed out)
  public toggleChunkChallenge(chunkX: number, chunkY: number): boolean {
    const key = `${chunkX},${chunkY}`;

    // Can only toggle on gold or platinum chunks
    if (!this.state.clearedChunks.has(key) && !this.state.platinumChunks.has(key)) {
      return false;
    }

    // Check cooldown (5 minutes = 300 seconds)
    const cooldown = this.state.chunkToggleCooldowns.get(key) || 0;
    if (cooldown > 0) {
      const centerX = chunkX * this.config.chunkSize + this.config.chunkSize / 2;
      const centerY = chunkY * this.config.chunkSize + this.config.chunkSize / 2;
      this.addFloatingText(centerX, centerY, `Wait ${Math.ceil(cooldown)}s`, '#FF4444');
      return false;
    }

    // Ensure chunk is loaded - generate it if not present
    let chunk = this.state.chunks.get(key);
    if (!chunk) {
      chunk = generateChunk(chunkX, chunkY, this.config, this.state.worldSeed);
      this.state.chunks.set(key, chunk);
    }

    const centerX = chunkX * this.config.chunkSize + this.config.chunkSize / 2;
    const centerY = chunkY * this.config.chunkSize + this.config.chunkSize / 2;

    if (this.state.challengeChunks.has(key)) {
      // Turn OFF challenge mode
      this.state.challengeChunks.delete(key);
      this.addFloatingText(centerX, centerY, 'Challenge OFF', '#AAAAAA');
    } else {
      // Turn ON challenge mode
      this.state.challengeChunks.add(key);
      this.addFloatingText(centerX, centerY, 'CHALLENGE ON!', '#FF6600');
    }

    // Respawn all trees in this chunk with appropriate health
    const isChallenge = this.state.challengeChunks.has(key);
    const isPlatinum = this.state.platinumChunks.has(key);
    // Platinum gets 4x health, gold gets 2x health
    const healthMultiplier = isChallenge ? (isPlatinum ? 4 : 2) : 1;
    for (const tree of chunk.trees) {
      tree.isDead = false;
      tree.respawnTimer = 0;
      tree.health = tree.maxHealth * healthMultiplier;
      // Also remove from dead trees map so save/load works correctly
      this.deadTreesMap.delete(tree.id);
    }

    // Set 5 minute cooldown
    this.state.chunkToggleCooldowns.set(key, 300);

    return true;
  }

  // Check if a tree is in a challenge chunk and return multiplier (0 = not challenge, 2 = gold, 4 = platinum)
  public getChallengeMultiplier(treeX: number, treeY: number): number {
    const chunkX = Math.floor(treeX / this.config.chunkSize);
    const chunkY = Math.floor(treeY / this.config.chunkSize);
    const key = `${chunkX},${chunkY}`;
    if (!this.state.challengeChunks.has(key)) return 1;
    // Platinum chunks get 4x, gold chunks get 2x
    return this.state.platinumChunks.has(key) ? 4 : 2;
  }

  // Load 3x3 chunks around each worker and waypoint so they can always find trees/drops
  private loadWorkerChunks(): void {
    // Track which chunk centers we've already processed to avoid redundant work
    const processedCenters = new Set<string>();

    // Load chunks around workers
    for (const worker of this.state.workers) {
      const centerKey = `${Math.floor(worker.position.x / this.config.chunkSize)},${Math.floor(worker.position.y / this.config.chunkSize)}`;
      if (!processedCenters.has(centerKey)) {
        processedCenters.add(centerKey);
        this.loadChunksAround(worker.position.x, worker.position.y);
      }
    }

    // Load chunks around worker waypoints
    for (const waypoint of this.state.waypoints) {
      const centerKey = `${Math.floor(waypoint.x / this.config.chunkSize)},${Math.floor(waypoint.y / this.config.chunkSize)}`;
      if (!processedCenters.has(centerKey)) {
        processedCenters.add(centerKey);
        this.loadChunksAround(waypoint.x, waypoint.y);
      }
    }

    // Load chunks around player waypoint
    if (this.state.playerWaypoint) {
      const centerKey = `${Math.floor(this.state.playerWaypoint.x / this.config.chunkSize)},${Math.floor(this.state.playerWaypoint.y / this.config.chunkSize)}`;
      if (!processedCenters.has(centerKey)) {
        processedCenters.add(centerKey);
        this.loadChunksAround(this.state.playerWaypoint.x, this.state.playerWaypoint.y);
      }
    }
  }

  private loadChunksAround(x: number, y: number): void {
    const centerChunkX = Math.floor(x / this.config.chunkSize);
    const centerChunkY = Math.floor(y / this.config.chunkSize);

    // Load 3x3 grid around position
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const chunkX = centerChunkX + dx;
        const chunkY = centerChunkY + dy;
        const key = `${chunkX},${chunkY}`;

        if (!this.state.chunks.has(key)) {
          this.state.chunks.set(key, generateChunk(chunkX, chunkY, this.config, this.state.worldSeed));
        }
      }
    }
  }

  // Get all chunk keys that should be protected from unloading (worker/waypoint areas)
  private getProtectedChunks(): Set<string> {
    const protected_ = new Set<string>();

    // Protect 3x3 around each worker
    for (const worker of this.state.workers) {
      const centerX = Math.floor(worker.position.x / this.config.chunkSize);
      const centerY = Math.floor(worker.position.y / this.config.chunkSize);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          protected_.add(`${centerX + dx},${centerY + dy}`);
        }
      }
    }

    // Protect 3x3 around each waypoint
    for (const waypoint of this.state.waypoints) {
      const centerX = Math.floor(waypoint.x / this.config.chunkSize);
      const centerY = Math.floor(waypoint.y / this.config.chunkSize);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          protected_.add(`${centerX + dx},${centerY + dy}`);
        }
      }
    }

    // Protect 3x3 around player waypoint
    if (this.state.playerWaypoint) {
      const centerX = Math.floor(this.state.playerWaypoint.x / this.config.chunkSize);
      const centerY = Math.floor(this.state.playerWaypoint.y / this.config.chunkSize);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          protected_.add(`${centerX + dx},${centerY + dy}`);
        }
      }
    }

    return protected_;
  }

  // Get config for click handling
  public getConfig(): GameConfig {
    return this.config;
  }

  // Get state for click handling
  public getState(): GameState {
    return this.state;
  }

  // Get catch-up time remaining for UI display
  public getCatchUpTime(): number {
    return this.catchUpTimeRemaining;
  }

  // Get waypoint placement mode for UI display
  public getWaypointMode(): WaypointType | null {
    return this.waypointPlacementMode;
  }

  private render(): void {
    render(this.ctx, this.state, this.sprites, this.config, this.catchUpTimeRemaining, this.waypointPlacementMode, this.regenCooldown, this.cheatMenuOpen, this.treeChecklistOpen);
  }
}
