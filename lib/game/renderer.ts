import { GameState, SpriteSheet, GameConfig, Tree, WoodDrop, Particle, FloatingText, UPGRADE_COSTS } from '../types';
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
  const scale = config.pixelScale;

  // Clear canvas
  ctx.fillStyle = '#2d4a2d';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Disable image smoothing for crisp pixels
  ctx.imageSmoothingEnabled = false;

  // Draw ground pattern
  drawGround(ctx, camera, scale);

  // Draw chipper
  drawChipper(ctx, state, sprites, config);

  // Collect all visible trees from chunks
  const visibleTrees: Tree[] = [];
  const buffer = 100;

  for (const chunk of chunks.values()) {
    for (const tree of chunk.trees) {
      if (
        tree.x >= camera.x - buffer &&
        tree.x <= camera.x + camera.width + buffer &&
        tree.y >= camera.y - buffer &&
        tree.y <= camera.y + camera.height + buffer
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
      drawPlayer(ctx, state, sprites, config);
      playerDrawn = true;
    }
    drawTree(ctx, tree, camera, sprites, scale, config);
  }

  if (!playerDrawn) {
    drawPlayer(ctx, state, sprites, config);
  }

  // Draw wood drops
  for (const drop of state.woodDrops) {
    drawWoodDrop(ctx, drop, camera, sprites, scale);
  }

  // Draw particles
  for (const particle of state.particles) {
    drawParticle(ctx, particle, camera, scale);
  }

  // Draw floating texts
  for (const text of state.floatingTexts) {
    drawFloatingText(ctx, text, camera, scale);
  }

  // Draw UI
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
  config: GameConfig
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

  // Draw respawn timer if dead
  if (tree.isDead && tree.respawnTimer > 0) {
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
  config: GameConfig
): void {
  const { player, camera } = state;
  const scale = config.pixelScale;

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
  config: GameConfig
): void {
  const { chipper, camera, player } = state;
  const scale = config.pixelScale;

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
  ctx.fillRect(padding, padding, 180, 80);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'left';

  // Wood icon and count
  ctx.drawImage(sprites.wood, padding + 10, padding + 12, 24, 18);
  ctx.fillText(`${state.wood} / ${state.upgrades.carryCapacity}`, padding + 45, padding + 28);

  // Money
  ctx.fillStyle = '#FFD700';
  ctx.fillText(`$${state.money}`, padding + 10, padding + 55);

  // Stats
  ctx.fillStyle = '#aaa';
  ctx.font = '11px monospace';
  ctx.fillText(`Total chopped: ${state.totalWoodChopped}`, padding + 10, padding + 72);

  // Top-right: Upgrades panel
  const upgradeWidth = 220;
  const upgradeX = ctx.canvas.width - upgradeWidth - padding;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(upgradeX, padding, upgradeWidth, 140);

  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('UPGRADES [1-4]', upgradeX + upgradeWidth / 2, padding + 18);

  ctx.textAlign = 'left';
  ctx.font = '12px monospace';

  const upgrades = [
    { key: '1', name: 'Axe Power', level: state.upgrades.axePower, costs: UPGRADE_COSTS.axePower },
    { key: '2', name: 'Move Speed', level: state.upgrades.moveSpeed, costs: UPGRADE_COSTS.moveSpeed },
    { key: '3', name: 'Chop Speed', level: state.upgrades.chopSpeed, costs: UPGRADE_COSTS.chopSpeed },
    { key: '4', name: 'Carry Cap', level: state.upgrades.carryCapacity, costs: UPGRADE_COSTS.carryCapacity },
  ];

  upgrades.forEach((upg, i) => {
    const y = padding + 35 + i * 26;
    const levelIndex = upg.name === 'Carry Cap' ? Math.floor((upg.level - 20) / 10) : upg.level - 1;
    const nextCost = upg.costs[levelIndex];
    const maxed = nextCost === undefined;

    ctx.fillStyle = '#fff';
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
  ctx.fillRect(padding, controlsY, 400, 25);

  ctx.fillStyle = '#ccc';
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('WASD: Move | SPACE/Click: Chop | E: Sell at Chipper | 1-4: Upgrades', padding + 10, controlsY + 16);

  // Capacity warning
  if (state.wood >= state.upgrades.carryCapacity) {
    ctx.fillStyle = 'rgba(255, 100, 100, 0.9)';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('INVENTORY FULL - Sell wood at the chipper!', ctx.canvas.width / 2, 120);
  }
}
