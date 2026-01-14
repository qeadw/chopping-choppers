import { SpriteSheet, TreeType } from '../types';

// Color palette
const COLORS = {
  trunk: ['#8B4513', '#654321', '#5D3A1A'],
  foliage: {
    pine: ['#228B22', '#006400', '#2E8B57', '#1E7B1E'],
    oak: ['#2E8B57', '#3CB371', '#228B22'],
    dead: ['#696969', '#808080', '#5C4033'],
  },
  player: {
    skin: '#FFDAB9',
    shirt: '#DC143C',
    pants: '#1E3A5F',
    hair: '#4A3728',
    boots: '#3D2314',
  },
  wood: ['#8B4513', '#A0522D', '#CD853F'],
  chipper: {
    body: '#4A4A4A',
    accent: '#FF6600',
    metal: '#707070',
  },
  axe: {
    handle: '#8B4513',
    blade: '#C0C0C0',
    edge: '#E0E0E0',
  },
};

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function setPixel(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

function createSmallPineSprite(): HTMLCanvasElement {
  const canvas = createCanvas(12, 20);
  const ctx = canvas.getContext('2d')!;

  // Trunk
  const trunkColor = COLORS.trunk[0];
  for (let y = 14; y < 20; y++) {
    setPixel(ctx, 5, y, trunkColor);
    setPixel(ctx, 6, y, trunkColor);
  }

  // Foliage - triangular pine shape
  const green = COLORS.foliage.pine[0];
  const darkGreen = COLORS.foliage.pine[1];

  // Top
  setPixel(ctx, 5, 0, green);
  setPixel(ctx, 6, 0, green);

  // Layer 1
  for (let x = 4; x <= 7; x++) setPixel(ctx, x, 1, green);
  for (let x = 4; x <= 7; x++) setPixel(ctx, x, 2, x < 6 ? darkGreen : green);

  // Layer 2
  for (let x = 3; x <= 8; x++) setPixel(ctx, x, 3, green);
  for (let x = 3; x <= 8; x++) setPixel(ctx, x, 4, x < 6 ? darkGreen : green);
  for (let x = 3; x <= 8; x++) setPixel(ctx, x, 5, green);

  // Layer 3
  for (let x = 2; x <= 9; x++) setPixel(ctx, x, 6, green);
  for (let x = 2; x <= 9; x++) setPixel(ctx, x, 7, x < 6 ? darkGreen : green);
  for (let x = 2; x <= 9; x++) setPixel(ctx, x, 8, green);

  // Layer 4
  for (let x = 1; x <= 10; x++) setPixel(ctx, x, 9, green);
  for (let x = 1; x <= 10; x++) setPixel(ctx, x, 10, x < 6 ? darkGreen : green);
  for (let x = 1; x <= 10; x++) setPixel(ctx, x, 11, green);

  // Bottom layer
  for (let x = 0; x <= 11; x++) setPixel(ctx, x, 12, green);
  for (let x = 0; x <= 11; x++) setPixel(ctx, x, 13, darkGreen);

  return canvas;
}

function createLargePineSprite(): HTMLCanvasElement {
  const canvas = createCanvas(16, 32);
  const ctx = canvas.getContext('2d')!;

  // Trunk
  const trunkColor = COLORS.trunk[1];
  for (let y = 24; y < 32; y++) {
    for (let x = 6; x <= 9; x++) {
      setPixel(ctx, x, y, trunkColor);
    }
  }

  const green = COLORS.foliage.pine[2];
  const darkGreen = COLORS.foliage.pine[1];

  // Build layered pine tree
  const layers = [
    { y: 0, width: 2 },
    { y: 2, width: 4 },
    { y: 5, width: 6 },
    { y: 8, width: 8 },
    { y: 11, width: 10 },
    { y: 14, width: 12 },
    { y: 17, width: 14 },
    { y: 20, width: 16 },
  ];

  layers.forEach(layer => {
    const startX = (16 - layer.width) / 2;
    for (let dy = 0; dy < 3; dy++) {
      for (let x = startX; x < startX + layer.width; x++) {
        const color = x < 8 && dy === 1 ? darkGreen : green;
        setPixel(ctx, x, layer.y + dy, color);
      }
    }
  });

  return canvas;
}

function createOakSprite(): HTMLCanvasElement {
  const canvas = createCanvas(20, 24);
  const ctx = canvas.getContext('2d')!;

  // Trunk
  const trunkColor = COLORS.trunk[2];
  for (let y = 16; y < 24; y++) {
    for (let x = 8; x <= 11; x++) {
      setPixel(ctx, x, y, trunkColor);
    }
  }

  const green = COLORS.foliage.oak[0];
  const lightGreen = COLORS.foliage.oak[1];

  // Round canopy
  const centerX = 10;
  const centerY = 8;
  const radius = 8;

  for (let y = 0; y < 17; y++) {
    for (let x = 0; x < 20; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= radius) {
        const color = dy < 0 && dx > 0 ? lightGreen : green;
        setPixel(ctx, x, y, color);
      }
    }
  }

  return canvas;
}

function createDeadTreeSprite(): HTMLCanvasElement {
  const canvas = createCanvas(14, 24);
  const ctx = canvas.getContext('2d')!;

  const wood = COLORS.foliage.dead[2];
  const gray = COLORS.foliage.dead[0];

  // Main trunk
  for (let y = 8; y < 24; y++) {
    setPixel(ctx, 6, y, wood);
    setPixel(ctx, 7, y, wood);
  }

  // Branches
  // Left branch
  for (let i = 0; i < 5; i++) {
    setPixel(ctx, 5 - i, 10 - i, gray);
    setPixel(ctx, 4 - i, 10 - i, gray);
  }

  // Right branch
  for (let i = 0; i < 4; i++) {
    setPixel(ctx, 8 + i, 8 - i, gray);
    setPixel(ctx, 9 + i, 8 - i, gray);
  }

  // Small branch left
  for (let i = 0; i < 3; i++) {
    setPixel(ctx, 5 - i, 14 - i, gray);
  }

  // Top
  for (let y = 0; y < 8; y++) {
    setPixel(ctx, 6, y, wood);
    setPixel(ctx, 7, y, wood);
  }

  return canvas;
}

function createPlayerSprite(): HTMLCanvasElement {
  const canvas = createCanvas(12, 18);
  const ctx = canvas.getContext('2d')!;

  const { skin, shirt, pants, hair, boots } = COLORS.player;

  // Hair/head top
  for (let x = 4; x <= 7; x++) {
    setPixel(ctx, x, 0, hair);
    setPixel(ctx, x, 1, hair);
  }

  // Face
  for (let x = 4; x <= 7; x++) {
    setPixel(ctx, x, 2, skin);
    setPixel(ctx, x, 3, skin);
  }
  // Eyes
  setPixel(ctx, 5, 2, '#000');
  setPixel(ctx, 6, 2, '#000');

  // Shirt/body
  for (let y = 4; y <= 9; y++) {
    for (let x = 3; x <= 8; x++) {
      setPixel(ctx, x, y, shirt);
    }
  }

  // Arms
  setPixel(ctx, 2, 5, skin);
  setPixel(ctx, 2, 6, skin);
  setPixel(ctx, 9, 5, skin);
  setPixel(ctx, 9, 6, skin);

  // Pants
  for (let y = 10; y <= 14; y++) {
    for (let x = 3; x <= 5; x++) {
      setPixel(ctx, x, y, pants);
    }
    for (let x = 6; x <= 8; x++) {
      setPixel(ctx, x, y, pants);
    }
  }

  // Boots
  for (let x = 3; x <= 5; x++) {
    setPixel(ctx, x, 15, boots);
    setPixel(ctx, x, 16, boots);
    setPixel(ctx, x, 17, boots);
  }
  for (let x = 6; x <= 8; x++) {
    setPixel(ctx, x, 15, boots);
    setPixel(ctx, x, 16, boots);
    setPixel(ctx, x, 17, boots);
  }

  return canvas;
}

// Stump sprites for cut trees
function createSmallStumpSprite(): HTMLCanvasElement {
  const canvas = createCanvas(12, 8);
  const ctx = canvas.getContext('2d')!;
  const trunkColor = COLORS.trunk[0];
  const innerColor = COLORS.wood[2];

  // Stump base
  for (let y = 4; y < 8; y++) {
    for (let x = 4; x <= 7; x++) {
      setPixel(ctx, x, y, trunkColor);
    }
  }
  // Top surface
  for (let x = 4; x <= 7; x++) {
    setPixel(ctx, x, 3, innerColor);
    setPixel(ctx, x, 4, innerColor);
  }

  return canvas;
}

function createLargeStumpSprite(): HTMLCanvasElement {
  const canvas = createCanvas(16, 10);
  const ctx = canvas.getContext('2d')!;
  const trunkColor = COLORS.trunk[1];
  const innerColor = COLORS.wood[2];

  // Stump base
  for (let y = 4; y < 10; y++) {
    for (let x = 5; x <= 10; x++) {
      setPixel(ctx, x, y, trunkColor);
    }
  }
  // Top surface
  for (let x = 5; x <= 10; x++) {
    for (let y = 3; y <= 5; y++) {
      setPixel(ctx, x, y, innerColor);
    }
  }

  return canvas;
}

function createOakStumpSprite(): HTMLCanvasElement {
  const canvas = createCanvas(20, 10);
  const ctx = canvas.getContext('2d')!;
  const trunkColor = COLORS.trunk[2];
  const innerColor = COLORS.wood[2];

  // Stump base
  for (let y = 4; y < 10; y++) {
    for (let x = 7; x <= 12; x++) {
      setPixel(ctx, x, y, trunkColor);
    }
  }
  // Top surface
  for (let x = 7; x <= 12; x++) {
    for (let y = 3; y <= 5; y++) {
      setPixel(ctx, x, y, innerColor);
    }
  }

  return canvas;
}

function createDeadStumpSprite(): HTMLCanvasElement {
  const canvas = createCanvas(14, 8);
  const ctx = canvas.getContext('2d')!;
  const wood = COLORS.foliage.dead[2];

  for (let y = 4; y < 8; y++) {
    setPixel(ctx, 6, y, wood);
    setPixel(ctx, 7, y, wood);
  }

  return canvas;
}

function createPlayerChopSprite(): HTMLCanvasElement {
  const canvas = createCanvas(16, 18);
  const ctx = canvas.getContext('2d')!;

  const { skin, shirt, pants, hair, boots } = COLORS.player;

  // Same body as regular player but with arm extended
  // Hair/head top
  for (let x = 4; x <= 7; x++) {
    setPixel(ctx, x, 0, hair);
    setPixel(ctx, x, 1, hair);
  }

  // Face
  for (let x = 4; x <= 7; x++) {
    setPixel(ctx, x, 2, skin);
    setPixel(ctx, x, 3, skin);
  }
  setPixel(ctx, 5, 2, '#000');
  setPixel(ctx, 6, 2, '#000');

  // Shirt/body
  for (let y = 4; y <= 9; y++) {
    for (let x = 3; x <= 8; x++) {
      setPixel(ctx, x, y, shirt);
    }
  }

  // Extended arm with axe swing
  setPixel(ctx, 9, 4, skin);
  setPixel(ctx, 10, 3, skin);
  setPixel(ctx, 11, 2, skin);
  // Axe
  setPixel(ctx, 12, 1, COLORS.axe.blade);
  setPixel(ctx, 13, 1, COLORS.axe.blade);
  setPixel(ctx, 14, 1, COLORS.axe.edge);
  setPixel(ctx, 12, 2, COLORS.axe.blade);
  setPixel(ctx, 13, 2, COLORS.axe.blade);
  setPixel(ctx, 14, 2, COLORS.axe.edge);

  // Other arm
  setPixel(ctx, 2, 5, skin);
  setPixel(ctx, 2, 6, skin);

  // Pants
  for (let y = 10; y <= 14; y++) {
    for (let x = 3; x <= 5; x++) {
      setPixel(ctx, x, y, pants);
    }
    for (let x = 6; x <= 8; x++) {
      setPixel(ctx, x, y, pants);
    }
  }

  // Boots
  for (let x = 3; x <= 5; x++) {
    setPixel(ctx, x, 15, boots);
    setPixel(ctx, x, 16, boots);
    setPixel(ctx, x, 17, boots);
  }
  for (let x = 6; x <= 8; x++) {
    setPixel(ctx, x, 15, boots);
    setPixel(ctx, x, 16, boots);
    setPixel(ctx, x, 17, boots);
  }

  return canvas;
}

function createWoodSprite(): HTMLCanvasElement {
  const canvas = createCanvas(8, 6);
  const ctx = canvas.getContext('2d')!;

  const dark = COLORS.wood[0];
  const mid = COLORS.wood[1];
  const light = COLORS.wood[2];

  // Log shape
  for (let x = 1; x <= 6; x++) {
    setPixel(ctx, x, 2, dark);
    setPixel(ctx, x, 3, mid);
  }
  // End circles
  setPixel(ctx, 0, 2, dark);
  setPixel(ctx, 0, 3, dark);
  setPixel(ctx, 7, 2, light);
  setPixel(ctx, 7, 3, light);
  // Top/bottom edges
  for (let x = 2; x <= 5; x++) {
    setPixel(ctx, x, 1, mid);
    setPixel(ctx, x, 4, dark);
  }

  return canvas;
}

function createChipperSprite(): HTMLCanvasElement {
  const canvas = createCanvas(32, 24);
  const ctx = canvas.getContext('2d')!;

  const { body, accent, metal } = COLORS.chipper;

  // Main body
  for (let y = 8; y < 20; y++) {
    for (let x = 4; x < 28; x++) {
      setPixel(ctx, x, y, body);
    }
  }

  // Hopper (input)
  for (let y = 2; y < 8; y++) {
    for (let x = 8; x < 16; x++) {
      setPixel(ctx, x, y, metal);
    }
  }

  // Output chute
  for (let y = 12; y < 18; y++) {
    for (let x = 24; x < 30; x++) {
      setPixel(ctx, x, y, metal);
    }
  }

  // Accent stripes
  for (let x = 4; x < 28; x++) {
    setPixel(ctx, x, 10, accent);
    setPixel(ctx, x, 11, accent);
  }

  // Wheels
  for (let x = 6; x <= 9; x++) {
    for (let y = 20; y <= 23; y++) {
      setPixel(ctx, x, y, '#222');
    }
  }
  for (let x = 22; x <= 25; x++) {
    for (let y = 20; y <= 23; y++) {
      setPixel(ctx, x, y, '#222');
    }
  }

  // Label
  ctx.fillStyle = '#FFF';
  ctx.font = '6px monospace';
  ctx.fillText('CHIP', 12, 17);

  return canvas;
}

function createAxeSprite(): HTMLCanvasElement {
  const canvas = createCanvas(10, 12);
  const ctx = canvas.getContext('2d')!;

  const { handle, blade, edge } = COLORS.axe;

  // Handle
  for (let y = 4; y < 12; y++) {
    setPixel(ctx, 4, y, handle);
    setPixel(ctx, 5, y, handle);
  }

  // Blade
  for (let y = 0; y < 6; y++) {
    for (let x = 5; x < 9; x++) {
      setPixel(ctx, x, y, blade);
    }
  }
  // Blade edge
  for (let y = 0; y < 6; y++) {
    setPixel(ctx, 9, y, edge);
  }

  return canvas;
}

export function createSpriteSheet(): SpriteSheet {
  return {
    trees: [
      createSmallPineSprite(),
      createLargePineSprite(),
      createOakSprite(),
      createDeadTreeSprite(),
    ],
    treeStumps: [
      createSmallStumpSprite(),
      createLargeStumpSprite(),
      createOakStumpSprite(),
      createDeadStumpSprite(),
    ],
    player: createPlayerSprite(),
    playerChop: createPlayerChopSprite(),
    wood: createWoodSprite(),
    chipper: createChipperSprite(),
    axe: createAxeSprite(),
  };
}

export function getTreeSprite(sprites: SpriteSheet, type: TreeType, isDead: boolean = false): HTMLCanvasElement {
  if (isDead) {
    return sprites.treeStumps[type];
  }
  return sprites.trees[type];
}
