import { Player, InputState, Camera, GameConfig, Upgrades } from '../types';

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
  upgrades: Upgrades
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

  // Apply speed with upgrade multiplier
  const speed = config.playerSpeed * upgrades.moveSpeed;
  player.velocity.x = vx * speed;
  player.velocity.y = vy * speed;

  // Update position
  player.position.x += player.velocity.x * deltaTime;
  player.position.y += player.velocity.y * deltaTime;
}

export function canChop(player: Player): boolean {
  return player.chopTimer <= 0;
}

export function startChop(player: Player, config: GameConfig, upgrades: Upgrades): void {
  player.isChopping = true;
  player.chopTimer = config.chopCooldown / upgrades.chopSpeed;
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
