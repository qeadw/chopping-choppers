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
  TREE_CHOP_MILESTONES,
} from '../types';
import { createPlayer, updatePlayer, createCamera, updateCamera, canChop, startChop, MilestoneBonuses } from './player';
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
  // Legacy fields for backward compatibility
  clearedChunks?: string[];  // Legacy: Chunks that were fully cleared at once (now bronzeChunks)
  // New tier system
  bronzeChunks?: string[];   // Tier 1: First clear
  silverChunks?: string[];   // Tier 2: Clear bronze challenge 2x
  goldChunks?: string[];     // Tier 3: Clear silver challenge 4x
  platinumChunks?: string[]; // Tier 4: Clear gold challenge 8x
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
  // Keybinds
  keybinds?: Record<string, string>;
  // Effective upgrades (stats that can be lowered)
  effectiveUpgrades?: { axePower: number; moveSpeed: number; chopSpeed: number; carryCapacity: number };
  effectiveWorkerUpgrades?: { restSpeed: number; workDuration: number; workerSpeed: number; workerPower: number };
  // Stat multipliers (0-1) for fine-grained control
  statMultipliers?: Record<string, number>;
  // Squad follow distance
  squadFollowDistance?: number;
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
  private squadMenuOpen: boolean = false; // Whether squad menu is visible
  private squadFollowDistance: number = 200; // How far squad workers can stray from player (pixels)
  private optionsMenuOpen: boolean = false; // Whether options menu is visible
  private optionsMenuSelection: number = 0; // Currently selected option in options menu
  private editingKeybind: string | null = null; // Which keybind is being edited (null = none)
  private platinumChunkRegenTimers: Map<string, number> = new Map(); // Timers for platinum chunk tree regeneration

  // Effective upgrade levels (can be lowered for testing/preference)
  private effectiveUpgrades = {
    axePower: 1,
    moveSpeed: 1,
    chopSpeed: 1,
    carryCapacity: 1,
  };
  private effectiveWorkerUpgrades = {
    restSpeed: 1,
    workDuration: 1,
    workerSpeed: 1,
    workerPower: 1,
  };

  // Stat multipliers (0-1) applied to final calculated values, allowing true minimum of ~1
  private statMultipliers = {
    axePower: 1.0,
    moveSpeed: 1.0,
    chopSpeed: 1.0,
    carryCapacity: 1.0,
    restSpeed: 1.0,
    workDuration: 1.0,
    workerSpeed: 1.0,
    workerPower: 1.0,
  };

  // Customizable keybinds (all game keybinds)
  private keybinds: Record<string, string> = {
    // Movement
    moveUp: 'w',
    moveDown: 's',
    moveLeft: 'a',
    moveRight: 'd',
    // Actions
    chop: ' ',
    interact: 'e',
    // Menus
    squadMenu: 'q',
    treeChecklist: 'l',
    optionsMenu: 'o',
    toggleUI: 'F2',
    // Toggles
    toggleStumpTimers: 't',
    toggleChoppers: 'c',
    toggleCollectors: 'v',
    // Workers
    hireChopper: 'j',
    hireCollector: 'k',
    // Waypoints (zoomed out)
    placeChopperWaypoint: 'q',
    placeCollectorWaypoint: 'r',
    placePlayerWaypoint: 'f',
    placeWoodWaypoint: 'y',
    clearWaypoints: 'x',
    // Other
    teleportHome: 'Home',
  };
  private keybindsMenuOpen: boolean = false;
  private keybindsMenuSelection: number = 0;
  private cheatBuffer: string = ''; // Buffer for detecting "cheater" typed

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
      bronzeChunks: new Set<string>(),
      silverChunks: new Set<string>(),
      goldChunks: new Set<string>(),
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

    // Setup hire worker key handler - uses keybinds object for customization
    this.hireKeyHandler = (e: KeyboardEvent) => {
      // Save code detection ("save")
      if (e.key.length === 1) {
        this.saveBuffer = (this.saveBuffer + e.key).slice(-4);
        if (this.saveBuffer.toLowerCase() === 'save') {
          this.saveBuffer = '';
          if (this.onSaveRequested) {
            this.onSaveRequested();
          }
          return;
        }
        // Cheat menu detection ("cheater")
        this.cheatBuffer = (this.cheatBuffer + e.key).slice(-7);
        if (this.cheatBuffer.toLowerCase() === 'cheater') {
          this.cheatBuffer = '';
          this.toggleCheatMenu();
          return;
        }
      }

      const key = e.key.toLowerCase();
      const keyRaw = e.key; // For special keys like F2

      // Helper to check keybind match
      const matchKey = (bindName: string) => {
        const bind = this.keybinds[bindName]?.toLowerCase();
        return bind === key || bind === keyRaw;
      };

      if (matchKey('hireChopper')) {
        this.hireWorker(WorkerType.Chopper);
      } else if (matchKey('hireCollector')) {
        this.hireWorker(WorkerType.Collector);
      } else if (matchKey('toggleStumpTimers')) {
        this.state.showStumpTimers = !this.state.showStumpTimers;
      } else if (matchKey('toggleChoppers')) {
        // Toggle choppers
        this.state.choppersEnabled = !this.state.choppersEnabled;
        const status = this.state.choppersEnabled ? 'ENABLED' : 'DISABLED';
        this.addFloatingText(this.state.player.position.x, this.state.player.position.y - 30, `Choppers ${status}`, this.state.choppersEnabled ? '#00FF00' : '#FF4444');
      } else if (matchKey('toggleCollectors')) {
        // Toggle collectors
        this.state.collectorsEnabled = !this.state.collectorsEnabled;
        const status = this.state.collectorsEnabled ? 'ENABLED' : 'DISABLED';
        this.addFloatingText(this.state.player.position.x, this.state.player.position.y - 30, `Collectors ${status}`, this.state.collectorsEnabled ? '#00FF00' : '#FF4444');
      } else if (matchKey('placeChopperWaypoint') && this.state.camera.zoom <= 0.15) {
        // Toggle chopper waypoint placement mode
        if (this.waypointPlacementMode === WaypointType.Chopper) {
          this.waypointPlacementMode = null;
        } else {
          this.waypointPlacementMode = WaypointType.Chopper;
          this.addFloatingText(this.state.player.position.x, this.state.player.position.y - 30, 'Click to place CHOPPER waypoint', '#5A9C5A');
        }
      } else if (matchKey('placeCollectorWaypoint') && this.state.camera.zoom <= 0.15) {
        // Toggle collector waypoint placement mode
        if (this.waypointPlacementMode === WaypointType.Collector) {
          this.waypointPlacementMode = null;
        } else {
          this.waypointPlacementMode = WaypointType.Collector;
          this.addFloatingText(this.state.player.position.x, this.state.player.position.y - 30, 'Click to place COLLECTOR waypoint', '#88AAFF');
        }
      } else if (matchKey('placePlayerWaypoint') && this.state.camera.zoom <= 0.15) {
        // Toggle player waypoint placement mode
        if (this.waypointPlacementMode === WaypointType.Player) {
          this.waypointPlacementMode = null;
        } else {
          this.waypointPlacementMode = WaypointType.Player;
          this.addFloatingText(this.state.player.position.x, this.state.player.position.y - 30, 'Click to place PLAYER waypoint', '#FFD700');
        }
      } else if (matchKey('placeWoodWaypoint') && this.state.camera.zoom <= 0.15) {
        // Toggle collector wood waypoint placement mode
        if (this.waypointPlacementMode === WaypointType.CollectorWood) {
          this.waypointPlacementMode = null;
        } else {
          this.waypointPlacementMode = WaypointType.CollectorWood;
          this.addFloatingText(this.state.player.position.x, this.state.player.position.y - 30, 'Click to place WOOD COLLECT waypoint', '#FFAA44');
        }
      } else if (matchKey('clearWaypoints') && this.state.camera.zoom <= 0.15) {
        // Clear all waypoints
        this.state.waypoints = [];
        this.state.playerWaypoint = null;
        this.addFloatingText(this.state.player.position.x, this.state.player.position.y - 30, 'Waypoints cleared', '#AAAAAA');
      } else if (matchKey('treeChecklist')) {
        // Toggle tree checklist
        this.toggleTreeChecklist();
      } else if (matchKey('squadMenu') && this.state.camera.zoom > 0.15) {
        // Toggle squad menu (only when not zoomed out, since Q is also waypoint)
        this.toggleSquadMenu();
      } else if (matchKey('optionsMenu')) {
        // Toggle options menu
        this.toggleOptionsMenu();
      } else if (matchKey('toggleUI')) {
        // Toggle UI visibility
        e.preventDefault();
        this.state.uiHidden = !this.state.uiHidden;
      } else if (this.keybindsMenuOpen) {
        // Keybinds menu navigation
        if (key === 'arrowup' || key === 'w') {
          this.keybindsMenuSelection = Math.max(0, this.keybindsMenuSelection - 1);
        } else if (key === 'arrowdown' || key === 's') {
          const keybindNames = Object.keys(this.keybinds);
          this.keybindsMenuSelection = Math.min(keybindNames.length - 1, this.keybindsMenuSelection + 1);
        } else if (key === 'enter' || key === ' ') {
          // Start editing selected keybind
          const keybindNames = Object.keys(this.keybinds);
          this.editingKeybind = keybindNames[this.keybindsMenuSelection];
        } else if (key === 'escape' || key === 'backspace') {
          // Go back to options menu
          this.keybindsMenuOpen = false;
          this.optionsMenuOpen = true;
        } else if (this.editingKeybind) {
          // Capture new keybind
          e.preventDefault();
          if (key !== 'escape') {
            this.keybinds[this.editingKeybind] = e.key === ' ' ? 'Space' : e.key;
          }
          this.editingKeybind = null;
        }
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
        } else if (key === 's') {
          // Set seed - prompt for new seed
          const newSeed = prompt('Enter new world seed (number):', String(this.state.worldSeed));
          if (newSeed !== null && !isNaN(Number(newSeed))) {
            this.changeSeed(Number(newSeed));
          }
        } else if (key === 'r') {
          // Randomize seed
          this.changeSeed(this.generateWorldSeed());
          this.addFloatingText(this.state.player.position.x, this.state.player.position.y - 30, `New random seed: ${this.state.worldSeed}`, '#FF00FF');
        } else if (key === 'a') {
          // Add apples
          this.state.applePile.count += 10;
          this.addFloatingText(this.state.player.position.x, this.state.player.position.y - 30, '+10 Apples (cheat)', '#FF00FF');
        } else if (key === 't') {
          // Add offline time (simulates 1 hour of progress)
          this.addFloatingText(this.state.player.position.x, this.state.player.position.y - 30, '+1 hour offline time (cheat)', '#FF00FF');
          this.simulateOfflineProgress(3600);
        } else if (key === 'p') {
          // Set apple buff time
          const newTime = prompt('Set apple buff time (seconds):', String(Math.ceil(this.state.appleBuff.remainingTime)));
          if (newTime !== null && !isNaN(Number(newTime))) {
            this.state.appleBuff.remainingTime = Number(newTime);
            this.state.appleBuff.active = Number(newTime) > 0;
            this.addFloatingText(this.state.player.position.x, this.state.player.position.y - 30, `Buff time: ${newTime}s`, '#FF00FF');
          }
        } else if (key === 'd') {
          // Set speed multiplier
          const newSpeed = prompt('Set apple speed multiplier:', String(this.state.appleBuff.speedMultiplier));
          if (newSpeed !== null && !isNaN(Number(newSpeed))) {
            this.state.appleBuff.speedMultiplier = Number(newSpeed);
            this.addFloatingText(this.state.player.position.x, this.state.player.position.y - 30, `Speed: ${newSpeed}x`, '#FF00FF');
          }
        } else if (key === 'f') {
          // Set damage multiplier
          const newDamage = prompt('Set apple damage multiplier:', String(this.state.appleBuff.damageMultiplier));
          if (newDamage !== null && !isNaN(Number(newDamage))) {
            this.state.appleBuff.damageMultiplier = Number(newDamage);
            this.addFloatingText(this.state.player.position.x, this.state.player.position.y - 30, `Damage: ${newDamage}x`, '#FF00FF');
          }
        } else if (key === 'u') {
          // Max all upgrades (free)
          this.state.upgrades.axePower = 5;
          this.state.upgrades.moveSpeed = 4;
          this.state.upgrades.chopSpeed = 4;
          this.state.upgrades.carryCapacity = 5;
          this.state.workerUpgrades.restSpeed = 4;
          this.state.workerUpgrades.workDuration = 4;
          this.state.workerUpgrades.workerSpeed = 4;
          this.state.workerUpgrades.workerPower = 4;
          this.addFloatingText(this.state.player.position.x, this.state.player.position.y - 30, 'All upgrades maxed!', '#FF00FF');
        } else if (key === 'w') {
          // Add 5 free choppers
          for (let i = 0; i < 5; i++) {
            this.spawnWorkerSilent(WorkerType.Chopper);
          }
          this.addFloatingText(this.state.player.position.x, this.state.player.position.y - 30, '+5 Choppers (free)', '#FF00FF');
        } else if (key === 'e') {
          // Add 5 free collectors
          for (let i = 0; i < 5; i++) {
            this.spawnWorkerSilent(WorkerType.Collector);
          }
          this.addFloatingText(this.state.player.position.x, this.state.player.position.y - 30, '+5 Collectors (free)', '#FF00FF');
        }
      } else if (this.squadMenuOpen) {
        // Squad menu actions
        if (key === '1') {
          // Add chopper to escort
          this.addToEscort(WorkerType.Chopper, 1);
        } else if (key === '2') {
          // Add collector to escort
          this.addToEscort(WorkerType.Collector, 1);
        } else if (key === '3') {
          // Release chopper from escort
          this.releaseFromEscort(WorkerType.Chopper, 1);
        } else if (key === '4') {
          // Release collector from escort
          this.releaseFromEscort(WorkerType.Collector, 1);
        } else if (key === '5') {
          // Release all
          this.releaseAllEscort();
        } else if (key === '!') {
          // Add all choppers to escort (shift+1)
          this.addToEscort(WorkerType.Chopper, 999);
        } else if (key === '@') {
          // Add all collectors to escort (shift+2)
          this.addToEscort(WorkerType.Collector, 999);
        } else if (key === '6' || key === '-') {
          // Decrease squad follow distance
          this.squadFollowDistance = Math.max(50, this.squadFollowDistance - 50);
          this.addFloatingText(this.state.player.position.x, this.state.player.position.y - 30, `Follow distance: ${this.squadFollowDistance}px`, '#88CCFF');
        } else if (key === '7' || key === '=' || key === '+') {
          // Increase squad follow distance
          this.squadFollowDistance = Math.min(800, this.squadFollowDistance + 50);
          this.addFloatingText(this.state.player.position.x, this.state.player.position.y - 30, `Follow distance: ${this.squadFollowDistance}px`, '#88CCFF');
        } else if (key === '0') {
          // Reset squad follow distance to default
          this.squadFollowDistance = 200;
          this.addFloatingText(this.state.player.position.x, this.state.player.position.y - 30, `Follow distance reset: ${this.squadFollowDistance}px`, '#88CCFF');
        }
      } else if (this.optionsMenuOpen) {
        // Options menu actions
        const options = this.getOptionsMenuOptions();
        if (key === 'arrowup' || key === 'w') {
          this.optionsMenuSelection = Math.max(0, this.optionsMenuSelection - 1);
        } else if (key === 'arrowdown' || key === 's') {
          this.optionsMenuSelection = Math.min(options.length - 1, this.optionsMenuSelection + 1);
        } else if (key === 'arrowleft' || key === 'a') {
          this.adjustOptionValue(-1);
        } else if (key === 'arrowright' || key === 'd') {
          this.adjustOptionValue(1);
        } else if (key === 'enter' || key === ' ') {
          const opt = options[this.optionsMenuSelection];
          if (opt && opt.type === 'button' && opt.key === 'keybinds') {
            this.optionsMenuOpen = false;
            this.keybindsMenuOpen = true;
            this.keybindsMenuSelection = 0;
          } else if (opt && opt.type === 'stat') {
            // Prompt for value input
            this.promptStatValue(opt.key);
          }
        } else if (key === 'escape' || matchKey('optionsMenu')) {
          this.optionsMenuOpen = false;
          this.saveProgress(); // Save when closing options
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

      // Check if cheat menu is open - clicking outside closes it
      if (this.cheatMenuOpen) {
        const menuWidth = 300;
        const menuHeight = 480;
        const menuX = (this.canvas.width - menuWidth) / 2;
        const menuY = (this.canvas.height - menuHeight) / 2;

        // If click is outside the menu, close it
        if (screenX < menuX || screenX > menuX + menuWidth ||
            screenY < menuY || screenY > menuY + menuHeight) {
          this.cheatMenuOpen = false;
        }
        return; // Don't process other clicks while cheat menu is open
      }

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

      // Only allow on silver+ tier chunks that are in challenge mode
      const tier = this.getChunkTier(chunkKey);
      if (tier < 2) {
        this.addFloatingText(worldX, worldY, 'Silver+ tier only!', '#FF4444');
        return;
      }

      if (!this.state.challengeChunks.has(chunkKey)) {
        this.addFloatingText(worldX, worldY, 'Must be in challenge mode!', '#FF4444');
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
        bronzeChunks: Array.from(this.state.bronzeChunks),
        silverChunks: Array.from(this.state.silverChunks),
        goldChunks: Array.from(this.state.goldChunks),
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
        // Keybinds
        keybinds: this.keybinds,
        // Effective upgrades
        effectiveUpgrades: this.effectiveUpgrades,
        effectiveWorkerUpgrades: this.effectiveWorkerUpgrades,
        // Stat multipliers
        statMultipliers: this.statMultipliers,
        // Squad follow distance
        squadFollowDistance: this.squadFollowDistance,
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

      // Restore chunk tiers (with backward compatibility)
      // Legacy: clearedChunks -> bronzeChunks, old platinumChunks -> silverChunks
      if (data.bronzeChunks && data.bronzeChunks.length > 0) {
        this.state.bronzeChunks = new Set(data.bronzeChunks);
      } else if (data.clearedChunks && data.clearedChunks.length > 0) {
        // Backward compatibility: old clearedChunks -> bronzeChunks
        this.state.bronzeChunks = new Set(data.clearedChunks);
      }

      if (data.silverChunks && data.silverChunks.length > 0) {
        this.state.silverChunks = new Set(data.silverChunks);
      } else if (data.platinumChunks && data.platinumChunks.length > 0 && !data.silverChunks) {
        // Backward compatibility: old platinumChunks -> silverChunks (only if no silverChunks)
        this.state.silverChunks = new Set(data.platinumChunks);
      }

      if (data.goldChunks && data.goldChunks.length > 0) {
        this.state.goldChunks = new Set(data.goldChunks);
      }

      // New platinum chunks (tier 4)
      if (data.platinumChunks && data.platinumChunks.length > 0 && data.silverChunks) {
        // Only load as new platinum if we have the new tier system
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

      // Restore keybinds
      if (data.keybinds) {
        this.keybinds = { ...this.keybinds, ...data.keybinds };
      }

      // Restore effective upgrades, or sync with actual upgrades if not saved
      if (data.effectiveUpgrades) {
        this.effectiveUpgrades = { ...this.effectiveUpgrades, ...data.effectiveUpgrades };
      } else {
        // No saved effective upgrades - sync with actual upgrades
        this.effectiveUpgrades = { ...this.state.upgrades };
      }
      if (data.effectiveWorkerUpgrades) {
        this.effectiveWorkerUpgrades = { ...this.effectiveWorkerUpgrades, ...data.effectiveWorkerUpgrades };
      } else {
        // No saved effective worker upgrades - sync with actual upgrades
        this.effectiveWorkerUpgrades = { ...this.state.workerUpgrades };
      }

      // Restore stat multipliers
      if (data.statMultipliers) {
        this.statMultipliers = { ...this.statMultipliers, ...data.statMultipliers };
      }

      // Restore squad follow distance
      if (data.squadFollowDistance !== undefined) {
        this.squadFollowDistance = data.squadFollowDistance;
      }

      // Ensure effective upgrades don't exceed actual upgrades (in case upgrades changed)
      this.effectiveUpgrades.axePower = Math.min(this.effectiveUpgrades.axePower, this.state.upgrades.axePower);
      this.effectiveUpgrades.moveSpeed = Math.min(this.effectiveUpgrades.moveSpeed, this.state.upgrades.moveSpeed);
      this.effectiveUpgrades.chopSpeed = Math.min(this.effectiveUpgrades.chopSpeed, this.state.upgrades.chopSpeed);
      this.effectiveUpgrades.carryCapacity = Math.min(this.effectiveUpgrades.carryCapacity, this.state.upgrades.carryCapacity);
      this.effectiveWorkerUpgrades.restSpeed = Math.min(this.effectiveWorkerUpgrades.restSpeed, this.state.workerUpgrades.restSpeed);
      this.effectiveWorkerUpgrades.workDuration = Math.min(this.effectiveWorkerUpgrades.workDuration, this.state.workerUpgrades.workDuration);
      this.effectiveWorkerUpgrades.workerSpeed = Math.min(this.effectiveWorkerUpgrades.workerSpeed, this.state.workerUpgrades.workerSpeed);
      this.effectiveWorkerUpgrades.workerPower = Math.min(this.effectiveWorkerUpgrades.workerPower, this.state.workerUpgrades.workerPower);

      // Ensure stat multipliers are valid (0-1 range)
      for (const key of Object.keys(this.statMultipliers) as (keyof typeof this.statMultipliers)[]) {
        this.statMultipliers[key] = Math.max(0.001, Math.min(1, this.statMultipliers[key]));
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

      // Get multiplier based on tier
      const multiplier = this.getChallengeMultiplierForTier(key);

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

    // Bring escort workers with the player
    const escortingWorkers = this.state.workers.filter(w => w.isEscorting);
    for (let i = 0; i < escortingWorkers.length; i++) {
      // Position escorts in a circle around the player
      const angle = (i / escortingWorkers.length) * Math.PI * 2;
      const radius = 30 + Math.floor(i / 8) * 20; // Expand radius for more workers
      escortingWorkers[i].position.x = Math.cos(angle) * radius;
      escortingWorkers[i].position.y = Math.sin(angle) * radius;
      escortingWorkers[i].velocity.x = 0;
      escortingWorkers[i].velocity.y = 0;
    }

    // NOTE: Player waypoint is intentionally NOT cleared on teleport
    // so players can easily return to where they were exploring

    // Save immediately after teleport to ensure waypoint is persisted
    this.saveProgress();

    // Spawn particles at new location
    this.spawnMoneyParticles(0, 0);

    const escortCount = escortingWorkers.length;
    const escortText = escortCount > 0 ? ` (+${escortCount} squad)` : '';
    const waypointText = this.state.playerWaypoint ? ' (waypoint saved)' : '';
    this.addFloatingText(0, -30, `Teleported! -$${cost}${escortText}${waypointText}`, '#FFD700');
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

  public changeSeed(newSeed: number): void {
    this.state.worldSeed = newSeed;
    // Clear all existing chunks to regenerate with new seed
    this.state.chunks.clear();
    // Regenerate chunks around player
    updateChunks(this.state.chunks, this.state.camera, this.config, this.state.worldSeed);
    this.addFloatingText(
      this.state.player.position.x,
      this.state.player.position.y - 30,
      `Seed changed to: ${newSeed}`,
      '#FF00FF'
    );
  }

  public simulateOfflineProgress(seconds: number): void {
    // Simulate worker progress for the given number of seconds
    // This is a simplified simulation that just gives resources
    const chopperCount = this.state.workers.filter(w => w.type === WorkerType.Chopper).length;
    const collectorCount = this.state.workers.filter(w => w.type === WorkerType.Collector).length;

    // Estimate wood per second (rough approximation)
    const woodPerSecond = (chopperCount * 0.5) + (collectorCount * 0.3);
    const totalWood = Math.floor(woodPerSecond * seconds);

    // Add money directly (assume auto-sell)
    const moneyGained = totalWood;
    this.state.money += moneyGained;
    this.state.totalWoodChopped += totalWood;
    this.state.totalMoneyEarned += moneyGained;

    this.addFloatingText(
      this.state.player.position.x,
      this.state.player.position.y - 50,
      `Offline: +$${moneyGained.toLocaleString()}`,
      '#FFD700'
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

  public toggleSquadMenu(): void {
    this.squadMenuOpen = !this.squadMenuOpen;
    if (this.squadMenuOpen) {
      this.cheatMenuOpen = false;
      this.treeChecklistOpen = false;
    }
  }

  public isSquadMenuOpen(): boolean {
    return this.squadMenuOpen;
  }

  public toggleOptionsMenu(): void {
    this.optionsMenuOpen = !this.optionsMenuOpen;
    if (this.optionsMenuOpen) {
      this.cheatMenuOpen = false;
      this.treeChecklistOpen = false;
      this.squadMenuOpen = false;
      this.optionsMenuSelection = 0;
      this.editingKeybind = null;
      // Don't reset effective upgrades - preserve user's choices
    }
  }

  public isOptionsMenuOpen(): boolean {
    return this.optionsMenuOpen;
  }

  public getOptionsMenuState(): {
    selection: number;
    editingKeybind: string | null;
    keybinds: Record<string, string>;
    effectiveUpgrades: { axePower: number; moveSpeed: number; chopSpeed: number; carryCapacity: number };
    effectiveWorkerUpgrades: { restSpeed: number; workDuration: number; workerSpeed: number; workerPower: number };
    maxUpgrades: { axePower: number; moveSpeed: number; chopSpeed: number; carryCapacity: number };
    maxWorkerUpgrades: { restSpeed: number; workDuration: number; workerSpeed: number; workerPower: number };
    statValues: Record<string, { current: number; min: number; max: number }>;
  } {
    // Calculate actual stat values for all stats with multipliers applied
    const statValues: Record<string, { current: number; min: number; max: number }> = {};
    const playerStats = ['axePower', 'moveSpeed', 'chopSpeed', 'carryCapacity'];
    const workerStats = ['restSpeed', 'workDuration', 'workerSpeed', 'workerPower'];

    for (const key of playerStats) {
      const maxValue = this.getMaxStatValue(key);
      const multiplier = this.statMultipliers[key as keyof typeof this.statMultipliers] ?? 1;
      statValues[key] = {
        current: Math.max(1, maxValue * multiplier),
        min: 1,
        max: maxValue,
      };
    }

    for (const key of workerStats) {
      const maxLevel = this.state.workerUpgrades[key as keyof typeof this.state.workerUpgrades];
      const maxValue = this.getStatValue(key, maxLevel);
      const multiplier = this.statMultipliers[key as keyof typeof this.statMultipliers] ?? 1;
      statValues[key] = {
        current: Math.max(1, maxValue * multiplier),
        min: 1,
        max: maxValue,
      };
    }

    return {
      selection: this.optionsMenuSelection,
      editingKeybind: this.editingKeybind,
      keybinds: this.keybinds,
      effectiveUpgrades: this.effectiveUpgrades,
      effectiveWorkerUpgrades: this.effectiveWorkerUpgrades,
      maxUpgrades: this.state.upgrades,
      maxWorkerUpgrades: this.state.workerUpgrades,
      statValues,
    };
  }

  private getOptionsMenuOptions(): Array<{ label: string; type: 'stat' | 'button'; key: string; category: string }> {
    return [
      // Player stats
      { label: 'Axe Power', type: 'stat', key: 'axePower', category: 'Player' },
      { label: 'Move Speed', type: 'stat', key: 'moveSpeed', category: 'Player' },
      { label: 'Chop Speed', type: 'stat', key: 'chopSpeed', category: 'Player' },
      { label: 'Carry Capacity', type: 'stat', key: 'carryCapacity', category: 'Player' },
      // Worker stats
      { label: 'Rest Speed', type: 'stat', key: 'restSpeed', category: 'Worker' },
      { label: 'Work Duration', type: 'stat', key: 'workDuration', category: 'Worker' },
      { label: 'Worker Speed', type: 'stat', key: 'workerSpeed', category: 'Worker' },
      { label: 'Worker Power', type: 'stat', key: 'workerPower', category: 'Worker' },
      // Button to open keybinds submenu
      { label: 'Keybinds...', type: 'button', key: 'keybinds', category: 'Settings' },
    ];
  }

  public isKeybindsMenuOpen(): boolean {
    return this.keybindsMenuOpen;
  }

  public getKeybindsMenuState(): { selection: number; editingKeybind: string | null; keybinds: Record<string, string> } {
    return {
      selection: this.keybindsMenuSelection,
      editingKeybind: this.editingKeybind,
      keybinds: this.keybinds,
    };
  }

  private adjustOptionValue(delta: number): void {
    const options = this.getOptionsMenuOptions();
    const opt = options[this.optionsMenuSelection];
    if (!opt || opt.type !== 'stat') return;

    const key = opt.key;

    // Adjust the stat multiplier by 5% per step
    const currentMultiplier = this.statMultipliers[key as keyof typeof this.statMultipliers] ?? 1;
    const step = 0.05; // 5% per arrow key press
    const newMultiplier = Math.max(0.001, Math.min(1, currentMultiplier + delta * step));
    this.statMultipliers[key as keyof typeof this.statMultipliers] = newMultiplier;
  }

  public getEffectiveUpgrades(): typeof this.effectiveUpgrades {
    return this.effectiveUpgrades;
  }

  public getEffectiveWorkerUpgrades(): typeof this.effectiveWorkerUpgrades {
    return this.effectiveWorkerUpgrades;
  }

  // Calculate actual stat values from upgrade levels
  public getStatValue(key: string, level: number): number {
    switch (key) {
      case 'axePower':
        // 40% compound per level, base damage 1
        return Math.pow(1.4, level - 1);
      case 'moveSpeed':
        // 10% compound per level, base 150
        return this.config.playerSpeed * Math.pow(1.1, level - 1);
      case 'chopSpeed':
        // Attacks per second: 1/cooldown, 10% faster per level
        return 1 / (this.config.chopCooldown / Math.pow(1.1, level - 1));
      case 'carryCapacity':
        // Base 10, 50% compound per level
        return Math.floor(10 * Math.pow(1.5, level - 1));
      case 'restSpeed':
        // 20% faster recovery per level (relative %)
        return 100 * Math.pow(1.2, level - 1);
      case 'workDuration':
        // 5% more stamina per level (relative %)
        return 100 * Math.pow(1.05, level - 1);
      case 'workerSpeed':
        // 20% faster per level (relative %)
        return 100 * Math.pow(1.2, level - 1);
      case 'workerPower':
        // 20% more damage per level (relative %)
        return 100 * Math.pow(1.2, level - 1);
      default:
        return level;
    }
  }

  // Convert an actual stat value back to the nearest upgrade level
  private valueToLevel(key: string, value: number): number {
    switch (key) {
      case 'axePower':
        // value = 1.4^(level-1) => level = log(value)/log(1.4) + 1
        return Math.max(1, Math.round(Math.log(value) / Math.log(1.4) + 1));
      case 'moveSpeed':
        // value = 150 * 1.1^(level-1) => level = log(value/150)/log(1.1) + 1
        return Math.max(1, Math.round(Math.log(value / this.config.playerSpeed) / Math.log(1.1) + 1));
      case 'chopSpeed':
        // value = 1/(0.4/1.1^(level-1)) = 1.1^(level-1)/0.4
        // value * 0.4 = 1.1^(level-1) => level = log(value*0.4)/log(1.1) + 1
        return Math.max(1, Math.round(Math.log(value * this.config.chopCooldown) / Math.log(1.1) + 1));
      case 'carryCapacity':
        // value = 10 * 1.5^(level-1) => level = log(value/10)/log(1.5) + 1
        return Math.max(1, Math.round(Math.log(value / 10) / Math.log(1.5) + 1));
      case 'restSpeed':
      case 'workDuration':
      case 'workerSpeed':
      case 'workerPower':
        // value = 100 * multiplier^(level-1)
        const multiplier = key === 'workDuration' ? 1.05 : 1.2;
        return Math.max(1, Math.round(Math.log(value / 100) / Math.log(multiplier) + 1));
      default:
        return Math.max(1, Math.round(value));
    }
  }

  // Get the maximum value for a stat including milestone bonuses
  private getMaxStatValue(key: string): number {
    const isPlayerStat = ['axePower', 'moveSpeed', 'chopSpeed', 'carryCapacity'].includes(key);
    const maxLevel = isPlayerStat
      ? this.state.upgrades[key as keyof typeof this.state.upgrades]
      : this.state.workerUpgrades[key as keyof typeof this.state.workerUpgrades];

    const baseMax = this.getStatValue(key, maxLevel);

    // For player stats, include milestone bonuses
    if (isPlayerStat) {
      const milestoneBonuses = this.calculateMilestoneBonuses();
      if (key === 'moveSpeed') {
        return baseMax * (1 + milestoneBonuses.speedPercent / 100);
      } else if (key === 'axePower') {
        return baseMax * (1 + milestoneBonuses.powerPercent / 100);
      } else if (key === 'chopSpeed') {
        return baseMax * (1 + milestoneBonuses.chopSpeedPercent / 100);
      }
    }
    return baseMax;
  }

  // Get the current effective stat value (with multiplier applied)
  public getEffectiveStatValue(key: string): number {
    const maxValue = this.getMaxStatValue(key);
    const multiplier = this.statMultipliers[key as keyof typeof this.statMultipliers] ?? 1;
    return Math.max(1, maxValue * multiplier);
  }

  // Prompt user for a stat value - allows setting from 1 to max (including milestone bonuses)
  private promptStatValue(key: string): void {
    const maxValue = this.getMaxStatValue(key);

    // Format values for display
    const formatValue = (v: number) => {
      if (key === 'carryCapacity') return Math.floor(v).toString();
      if (['restSpeed', 'workDuration', 'workerSpeed', 'workerPower'].includes(key)) {
        return Math.round(v) + '%';
      }
      return v.toFixed(2);
    };

    const statNames: Record<string, string> = {
      axePower: 'Axe Power (damage)',
      moveSpeed: 'Move Speed',
      chopSpeed: 'Chop Speed (attacks/sec)',
      carryCapacity: 'Carry Capacity',
      restSpeed: 'Rest Speed',
      workDuration: 'Work Duration',
      workerSpeed: 'Worker Speed',
      workerPower: 'Worker Power',
    };

    // Get current effective value
    const currentValue = this.getEffectiveStatValue(key);

    const input = window.prompt(
      `${statNames[key] || key}\nRange: 1 to ${formatValue(maxValue)}\nEnter a value:`,
      formatValue(currentValue)
    );

    if (input === null) return; // Cancelled

    // Parse the input (remove % if present)
    let parsed = parseFloat(input.replace('%', ''));
    if (isNaN(parsed)) return;

    // Clamp to valid range (minimum 1, max is the calculated max)
    parsed = Math.max(1, Math.min(maxValue, parsed));

    // Calculate the multiplier needed to achieve this value
    const multiplier = parsed / maxValue;
    this.statMultipliers[key as keyof typeof this.statMultipliers] = Math.max(0.001, Math.min(1, multiplier));
  }

  // Add workers to escort squad
  public addToEscort(type: WorkerType, count: number): number {
    const availableWorkers = this.state.workers
      .filter(w => w.type === type && !w.isEscorting && w.state !== WorkerState.Resting)
      // Sort by stamina descending - send healthiest workers first
      .sort((a, b) => b.stamina - a.stamina);
    const toAdd = Math.min(count, availableWorkers.length);

    for (let i = 0; i < toAdd; i++) {
      availableWorkers[i].isEscorting = true;
      availableWorkers[i].state = WorkerState.Escorting;
      availableWorkers[i].targetTree = null;
      availableWorkers[i].targetDrop = null;
      availableWorkers[i].targetApple = null;
    }

    if (toAdd > 0) {
      const typeName = type === WorkerType.Chopper ? 'Chopper' : 'Collector';
      this.addFloatingText(
        this.state.player.position.x,
        this.state.player.position.y - 30,
        `+${toAdd} ${typeName}${toAdd > 1 ? 's' : ''} following!`,
        '#44FF44'
      );
    }
    return toAdd;
  }

  // Release workers from escort squad
  public releaseFromEscort(type: WorkerType, count: number): number {
    const escortingWorkers = this.state.workers.filter(
      w => w.type === type && w.isEscorting
    );
    const toRelease = Math.min(count, escortingWorkers.length);

    for (let i = 0; i < toRelease; i++) {
      escortingWorkers[i].isEscorting = false;
      escortingWorkers[i].state = WorkerState.Idle;
    }

    if (toRelease > 0) {
      const typeName = type === WorkerType.Chopper ? 'Chopper' : 'Collector';
      this.addFloatingText(
        this.state.player.position.x,
        this.state.player.position.y - 30,
        `Released ${toRelease} ${typeName}${toRelease > 1 ? 's' : ''}`,
        '#FFAA44'
      );
    }
    return toRelease;
  }

  // Release all escort workers
  public releaseAllEscort(): void {
    const escortingWorkers = this.state.workers.filter(w => w.isEscorting);
    for (const worker of escortingWorkers) {
      worker.isEscorting = false;
      worker.state = WorkerState.Idle;
    }
    if (escortingWorkers.length > 0) {
      this.addFloatingText(
        this.state.player.position.x,
        this.state.player.position.y - 30,
        `Released all ${escortingWorkers.length} workers`,
        '#FFAA44'
      );
    }
  }

  // Get escort counts
  public getEscortCounts(): { choppers: number; collectors: number } {
    const choppers = this.state.workers.filter(
      w => w.type === WorkerType.Chopper && w.isEscorting
    ).length;
    const collectors = this.state.workers.filter(
      w => w.type === WorkerType.Collector && w.isEscorting
    ).length;
    return { choppers, collectors };
  }

  // Get available (non-escorting, non-resting) worker counts
  public getAvailableWorkerCounts(): { choppers: number; collectors: number } {
    const choppers = this.state.workers.filter(
      w => w.type === WorkerType.Chopper && !w.isEscorting && w.state !== WorkerState.Resting
    ).length;
    const collectors = this.state.workers.filter(
      w => w.type === WorkerType.Collector && !w.isEscorting && w.state !== WorkerState.Resting
    ).length;
    return { choppers, collectors };
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
      // Escort mode
      isEscorting: false,
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

  // Calculate milestone bonuses from tree chop counts
  // Each tree type gives a ONE-TIME bonus when you reach the milestone threshold
  private calculateMilestoneBonuses(): MilestoneBonuses {
    let speedPercent = 0;
    let powerPercent = 0;
    let chopSpeedPercent = 0;

    for (const [treeType, count] of this.state.treeChoppedCounts) {
      const milestone = TREE_CHOP_MILESTONES[treeType as TreeType];
      if (!milestone) continue;

      // Grant bonus up to 3 times per tree type
      const milestoneReached = Math.min(3, Math.floor(count / milestone.perMilestone));
      const bonus = milestoneReached * milestone.bonusPercent;

      if (milestone.bonusType === 'speed') {
        speedPercent += bonus;
      } else if (milestone.bonusType === 'power') {
        powerPercent += bonus;
      } else if (milestone.bonusType === 'chopSpeed') {
        chopSpeedPercent += bonus;
      }
    }

    return { speedPercent, powerPercent, chopSpeedPercent };
  }

  private update(deltaTime: number): void {
    // Calculate milestone bonuses
    const milestoneBonuses = this.calculateMilestoneBonuses();

    // Store old position to apply speed multiplier correctly
    const oldX = this.state.player.position.x;
    const oldY = this.state.player.position.y;

    // Don't process movement while cheat menu, options menu, or keybinds menu is open
    const inputBlocked = this.cheatMenuOpen || this.optionsMenuOpen || this.keybindsMenuOpen;
    const inputState = inputBlocked ? { ...this.state.input, up: false, down: false, left: false, right: false } : this.state.input;

    // Update player position based on input (use effective upgrades for adjustable stats)
    updatePlayer(this.state.player, inputState, deltaTime, this.config, this.effectiveUpgrades, milestoneBonuses);

    // Apply stat multiplier to movement (allows setting speed from 1 to max including milestones)
    const speedMultiplier = this.statMultipliers.moveSpeed;
    if (speedMultiplier < 1) {
      // Calculate delta and scale it by the multiplier
      const deltaX = this.state.player.position.x - oldX;
      const deltaY = this.state.player.position.y - oldY;
      this.state.player.position.x = oldX + deltaX * speedMultiplier;
      this.state.player.position.y = oldY + deltaY * speedMultiplier;
      this.state.player.velocity.x *= speedMultiplier;
      this.state.player.velocity.y *= speedMultiplier;
    }

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

    // Update platinum chunk regeneration timers
    for (const [key, time] of this.platinumChunkRegenTimers) {
      const newTime = time - deltaTime;
      if (newTime <= 0) {
        this.platinumChunkRegenTimers.delete(key);
        // Regenerate all trees in this platinum chunk
        this.regeneratePlatinumChunk(key);
      } else {
        this.platinumChunkRegenTimers.set(key, newTime);
      }
    }

    // Update regenerate button cooldown
    if (this.regenCooldown > 0) {
      this.regenCooldown = Math.max(0, this.regenCooldown - deltaTime);
    }

    // Handle chopping
    // After chop speed level 5, allow holding to auto-swing (use effective upgrade)
    const autoChopEnabled = this.effectiveUpgrades.chopSpeed >= 5;
    if (this.state.input.chop && (autoChopEnabled || !this.pendingChop)) {
      if (!autoChopEnabled) {
        this.pendingChop = true;
      }
      this.tryChop();
    }
    if (!this.state.input.chop) {
      this.pendingChop = false;
    }

    // Handle selling at chipper
    if (this.state.input.interact) {
      this.trySellWood();
    }

    // Handle eating apples (supports holding E to eat rapidly)
    this.tryEatApple(deltaTime);

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

    // Calculate milestone bonuses for chop speed and power
    const milestoneBonuses = this.calculateMilestoneBonuses();

    // Start chop animation (with milestone chop speed bonus, use effective upgrades)
    startChop(this.state.player, this.config, this.effectiveUpgrades, milestoneBonuses);

    // Apply chop speed multiplier (higher multiplier = faster attacks = shorter cooldown)
    // The multiplier scales the time, so we divide by it to get faster chops at multiplier=1
    if (this.statMultipliers.chopSpeed < 1) {
      this.state.player.chopTimer /= this.statMultipliers.chopSpeed;
    }

    // Deal damage to tree (40% compound per level, base damage 1) plus milestone power bonus
    const baseDamage = Math.pow(1.4, this.effectiveUpgrades.axePower - 1);
    const damageWithBonus = baseDamage * (1 + milestoneBonuses.powerPercent / 100);
    // Apply stat multiplier to allow setting damage from 1 to max
    const damage = Math.max(0.1, damageWithBonus * this.statMultipliers.axePower);
    const wasDestroyed = damageTree(nearestTree, damage, this.config);

    // Spawn wood particles on hit
    this.spawnWoodParticles(nearestTree.x, nearestTree.y - 20);

    if (wasDestroyed) {
      // Tree was chopped down - spawn wood drop (2x bronze, 4x silver, 8x gold, 16x platinum)
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
        // Check capacity (base 10, 50% compound per level) - use effective upgrade and multiplier
        const baseCapacity = Math.floor(10 * Math.pow(1.5, this.effectiveUpgrades.carryCapacity - 1));
        const effectiveCapacity = Math.max(1, Math.floor(baseCapacity * this.statMultipliers.carryCapacity));
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

  // Track apple eating cooldown for hold-to-eat feature
  private appleEatCooldown: number = 0;
  private readonly APPLE_EAT_INTERVAL: number = 0.2; // Eat one apple every 0.2 seconds while holding E

  private tryEatApple(deltaTime: number): void {
    const { player, applePile, appleBuff, input } = this.state;

    // Update apple eat cooldown
    if (this.appleEatCooldown > 0) {
      this.appleEatCooldown -= deltaTime;
    }

    // Check if there are apples to eat
    if (applePile.count <= 0) return;

    // Check if player is near apple pile
    const dx = player.position.x - applePile.x;
    const dy = player.position.y - applePile.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Allow eating if holding E and cooldown is ready
    if (dist < 60 && input.interact && this.appleEatCooldown <= 0) {
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

      // Set cooldown for next apple (allows holding E to eat rapidly)
      this.appleEatCooldown = this.APPLE_EAT_INTERVAL;
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
          this.effectiveUpgrades.axePower = upgrades.axePower; // Auto-sync effective
          break;
        case 'moveSpeed':
          upgrades.moveSpeed++;
          this.effectiveUpgrades.moveSpeed = upgrades.moveSpeed;
          break;
        case 'chopSpeed':
          upgrades.chopSpeed++;
          this.effectiveUpgrades.chopSpeed = upgrades.chopSpeed;
          break;
        case 'carryCapacity':
          upgrades.carryCapacity++;
          this.effectiveUpgrades.carryCapacity = upgrades.carryCapacity;
          break;
        case 'restSpeed':
          workerUpgrades.restSpeed++;
          this.effectiveWorkerUpgrades.restSpeed = workerUpgrades.restSpeed;
          break;
        case 'workDuration':
          workerUpgrades.workDuration++;
          this.effectiveWorkerUpgrades.workDuration = workerUpgrades.workDuration;
          // Update all workers' max stamina (collectors have base 60, choppers have base 100)
          for (const worker of this.state.workers) {
            const baseStamina = worker.type === WorkerType.Collector ? 60 : 100;
            worker.maxStamina = baseStamina * workerUpgrades.workDuration;
          }
          break;
        case 'workerSpeed':
          workerUpgrades.workerSpeed++;
          this.effectiveWorkerUpgrades.workerSpeed = workerUpgrades.workerSpeed;
          break;
        case 'workerPower':
          workerUpgrades.workerPower++;
          this.effectiveWorkerUpgrades.workerPower = workerUpgrades.workerPower;
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
      // Escort mode
      isEscorting: false,
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

      // Calculate effective speed with upgrades (20% per level) and apple buff - use effective worker upgrades
      const appleSpeedMult = this.state.appleBuff.active ? this.state.appleBuff.speedMultiplier : 1;
      const effectiveSpeed = worker.speed * Math.pow(1.2, this.effectiveWorkerUpgrades.workerSpeed - 1) * appleSpeedMult;

      // Calculate effective power level for 20% multipliers and apple damage buff - use effective worker upgrades
      const effectivePower = this.effectiveWorkerUpgrades.workerPower;
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

      // Handle escorting workers - they work within squadFollowDistance of player
      if (worker.isEscorting) {
        const playerPos = this.state.player.position;
        const dx = playerPos.x - worker.position.x;
        const dy = playerPos.y - worker.position.y;
        const distFromPlayer = Math.sqrt(dx * dx + dy * dy);

        // If too far from player, return to player
        if (distFromPlayer > this.squadFollowDistance) {
          const speed = effectiveSpeed;
          worker.velocity.x = (dx / distFromPlayer) * speed;
          worker.velocity.y = (dy / distFromPlayer) * speed;
          worker.facingRight = dx > 0;
          worker.position.x += worker.velocity.x * deltaTime;
          worker.position.y += worker.velocity.y * deltaTime;

          // Overshoot prevention for escorting workers returning to player
          const moveThisFrame = speed * deltaTime;
          const newDx = playerPos.x - worker.position.x;
          const newDy = playerPos.y - worker.position.y;
          const newDistFromPlayer = Math.sqrt(newDx * newDx + newDy * newDy);
          // If we moved more than needed and overshot, snap to just within follow distance
          if (moveThisFrame > newDistFromPlayer + this.squadFollowDistance * 0.8) {
            worker.position.x = playerPos.x - (worker.velocity.x / speed) * this.squadFollowDistance * 0.8;
            worker.position.y = playerPos.y - (worker.velocity.y / speed) * this.squadFollowDistance * 0.8;
          }

          worker.lastPosition = { ...worker.position };
          // Clear any targets when returning
          worker.targetTree = null;
          worker.targetDrop = null;
          worker.targetApple = null;
          worker.state = WorkerState.Escorting;
          continue;
        }

        // Check if current target is within squadFollowDistance of player
        if (worker.targetTree) {
          const treeDx = playerPos.x - worker.targetTree.x;
          const treeDy = playerPos.y - worker.targetTree.y;
          const treeDist = Math.sqrt(treeDx * treeDx + treeDy * treeDy);
          if (treeDist > this.squadFollowDistance) {
            worker.targetTree = null;
            worker.state = WorkerState.Idle;
          }
        }
        if (worker.targetDrop) {
          const dropDx = playerPos.x - worker.targetDrop.x;
          const dropDy = playerPos.y - worker.targetDrop.y;
          const dropDist = Math.sqrt(dropDx * dropDx + dropDy * dropDy);
          if (dropDist > this.squadFollowDistance) {
            worker.targetDrop = null;
            worker.state = WorkerState.Idle;
          }
        }
        if (worker.targetApple) {
          const appleDx = playerPos.x - worker.targetApple.x;
          const appleDy = playerPos.y - worker.targetApple.y;
          const appleDist = Math.sqrt(appleDx * appleDx + appleDy * appleDy);
          if (appleDist > this.squadFollowDistance) {
            worker.targetApple = null;
            worker.state = WorkerState.Idle;
          }
        }

        // Within range - set state to Idle so they can find work
        if (worker.state === WorkerState.Escorting) {
          worker.state = WorkerState.Idle;
        }
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
              // If escorting, check if tree is within squadFollowDistance of player
              if (worker.isEscorting) {
                const playerPos = this.state.player.position;
                const dx = playerPos.x - nearbyTree.x;
                const dy = playerPos.y - nearbyTree.y;
                const distFromPlayer = Math.sqrt(dx * dx + dy * dy);
                if (distFromPlayer <= this.squadFollowDistance) {
                  worker.targetTree = nearbyTree;
                  worker.state = WorkerState.MovingToTree;
                  worker.searchRadius = 0;
                }
                // If outside range, stay idle (don't expand search for escorting)
              } else {
                worker.targetTree = nearbyTree;
                worker.state = WorkerState.MovingToTree;
                worker.searchRadius = 0; // Reset search radius on success
              }
            } else {
              // Expand search radius more aggressively - up to 10 chunks
              // Increase by 2 chunks at a time for faster expansion
              // (Don't expand for escorting workers - they stay near player)
              if (worker.searchRadius < 10 && !worker.isEscorting) {
                worker.searchRadius += 2;
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
              // If escorting, check if apple is within squadFollowDistance of player
              if (worker.isEscorting) {
                const playerPos = this.state.player.position;
                const dx = playerPos.x - nearbyApple.x;
                const dy = playerPos.y - nearbyApple.y;
                const distFromPlayer = Math.sqrt(dx * dx + dy * dy);
                if (distFromPlayer <= this.squadFollowDistance) {
                  worker.targetApple = nearbyApple;
                  worker.state = WorkerState.MovingToApple;
                  worker.searchRadius = 0;
                  break;
                }
                // If outside range, continue to check for wood drops
              } else {
                worker.targetApple = nearbyApple;
                worker.state = WorkerState.MovingToApple;
                worker.searchRadius = 0;
                break;
              }
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
                // If escorting, check if drop is within squadFollowDistance of player
                if (worker.isEscorting) {
                  const playerPos = this.state.player.position;
                  const dx = playerPos.x - nearbyDrop.x;
                  const dy = playerPos.y - nearbyDrop.y;
                  const distFromPlayer = Math.sqrt(dx * dx + dy * dy);
                  if (distFromPlayer <= this.squadFollowDistance) {
                    worker.targetDrop = nearbyDrop;
                    worker.state = WorkerState.MovingToDrop;
                    worker.searchRadius = 0;
                  }
                  // If outside range, stay idle (escorting collectors don't wander)
                } else {
                  worker.targetDrop = nearbyDrop;
                  worker.state = WorkerState.MovingToDrop;
                  worker.searchRadius = 0; // Reset search radius on success
                }
              } else if (targetWaypoint && !worker.isEscorting) {
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
              } else if (!worker.isEscorting) {
                // No wood found nearby - look for active choppers to follow
                // (Escorting workers don't do this - they stay near player)
                const activeChoppers = this.state.workers.filter(w =>
                  w.type === WorkerType.Chopper && w.targetTree && !w.targetTree.isDead
                );

                if (activeChoppers.length > 0) {
                  // Find the nearest active chopper
                  let nearestChopper: Worker | null = null;
                  let nearestChopperDist = Infinity;
                  for (const chopper of activeChoppers) {
                    const dx = chopper.position.x - worker.position.x;
                    const dy = chopper.position.y - worker.position.y;
                    const dist = dx * dx + dy * dy;
                    if (dist < nearestChopperDist) {
                      nearestChopperDist = dist;
                      nearestChopper = chopper;
                    }
                  }

                  if (nearestChopper) {
                    // Search for wood near the chopper instead of near self
                    const dropNearChopper = this.findNearestWoodDrop(
                      nearestChopper.position.x, nearestChopper.position.y, 600
                    );

                    if (dropNearChopper) {
                      worker.targetDrop = dropNearChopper;
                      worker.state = WorkerState.MovingToDrop;
                      worker.searchRadius = 0;
                    } else {
                      // Move toward the chopper to be ready to collect
                      const dx = nearestChopper.position.x - worker.position.x;
                      const dy = nearestChopper.position.y - worker.position.y;
                      const dist = Math.sqrt(dx * dx + dy * dy);
                      if (dist > 100 && dist > 0) {
                        worker.velocity.x = (dx / dist) * effectiveSpeed;
                        worker.velocity.y = (dy / dist) * effectiveSpeed;
                        worker.facingRight = dx > 0;
                      } else {
                        // Near chopper, wait for wood to drop
                        worker.velocity.x = 0;
                        worker.velocity.y = 0;
                      }
                    }
                  }
                } else {
                  // No active choppers, expand search radius
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
            // Worker chop cooldown - 5% faster per Work Duration level (compounding) - use effective upgrade
            // Apple buff also gives 5x attack speed
            const baseChopCooldown = 0.6 * Math.pow(0.95, this.effectiveWorkerUpgrades.workDuration - 1);
            worker.chopTimer = baseChopCooldown / appleSpeedMult;
            const chopDamage = worker.chopPower * Math.pow(1.2, effectivePower - 1) * appleDamageMult;  // 1.2x damage per level, apple buff
            const wasDestroyed = damageTree(worker.targetTree, chopDamage, this.config);

            // Drain stamina when chopping
            worker.stamina -= 5;

            this.spawnWoodParticles(worker.targetTree.x, worker.targetTree.y - 20);

            if (wasDestroyed) {
              // 2x bronze, 4x silver, 8x gold, 16x platinum challenge drops
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

          // Pick up wood in batches - base 5/tick, 50% faster per worker speed upgrade - use effective upgrades
          // Pickup speed scaled 0.25x (4x slower base interval)
          const collectRate = Math.pow(1.5, this.effectiveWorkerUpgrades.workerSpeed - 1); // batches per second
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

          // Recover stamina (20% faster per upgrade level) - use effective upgrades
          const restMultiplier = Math.pow(1.2, this.effectiveWorkerUpgrades.restSpeed - 1);
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

      // Overshoot prevention: if worker moved past their target, snap them close to it
      // This fixes issues with very fast workers (high speed upgrades + apple buff) missing targets
      const velMag = Math.sqrt(worker.velocity.x * worker.velocity.x + worker.velocity.y * worker.velocity.y);
      const moveThisFrame = velMag * deltaTime;

      if (worker.state === WorkerState.MovingToTree && worker.targetTree && velMag > 0) {
        const dx = worker.targetTree.x - worker.position.x;
        const dy = worker.targetTree.y - worker.position.y;
        const distAfterMove = Math.sqrt(dx * dx + dy * dy);
        // If we moved more than the remaining distance, we overshot - snap to just within range
        if (moveThisFrame > distAfterMove + 25) {
          // Place worker 25 units from target, in the direction they came from (opposite of velocity)
          worker.position.x = worker.targetTree.x - (worker.velocity.x / velMag) * 25;
          worker.position.y = worker.targetTree.y - (worker.velocity.y / velMag) * 25;
        }
      } else if (worker.state === WorkerState.MovingToDrop && worker.targetDrop && velMag > 0) {
        const dx = worker.targetDrop.x - worker.position.x;
        const dy = worker.targetDrop.y - worker.position.y;
        const distAfterMove = Math.sqrt(dx * dx + dy * dy);
        // If we moved more than the remaining distance, we overshot - snap to just within range
        if (moveThisFrame > distAfterMove + 15) {
          worker.position.x = worker.targetDrop.x - (worker.velocity.x / velMag) * 15;
          worker.position.y = worker.targetDrop.y - (worker.velocity.y / velMag) * 15;
        }
      } else if (worker.state === WorkerState.ReturningToChipper && velMag > 0) {
        const dx = chipperCenterX - worker.position.x;
        const dy = chipperCenterY - worker.position.y;
        const distAfterMove = Math.sqrt(dx * dx + dy * dy);
        // If we moved more than the remaining distance, we overshot - snap to just within range
        if (moveThisFrame > distAfterMove + 25) {
          worker.position.x = chipperCenterX - (worker.velocity.x / velMag) * 25;
          worker.position.y = chipperCenterY - (worker.velocity.y / velMag) * 25;
        }
      } else if (worker.state === WorkerState.GoingToRest && velMag > 0) {
        const dx = shackCenterX - worker.position.x;
        const dy = shackCenterY - worker.position.y;
        const distAfterMove = Math.sqrt(dx * dx + dy * dy);
        // If we moved more than the remaining distance, we overshot - snap to just within range
        if (moveThisFrame > distAfterMove + 25) {
          worker.position.x = shackCenterX - (worker.velocity.x / velMag) * 25;
          worker.position.y = shackCenterY - (worker.velocity.y / velMag) * 25;
        }
      } else if (worker.state === WorkerState.ReturningWithApple && velMag > 0) {
        const { applePile } = this.state;
        const dx = applePile.x - worker.position.x;
        const dy = applePile.y - worker.position.y;
        const distAfterMove = Math.sqrt(dx * dx + dy * dy);
        // If we moved more than the remaining distance, we overshot - snap to just within range
        if (moveThisFrame > distAfterMove + 25) {
          worker.position.x = applePile.x - (worker.velocity.x / velMag) * 25;
          worker.position.y = applePile.y - (worker.velocity.y / velMag) * 25;
        }
      } else if (worker.state === WorkerState.MovingToApple && worker.targetApple && velMag > 0) {
        const dx = worker.targetApple.x - worker.position.x;
        const dy = worker.targetApple.y - worker.position.y;
        const distAfterMove = Math.sqrt(dx * dx + dy * dy);
        // If we moved more than the remaining distance, we overshot - snap to just within range
        if (moveThisFrame > distAfterMove + 15) {
          worker.position.x = worker.targetApple.x - (worker.velocity.x / velMag) * 15;
          worker.position.y = worker.targetApple.y - (worker.velocity.y / velMag) * 15;
        }
      }

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

    // Escorting workers ignore waypoints and search near their position (near player)
    const isEscorting = worker.isEscorting;

    // Get chopper waypoints (only used for non-escorting workers)
    const chopperWaypoints = this.state.waypoints.filter(w => w.type === WaypointType.Chopper);
    const hasWaypoints = !isEscorting && chopperWaypoints.length > 0;

    // Pre-compute tree targeting counts ONCE (avoid O(n²) filter in loop)
    const treeTargetCounts = new Map<Tree, number>();
    for (const w of this.state.workers) {
      if (w !== worker && w.targetTree) {
        treeTargetCounts.set(w.targetTree, (treeTargetCounts.get(w.targetTree) || 0) + 1);
      }
    }

    // If waypoints exist (and not escorting), get the chunks they're in (including adjacent chunks based on search radius)
    const waypointChunks = new Set<string>();
    if (hasWaypoints) {
      // Expand search based on searchRadius - each level adds a ring of chunks around waypoints
      const expansionRadius = Math.floor(worker.searchRadius / 2); // 0-1 = center, 2-3 = +1, 4-5 = +2, etc.
      for (const wp of chopperWaypoints) {
        const centerChunkX = Math.floor(wp.x / this.config.chunkSize);
        const centerChunkY = Math.floor(wp.y / this.config.chunkSize);
        // Add center chunk and expanded radius
        for (let dx = -expansionRadius; dx <= expansionRadius; dx++) {
          for (let dy = -expansionRadius; dy <= expansionRadius; dy++) {
            waypointChunks.add(`${centerChunkX + dx},${centerChunkY + dy}`);
          }
        }
      }
    }

    // Calculate max range once
    const baseRange = 300;
    // Escorting workers use squadFollowDistance as their range
    const maxRange = isEscorting ? this.squadFollowDistance : baseRange + worker.searchRadius * this.config.chunkSize;
    const maxRangeSq = maxRange * maxRange; // Use squared distance to avoid sqrt

    for (const chunk of this.state.chunks.values()) {
      const chunkKey = `${chunk.x},${chunk.y}`;

      // If waypoints exist (and not escorting), consider trees in waypoint chunks and expanded area
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

  // Get the current tier of a chunk (0 = none, 1 = bronze, 2 = silver, 3 = gold, 4 = platinum)
  private getChunkTier(key: string): number {
    if (this.state.platinumChunks.has(key)) return 4;
    if (this.state.goldChunks.has(key)) return 3;
    if (this.state.silverChunks.has(key)) return 2;
    if (this.state.bronzeChunks.has(key)) return 1;
    return 0;
  }

  // Get challenge multiplier based on current tier (2x for bronze, 4x for silver, 8x for gold, 16x for platinum)
  public getChallengeMultiplierForTier(key: string): number {
    const tier = this.getChunkTier(key);
    if (tier === 1) return 2;   // Bronze -> 2x challenge for silver
    if (tier === 2) return 4;   // Silver -> 4x challenge for gold
    if (tier === 3) return 8;   // Gold -> 8x challenge for platinum
    if (tier === 4) return 16;  // Platinum -> 16x for farming (hardest)
    return 2;  // Default 2x
  }

  // Check if a chunk is now fully cleared and upgrade its tier
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

    const currentTier = this.getChunkTier(key);
    const isChallenge = this.state.challengeChunks.has(key);

    // Tier upgrade logic
    if (isChallenge && currentTier < 4) {
      // Cleared in challenge mode - upgrade tier
      const newTier = currentTier + 1;
      const tierNames = ['', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];
      const tierColors = ['', '#CD7F32', '#C0C0C0', '#FFD700', '#E5E4E2'];

      // Add to new tier set
      if (newTier === 1) this.state.bronzeChunks.add(key);
      else if (newTier === 2) this.state.silverChunks.add(key);
      else if (newTier === 3) this.state.goldChunks.add(key);
      else if (newTier === 4) this.state.platinumChunks.add(key);

      this.addFloatingText(centerX, centerY, `${tierNames[newTier]} CHUNK!`, tierColors[newTier]);

      // Only platinum chunks auto-regenerate in challenge mode
      if (newTier === 4) {
        this.platinumChunkRegenTimers.set(key, 30);
        this.addFloatingText(centerX, centerY - 20, 'Trees regen in 30s', '#AAAAAA');
      }
    } else if (currentTier === 0 && !isChallenge) {
      // First time clear (no challenge) - bronze
      this.state.bronzeChunks.add(key);
      this.addFloatingText(centerX, centerY, 'BRONZE CHUNK!', '#CD7F32');
    } else if (isChallenge && currentTier === 4) {
      // Platinum chunks in challenge mode - start regen timer
      this.platinumChunkRegenTimers.set(key, 30);
      this.addFloatingText(centerX, centerY, 'Trees regen in 30s', '#AAAAAA');
    }
  }

  // Regenerate all trees in a high-tier chunk (called when regen timer expires)
  private regeneratePlatinumChunk(key: string): void {
    const chunk = this.state.chunks.get(key);
    if (!chunk) return;

    // Only regen if it's a silver+ tier chunk in challenge mode
    const tier = this.getChunkTier(key);
    if (tier < 2) return; // Bronze doesn't auto-regen
    if (!this.state.challengeChunks.has(key)) return;

    const [chunkX, chunkY] = key.split(',').map(Number);
    const centerX = chunkX * this.config.chunkSize + this.config.chunkSize / 2;
    const centerY = chunkY * this.config.chunkSize + this.config.chunkSize / 2;

    // Get health multiplier based on tier
    const healthMultiplier = this.getChallengeMultiplierForTier(key);

    // Regenerate all trees with appropriate health
    let regenCount = 0;
    for (const tree of chunk.trees) {
      if (tree.isDead) {
        tree.isDead = false;
        tree.respawnTimer = 0;
        tree.health = tree.maxHealth * healthMultiplier;
        this.deadTreesMap.delete(tree.id);
        regenCount++;
      }
    }

    if (regenCount > 0) {
      this.addFloatingText(centerX, centerY, `${regenCount} trees regenerated!`, '#E5E4E2');
    }
  }

  // Toggle challenge mode on a tiered chunk (only when fully zoomed out)
  public toggleChunkChallenge(chunkX: number, chunkY: number): boolean {
    const key = `${chunkX},${chunkY}`;

    // Can only toggle on chunks with at least bronze tier
    const tier = this.getChunkTier(key);
    if (tier === 0) {
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

    const healthMultiplier = this.getChallengeMultiplierForTier(key);

    if (this.state.challengeChunks.has(key)) {
      // Turn OFF challenge mode
      this.state.challengeChunks.delete(key);
      this.addFloatingText(centerX, centerY, 'Challenge OFF', '#AAAAAA');
    } else {
      // Turn ON challenge mode
      this.state.challengeChunks.add(key);
      this.addFloatingText(centerX, centerY, `${healthMultiplier}X CHALLENGE!`, '#FF6600');
    }

    // Respawn all trees in this chunk with appropriate health
    const isChallenge = this.state.challengeChunks.has(key);
    const finalMultiplier = isChallenge ? healthMultiplier : 1;
    for (const tree of chunk.trees) {
      tree.isDead = false;
      tree.respawnTimer = 0;
      tree.health = tree.maxHealth * finalMultiplier;
      // Also remove from dead trees map so save/load works correctly
      this.deadTreesMap.delete(tree.id);
    }

    // Set 5 minute cooldown
    this.state.chunkToggleCooldowns.set(key, 300);

    return true;
  }

  // Check if a tree is in a challenge chunk and return multiplier
  public getChallengeMultiplier(treeX: number, treeY: number): number {
    const chunkX = Math.floor(treeX / this.config.chunkSize);
    const chunkY = Math.floor(treeY / this.config.chunkSize);
    const key = `${chunkX},${chunkY}`;
    if (!this.state.challengeChunks.has(key)) return 1;
    return this.getChallengeMultiplierForTier(key);
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
    render(
      this.ctx,
      this.state,
      this.sprites,
      this.config,
      this.catchUpTimeRemaining,
      this.waypointPlacementMode,
      this.regenCooldown,
      this.cheatMenuOpen,
      this.treeChecklistOpen,
      this.squadMenuOpen,
      this.optionsMenuOpen,
      this.optionsMenuOpen ? this.getOptionsMenuState() : null,
      this.keybindsMenuOpen,
      this.keybindsMenuOpen ? this.getKeybindsMenuState() : null,
      this.squadFollowDistance
    );
  }
}
