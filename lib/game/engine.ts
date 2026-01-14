import {
  GameState,
  GameConfig,
  DEFAULT_CONFIG,
  SpriteSheet,
  WoodDrop,
  Particle,
  FloatingText,
  Tree,
  TREE_STATS,
  UPGRADE_COSTS,
} from '../types';
import { createPlayer, updatePlayer, createCamera, updateCamera, canChop, startChop } from './player';
import { createInputState, setupInputHandlers } from './input';
import { updateChunks, updateTrees, damageTree } from './forest';
import { render } from './renderer';
import { createSpriteSheet } from './sprites';

let dropIdCounter = 0;

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
        carryCapacity: 20,
      },
      woodDrops: [],
      chipper: {
        x: -50,
        y: -50,
        width: 32,
        height: 24,
      },
      particles: [],
      floatingTexts: [],
      totalWoodChopped: 0,
      totalMoneyEarned: 0,
    };

    // Generate initial chunks around player
    updateChunks(this.state.chunks, this.state.camera, this.config);

    // Setup upgrade key handler
    this.upgradeKeyHandler = (e: KeyboardEvent) => {
      if (e.key >= '1' && e.key <= '4') {
        this.handleUpgrade(parseInt(e.key));
      }
    };
    window.addEventListener('keydown', this.upgradeKeyHandler);
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
    this.cleanupInput();
    window.removeEventListener('keydown', this.upgradeKeyHandler);
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

    // Update camera to follow player
    updateCamera(this.state.camera, this.state.player);

    // Update chunks (generate new ones, remove distant ones)
    updateChunks(this.state.chunks, this.state.camera, this.config);

    // Update tree respawn timers
    updateTrees(this.state.chunks, deltaTime, this.config);

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

    // Deal damage to tree
    const damage = this.state.upgrades.axePower;
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
    // Scatter drops slightly
    const drop: WoodDrop = {
      id: `drop_${dropIdCounter++}`,
      x: x + (Math.random() - 0.5) * 20,
      y: y + (Math.random() - 0.5) * 10,
      amount,
      lifetime: 30, // 30 seconds to pick up
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
        // Check capacity
        const canCarry = Math.min(drop.amount, upgrades.carryCapacity - this.state.wood);
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
    const { upgrades } = this.state;

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
        levelIndex = Math.floor((upgrades.carryCapacity - 20) / 10);
        upgradeName = 'carryCapacity';
        break;
      default:
        return;
    }

    const cost = costs[levelIndex];
    if (cost === undefined) return; // Already maxed

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
          upgrades.carryCapacity += 10;
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

  private render(): void {
    render(this.ctx, this.state, this.sprites, this.config);
  }
}
