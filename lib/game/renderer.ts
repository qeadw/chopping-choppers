import { GameState, SpriteSheet, GameConfig, Tree, WoodDrop, Particle, FloatingText, Worker, WorkerType, WorkerState, UPGRADE_COSTS, CHOPPER_COSTS, COLLECTOR_COSTS, WORKER_UPGRADE_COSTS, WaypointType, TreeType, TREE_STATS } from '../types';
import { chunkKey } from './forest';
import { getTreeSprite } from './sprites';

// Ground colors for tiling
const GROUND_COLORS = ['#3d5c3d', '#4a6b4a', '#3f5f3f'];

export interface OptionsMenuState {
  selection: number;
  editingKeybind: string | null;
  keybinds: Record<string, string>;
  effectiveUpgrades: { axePower: number; moveSpeed: number; chopSpeed: number; carryCapacity: number };
  effectiveWorkerUpgrades: { restSpeed: number; workDuration: number; workerSpeed: number; workerPower: number };
  maxUpgrades: { axePower: number; moveSpeed: number; chopSpeed: number; carryCapacity: number };
  maxWorkerUpgrades: { restSpeed: number; workDuration: number; workerSpeed: number; workerPower: number };
  // Calculated stat values (actual values, not levels)
  statValues: Record<string, { current: number; min: number; max: number }>;
}

export function render(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: SpriteSheet,
  config: GameConfig,
  catchUpTime: number = 0,
  waypointMode: WaypointType | null = null,
  regenCooldown: number = 0,
  cheatMenuOpen: boolean = false,
  treeChecklistOpen: boolean = false,
  squadMenuOpen: boolean = false,
  optionsMenuOpen: boolean = false,
  optionsMenuState: OptionsMenuState | null = null,
  keybindsMenuOpen: boolean = false,
  keybindsMenuState: KeybindsMenuState | null = null
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

  // Draw apple drops
  for (const apple of state.appleDrops) {
    drawAppleDrop(ctx, apple, effectiveCamera, sprites, scale);
  }

  // Draw apple pile (if there are apples)
  if (state.applePile.count > 0 || true) {  // Always draw pile location
    drawApplePile(ctx, state, effectiveCamera, sprites, scale);
  }

  // Draw particles
  for (const particle of state.particles) {
    drawParticle(ctx, particle, effectiveCamera, scale);
  }

  // Draw floating texts
  for (const text of state.floatingTexts) {
    drawFloatingText(ctx, text, effectiveCamera, scale);
  }

  // Draw chunk debug overlay when zoomed out (unless UI hidden)
  if (camera.zoom < 0.6 && !state.uiHidden) {
    drawChunkOverlay(ctx, state, config, effectiveCamera, scale, waypointMode);
  }

  // Draw waypoints when zoomed out (unless UI hidden)
  if (camera.zoom < 0.6 && !state.uiHidden) {
    drawWaypoints(ctx, state, effectiveCamera, scale);
  }

  // Draw UI (always at normal scale) - unless hidden with F2
  if (!state.uiHidden) {
    drawUI(ctx, state, sprites, config, regenCooldown);

    // Draw apple drop notification popup (middle left)
    if (state.appleDropNotification.active) {
      drawAppleNotification(ctx);
    }
  }

  // Draw cheat menu if open (ignores UI hidden state)
  if (cheatMenuOpen) {
    drawCheatMenu(ctx, state);
  }

  // Draw tree checklist if open (ignores UI hidden state)
  if (treeChecklistOpen) {
    drawTreeChecklist(ctx, state, sprites);
  }

  // Draw squad menu if open (ignores UI hidden state)
  if (squadMenuOpen) {
    drawSquadMenu(ctx, state);
  }

  // Draw options menu if open (ignores UI hidden state)
  if (optionsMenuOpen && optionsMenuState) {
    drawOptionsMenu(ctx, optionsMenuState);
  }

  // Draw keybinds menu if open (ignores UI hidden state)
  if (keybindsMenuOpen && keybindsMenuState) {
    drawKeybindsMenu(ctx, keybindsMenuState);
  }

  // Draw player waypoint off-screen indicator at all zoom levels
  if (state.playerWaypoint) {
    drawPlayerWaypointIndicator(ctx, state, effectiveCamera, scale);
  }

  // Draw catch-up indicator if active (not when UI is hidden with F2)
  if (catchUpTime > 0 && !state.uiHidden) {
    drawCatchUpIndicator(ctx, catchUpTime);
  }
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

  // Draw health bar if tree is damaged (health < maxHealth, 2x, 4x, or 8x for challenge)
  // Determine effective max based on current health (could be 1x, 2x, 4x, or 8x)
  let effectiveMaxHealth = tree.maxHealth;
  if (tree.health > tree.maxHealth * 4) {
    effectiveMaxHealth = tree.maxHealth * 8;  // Gold/Platinum challenge (8x)
  } else if (tree.health > tree.maxHealth * 2) {
    effectiveMaxHealth = tree.maxHealth * 4;  // Silver challenge (4x)
  } else if (tree.health > tree.maxHealth) {
    effectiveMaxHealth = tree.maxHealth * 2;  // Bronze challenge (2x)
  }
  if (!tree.isDead && tree.health < effectiveMaxHealth) {
    const barWidth = 20 * scale;
    const barHeight = 3 * scale;
    const barX = (tree.x - camera.x) * scale - barWidth / 2;
    const barY = screenY - 8 * scale;

    // Background
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    // Health - use effective max for percentage
    const healthPercent = tree.health / effectiveMaxHealth;
    // Gold/Plat (8x) = white/platinum, Silver (4x) = silver, Bronze (2x) = bronze/orange, normal = green
    const isGoldPlatChallenge = effectiveMaxHealth > tree.maxHealth * 4;
    const isSilverChallenge = effectiveMaxHealth > tree.maxHealth * 2 && !isGoldPlatChallenge;
    const isBronzeChallenge = effectiveMaxHealth > tree.maxHealth && !isSilverChallenge && !isGoldPlatChallenge;
    if (isGoldPlatChallenge) {
      ctx.fillStyle = healthPercent > 0.5 ? '#E5E4E2' : healthPercent > 0.25 ? '#FFD700' : '#f44';
    } else if (isSilverChallenge) {
      ctx.fillStyle = healthPercent > 0.5 ? '#C0C0C0' : healthPercent > 0.25 ? '#A0A0A0' : '#f44';
    } else if (isBronzeChallenge) {
      ctx.fillStyle = healthPercent > 0.5 ? '#CD7F32' : healthPercent > 0.25 ? '#fa0' : '#f44';
    } else {
      ctx.fillStyle = healthPercent > 0.5 ? '#4a4' : healthPercent > 0.25 ? '#aa4' : '#a44';
    }
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

  // Draw wood count above worker if carrying (above stamina bar)
  if (worker.wood > 0) {
    const textX = (worker.position.x - camera.x) * scale;
    const textY = (worker.position.y - camera.y - 24) * scale;
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

function drawAppleDrop(
  ctx: CanvasRenderingContext2D,
  apple: { id: string; x: number; y: number },
  camera: { x: number; y: number },
  sprites: SpriteSheet,
  scale: number
): void {
  // Bob animation using apple id hash
  const hashNum = apple.id.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  const bobY = Math.sin(hashNum + performance.now() / 200) * 2;

  const screenX = (apple.x - camera.x - sprites.apple.width / 2) * scale;
  const screenY = (apple.y - camera.y - sprites.apple.height / 2 + bobY) * scale;

  ctx.drawImage(
    sprites.apple,
    screenX,
    screenY,
    sprites.apple.width * scale,
    sprites.apple.height * scale
  );
}

function drawApplePile(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  camera: { x: number; y: number },
  sprites: SpriteSheet,
  scale: number
): void {
  const { applePile, player } = state;

  const screenX = (applePile.x - camera.x - sprites.applePile.width / 2) * scale;
  const screenY = (applePile.y - camera.y - sprites.applePile.height / 2) * scale;

  // Draw pile sprite if there are apples
  if (applePile.count > 0) {
    ctx.drawImage(
      sprites.applePile,
      screenX,
      screenY,
      sprites.applePile.width * scale,
      sprites.applePile.height * scale
    );

    // Draw apple count
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${10 * scale}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(`x${applePile.count}`, screenX + sprites.applePile.width * scale / 2, screenY - 5 * scale);
  } else {
    // Draw a small marker when empty
    ctx.fillStyle = '#555';
    ctx.beginPath();
    ctx.arc(
      (applePile.x - camera.x) * scale,
      (applePile.y - camera.y) * scale,
      4 * scale,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  // Check if player is near and has apples to eat
  const dx = player.position.x - applePile.x;
  const dy = player.position.y - applePile.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance < 60 && applePile.count > 0) {
    // Glow effect
    ctx.strokeStyle = '#E53935';
    ctx.lineWidth = 2;
    const pileW = sprites.applePile.width * scale;
    const pileH = sprites.applePile.height * scale;
    ctx.strokeRect(screenX - 2, screenY - 2, pileW + 4, pileH + 4);

    // Prompt
    ctx.fillStyle = '#E53935';
    ctx.font = `bold ${10 * scale}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('[E] Eat Apple', screenX + pileW / 2, screenY - 15 * scale);
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
  config: GameConfig,
  regenCooldown: number = 0
): void {
  const scale = config.pixelScale;
  const padding = 15;

  // Top-left: Resources panel
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(padding, padding, 220, 175);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'left';

  // Wood icon and count (base 10, 50% compound per level)
  const effectiveCarryCap = Math.floor(10 * Math.pow(1.5, state.upgrades.carryCapacity - 1));
  ctx.drawImage(sprites.wood, padding + 10, padding + 12, 24, 18);
  ctx.fillText(`${state.wood} / ${effectiveCarryCap}`, padding + 45, padding + 28);

  // Money
  ctx.fillStyle = '#FFD700';
  ctx.fillText(`$${state.money}`, padding + 10, padding + 52);

  // Workers
  ctx.font = '13px monospace';
  const chopperCount = state.workers.filter(w => w.type === WorkerType.Chopper).length;
  const collectorCount = state.workers.filter(w => w.type === WorkerType.Collector).length;

  // Calculate worker costs (doubles after array ends)
  const getWorkerCost = (costs: number[], count: number) => {
    if (count < costs.length) return costs[count];
    const lastCost = costs[costs.length - 1];
    return lastCost * Math.pow(2, count - costs.length + 1);
  };
  const nextChopperCost = getWorkerCost(CHOPPER_COSTS, chopperCount);
  const nextCollectorCost = getWorkerCost(COLLECTOR_COSTS, collectorCount);

  // Show choppers with enable/disable status
  ctx.fillStyle = state.choppersEnabled ? '#5A9C5A' : '#666666';
  const chopperStatus = state.choppersEnabled ? '' : ' [OFF]';
  ctx.fillText(`Choppers: ${chopperCount}${chopperStatus} [J] $${nextChopperCost}`, padding + 10, padding + 70);

  // Show collectors with enable/disable status
  ctx.fillStyle = state.collectorsEnabled ? '#88AAFF' : '#666666';
  const collectorStatus = state.collectorsEnabled ? '' : ' [OFF]';
  ctx.fillText(`Collectors: ${collectorCount}${collectorStatus} [K] $${nextCollectorCost}`, padding + 10, padding + 86);

  // Stats
  ctx.fillStyle = '#aaa';
  ctx.font = '11px monospace';
  ctx.fillText(`Total chopped: ${state.totalWoodChopped}`, padding + 10, padding + 102);

  // Player stats
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px monospace';
  ctx.fillText('PLAYER STATS:', padding + 10, padding + 120);
  ctx.font = '10px monospace';
  ctx.fillStyle = '#aaa';
  const effAxePower = Math.pow(1.4, state.upgrades.axePower - 1).toFixed(2);
  const effMoveSpeed = (100 * Math.pow(1.1, state.upgrades.moveSpeed - 1)).toFixed(0);
  const effChopSpeed = (100 * Math.pow(1.1, state.upgrades.chopSpeed - 1)).toFixed(0);
  ctx.fillText(`Dmg: ${effAxePower}  Move: ${effMoveSpeed}%  Chop: ${effChopSpeed}%`, padding + 10, padding + 134);
  ctx.fillText(`Carry: ${effectiveCarryCap}  (Lv ${state.upgrades.axePower}/${state.upgrades.moveSpeed}/${state.upgrades.chopSpeed}/${state.upgrades.carryCapacity})`, padding + 10, padding + 148);

  // Auto-chop indicator
  if (state.upgrades.chopSpeed >= 5) {
    ctx.fillStyle = '#4f4';
    ctx.fillText('Auto-chop: ON (hold click)', padding + 10, padding + 162);
  } else {
    ctx.fillStyle = '#888';
    ctx.fillText(`Auto-chop: Lv5 chop speed`, padding + 10, padding + 162);
  }

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

  // Calculate upgrade cost (doubles after array ends)
  const getUpgradeCost = (costs: number[], levelIndex: number) => {
    if (levelIndex < costs.length) return costs[levelIndex];
    const lastCost = costs[costs.length - 1];
    return lastCost * Math.pow(2, levelIndex - costs.length + 1);
  };

  upgrades.forEach((upg, i) => {
    const y = padding + 35 + i * 26;
    const levelIndex = upg.level - 1;
    const nextCost = getUpgradeCost(upg.costs, levelIndex);

    ctx.fillStyle = (upg as { isWorker?: boolean }).isWorker ? '#88AAFF' : '#fff';
    ctx.fillText(`[${upg.key}] ${upg.name}`, upgradeX + 10, y);

    ctx.fillStyle = state.money >= nextCost ? '#4f4' : '#f44';
    ctx.fillText(`$${nextCost}`, upgradeX + upgradeWidth - 55, y);

    // Level indicator
    ctx.fillStyle = '#888';
    ctx.fillText(`Lv${upg.level}`, upgradeX + 130, y);
  });

  // Regenerate Chunks button (right side, below upgrades)
  const regenButtonX = upgradeX;
  const regenButtonY = padding + 260;
  const regenButtonW = upgradeWidth;
  const regenButtonH = 32;
  const regenOnCooldown = regenCooldown > 0;

  // Button background - darker when on cooldown
  ctx.fillStyle = regenOnCooldown ? 'rgba(40, 40, 40, 0.85)' : 'rgba(80, 40, 40, 0.85)';
  ctx.fillRect(regenButtonX, regenButtonY, regenButtonW, regenButtonH);
  ctx.strokeStyle = regenOnCooldown ? '#666666' : '#AA6666';
  ctx.lineWidth = 2;
  ctx.strokeRect(regenButtonX, regenButtonY, regenButtonW, regenButtonH);

  // Draw cooldown progress bar if on cooldown
  if (regenOnCooldown) {
    const cooldownPercent = regenCooldown / 150;
    const barWidth = regenButtonW * (1 - cooldownPercent);
    ctx.fillStyle = 'rgba(100, 60, 60, 0.5)';
    ctx.fillRect(regenButtonX, regenButtonY, barWidth, regenButtonH);
  }

  ctx.fillStyle = regenOnCooldown ? '#888888' : '#FFAAAA';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('REGENERATE CHUNKS', regenButtonX + regenButtonW / 2, regenButtonY + 14);
  ctx.fillStyle = regenOnCooldown ? '#666666' : '#AAAAAA';
  ctx.font = '10px monospace';
  if (regenOnCooldown) {
    ctx.fillText(`Cooldown: ${Math.ceil(regenCooldown)}s`, regenButtonX + regenButtonW / 2, regenButtonY + 26);
  } else {
    ctx.fillText('(Reset unloaded areas)', regenButtonX + regenButtonW / 2, regenButtonY + 26);
  }

  // Teleport Home button (right side, below regenerate)
  const teleportButtonX = regenButtonX;
  const teleportButtonY = regenButtonY + regenButtonH + 8;
  const teleportButtonW = regenButtonW;
  const teleportButtonH = 32;

  // Calculate teleport cost (8 coins per chunk distance from origin)
  const playerChunkX = Math.floor(state.player.position.x / config.chunkSize);
  const playerChunkY = Math.floor(state.player.position.y / config.chunkSize);
  const chunkDistance = Math.abs(playerChunkX) + Math.abs(playerChunkY);
  const teleportCost = chunkDistance * 8;
  const canAffordTeleport = state.money >= teleportCost;
  const atHome = chunkDistance === 0;

  // Button background
  ctx.fillStyle = atHome ? 'rgba(40, 40, 40, 0.85)' : (canAffordTeleport ? 'rgba(40, 80, 40, 0.85)' : 'rgba(80, 40, 40, 0.85)');
  ctx.fillRect(teleportButtonX, teleportButtonY, teleportButtonW, teleportButtonH);
  ctx.strokeStyle = atHome ? '#666666' : (canAffordTeleport ? '#66AA66' : '#AA6666');
  ctx.lineWidth = 2;
  ctx.strokeRect(teleportButtonX, teleportButtonY, teleportButtonW, teleportButtonH);

  ctx.fillStyle = atHome ? '#888888' : (canAffordTeleport ? '#AAFFAA' : '#FFAAAA');
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('TELEPORT HOME', teleportButtonX + teleportButtonW / 2, teleportButtonY + 14);
  ctx.fillStyle = atHome ? '#666666' : (canAffordTeleport ? '#88CC88' : '#CC8888');
  ctx.font = '10px monospace';
  if (atHome) {
    ctx.fillText('(Already at home)', teleportButtonX + teleportButtonW / 2, teleportButtonY + 26);
  } else {
    ctx.fillText(`Cost: $${teleportCost} (${chunkDistance} chunks)`, teleportButtonX + teleportButtonW / 2, teleportButtonY + 26);
  }

  // Bottom: Controls hint (two lines)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  const controlsY = ctx.canvas.height - 50;
  ctx.fillRect(padding, controlsY, 680, 40);

  ctx.fillStyle = '#ccc';
  ctx.font = '11px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('WASD: Move | Click: Chop | E: Sell | J/K: Hire | C/V: Toggle workers | T: Timers | L: Checklist | H: Squad | F2: Hide UI', padding + 10, controlsY + 14);
  ctx.fillText('Scroll: Zoom | Zoomed out: Waypoints (Q/R/Y/F/X)', padding + 10, controlsY + 30);

  // Apple buff timer display
  if (state.appleBuff.active && state.appleBuff.remainingTime > 0) {
    const buffY = 60;
    const buffWidth = 250;
    const buffHeight = 40;
    const buffX = (ctx.canvas.width - buffWidth) / 2;

    // Background with glow effect
    ctx.fillStyle = 'rgba(229, 57, 53, 0.85)';  // Apple red
    ctx.fillRect(buffX, buffY, buffWidth, buffHeight);

    // Pulsing border
    const pulse = Math.sin(performance.now() / 100) * 0.3 + 0.7;
    ctx.strokeStyle = `rgba(255, 138, 128, ${pulse})`;  // Light red
    ctx.lineWidth = 3;
    ctx.strokeRect(buffX, buffY, buffWidth, buffHeight);

    // Text
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('APPLE BUFF ACTIVE!', ctx.canvas.width / 2, buffY + 16);

    ctx.font = 'bold 12px monospace';
    ctx.fillText(`5x Speed | 2x Damage | ${state.appleBuff.remainingTime.toFixed(1)}s`, ctx.canvas.width / 2, buffY + 32);
  }

  // Capacity warning
  const playerCapacity = Math.floor(10 * Math.pow(1.5, state.upgrades.carryCapacity - 1));
  if (state.wood >= playerCapacity) {
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
      const effSpeed = Math.round(chopper.speed * Math.pow(1.2, workerUpgrades.workerSpeed - 1));
      const effDamage = chopper.chopPower * Math.pow(1.2, effectivePower - 1);
      const effRest = (chopper.baseRestTime / Math.pow(1.2, workerUpgrades.restSpeed - 1)).toFixed(1);
      const effCap = Math.floor(chopper.carryCapacity * Math.pow(1.2, effectivePower - 1));

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
      const effSpeed = Math.round(collector.speed * Math.pow(1.2, workerUpgrades.workerSpeed - 1));
      const effRest = (collector.baseRestTime / Math.pow(1.2, workerUpgrades.restSpeed - 1)).toFixed(1);
      const effCap = Math.floor(collector.carryCapacity * Math.pow(1.8, effectivePower - 1));
      const pickupRate = Math.pow(1.5, workerUpgrades.workerSpeed - 1).toFixed(2);

      ctx.fillStyle = '#88AAFF';
      ctx.fillText('COLLECTORS:', workerPanelX + 10, workerPanelY + yOffset);
      yOffset += 14;
      ctx.fillStyle = '#aaa';
      ctx.fillText(`  Spd: ${effSpeed}  Cap: ${effCap}`, workerPanelX + 10, workerPanelY + yOffset);
      yOffset += 12;
      ctx.fillText(`  Pickup: ${pickupRate}/s  Rest: ${effRest}s`, workerPanelX + 10, workerPanelY + yOffset);
    }
  }
}

function drawWaypoints(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  camera: { x: number; y: number },
  scale: number
): void {
  // Draw worker waypoints
  for (const waypoint of state.waypoints) {
    const screenX = (waypoint.x - camera.x) * scale;
    const screenY = (waypoint.y - camera.y) * scale;

    const isChopper = waypoint.type === WaypointType.Chopper;
    const color = isChopper ? '#5A9C5A' : '#88AAFF';
    const symbol = isChopper ? '⚒' : '📦';

    // Draw waypoint marker
    ctx.beginPath();
    ctx.arc(screenX, screenY, 8 * scale, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw range circle
    ctx.beginPath();
    ctx.arc(screenX, screenY, 400 * scale, 0, Math.PI * 2);
    ctx.strokeStyle = `${color}44`;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw symbol
    ctx.fillStyle = '#fff';
    ctx.font = `${12 * scale}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(symbol, screenX, screenY + 4 * scale);
  }

  // Draw player waypoint (when zoomed out)
  if (state.playerWaypoint) {
    const screenX = (state.playerWaypoint.x - camera.x) * scale;
    const screenY = (state.playerWaypoint.y - camera.y) * scale;
    const color = '#FFD700';

    // Draw waypoint marker (star shape)
    ctx.beginPath();
    ctx.arc(screenX, screenY, 10 * scale, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw symbol
    ctx.fillStyle = '#000';
    ctx.font = `bold ${14 * scale}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('★', screenX, screenY + 5 * scale);
  }
}

function drawPlayerWaypointIndicator(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  camera: { x: number; y: number; width: number; height: number },
  scale: number
): void {
  if (!state.playerWaypoint) return;

  const waypointScreenX = (state.playerWaypoint.x - camera.x) * scale;
  const waypointScreenY = (state.playerWaypoint.y - camera.y) * scale;
  const canvasWidth = ctx.canvas.width;
  const canvasHeight = ctx.canvas.height;
  const margin = 60;

  // Check if waypoint is on screen
  if (waypointScreenX >= margin && waypointScreenX <= canvasWidth - margin &&
      waypointScreenY >= margin && waypointScreenY <= canvasHeight - margin) {
    // Waypoint is on screen - draw a small marker at its position
    ctx.beginPath();
    ctx.arc(waypointScreenX, waypointScreenY, 12, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 215, 0, 0.7)';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#000';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('★', waypointScreenX, waypointScreenY + 5);
    return;
  }

  // Waypoint is off screen - draw indicator on edge
  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;
  const dx = waypointScreenX - centerX;
  const dy = waypointScreenY - centerY;
  const angle = Math.atan2(dy, dx);

  // Calculate position on screen edge
  let edgeX: number, edgeY: number;
  const halfWidth = canvasWidth / 2 - margin;
  const halfHeight = canvasHeight / 2 - margin;

  // Find intersection with screen edge
  const tanAngle = Math.tan(angle);
  if (Math.abs(dx) * halfHeight > Math.abs(dy) * halfWidth) {
    // Hits left or right edge
    edgeX = dx > 0 ? canvasWidth - margin : margin;
    edgeY = centerY + (edgeX - centerX) * tanAngle;
  } else {
    // Hits top or bottom edge
    edgeY = dy > 0 ? canvasHeight - margin : margin;
    edgeX = centerX + (edgeY - centerY) / tanAngle;
  }

  // Clamp to screen
  edgeX = Math.max(margin, Math.min(canvasWidth - margin, edgeX));
  edgeY = Math.max(margin, Math.min(canvasHeight - margin, edgeY));

  // Calculate distance
  const worldDx = state.playerWaypoint.x - state.player.position.x;
  const worldDy = state.playerWaypoint.y - state.player.position.y;
  const distance = Math.sqrt(worldDx * worldDx + worldDy * worldDy);

  // Draw arrow pointing toward waypoint
  ctx.save();
  ctx.translate(edgeX, edgeY);
  ctx.rotate(angle);

  // Arrow shape
  ctx.beginPath();
  ctx.moveTo(15, 0);
  ctx.lineTo(-10, -10);
  ctx.lineTo(-5, 0);
  ctx.lineTo(-10, 10);
  ctx.closePath();
  ctx.fillStyle = '#FFD700';
  ctx.fill();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();

  // Draw distance text
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(edgeX - 30, edgeY + 15, 60, 20);
  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(distance)}`, edgeX, edgeY + 29);
}

function drawChunkOverlay(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  config: GameConfig,
  camera: { x: number; y: number; width: number; height: number; zoom: number },
  scale: number,
  waypointMode: WaypointType | null = null
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

  // Check if fully zoomed out (for toggle hint)
  const fullyZoomedOut = camera.zoom <= 0.15;

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

      // Check chunk tier (0=none, 1=bronze, 2=silver, 3=gold, 4=platinum)
      const isPlatinum = state.platinumChunks.has(key);
      const isGold = state.goldChunks.has(key);
      const isSilver = state.silverChunks.has(key);
      const isBronze = state.bronzeChunks.has(key);
      const tier = isPlatinum ? 4 : isGold ? 3 : isSilver ? 2 : isBronze ? 1 : 0;
      const isChallenge = state.challengeChunks.has(key);
      const cooldown = state.chunkToggleCooldowns.get(key) || 0;
      // Challenge multipliers: bronze=2x, silver=4x, gold=8x, platinum=8x
      const challengeMulti = tier === 1 ? 2 : tier === 2 ? 4 : tier >= 3 ? 8 : 2;

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
        } else if (isChallenge) {
          // Challenge mode - orange tint
          color = 'rgba(255, 100, 0, 0.4)';
        } else {
          // Has trees - red
          color = 'rgba(255, 0, 0, 0.3)';
        }
      }

      // Draw chunk background
      ctx.fillStyle = color;
      ctx.fillRect(screenX, screenY, screenW, screenH);

      // Tier colors: bronze=#CD7F32, silver=#C0C0C0, gold=#FFD700, platinum=#E5E4E2
      const tierColors = ['rgba(255,255,255,0.5)', '#CD7F32', '#C0C0C0', '#FFD700', '#E5E4E2'];
      const tierLineWidths = [1, 2, 3, 3, 4];

      // Draw chunk border based on tier
      ctx.strokeStyle = tierColors[tier];
      ctx.lineWidth = tierLineWidths[tier];
      ctx.strokeRect(screenX, screenY, screenW, screenH);

      // Draw tree count - always show for all chunks
      if (chunk) {
        // Color based on tier
        ctx.fillStyle = tier > 0 ? tierColors[tier] : 'rgba(255, 255, 255, 0.9)';
        ctx.fillText(
          `${treeCount}`,
          screenX + screenW / 2,
          screenY + screenH / 2 + 4
        );

        // Show challenge indicator if active
        if (isChallenge) {
          ctx.fillStyle = tier >= 2 ? tierColors[tier] : '#FF6600';
          ctx.font = `bold ${Math.max(8, 10 * scale / 3)}px monospace`;
          ctx.fillText(
            `${challengeMulti}X`,
            screenX + screenW / 2,
            screenY + screenH / 2 - 12
          );
          ctx.font = `${Math.max(10, 12 * scale / 3)}px monospace`;
        }

        // Show cooldown timer if applicable and zoomed out enough
        if (cooldown > 0 && fullyZoomedOut && tier > 0) {
          ctx.fillStyle = '#FF4444';
          ctx.font = `${Math.max(8, 8 * scale / 3)}px monospace`;
          const mins = Math.floor(cooldown / 60);
          const secs = Math.ceil(cooldown % 60);
          ctx.fillText(
            `${mins}:${secs.toString().padStart(2, '0')}`,
            screenX + screenW / 2,
            screenY + screenH / 2 + 20
          );
          ctx.font = `${Math.max(10, 12 * scale / 3)}px monospace`;
        }

        // Show click hint for tiered chunks when fully zoomed out
        if (fullyZoomedOut && tier > 0 && cooldown <= 0 && !isChallenge) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.font = `${Math.max(7, 7 * scale / 3)}px monospace`;
          ctx.fillText(
            'CLICK',
            screenX + screenW / 2,
            screenY + screenH / 2 + 18
          );
          ctx.font = `${Math.max(10, 12 * scale / 3)}px monospace`;
        }
      }
    }
  }

  // Show instruction at bottom when fully zoomed out
  if (fullyZoomedOut) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(ctx.canvas.width / 2 - 280, ctx.canvas.height - 80, 560, 45);

    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';

    // Show waypoint mode if active
    if (waypointMode !== null) {
      let modeName: string;
      let modeColor: string;
      if (waypointMode === WaypointType.Chopper) {
        modeName = 'CHOPPER';
        modeColor = '#5A9C5A';
      } else if (waypointMode === WaypointType.Collector) {
        modeName = 'COLLECTOR';
        modeColor = '#88AAFF';
      } else {
        modeName = 'PLAYER';
        modeColor = '#FFD700';
      }
      ctx.fillStyle = modeColor;
      ctx.fillText(`Placing ${modeName} waypoint - Click to place`, ctx.canvas.width / 2, ctx.canvas.height - 60);
    } else {
      ctx.fillStyle = '#FFD700';
      ctx.fillText('Click completed chunks for CHALLENGE (Bronze: 2x | Silver: 4x | Gold: 8x | Plat: 16x)', ctx.canvas.width / 2, ctx.canvas.height - 60);
    }

    ctx.fillStyle = '#AAAAAA';
    ctx.font = '10px monospace';
    ctx.fillText('Q: Chopper | R: Collector | F: Player waypoint | X: Clear all', ctx.canvas.width / 2, ctx.canvas.height - 43);
  }
}

function drawCatchUpIndicator(
  ctx: CanvasRenderingContext2D,
  catchUpTime: number
): void {
  const centerX = ctx.canvas.width / 2;
  const centerY = ctx.canvas.height / 2;

  // Semi-transparent overlay
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(centerX - 150, centerY - 40, 300, 80);

  // Border
  ctx.strokeStyle = '#88FFFF';
  ctx.lineWidth = 2;
  ctx.strokeRect(centerX - 150, centerY - 40, 300, 80);

  // Title
  ctx.fillStyle = '#88FFFF';
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('CATCHING UP...', centerX, centerY - 10);

  // Time remaining
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '14px monospace';
  const mins = Math.floor(catchUpTime / 60);
  const secs = Math.floor(catchUpTime % 60);
  ctx.fillText(`${mins}:${secs.toString().padStart(2, '0')} remaining`, centerX, centerY + 15);

  // Progress bar
  const barWidth = 260;
  const barHeight = 8;
  const barX = centerX - barWidth / 2;
  const barY = centerY + 25;

  ctx.fillStyle = '#333';
  ctx.fillRect(barX, barY, barWidth, barHeight);

  // Animated progress (pulse effect)
  const pulse = Math.sin(Date.now() / 200) * 0.2 + 0.8;
  ctx.fillStyle = `rgba(136, 255, 255, ${pulse})`;
  ctx.fillRect(barX, barY, barWidth * pulse, barHeight);
}

function drawCheatMenu(
  ctx: CanvasRenderingContext2D,
  state: GameState
): void {
  const menuWidth = 300;
  const menuHeight = 480;
  const menuX = (ctx.canvas.width - menuWidth) / 2;
  const menuY = (ctx.canvas.height - menuHeight) / 2;

  // Darken background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Menu background
  ctx.fillStyle = 'rgba(40, 20, 60, 0.95)';
  ctx.fillRect(menuX, menuY, menuWidth, menuHeight);

  // Menu border
  ctx.strokeStyle = '#FF00FF';
  ctx.lineWidth = 3;
  ctx.strokeRect(menuX, menuY, menuWidth, menuHeight);

  // Title
  ctx.fillStyle = '#FF00FF';
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('CHEAT MENU', menuX + menuWidth / 2, menuY + 28);

  // Subtitle
  ctx.fillStyle = '#888';
  ctx.font = '10px monospace';
  ctx.fillText('Type "cheater" or click outside to close', menuX + menuWidth / 2, menuY + 42);

  // Cheat options
  ctx.textAlign = 'left';
  ctx.font = '12px monospace';
  const options = [
    { key: 'M', label: 'Add $1,000' },
    { key: 'N', label: 'Add $10,000' },
    { key: 'B', label: 'Add $100,000' },
    { key: 'L', label: 'Open Tree Checklist' },
    { key: 'G', label: 'Fill Tree Checklist' },
    { key: 'S', label: 'Set World Seed' },
    { key: 'R', label: 'Randomize Seed' },
    { key: 'A', label: 'Add 10 Apples' },
    { key: 'T', label: '+1 Hour Offline Time' },
    { key: 'P', label: 'Set Buff Time' },
    { key: 'D', label: 'Set Speed Multiplier' },
    { key: 'F', label: 'Set Damage Multiplier' },
    { key: 'U', label: 'Max All Upgrades' },
    { key: 'W', label: '+5 Free Choppers' },
    { key: 'E', label: '+5 Free Collectors' },
  ];

  let y = menuY + 60;
  for (const opt of options) {
    ctx.fillStyle = '#FF88FF';
    ctx.fillText(`[${opt.key}]`, menuX + 15, y);
    ctx.fillStyle = '#fff';
    ctx.fillText(opt.label, menuX + 50, y);
    y += 21;
  }

  // Show current stats
  ctx.fillStyle = '#888';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`Seed: ${state.worldSeed} | Buff: ${Math.ceil(state.appleBuff.remainingTime)}s`, menuX + menuWidth / 2, menuY + menuHeight - 28);
  ctx.fillText(`Speed: ${state.appleBuff.speedMultiplier}x | Damage: ${state.appleBuff.damageMultiplier}x`, menuX + menuWidth / 2, menuY + menuHeight - 12);
}

function drawSquadMenu(
  ctx: CanvasRenderingContext2D,
  state: GameState
): void {
  const menuWidth = 320;
  const menuHeight = 340;
  const menuX = (ctx.canvas.width - menuWidth) / 2;
  const menuY = (ctx.canvas.height - menuHeight) / 2;

  // Count workers
  const chopperCount = state.workers.filter(w => w.type === WorkerType.Chopper).length;
  const collectorCount = state.workers.filter(w => w.type === WorkerType.Collector).length;
  const escortingChoppers = state.workers.filter(w => w.type === WorkerType.Chopper && w.isEscorting).length;
  const escortingCollectors = state.workers.filter(w => w.type === WorkerType.Collector && w.isEscorting).length;
  const availableChoppers = state.workers.filter(w => w.type === WorkerType.Chopper && !w.isEscorting && w.state !== WorkerState.Resting).length;
  const availableCollectors = state.workers.filter(w => w.type === WorkerType.Collector && !w.isEscorting && w.state !== WorkerState.Resting).length;

  // Darken background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Menu background
  ctx.fillStyle = 'rgba(30, 50, 60, 0.95)';
  ctx.fillRect(menuX, menuY, menuWidth, menuHeight);

  // Menu border
  ctx.strokeStyle = '#44AAFF';
  ctx.lineWidth = 3;
  ctx.strokeRect(menuX, menuY, menuWidth, menuHeight);

  // Title
  ctx.fillStyle = '#44AAFF';
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('SQUAD MENU', menuX + menuWidth / 2, menuY + 28);

  // Subtitle
  ctx.fillStyle = '#888';
  ctx.font = '10px monospace';
  ctx.fillText('Press H to close', menuX + menuWidth / 2, menuY + 42);

  // Current squad status
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('Current Squad:', menuX + 20, menuY + 70);

  ctx.font = '13px monospace';
  ctx.fillStyle = '#4f8';
  ctx.fillText(`Choppers:   ${escortingChoppers}/${chopperCount} following`, menuX + 30, menuY + 92);
  ctx.fillStyle = '#f84';
  ctx.fillText(`Collectors: ${escortingCollectors}/${collectorCount} following`, menuX + 30, menuY + 112);

  // Available workers
  ctx.fillStyle = '#aaa';
  ctx.font = '11px monospace';
  ctx.fillText(`(${availableChoppers} available choppers, ${availableCollectors} available collectors)`, menuX + 20, menuY + 135);

  // Controls
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px monospace';
  ctx.fillText('Controls:', menuX + 20, menuY + 165);

  ctx.font = '13px monospace';
  const controls = [
    { key: '1', label: 'Add Chopper to squad' },
    { key: '2', label: 'Add Collector to squad' },
    { key: 'Shift+1', label: 'Add ALL Choppers' },
    { key: 'Shift+2', label: 'Add ALL Collectors' },
    { key: '3', label: 'Release Chopper from squad' },
    { key: '4', label: 'Release Collector from squad' },
    { key: '5', label: 'Release ALL workers' },
  ];

  let y = menuY + 188;
  for (const ctrl of controls) {
    ctx.fillStyle = '#88CCFF';
    ctx.fillText(`[${ctrl.key}]`, menuX + 25, y);
    ctx.fillStyle = '#fff';
    ctx.fillText(ctrl.label, menuX + 100, y);
    y += 20;
  }

  // Info
  ctx.fillStyle = '#888';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Squad workers follow you and teleport with you', menuX + menuWidth / 2, menuY + menuHeight - 28);
  ctx.fillText('They will not work until released', menuX + menuWidth / 2, menuY + menuHeight - 12);
}

function drawOptionsMenu(
  ctx: CanvasRenderingContext2D,
  menuState: OptionsMenuState
): void {
  const menuWidth = 380;
  const menuHeight = 520;
  const menuX = (ctx.canvas.width - menuWidth) / 2;
  const menuY = (ctx.canvas.height - menuHeight) / 2;

  // Darken background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Menu background
  ctx.fillStyle = 'rgba(40, 40, 50, 0.95)';
  ctx.fillRect(menuX, menuY, menuWidth, menuHeight);

  // Menu border
  ctx.strokeStyle = '#88AA44';
  ctx.lineWidth = 3;
  ctx.strokeRect(menuX, menuY, menuWidth, menuHeight);

  // Title
  ctx.fillStyle = '#88AA44';
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('OPTIONS', menuX + menuWidth / 2, menuY + 28);

  // Subtitle
  ctx.fillStyle = '#888';
  ctx.font = '10px monospace';
  ctx.fillText('Arrows to navigate, L/R to adjust, Enter to type', menuX + menuWidth / 2, menuY + 42);

  const options = [
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
    // Button to keybinds submenu
    { label: 'Keybinds...', type: 'button', key: 'keybinds', category: 'Settings' },
  ];

  let y = menuY + 60;
  let lastCategory = '';

  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const isSelected = i === menuState.selection;

    // Draw category header
    if (opt.category !== lastCategory) {
      lastCategory = opt.category;
      ctx.fillStyle = '#88AA44';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`-- ${opt.category} --`, menuX + 15, y);
      y += 18;
    }

    // Highlight selected row
    if (isSelected) {
      ctx.fillStyle = 'rgba(136, 170, 68, 0.3)';
      ctx.fillRect(menuX + 10, y - 12, menuWidth - 20, 18);
    }

    // Draw label
    ctx.fillStyle = isSelected ? '#fff' : '#ccc';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(opt.label, menuX + 20, y);

    // Draw value
    ctx.textAlign = 'right';
    if (opt.type === 'stat') {
      const isPlayerStat = ['axePower', 'moveSpeed', 'chopSpeed', 'carryCapacity'].includes(opt.key);
      let currentLevel: number, maxLevel: number;
      if (isPlayerStat) {
        currentLevel = menuState.effectiveUpgrades[opt.key as keyof typeof menuState.effectiveUpgrades];
        maxLevel = menuState.maxUpgrades[opt.key as keyof typeof menuState.maxUpgrades];
      } else {
        currentLevel = menuState.effectiveWorkerUpgrades[opt.key as keyof typeof menuState.effectiveWorkerUpgrades];
        maxLevel = menuState.maxWorkerUpgrades[opt.key as keyof typeof menuState.maxWorkerUpgrades];
      }
      const canDecrease = currentLevel > 1;
      const canIncrease = currentLevel < maxLevel;

      // Get actual calculated values
      const statVal = menuState.statValues[opt.key];
      const formatValue = (v: number) => {
        if (opt.key === 'carryCapacity') return Math.floor(v).toString();
        if (['restSpeed', 'workDuration', 'workerSpeed', 'workerPower'].includes(opt.key)) {
          return Math.round(v) + '%';
        }
        if (opt.key === 'chopSpeed') return v.toFixed(1) + '/s';
        return v.toFixed(1);
      };

      ctx.fillStyle = isSelected ? '#88AA44' : '#888';
      const leftArrow = canDecrease ? '< ' : '  ';
      const rightArrow = canIncrease ? ' >' : '  ';
      // Show actual value (current/max) with arrows
      ctx.fillText(`${leftArrow}${formatValue(statVal.current)}/${formatValue(statVal.max)}${rightArrow}`, menuX + menuWidth - 20, y);
    } else if (opt.type === 'button') {
      ctx.fillStyle = isSelected ? '#88CCFF' : '#888';
      ctx.fillText('>', menuX + menuWidth - 20, y);
    }

    y += 20;
  }

  // Footer
  ctx.fillStyle = '#888';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Enter to select | Escape to close & save', menuX + menuWidth / 2, menuY + menuHeight - 15);
}

export interface KeybindsMenuState {
  selection: number;
  editingKeybind: string | null;
  keybinds: Record<string, string>;
}

// Keybind display names
const KEYBIND_LABELS: Record<string, string> = {
  moveUp: 'Move Up',
  moveDown: 'Move Down',
  moveLeft: 'Move Left',
  moveRight: 'Move Right',
  chop: 'Chop',
  interact: 'Interact/Sell',
  squadMenu: 'Squad Menu',
  treeChecklist: 'Tree Checklist',
  optionsMenu: 'Options Menu',
  toggleUI: 'Toggle UI',
  toggleStumpTimers: 'Stump Timers',
  toggleChoppers: 'Toggle Choppers',
  toggleCollectors: 'Toggle Collectors',
  hireChopper: 'Hire Chopper',
  hireCollector: 'Hire Collector',
  placeChopperWaypoint: 'Chopper Waypoint',
  placeCollectorWaypoint: 'Collector Waypoint',
  placePlayerWaypoint: 'Player Waypoint',
  placeWoodWaypoint: 'Wood Waypoint',
  clearWaypoints: 'Clear Waypoints',
  teleportHome: 'Teleport Home',
};

function drawKeybindsMenu(
  ctx: CanvasRenderingContext2D,
  menuState: KeybindsMenuState
): void {
  const menuWidth = 400;
  const keybindNames = Object.keys(menuState.keybinds);
  const menuHeight = Math.min(550, 80 + keybindNames.length * 22);
  const menuX = (ctx.canvas.width - menuWidth) / 2;
  const menuY = (ctx.canvas.height - menuHeight) / 2;

  // Darken background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Menu background
  ctx.fillStyle = 'rgba(40, 50, 60, 0.95)';
  ctx.fillRect(menuX, menuY, menuWidth, menuHeight);

  // Menu border
  ctx.strokeStyle = '#88AAFF';
  ctx.lineWidth = 3;
  ctx.strokeRect(menuX, menuY, menuWidth, menuHeight);

  // Title
  ctx.fillStyle = '#88AAFF';
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('KEYBINDS', menuX + menuWidth / 2, menuY + 28);

  // Subtitle
  ctx.fillStyle = '#888';
  ctx.font = '10px monospace';
  ctx.fillText('Enter to change, Escape/Backspace to go back', menuX + menuWidth / 2, menuY + 42);

  let y = menuY + 65;

  for (let i = 0; i < keybindNames.length; i++) {
    const key = keybindNames[i];
    const isSelected = i === menuState.selection;
    const isEditing = menuState.editingKeybind === key;

    // Highlight selected row
    if (isSelected) {
      ctx.fillStyle = 'rgba(136, 170, 255, 0.3)';
      ctx.fillRect(menuX + 10, y - 12, menuWidth - 20, 18);
    }

    // Draw label
    ctx.fillStyle = isSelected ? '#fff' : '#ccc';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(KEYBIND_LABELS[key] || key, menuX + 20, y);

    // Draw current keybind value
    ctx.textAlign = 'right';
    if (isEditing) {
      ctx.fillStyle = '#ff8';
      ctx.fillText('Press any key...', menuX + menuWidth - 20, y);
    } else {
      const keyValue = menuState.keybinds[key] || '?';
      const displayValue = keyValue === ' ' ? 'Space' : keyValue;
      ctx.fillStyle = isSelected ? '#88CCFF' : '#888';
      ctx.fillText(`[${displayValue}]`, menuX + menuWidth - 20, y);
    }

    y += 20;
  }

  // Footer
  ctx.fillStyle = '#888';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Settings auto-save when you exit', menuX + menuWidth / 2, menuY + menuHeight - 12);
}

function drawTreeChecklist(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: SpriteSheet
): void {
  const menuWidth = 450;
  const menuHeight = 500;
  const menuX = (ctx.canvas.width - menuWidth) / 2;
  const menuY = (ctx.canvas.height - menuHeight) / 2;

  // Darken background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Menu background
  ctx.fillStyle = 'rgba(20, 40, 30, 0.95)';
  ctx.fillRect(menuX, menuY, menuWidth, menuHeight);

  // Menu border
  ctx.strokeStyle = '#4a8';
  ctx.lineWidth = 3;
  ctx.strokeRect(menuX, menuY, menuWidth, menuHeight);

  // Title
  ctx.fillStyle = '#4f8';
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('TREE CHECKLIST', menuX + menuWidth / 2, menuY + 28);

  // Subtitle - count discovered
  const discoveredCount = state.choppedTreeTypes.size;
  const totalCount = 15; // TreeType goes from 0 to 14
  ctx.fillStyle = '#888';
  ctx.font = '12px monospace';
  ctx.fillText(`${discoveredCount}/${totalCount} discovered - Press L to close`, menuX + menuWidth / 2, menuY + 46);

  // Tree list with stats
  ctx.textAlign = 'left';
  const treeNames = [
    'Small Pine', 'Large Pine', 'Oak', 'Dead Tree', 'Birch',
    'Willow', 'Cherry Blossom', 'Giant Redwood', 'Ancient Oak', 'Magic Tree',
    'Crystal Tree', 'Void Tree', 'Cosmic Tree', 'Divine Tree', 'World Tree'
  ];

  const rarityColors: Record<number, string> = {
    0: '#888888', // Common
    1: '#888888',
    2: '#888888',
    3: '#888888',
    4: '#888888',
    5: '#4488ff', // Uncommon
    6: '#44ff88', // Rare
    7: '#ff8844', // Epic
    8: '#ff44ff', // Legendary
    9: '#ffff44', // Magic
    10: '#88ffff', // Crystal
    11: '#8844ff', // Void
    12: '#ff88ff', // Cosmic
    13: '#ffffff', // Divine
    14: '#ffd700', // World Tree
  };

  let y = menuY + 72;
  const rowHeight = 28;

  for (let i = 0; i < 15; i++) {
    const treeType = i as TreeType;
    const discovered = state.choppedTreeTypes.has(treeType);
    const count = state.treeChoppedCounts.get(treeType) || 0;
    const stats = TREE_STATS[treeType];
    const color = rarityColors[i] || '#888';

    // Progressive unlock thresholds - 5x lower for Ancient Oak (8) and below
    const isCommonTree = i <= 8; // Ancient Oak is index 8
    const thresholdMultiplier = isCommonTree ? 0.2 : 1; // 5x lower for common trees
    const showSize = count >= Math.ceil(10 * thresholdMultiplier);      // 2 for common, 10 for rare
    const showWood = count >= Math.ceil(50 * thresholdMultiplier);      // 10 for common, 50 for rare
    const showSpawnChance = count >= Math.ceil(100 * thresholdMultiplier); // 20 for common, 100 for rare
    const showHP = count >= Math.ceil(250 * thresholdMultiplier);       // 50 for common, 250 for rare

    // Draw tree sprite if discovered (scaled down)
    if (discovered) {
      const sprite = sprites.trees[i];
      if (sprite) {
        ctx.drawImage(sprite, menuX + 15, y - 14, 18, 24);
      }
    } else {
      // Draw question mark for undiscovered
      ctx.fillStyle = '#444';
      ctx.font = 'bold 18px monospace';
      ctx.fillText('?', menuX + 20, y + 4);
    }

    // Tree name and count
    ctx.font = '13px monospace';
    if (discovered) {
      ctx.fillStyle = color;
      ctx.fillText(treeNames[i], menuX + 45, y);
      // Show count
      ctx.fillStyle = '#888';
      ctx.font = '10px monospace';
      ctx.fillText(`x${count}`, menuX + 145, y);
    } else {
      ctx.fillStyle = '#444';
      ctx.fillText('???', menuX + 45, y);
    }

    // Stats (progressive reveal based on count)
    if (discovered) {
      ctx.font = '10px monospace';
      let statX = menuX + 180;

      // HP (250+ trees)
      if (showHP) {
        ctx.fillStyle = '#aaa';
        ctx.fillText(`HP:${stats.health}`, statX, y);
      } else {
        ctx.fillStyle = '#555';
        ctx.fillText('HP:???', statX, y);
      }
      statX += 55;

      // Wood (50+ trees)
      if (showWood) {
        ctx.fillStyle = '#aaa';
        ctx.fillText(`W:${stats.woodDrop}`, statX, y);
      } else {
        ctx.fillStyle = '#555';
        ctx.fillText('W:???', statX, y);
      }
      statX += 50;

      // Size (10+ trees)
      if (showSize) {
        ctx.fillStyle = '#aaa';
        ctx.fillText(`Sz:${stats.hitboxRadius}`, statX, y);
      } else {
        ctx.fillStyle = '#555';
        ctx.fillText('Sz:???', statX, y);
      }
      statX += 45;

      // Spawn chance (100+ trees)
      if (showSpawnChance) {
        ctx.fillStyle = '#aaa';
        ctx.fillText(stats.spawnChance, statX, y);
      } else {
        ctx.fillStyle = '#555';
        ctx.fillText('??%', statX, y);
      }
    }

    // Checkmark or X
    ctx.font = 'bold 14px monospace';
    if (discovered) {
      ctx.fillStyle = '#4f8';
      ctx.fillText('✓', menuX + menuWidth - 30, y);
    } else {
      ctx.fillStyle = '#844';
      ctx.fillText('✗', menuX + menuWidth - 30, y);
    }

    y += rowHeight;
  }
}

function drawAppleNotification(ctx: CanvasRenderingContext2D): void {
  const notifWidth = 150;
  const notifHeight = 50;
  const notifX = 15; // Middle left
  const notifY = (ctx.canvas.height - notifHeight) / 2;

  // Pulsing background
  const pulse = Math.sin(performance.now() / 150) * 0.2 + 0.8;

  // Background
  ctx.fillStyle = `rgba(229, 57, 53, ${0.9 * pulse})`;
  ctx.fillRect(notifX, notifY, notifWidth, notifHeight);

  // Border
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.strokeRect(notifX, notifY, notifWidth, notifHeight);

  // Text
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('APPLE', notifX + notifWidth / 2, notifY + 22);
  ctx.font = 'bold 14px monospace';
  ctx.fillText('DROPPED!', notifX + notifWidth / 2, notifY + 40);
}
