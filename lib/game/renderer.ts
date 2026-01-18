import { GameState, SpriteSheet, GameConfig, Tree, WoodDrop, Particle, FloatingText, Worker, WorkerType, WorkerState, UPGRADE_COSTS, CHOPPER_COSTS, COLLECTOR_COSTS, WORKER_UPGRADE_COSTS } from '../types';
import { chunkKey } from './forest';
import { getTreeSprite } from './sprites';

// Ground colors for tiling
const GROUND_COLORS = ['#3d5c3d', '#4a6b4a', '#3f5f3f'];

export function render(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: SpriteSheet,
  config: GameConfig
): void {
  const { camera, player, chunks } = state;
  const baseScale = config.pixelScale;
  const scale = baseScale * camera.zoom;

  // Clear canvas
  ctx.fillStyle = '#2d4a2d';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Disable image smoothing for crisp pixels
  ctx.imageSmoothingEnabled = false;

  // Calculate the effective camera view (larger when zoomed out)
  const effectiveWidth = camera.width / camera.zoom;
  const effectiveHeight = camera.height / camera.zoom;
  const effectiveCameraX = player.position.x - effectiveWidth / 2;
  const effectiveCameraY = player.position.y - effectiveHeight / 2;

  const effectiveCamera = {
    x: effectiveCameraX,
    y: effectiveCameraY,
    width: effectiveWidth,
    height: effectiveHeight,
    zoom: camera.zoom,
  };

  // Draw ground pattern
  drawGround(ctx, effectiveCamera, scale);

  // Draw chipper
  drawChipper(ctx, state, sprites, config, effectiveCamera, scale);

  // Draw shack
  drawShack(ctx, state, sprites, config, effectiveCamera, scale);

  // Collect all visible trees from chunks
  const visibleTrees: Tree[] = [];
  const buffer = 100 / camera.zoom;

  for (const chunk of chunks.values()) {
    for (const tree of chunk.trees) {
      if (
        tree.x >= effectiveCameraX - buffer &&
        tree.x <= effectiveCameraX + effectiveWidth + buffer &&
        tree.y >= effectiveCameraY - buffer &&
        tree.y <= effectiveCameraY + effectiveHeight + buffer
      ) {
        visibleTrees.push(tree);
      }
    }
  }

  // Sort all visible trees by Y position for proper depth
  visibleTrees.sort((a, b) => a.y - b.y);

  // Determine where player should be inserted in draw order
  const playerY = player.position.y + player.height;

  // Draw trees and player in correct depth order
  let playerDrawn = false;

  for (const tree of visibleTrees) {
    if (!playerDrawn && tree.y > playerY) {
      drawPlayer(ctx, state, sprites, config, effectiveCamera, scale);
      playerDrawn = true;
    }
    drawTree(ctx, tree, effectiveCamera, sprites, scale, config, state.showStumpTimers);
  }

  if (!playerDrawn) {
    drawPlayer(ctx, state, sprites, config, effectiveCamera, scale);
  }

  // Draw workers
  for (const worker of state.workers) {
    drawWorker(ctx, worker, effectiveCamera, sprites, scale);
  }

  // Draw wood drops
  for (const drop of state.woodDrops) {
    drawWoodDrop(ctx, drop, effectiveCamera, sprites, scale);
  }

  // Draw particles
  for (const particle of state.particles) {
    drawParticle(ctx, particle, effectiveCamera, scale);
  }

  // Draw floating texts
  for (const text of state.floatingTexts) {
    drawFloatingText(ctx, text, effectiveCamera, scale);
  }

  // Draw chunk debug overlay when zoomed out
  if (camera.zoom < 0.6) {
    drawChunkOverlay(ctx, state, config, effectiveCamera, scale);
  }

  // Draw UI (always at normal scale)
  drawUI(ctx, state, sprites, config);
}

function drawGround(
  ctx: CanvasRenderingContext2D,
  camera: { x: number; y: number; width: number; height: number },
  scale: number
): void {
  const tileSize = 32;

  const startX = Math.floor(camera.x / tileSize) * tileSize;
  const startY = Math.floor(camera.y / tileSize) * tileSize;

  for (let y = startY; y < camera.y + camera.height + tileSize; y += tileSize) {
    for (let x = startX; x < camera.x + camera.width + tileSize; x += tileSize) {
      const colorIndex = (Math.abs(Math.floor(x / tileSize)) + Math.abs(Math.floor(y / tileSize))) % 3;
      ctx.fillStyle = GROUND_COLORS[colorIndex];

      const screenX = (x - camera.x) * scale;
      const screenY = (y - camera.y) * scale;
      ctx.fillRect(screenX, screenY, tileSize * scale, tileSize * scale);
    }
  }
}

function drawTree(
  ctx: CanvasRenderingContext2D,
  tree: Tree,
  camera: { x: number; y: number },
  sprites: SpriteSheet,
  scale: number,
  config: GameConfig,
  showTimers: boolean
): void {
  const sprite = getTreeSprite(sprites, tree.type, tree.isDead);

  const screenX = (tree.x - camera.x - sprite.width / 2) * scale;
  const screenY = (tree.y - camera.y - sprite.height) * scale;

  ctx.drawImage(
    sprite,
    screenX,
    screenY,
    sprite.width * scale,
    sprite.height * scale
  );

  // Draw health bar if tree is damaged but not dead
  if (!tree.isDead && tree.health < tree.maxHealth) {
    const barWidth = 20 * scale;
    const barHeight = 3 * scale;
    const barX = (tree.x - camera.x) * scale - barWidth / 2;
    const barY = screenY - 8 * scale;

    // Background
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    // Health
    const healthPercent = tree.health / tree.maxHealth;
    ctx.fillStyle = healthPercent > 0.5 ? '#4a4' : healthPercent > 0.25 ? '#aa4' : '#a44';
    ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);
  }

  // Draw respawn timer if dead and timers are enabled
  if (tree.isDead && tree.respawnTimer > 0 && showTimers) {
    const screenCenterX = (tree.x - camera.x) * scale;
    const screenCenterY = (tree.y - camera.y - 10) * scale;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = `${10 * scale}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.ceil(tree.respawnTimer)}s`, screenCenterX, screenCenterY);
  }
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: SpriteSheet,
  config: GameConfig,
  camera: { x: number; y: number; width: number; height: number },
  scale: number
): void {
  const { player } = state;

  const sprite = player.isChopping ? sprites.playerChop : sprites.player;

  let screenX = (player.position.x - camera.x - player.width / 2) * scale;
  const screenY = (player.position.y - camera.y - player.height / 2) * scale;

  // Flip sprite based on facing direction
  ctx.save();
  if (!player.facingRight) {
    ctx.translate(screenX + sprite.width * scale, 0);
    ctx.scale(-1, 1);
    screenX = 0;
  }

  ctx.drawImage(
    sprite,
    screenX,
    screenY,
    sprite.width * scale,
    sprite.height * scale
  );

  ctx.restore();
}

function drawWorker(
  ctx: CanvasRenderingContext2D,
  worker: Worker,
  camera: { x: number; y: number },
  sprites: SpriteSheet,
  scale: number
): void {
  // Choose sprite based on state
  let sprite: HTMLCanvasElement;
  if (worker.state === WorkerState.Resting) {
    sprite = sprites.workerSleep;
  } else if (worker.state === WorkerState.Chopping && worker.chopTimer > 0.3) {
    sprite = sprites.workerChop;
  } else if (worker.wood > 0) {
    sprite = sprites.workerCarry;
  } else {
    sprite = sprites.worker;
  }

  let screenX = (worker.position.x - camera.x - 7) * scale;
  const screenY = (worker.position.y - camera.y - 10) * scale;

  // Flip sprite based on facing direction
  ctx.save();
  if (!worker.facingRight) {
    ctx.translate(screenX + sprite.width * scale, 0);
    ctx.scale(-1, 1);
    screenX = 0;
  }

  ctx.drawImage(
    sprite,
    screenX,
    screenY,
    sprite.width * scale,
    sprite.height * scale
  );

  ctx.restore();

  // Draw wood count above worker if carrying
  if (worker.wood > 0) {
    const textX = (worker.position.x - camera.x) * scale;
    const textY = (worker.position.y - camera.y - 15) * scale;
    ctx.fillStyle = '#8B4513';
    ctx.font = `bold ${8 * scale}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(`${worker.wood}`, textX, textY);
  }

  // Draw stamina bar
  if (worker.state !== WorkerState.Resting) {
    const barWidth = 16 * scale;
    const barHeight = 3 * scale;
    const barX = (worker.position.x - camera.x) * scale - barWidth / 2;
    const barY = (worker.position.y - camera.y - 18) * scale;

    // Background
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    // Stamina
    const staminaPercent = Math.max(0, worker.stamina / worker.maxStamina);
    ctx.fillStyle = staminaPercent > 0.5 ? '#4af' : staminaPercent > 0.25 ? '#fa4' : '#f44';
    ctx.fillRect(barX, barY, barWidth * staminaPercent, barHeight);
  }
}

function drawWoodDrop(
  ctx: CanvasRenderingContext2D,
  drop: WoodDrop,
  camera: { x: number; y: number },
  sprites: SpriteSheet,
  scale: number
): void {
  // Bob animation
  const bobY = Math.sin(drop.bobOffset + performance.now() / 200) * 2;

  const screenX = (drop.x - camera.x - 4) * scale;
  const screenY = (drop.y - camera.y - 3 + bobY) * scale;

  ctx.drawImage(
    sprites.wood,
    screenX,
    screenY,
    sprites.wood.width * scale,
    sprites.wood.height * scale
  );

  // Draw amount if > 1
  if (drop.amount > 1) {
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${8 * scale}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(`${drop.amount}`, screenX + 4 * scale, screenY - 2 * scale);
  }
}

function drawChipper(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: SpriteSheet,
  config: GameConfig,
  camera: { x: number; y: number; width: number; height: number },
  scale: number
): void {
  const { chipper, player } = state;

  const screenX = (chipper.x - camera.x) * scale;
  const screenY = (chipper.y - camera.y) * scale;

  ctx.drawImage(
    sprites.chipper,
    screenX,
    screenY,
    sprites.chipper.width * scale,
    sprites.chipper.height * scale
  );

  // Glow effect when player is near with wood
  const dx = player.position.x - (chipper.x + chipper.width / 2);
  const dy = player.position.y - (chipper.y + chipper.height / 2);
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance < 60 && state.wood > 0) {
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2;
    ctx.strokeRect(screenX - 2, screenY - 2, sprites.chipper.width * scale + 4, sprites.chipper.height * scale + 4);

    // Prompt
    ctx.fillStyle = '#FFD700';
    ctx.font = `bold ${10 * scale}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('[E] Sell Wood', screenX + sprites.chipper.width * scale / 2, screenY - 10);
  }
}

function drawShack(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: SpriteSheet,
  config: GameConfig,
  camera: { x: number; y: number; width: number; height: number },
  scale: number
): void {
  const { shack } = state;

  const screenX = (shack.x - camera.x) * scale;
  const screenY = (shack.y - camera.y) * scale;

  ctx.drawImage(
    sprites.shack,
    screenX,
    screenY,
    sprites.shack.width * scale,
    sprites.shack.height * scale
  );

  // Show resting workers count
  const restingCount = state.workers.filter(w => w.state === WorkerState.Resting).length;
  if (restingCount > 0) {
    ctx.fillStyle = '#88AAFF';
    ctx.font = `bold ${10 * scale}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(`${restingCount} resting`, screenX + sprites.shack.width * scale / 2, screenY - 10);
  }
}

function drawParticle(
  ctx: CanvasRenderingContext2D,
  particle: Particle,
  camera: { x: number; y: number },
  scale: number
): void {
  const alpha = particle.life / particle.maxLife;
  const screenX = (particle.x - camera.x) * scale;
  const screenY = (particle.y - camera.y) * scale;

  ctx.globalAlpha = alpha;
  ctx.fillStyle = particle.color;
  ctx.fillRect(screenX, screenY, particle.size * scale, particle.size * scale);
  ctx.globalAlpha = 1;
}

function drawFloatingText(
  ctx: CanvasRenderingContext2D,
  text: FloatingText,
  camera: { x: number; y: number },
  scale: number
): void {
  const alpha = text.life / text.maxLife;
  const rise = (1 - alpha) * 20;

  const screenX = (text.x - camera.x) * scale;
  const screenY = (text.y - camera.y) * scale - rise * scale;

  ctx.globalAlpha = alpha;
  ctx.fillStyle = text.color;
  ctx.font = `bold ${12 * scale}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(text.text, screenX, screenY);
  ctx.globalAlpha = 1;
}

function drawUI(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: SpriteSheet,
  config: GameConfig
): void {
  const scale = config.pixelScale;
  const padding = 15;

  // Top-left: Resources panel
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(padding, padding, 220, 110);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'left';

  // Wood icon and count
  ctx.drawImage(sprites.wood, padding + 10, padding + 12, 24, 18);
  ctx.fillText(`${state.wood} / ${state.upgrades.carryCapacity}`, padding + 45, padding + 28);

  // Money
  ctx.fillStyle = '#FFD700';
  ctx.fillText(`$${state.money}`, padding + 10, padding + 52);

  // Workers
  ctx.fillStyle = '#5A9C5A';
  ctx.font = '13px monospace';
  const chopperCount = state.workers.filter(w => w.type === WorkerType.Chopper).length;
  const collectorCount = state.workers.filter(w => w.type === WorkerType.Collector).length;
  const nextChopperCost = CHOPPER_COSTS[chopperCount];
  const nextCollectorCost = COLLECTOR_COSTS[collectorCount];
  ctx.fillText(`Choppers: ${chopperCount} [J] ${nextChopperCost !== undefined ? '$' + nextChopperCost : 'MAX'}`, padding + 10, padding + 70);
  ctx.fillStyle = '#88AAFF';
  ctx.fillText(`Collectors: ${collectorCount} [K] ${nextCollectorCost !== undefined ? '$' + nextCollectorCost : 'MAX'}`, padding + 10, padding + 86);

  // Stats
  ctx.fillStyle = '#aaa';
  ctx.font = '11px monospace';
  ctx.fillText(`Total chopped: ${state.totalWoodChopped}`, padding + 10, padding + 102);

  // Top-right: Upgrades panel
  const upgradeWidth = 230;
  const upgradeX = ctx.canvas.width - upgradeWidth - padding;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(upgradeX, padding, upgradeWidth, 250);

  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('UPGRADES [1-8]', upgradeX + upgradeWidth / 2, padding + 18);

  ctx.textAlign = 'left';
  ctx.font = '12px monospace';

  const upgrades = [
    { key: '1', name: 'Axe Power', level: state.upgrades.axePower, costs: UPGRADE_COSTS.axePower },
    { key: '2', name: 'Move Speed', level: state.upgrades.moveSpeed, costs: UPGRADE_COSTS.moveSpeed },
    { key: '3', name: 'Chop Speed', level: state.upgrades.chopSpeed, costs: UPGRADE_COSTS.chopSpeed },
    { key: '4', name: 'Carry Cap', level: state.upgrades.carryCapacity, costs: UPGRADE_COSTS.carryCapacity },
    { key: '5', name: 'Rest Speed', level: state.workerUpgrades.restSpeed, costs: WORKER_UPGRADE_COSTS.restSpeed, isWorker: true },
    { key: '6', name: 'Work Dur.', level: state.workerUpgrades.workDuration, costs: WORKER_UPGRADE_COSTS.workDuration, isWorker: true },
    { key: '7', name: 'Worker Spd', level: state.workerUpgrades.workerSpeed, costs: WORKER_UPGRADE_COSTS.workerSpeed, isWorker: true },
    { key: '8', name: 'Worker Pwr', level: state.workerUpgrades.workerPower, costs: WORKER_UPGRADE_COSTS.workerPower, isWorker: true },
  ];

  upgrades.forEach((upg, i) => {
    const y = padding + 35 + i * 26;
    let levelIndex: number;
    if (upg.name === 'Carry Cap') {
      levelIndex = Math.floor((upg.level - 20) / 10);
    } else {
      levelIndex = upg.level - 1;
    }
    const nextCost = upg.costs[levelIndex];
    const maxed = nextCost === undefined;

    ctx.fillStyle = (upg as { isWorker?: boolean }).isWorker ? '#88AAFF' : '#fff';
    ctx.fillText(`[${upg.key}] ${upg.name}`, upgradeX + 10, y);

    if (maxed) {
      ctx.fillStyle = '#4a4';
      ctx.fillText('MAX', upgradeX + upgradeWidth - 45, y);
    } else {
      ctx.fillStyle = state.money >= nextCost ? '#4f4' : '#f44';
      ctx.fillText(`$${nextCost}`, upgradeX + upgradeWidth - 55, y);
    }

    // Level indicator
    ctx.fillStyle = '#888';
    ctx.fillText(`Lv${upg.name === 'Carry Cap' ? levelIndex + 1 : upg.level}`, upgradeX + 130, y);
  });

  // Bottom: Controls hint
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  const controlsY = ctx.canvas.height - 35;
  ctx.fillRect(padding, controlsY, 620, 25);

  ctx.fillStyle = '#ccc';
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('WASD: Move | Click: Chop | E: Sell | J: Chopper | K: Collector | T: Timers | Scroll: Zoom', padding + 10, controlsY + 16);

  // Capacity warning
  if (state.wood >= state.upgrades.carryCapacity) {
    ctx.fillStyle = 'rgba(255, 100, 100, 0.9)';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('INVENTORY FULL - Sell wood at the chipper!', ctx.canvas.width / 2, 120);
  }

  // Bottom-right: Worker stats panel
  if (state.workers.length > 0) {
    // Get a sample worker of each type to show stats
    const chopper = state.workers.find(w => w.type === WorkerType.Chopper);
    const collector = state.workers.find(w => w.type === WorkerType.Collector);
    const { workerUpgrades } = state;

    // Calculate effective stats with upgrades applied
    const effectivePower = workerUpgrades.workerPower;

    const workerPanelWidth = 170;
    const workerPanelHeight = 130;
    const workerPanelX = ctx.canvas.width - workerPanelWidth - padding;
    const workerPanelY = ctx.canvas.height - workerPanelHeight - padding - 40;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(workerPanelX, workerPanelY, workerPanelWidth, workerPanelHeight);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('WORKER STATS', workerPanelX + workerPanelWidth / 2, workerPanelY + 16);

    ctx.font = '10px monospace';
    ctx.textAlign = 'left';

    let yOffset = 34;

    if (chopper) {
      const effSpeed = Math.round(chopper.speed * workerUpgrades.workerSpeed);
      const effDamage = chopper.chopPower + effectivePower;
      const effRest = (chopper.baseRestTime / workerUpgrades.restSpeed).toFixed(1);
      const effCap = chopper.carryCapacity + effectivePower * 5;

      ctx.fillStyle = '#5A9C5A';
      ctx.fillText('CHOPPERS:', workerPanelX + 10, workerPanelY + yOffset);
      yOffset += 14;
      ctx.fillStyle = '#aaa';
      ctx.fillText(`  Dmg: ${effDamage.toFixed(2)}  Spd: ${effSpeed}`, workerPanelX + 10, workerPanelY + yOffset);
      yOffset += 12;
      ctx.fillText(`  Rest: ${effRest}s  Cap: ${effCap}`, workerPanelX + 10, workerPanelY + yOffset);
      yOffset += 18;
    }

    if (collector) {
      const effSpeed = Math.round(collector.speed * workerUpgrades.workerSpeed);
      const effRest = (collector.baseRestTime / workerUpgrades.restSpeed).toFixed(1);
      const effCap = collector.carryCapacity + effectivePower * 5;

      ctx.fillStyle = '#88AAFF';
      ctx.fillText('COLLECTORS:', workerPanelX + 10, workerPanelY + yOffset);
      yOffset += 14;
      ctx.fillStyle = '#aaa';
      ctx.fillText(`  Spd: ${effSpeed}  Cap: ${effCap}`, workerPanelX + 10, workerPanelY + yOffset);
      yOffset += 12;
      ctx.fillText(`  Rest: ${effRest}s`, workerPanelX + 10, workerPanelY + yOffset);
    }
  }
}

function drawChunkOverlay(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  config: GameConfig,
  camera: { x: number; y: number; width: number; height: number },
  scale: number
): void {
  const { chunks } = state;
  const chunkSize = config.chunkSize;

  // Calculate visible chunk range
  const startChunkX = Math.floor(camera.x / chunkSize) - 1;
  const startChunkY = Math.floor(camera.y / chunkSize) - 1;
  const endChunkX = Math.ceil((camera.x + camera.width) / chunkSize) + 1;
  const endChunkY = Math.ceil((camera.y + camera.height) / chunkSize) + 1;

  ctx.font = `${Math.max(10, 12 * scale / 3)}px monospace`;
  ctx.textAlign = 'center';

  for (let cx = startChunkX; cx <= endChunkX; cx++) {
    for (let cy = startChunkY; cy <= endChunkY; cy++) {
      const worldX = cx * chunkSize;
      const worldY = cy * chunkSize;

      const screenX = (worldX - camera.x) * scale;
      const screenY = (worldY - camera.y) * scale;
      const screenW = chunkSize * scale;
      const screenH = chunkSize * scale;

      const key = chunkKey(cx, cy);
      const chunk = chunks.get(key);

      let color: string;
      let treeCount = 0;

      if (!chunk) {
        // Unloaded - grey
        color = 'rgba(128, 128, 128, 0.4)';
      } else {
        // Count living trees
        treeCount = chunk.trees.filter(t => !t.isDead).length;
        if (treeCount === 0) {
          // No trees left - green
          color = 'rgba(0, 255, 0, 0.3)';
        } else {
          // Has trees - red
          color = 'rgba(255, 0, 0, 0.3)';
        }
      }

      // Draw chunk background
      ctx.fillStyle = color;
      ctx.fillRect(screenX, screenY, screenW, screenH);

      // Draw chunk border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(screenX, screenY, screenW, screenH);

      // Draw tree count
      if (chunk) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillText(
          `${treeCount}`,
          screenX + screenW / 2,
          screenY + screenH / 2 + 4
        );
      }
    }
  }
}
