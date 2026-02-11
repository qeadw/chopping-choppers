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

function hashCoords(x: number, y: number, worldSeed: number): number {
  // Hash function combining chunk coordinates with world seed
  let hash = x * 374761393 + y * 668265263 + worldSeed * 1103515245;
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

// Tree IDs are now deterministic based on chunk and tree index within chunk

export function generateChunk(chunkX: number, chunkY: number, config: GameConfig, worldSeed: number = 0): Chunk {
  const seed = hashCoords(chunkX, chunkY, worldSeed);
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

    // Calculate chunk distance from spawn for rarity scaling and legendary tree restrictions
    const chunkDistFromSpawn = Math.max(Math.abs(chunkX), Math.abs(chunkY));

    // Distance-based rarity scaling: +1% per 100 chunks, capping at +10% at 1000 chunks
    // This shifts probability from first 5 trees to last 5 trees (MagicTree and above)
    const distanceBonus = Math.min(chunkDistFromSpawn / 100, 10) * 0.01; // 0 to 0.1

    // Base probabilities for each tree type
    // First 5 trees lose probability equally (distanceBonus / 5 each)
    // Last 5 trees gain probability proportionally
    const commonReduction = distanceBonus / 5;

    // Weighted tree type selection with distance scaling
    const typeRoll = rng.next();
    let type: TreeType;

    // Adjusted thresholds based on distance
    // Base: SmallPine 50%, LargePine 25%, Oak 12.5%, DeadTree 6.25%, Birch 3.125%
    const t0 = 0.5 - commonReduction;          // SmallPine
    const t1 = 0.75 - commonReduction * 2;     // LargePine
    const t2 = 0.875 - commonReduction * 3;    // Oak
    const t3 = 0.9375 - commonReduction * 4;   // DeadTree
    const t4 = 0.96875 - commonReduction * 5;  // Birch

    // Rare trees get the bonus distributed proportionally to their rarity
    // MagicTree gets most of the bonus, WorldTree the least (proportional to original chance)
    const rareBoost = distanceBonus / 5; // Split among 5 rare tree types

    if (typeRoll < t0) {
      type = TreeType.SmallPine;
    } else if (typeRoll < t1) {
      type = TreeType.LargePine;
    } else if (typeRoll < t2) {
      type = TreeType.Oak;
    } else if (typeRoll < t3) {
      type = TreeType.DeadTree;
    } else if (typeRoll < t4) {
      type = TreeType.Birch;
    } else if (typeRoll < 0.984375) {
      type = TreeType.Willow;           // 1.56%
    } else if (typeRoll < 0.9921875) {
      type = TreeType.CherryBlossom;    // 0.78%
    } else if (typeRoll < 0.99609375) {
      type = TreeType.GiantRedwood;     // 0.39%
    } else if (typeRoll < 0.998046875) {
      type = TreeType.AncientOak;       // 0.2%
    } else if (typeRoll < 0.999 + rareBoost) {
      type = TreeType.MagicTree;        // 0.1% + bonus
    } else if (typeRoll < 0.9991 + rareBoost * 0.8 && chunkDistFromSpawn > 1) {
      type = TreeType.CrystalTree;      // 0.01% + bonus - not within 1 chunk of spawn
    } else if (typeRoll < 0.99911 + rareBoost * 0.6 && chunkDistFromSpawn > 2) {
      type = TreeType.VoidTree;         // 0.001% + bonus - not within 2 chunks of spawn
    } else if (typeRoll < 0.999111 + rareBoost * 0.4 && chunkDistFromSpawn > 3) {
      type = TreeType.CosmicTree;       // 0.0001% + bonus - not within 3 chunks of spawn
    } else if (typeRoll < 0.9991111 + rareBoost * 0.2 && chunkDistFromSpawn > 4) {
      type = TreeType.DivineTree;       // 0.00001% + bonus - not within 4 chunks of spawn
    } else if (typeRoll >= 0.9991111 && chunkDistFromSpawn > 5) {
      type = TreeType.WorldTree;        // 0.000001% + bonus - not within 5 chunks of spawn - LEGENDARY!
    } else {
      // Fallback to MagicTree if legendary tree can't spawn due to distance
      type = TreeType.MagicTree;
    }

    // Skip if would overlap with existing trees
    if (wouldOverlap(x, y, type, trees)) {
      continue;
    }

    const stats = TREE_STATS[type];

    trees.push({
      id: `tree_${chunkX}_${chunkY}_${trees.length}`,
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

  // Check if this chunk contains a World Tree - if so, make ALL trees mythic
  const hasWorldTree = trees.some(tree => tree.type === TreeType.WorldTree);
  if (hasWorldTree) {
    // Replace all non-mythic trees with random mythic trees
    const mythicTypes = [
      TreeType.MagicTree,
      TreeType.CrystalTree,
      TreeType.VoidTree,
      TreeType.CosmicTree,
      TreeType.DivineTree,
    ];

    for (const tree of trees) {
      if (tree.type < TreeType.MagicTree) {
        // Pick a random mythic type (weighted towards lower tiers)
        const mythicRoll = rng.next();
        let newType: TreeType;
        if (mythicRoll < 0.5) {
          newType = TreeType.MagicTree;
        } else if (mythicRoll < 0.75) {
          newType = TreeType.CrystalTree;
        } else if (mythicRoll < 0.9) {
          newType = TreeType.VoidTree;
        } else if (mythicRoll < 0.97) {
          newType = TreeType.CosmicTree;
        } else {
          newType = TreeType.DivineTree;
        }

        const newStats = TREE_STATS[newType];
        tree.type = newType;
        tree.health = newStats.health;
        tree.maxHealth = newStats.health;
      }
    }
  }

  return {
    x: chunkX,
    y: chunkY,
    trees,
  };
}

export function updateTrees(chunks: Map<string, Chunk>, deltaTime: number, config: GameConfig, noRespawnChunks?: Set<string>): void {
  for (const chunk of chunks.values()) {
    // Check if this chunk has respawning disabled
    const chunkKey = `${chunk.x},${chunk.y}`;
    const respawnDisabled = noRespawnChunks?.has(chunkKey) ?? false;

    for (const tree of chunk.trees) {
      if (tree.isDead) {
        tree.respawnTimer -= deltaTime;
        if (tree.respawnTimer <= 0 && !respawnDisabled) {
          // Respawn tree
          tree.isDead = false;
          tree.health = tree.maxHealth;
          tree.respawnTimer = 0;
        } else if (tree.respawnTimer <= 0 && respawnDisabled) {
          // Keep timer at 0 but don't respawn
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
    // Rarer trees take longer to respawn (10% more per tier)
    tree.respawnTimer = config.treeRespawnTime * Math.pow(1.1, tree.type);
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
  config: GameConfig,
  worldSeed: number = 0,
  protectedChunks: Set<string> = new Set()
): void {
  const visibleChunks = getVisibleChunks(camera, config);
  const visibleKeys = new Set(visibleChunks.map(c => chunkKey(c.chunkX, c.chunkY)));

  // Generate missing chunks
  for (const { chunkX, chunkY } of visibleChunks) {
    const key = chunkKey(chunkX, chunkY);
    if (!chunks.has(key)) {
      chunks.set(key, generateChunk(chunkX, chunkY, config, worldSeed));
    }
  }

  // Remove distant chunks (keep some buffer), but never delete protected chunks
  const maxDistance = config.renderDistance + 2;
  const centerChunkX = Math.floor((camera.x + camera.width / 2) / config.chunkSize);
  const centerChunkY = Math.floor((camera.y + camera.height / 2) / config.chunkSize);

  for (const [key, chunk] of chunks) {
    // Never delete protected chunks (worker/waypoint chunks)
    if (protectedChunks.has(key)) continue;

    const dx = Math.abs(chunk.x - centerChunkX);
    const dy = Math.abs(chunk.y - centerChunkY);
    if (dx > maxDistance || dy > maxDistance) {
      chunks.delete(key);
    }
  }
}

export { chunkKey };
