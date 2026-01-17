import { Chunk, Tree, TreeType, GameConfig, Camera, TREE_STATS } from '../types';

// Seeded random number generator for consistent chunk generation
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }
}

function chunkKey(chunkX: number, chunkY: number): string {
  return `${chunkX},${chunkY}`;
}

function hashCoords(x: number, y: number): number {
  // Simple hash function for chunk coordinates
  let hash = x * 374761393 + y * 668265263;
  hash = (hash ^ (hash >> 13)) * 1274126177;
  return hash ^ (hash >> 16);
}

// Clear zones where no trees should spawn
const CLEAR_ZONES = [
  { x: -50, y: -50, radius: 80 },  // Chipper area
  { x: 50, y: -50, radius: 60 },   // Shack area
];

// Check if a position is in a clear zone
function isInClearZone(x: number, y: number): boolean {
  for (const zone of CLEAR_ZONES) {
    const dx = x - zone.x;
    const dy = y - zone.y;
    if (dx * dx + dy * dy < zone.radius * zone.radius) {
      return true;
    }
  }
  return false;
}

// Check if a new tree would overlap with existing trees
function wouldOverlap(x: number, y: number, type: TreeType, existingTrees: Tree[]): boolean {
  const newRadius = TREE_STATS[type].hitboxRadius + 2; // Reduced padding for denser forest
  for (const tree of existingTrees) {
    const existingRadius = TREE_STATS[tree.type].hitboxRadius + 2;
    const minDist = newRadius + existingRadius;
    const dx = x - tree.x;
    const dy = y - tree.y;
    if (dx * dx + dy * dy < minDist * minDist) {
      return true;
    }
  }
  return false;
}

let treeIdCounter = 0;

export function generateChunk(chunkX: number, chunkY: number, config: GameConfig): Chunk {
  const seed = hashCoords(chunkX, chunkY);
  const rng = new SeededRandom(seed);

  const trees: Tree[] = [];
  const worldX = chunkX * config.chunkSize;
  const worldY = chunkY * config.chunkSize;

  // Generate 192-320 trees per chunk randomly (16x increase)
  const treeCount = 192 + Math.floor(rng.next() * 129);  // 192 to 320 trees

  // Try to place trees, with multiple attempts to avoid overlap
  let attempts = 0;
  const maxAttempts = treeCount * 5;

  while (trees.length < treeCount && attempts < maxAttempts) {
    attempts++;

    const x = worldX + rng.next() * config.chunkSize;
    const y = worldY + rng.next() * config.chunkSize;

    // Skip if in a clear zone
    if (isInClearZone(x, y)) {
      continue;
    }

    // Weighted tree type selection (rarer trees have lower chances)
    const typeRoll = rng.next();
    let type: TreeType;
    if (typeRoll < 0.25) {
      type = TreeType.SmallPine;
    } else if (typeRoll < 0.45) {
      type = TreeType.LargePine;
    } else if (typeRoll < 0.60) {
      type = TreeType.Oak;
    } else if (typeRoll < 0.70) {
      type = TreeType.DeadTree;
    } else if (typeRoll < 0.80) {
      type = TreeType.Birch;
    } else if (typeRoll < 0.88) {
      type = TreeType.Willow;
    } else if (typeRoll < 0.94) {
      type = TreeType.CherryBlossom;
    } else if (typeRoll < 0.97) {
      type = TreeType.GiantRedwood;
    } else if (typeRoll < 0.99) {
      type = TreeType.AncientOak;
    } else {
      type = TreeType.MagicTree;  // 1% chance - extremely rare!
    }

    // Skip if would overlap with existing trees
    if (wouldOverlap(x, y, type, trees)) {
      continue;
    }

    const stats = TREE_STATS[type];

    trees.push({
      id: `tree_${chunkX}_${chunkY}_${treeIdCounter++}`,
      x,
      y,
      type,
      variant: Math.floor(rng.next() * 3),
      health: stats.health,
      maxHealth: stats.health,
      respawnTimer: 0,
      isDead: false,
    });
  }

  // Sort trees by y position for proper depth ordering
  trees.sort((a, b) => a.y - b.y);

  return {
    x: chunkX,
    y: chunkY,
    trees,
  };
}

export function updateTrees(chunks: Map<string, Chunk>, deltaTime: number, config: GameConfig): void {
  for (const chunk of chunks.values()) {
    for (const tree of chunk.trees) {
      if (tree.isDead) {
        tree.respawnTimer -= deltaTime;
        if (tree.respawnTimer <= 0) {
          // Respawn tree
          tree.isDead = false;
          tree.health = tree.maxHealth;
          tree.respawnTimer = 0;
        }
      }
    }
  }
}

export function damageTree(tree: Tree, damage: number, config: GameConfig): boolean {
  if (tree.isDead) return false;

  tree.health -= damage;

  if (tree.health <= 0) {
    tree.isDead = true;
    tree.health = 0;
    tree.respawnTimer = config.treeRespawnTime;
    return true; // Tree was chopped down
  }

  return false; // Tree still standing
}

export function getVisibleChunks(
  camera: Camera,
  config: GameConfig
): { chunkX: number; chunkY: number }[] {
  const chunks: { chunkX: number; chunkY: number }[] = [];

  const startChunkX = Math.floor(camera.x / config.chunkSize) - config.renderDistance;
  const startChunkY = Math.floor(camera.y / config.chunkSize) - config.renderDistance;
  const endChunkX = Math.floor((camera.x + camera.width) / config.chunkSize) + config.renderDistance;
  const endChunkY = Math.floor((camera.y + camera.height) / config.chunkSize) + config.renderDistance;

  for (let cx = startChunkX; cx <= endChunkX; cx++) {
    for (let cy = startChunkY; cy <= endChunkY; cy++) {
      chunks.push({ chunkX: cx, chunkY: cy });
    }
  }

  return chunks;
}

export function updateChunks(
  chunks: Map<string, Chunk>,
  camera: Camera,
  config: GameConfig
): void {
  const visibleChunks = getVisibleChunks(camera, config);
  const visibleKeys = new Set(visibleChunks.map(c => chunkKey(c.chunkX, c.chunkY)));

  // Generate missing chunks
  for (const { chunkX, chunkY } of visibleChunks) {
    const key = chunkKey(chunkX, chunkY);
    if (!chunks.has(key)) {
      chunks.set(key, generateChunk(chunkX, chunkY, config));
    }
  }

  // Remove distant chunks (keep some buffer)
  const maxDistance = config.renderDistance + 2;
  const centerChunkX = Math.floor((camera.x + camera.width / 2) / config.chunkSize);
  const centerChunkY = Math.floor((camera.y + camera.height / 2) / config.chunkSize);

  for (const [key, chunk] of chunks) {
    const dx = Math.abs(chunk.x - centerChunkX);
    const dy = Math.abs(chunk.y - centerChunkY);
    if (dx > maxDistance || dy > maxDistance) {
      chunks.delete(key);
    }
  }
}

export { chunkKey };
