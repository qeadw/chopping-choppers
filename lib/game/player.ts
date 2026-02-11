import { Player, InputState, Camera, GameConfig, Upgrades } from '../types';

// Milestone bonuses interface
export interface MilestoneBonuses {
  speedPercent: number;   // Total % bonus to move speed
  powerPercent: number;   // Total % bonus to chop power
  chopSpeedPercent: number; // Total % bonus to chop speed
}

export function createPlayer(): Player {
  return {
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    speed: 150,
    width: 12,
    height: 18,
    facingRight: true,
    isChopping: false,
    chopTimer: 0,
  };
}

export function updatePlayer(
  player: Player,
  input: InputState,
  deltaTime: number,
  config: GameConfig,
  upgrades: Upgrades,
  milestoneBonuses: MilestoneBonuses = { speedPercent: 0, powerPercent: 0, chopSpeedPercent: 0 }
): void {
  // Update chop timer
  if (player.chopTimer > 0) {
    player.chopTimer -= deltaTime;
    if (player.chopTimer <= 0) {
      player.isChopping = false;
    }
  }

  // Calculate velocity based on input
  let vx = 0;
  let vy = 0;

  if (input.up) vy -= 1;
  if (input.down) vy += 1;
  if (input.left) {
    vx -= 1;
    player.facingRight = false;
  }
  if (input.right) {
    vx += 1;
    player.facingRight = true;
  }

  // Normalize diagonal movement
  if (vx !== 0 && vy !== 0) {
    const len = Math.sqrt(vx * vx + vy * vy);
    vx /= len;
    vy /= len;
  }

  // Apply speed with upgrade multiplier (10% compound per level) plus milestone bonus
  const baseSpeed = config.playerSpeed * Math.pow(1.1, upgrades.moveSpeed - 1);
  const speed = baseSpeed * (1 + milestoneBonuses.speedPercent / 100);
  player.velocity.x = vx * speed;
  player.velocity.y = vy * speed;

  // Update position
  player.position.x += player.velocity.x * deltaTime;
  player.position.y += player.velocity.y * deltaTime;
}

export function canChop(player: Player): boolean {
  return player.chopTimer <= 0;
}

export function startChop(
  player: Player,
  config: GameConfig,
  upgrades: Upgrades,
  milestoneBonuses: MilestoneBonuses = { speedPercent: 0, powerPercent: 0, chopSpeedPercent: 0 }
): void {
  player.isChopping = true;
  // Chop speed: 10% faster per level (compound) plus milestone bonus
  const baseCooldown = config.chopCooldown / Math.pow(1.1, upgrades.chopSpeed - 1);
  player.chopTimer = baseCooldown / (1 + milestoneBonuses.chopSpeedPercent / 100);
}

export function updateCamera(camera: Camera, player: Player): void {
  // Center camera on player
  camera.x = player.position.x - camera.width / 2;
  camera.y = player.position.y - camera.height / 2;
}

export function createCamera(width: number, height: number): Camera {
  return {
    x: 0,
    y: 0,
    width,
    height,
    zoom: 1,
  };
}
