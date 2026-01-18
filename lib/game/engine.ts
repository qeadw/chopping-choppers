import {
  GameState,
  GameConfig,
  DEFAULT_CONFIG,
  SpriteSheet,
  WoodDrop,
  Particle,
  FloatingText,
  Tree,
  Worker,
  WorkerType,
  WorkerState,
  TREE_STATS,
  UPGRADE_COSTS,
  CHOPPER_COSTS,
  COLLECTOR_COSTS,
  WORKER_UPGRADE_COSTS,
  Position,
} from '../types';
import { createPlayer, updatePlayer, createCamera, updateCamera, canChop, startChop } from './player';
import { createInputState, setupInputHandlers } from './input';
import { updateChunks, updateTrees, damageTree } from './forest';
import { render } from './renderer';
import { createSpriteSheet } from './sprites';

let dropIdCounter = 0;
let workerIdCounter = 0;

const SAVE_KEY = 'chopping_choppers_save';
const SAVE_INTERVAL = 5000; // Save every 5 seconds

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
  private beforeUnloadHandler: () => void;
  private saveIntervalId: number = 0;
  private deadTreesMap: Map<string, number> = new Map(); // tree ID -> respawn timer

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
    this.hireKeyHandler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'j') {
        this.hireWorker(WorkerType.Chopper);
      } else if (e.key.toLowerCase() === 'k') {
        this.hireWorker(WorkerType.Collector);
      } else if (e.key.toLowerCase() === 't') {
        this.state.showStumpTimers = !this.state.showStumpTimers;
      }
    };
    window.addEventListener('keydown', this.hireKeyHandler);

    // Setup zoom handler (mouse wheel)
    this.wheelHandler = (e: WheelEvent) => {
      e.preventDefault();
      const zoomSpeed = 0.1;
      const minZoom = 0.2;
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
  }

  start(): void {
    this.lastTime = performance.now();
    this.gameLoop(this.lastTime);
  }

  stop(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = 0;
    }
    if (this.saveIntervalId) {
      clearInterval(this.saveIntervalId);
      this.saveIntervalId = 0;
    }
    this.saveProgress(); // Save on stop
    this.cleanupInput();
    window.removeEventListener('keydown', this.upgradeKeyHandler);
    window.removeEventListener('keydown', this.hireKeyHandler);
    window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    this.canvas.removeEventListener('wheel', this.wheelHandler);
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
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
    } catch (e) {
      console.warn('Failed to save progress:', e);
    }
  }

  private loadProgress(): void {
    try {
      const saved = localStorage.getItem(SAVE_KEY);
      if (!saved) return;

      const data: SaveData = JSON.parse(saved);

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
        const cap = this.state.upgrades.carryCapacity;
        if (typeof cap === 'number' && cap >= 10) {
          // Old format: base 20, +10 per upgrade. Convert to level.
          this.state.upgrades.carryCapacity = Math.floor((cap - 10) / 10) + 1;
        }
      }

      // Ensure all upgrades are at least 1
      if (this.state.upgrades.axePower < 1) this.state.upgrades.axePower = 1;
      if (this.state.upgrades.moveSpeed < 1) this.state.upgrades.moveSpeed = 1;
      if (this.state.upgrades.chopSpeed < 1) this.state.upgrades.chopSpeed = 1;
      if (this.state.upgrades.carryCapacity < 1) this.state.upgrades.carryCapacity = 1;
      if (data.workerUpgrades) {
        this.state.workerUpgrades = { ...this.state.workerUpgrades, ...data.workerUpgrades };
      }

      // Ensure all worker upgrades are at least 1
      if (this.state.workerUpgrades.restSpeed < 1) this.state.workerUpgrades.restSpeed = 1;
      if (this.state.workerUpgrades.workDuration < 1) this.state.workerUpgrades.workDuration = 1;
      if (this.state.workerUpgrades.workerSpeed < 1) this.state.workerUpgrades.workerSpeed = 1;
      if (this.state.workerUpgrades.workerPower < 1) this.state.workerUpgrades.workerPower = 1;

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

      console.log('Progress loaded!');
    } catch (e) {
      console.warn('Failed to load progress:', e);
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

  private spawnWorkerSilent(type: WorkerType): void {
    const { shack, workerUpgrades } = this.state;
    const isCollector = type === WorkerType.Collector;
    const baseMaxStamina = isCollector ? 60 : 100;
    const baseRestTime = 20;  // 20 seconds rest time for all workers

    const worker: Worker = {
      id: `worker_${workerIdCounter++}`,
      type,
      position: {
        x: shack.x + shack.width / 2 + (Math.random() - 0.5) * 30,
        y: shack.y + shack.height + (Math.random() - 0.5) * 20,
      },
      velocity: { x: 0, y: 0 },
      state: WorkerState.Idle,
      targetTree: null,
      targetDrop: null,
      wood: 0,
      chopTimer: 0,
      facingRight: true,
      carryCapacity: isCollector ? 2 : 5,
      speed: isCollector ? 9 : 10,
      chopPower: isCollector ? 0 : 1,
      treesChopped: 0,
      stamina: baseMaxStamina * workerUpgrades.workDuration,
      maxStamina: baseMaxStamina * workerUpgrades.workDuration,
      restTimer: 0,
      baseRestTime,
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

    // Update chunks (generate new ones, remove distant ones)
    updateChunks(this.state.chunks, this.state.camera, this.config, this.state.worldSeed);

    // Apply saved dead tree state to newly generated chunks
    this.applyDeadTreesToChunks();

    // Update tree respawn timers
    updateTrees(this.state.chunks, deltaTime, this.config);

    // Sync deadTreesMap with actual tree state (handle respawns)
    this.syncDeadTreesMap();

    // Handle chopping
    if (this.state.input.chop && !this.pendingChop) {
      this.pendingChop = true;
      this.tryChop();
    }
    if (!this.state.input.chop) {
      this.pendingChop = false;
    }

    // Handle selling at chipper
    if (this.state.input.interact) {
      this.trySellWood();
    }

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
      // Tree was chopped down - spawn wood drop
      const woodAmount = TREE_STATS[nearestTree.type].woodDrop;
      this.spawnWoodDrop(nearestTree.x, nearestTree.y, woodAmount);
      this.state.totalWoodChopped += woodAmount;

      // Spawn extra particles for tree falling
      this.spawnTreeFallParticles(nearestTree.x, nearestTree.y);

      // Show floating text
      this.addFloatingText(nearestTree.x, nearestTree.y - 30, `+${woodAmount}`, '#8B4513');
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

  private updateWoodDrops(deltaTime: number): void {
    const { player, upgrades } = this.state;

    for (let i = this.state.woodDrops.length - 1; i >= 0; i--) {
      const drop = this.state.woodDrops[i];

      // Decrease lifetime
      drop.lifetime -= deltaTime;
      if (drop.lifetime <= 0) {
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
          // Update all workers' max stamina
          for (const worker of this.state.workers) {
            worker.maxStamina = 100 * workerUpgrades.workDuration;
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

    const worker: Worker = {
      id: `worker_${workerIdCounter++}`,
      type,
      position: {
        x: shack.x + shack.width / 2 + (Math.random() - 0.5) * 30,
        y: shack.y + shack.height + (Math.random() - 0.5) * 20,
      },
      velocity: { x: 0, y: 0 },
      state: WorkerState.Idle,
      targetTree: null,
      targetDrop: null,
      wood: 0,
      chopTimer: 0,
      facingRight: true,
      carryCapacity: isCollector ? 2 : 5,   // Collectors carry less
      speed: isCollector ? 9 : 10,          // Both workers very slow
      chopPower: isCollector ? 0 : 1,   // Choppers much weaker
      // Fatigue system
      treesChopped: 0,
      stamina: baseMaxStamina,
      maxStamina: baseMaxStamina * workerUpgrades.workDuration,
      restTimer: 0,
      baseRestTime,
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

    for (const worker of this.state.workers) {
      // Update chop timer
      if (worker.chopTimer > 0) {
        worker.chopTimer -= deltaTime;
      }

      // Calculate effective speed with upgrades (20% per level)
      const effectiveSpeed = worker.speed * Math.pow(1.2, workerUpgrades.workerSpeed - 1);

      // Calculate effective power level for 20% multipliers
      const effectivePower = workerUpgrades.workerPower;

      const isChopper = worker.type === WorkerType.Chopper;
      const isCollector = worker.type === WorkerType.Collector;

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
            }
          } else if (isCollector) {
            // Collectors only look for wood drops to collect
            const collectorCapacity = Math.floor(worker.carryCapacity * Math.pow(1.8, effectivePower - 1));
            if (worker.wood < collectorCapacity) {
              const nearbyDrop = this.findNearestWoodDrop(worker.position.x, worker.position.y, 400);
              if (nearbyDrop) {
                worker.targetDrop = nearbyDrop;
                worker.state = WorkerState.MovingToDrop;
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
          } else {
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
            worker.chopTimer = 0.6; // Worker chop cooldown
            const chopDamage = worker.chopPower * Math.pow(1.2, effectivePower - 1);  // 1.2x damage per level
            const wasDestroyed = damageTree(worker.targetTree, chopDamage, this.config);

            // Drain stamina when chopping
            worker.stamina -= 5;

            this.spawnWoodParticles(worker.targetTree.x, worker.targetTree.y - 20);

            if (wasDestroyed) {
              const woodAmount = TREE_STATS[worker.targetTree.type].woodDrop;
              this.spawnWoodDrop(worker.targetTree.x, worker.targetTree.y, woodAmount);
              this.state.totalWoodChopped += woodAmount;
              this.spawnTreeFallParticles(worker.targetTree.x, worker.targetTree.y);
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

          // Move toward drop
          const moveDx = worker.targetDrop.x - worker.position.x;
          const moveDy = worker.targetDrop.y - worker.position.y;
          const moveDist = Math.sqrt(moveDx * moveDx + moveDy * moveDy);

          if (moveDist < 20) {
            // Close enough to collect
            worker.state = WorkerState.Collecting;
            worker.velocity.x = 0;
            worker.velocity.y = 0;
          } else {
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

          if (!worker.targetDrop || worker.targetDrop.amount <= 0) {
            worker.state = WorkerState.Idle;
            worker.targetDrop = null;
            break;
          }

          // Pick up wood - power upgrade increases carry capacity by 20% per level
          const effectiveCapacity = Math.floor(worker.carryCapacity * Math.pow(1.8, effectivePower - 1));
          const canCarry = Math.max(0, Math.min(worker.targetDrop.amount, effectiveCapacity - worker.wood));
          if (canCarry > 0) {
            worker.wood = Math.min(worker.wood + canCarry, effectiveCapacity); // Cap at max
            worker.targetDrop.amount -= canCarry;
            this.addFloatingText(worker.position.x, worker.position.y - 20, `+${canCarry}`, '#8B4513');
            // Drain stamina based on amount collected
            worker.stamina -= canCarry * 2;

            // Remove wood drop from array if fully collected
            if (worker.targetDrop.amount <= 0) {
              const dropIndex = this.state.woodDrops.indexOf(worker.targetDrop);
              if (dropIndex !== -1) {
                this.state.woodDrops.splice(dropIndex, 1);
              }
            }
          }
          worker.targetDrop = null;

          // If full, return to chipper
          if (worker.wood >= effectiveCapacity) {
            worker.state = WorkerState.ReturningToChipper;
          } else {
            worker.state = WorkerState.Idle;
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
          } else {
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
          } else {
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
      }

      // Apply velocity
      worker.position.x += worker.velocity.x * deltaTime;
      worker.position.y += worker.velocity.y * deltaTime;

      // Check tree collisions for worker
      this.handleTreeCollisions(worker.position, 5);
    }
  }

  private findNearestTreeForWorker(worker: Worker): Tree | null {
    let nearest: Tree | null = null;
    let nearestDist = 300; // Worker search range

    for (const chunk of this.state.chunks.values()) {
      for (const tree of chunk.trees) {
        if (tree.isDead) continue;

        // Check if another worker is already targeting this tree
        const alreadyTargeted = this.state.workers.some(
          w => w !== worker && w.targetTree === tree
        );
        if (alreadyTargeted) continue;

        const dx = tree.x - worker.position.x;
        const dy = tree.y - worker.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = tree;
        }
      }
    }

    return nearest;
  }

  private handleTreeCollisions(position: { x: number; y: number }, entityRadius: number): void {
    for (const chunk of this.state.chunks.values()) {
      for (const tree of chunk.trees) {
        if (tree.isDead) continue;

        const treeRadius = TREE_STATS[tree.type].hitboxRadius;
        const minDist = entityRadius + treeRadius;

        // Tree hitbox is on the trunk, offset up from the base (tree.y)
        // The tree sprite is drawn with its base at tree.y, so we offset up by ~15 pixels
        const treeHitboxY = tree.y - 15;

        const dx = position.x - tree.x;
        const dy = position.y - treeHitboxY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < minDist && dist > 0) {
          // Push entity out of tree
          const overlap = minDist - dist;
          const pushX = (dx / dist) * overlap;
          const pushY = (dy / dist) * overlap;

          position.x += pushX;
          position.y += pushY;
        }
      }
    }
  }

  private findNearestWoodDrop(x: number, y: number, maxRange: number): WoodDrop | null {
    let nearest: WoodDrop | null = null;
    let nearestDist = maxRange;

    for (const drop of this.state.woodDrops) {
      if (drop.amount <= 0) continue;

      // Check if a worker is already collecting this
      const alreadyTargeted = this.state.workers.some(w => w.targetDrop === drop);
      if (alreadyTargeted) continue;

      const dx = drop.x - x;
      const dy = drop.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = drop;
      }
    }

    return nearest;
  }

  private render(): void {
    render(this.ctx, this.state, this.sprites, this.config);
  }
}
