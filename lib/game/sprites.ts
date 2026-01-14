import { SpriteSheet, TreeType } from '../types';

// Enhanced color palette with proper shading
const COLORS = {
  trunk: {
    base: '#8B5A2B',
    dark: '#5D3A1A',
    light: '#A67C52',
    highlight: '#C4956A',
  },
  pine: {
    darkest: '#1B4D2E',
    dark: '#2D6B3F',
    base: '#3D8B4F',
    light: '#5AAD6A',
    highlight: '#7BC98A',
    snow: '#E8F4EC',
  },
  oak: {
    darkest: '#1E5631',
    dark: '#2E7D46',
    base: '#4A9E5C',
    light: '#6BBF7A',
    highlight: '#8DD99A',
  },
  dead: {
    dark: '#3D3028',
    base: '#5C4A3D',
    light: '#7A6555',
    highlight: '#98816E',
  },
  player: {
    skin: '#FFDAB9',
    skinShadow: '#E5B894',
    skinHighlight: '#FFE8D0',
    hair: '#4A3728',
    hairHighlight: '#6B5344',
    // Red plaid shirt
    shirtRed: '#C41E3A',
    shirtRedDark: '#8B1428',
    shirtRedLight: '#E63950',
    shirtBlack: '#2A2A2A',
    // Blue jeans
    pants: '#3D5A80',
    pantsDark: '#2A3F5A',
    pantsLight: '#5A7AA0',
    // Boots
    boots: '#3D2314',
    bootsDark: '#2A1810',
    bootsLight: '#5A3A28',
    // Beard
    beard: '#5C4033',
    beardLight: '#7A5A48',
  },
  wood: {
    dark: '#6B4423',
    base: '#8B5A2B',
    light: '#A67C52',
    ring: '#D4A574',
  },
  chipper: {
    body: '#4A4A4A',
    bodyDark: '#333333',
    bodyLight: '#5A5A5A',
    accent: '#FF6600',
    accentDark: '#CC5200',
    accentLight: '#FF8533',
    metal: '#888888',
    metalDark: '#666666',
    metalLight: '#AAAAAA',
  },
  axe: {
    handle: '#6B4423',
    handleDark: '#4A2F18',
    handleLight: '#8B5A2B',
    blade: '#A8A8A8',
    bladeDark: '#787878',
    bladeLight: '#D0D0D0',
    edge: '#E8E8E8',
  },
  worker: {
    skin: '#D2A67D',
    skinShadow: '#B8906A',
    skinHighlight: '#E8C4A0',
    // Green work shirt
    shirtGreen: '#4A7C4A',
    shirtGreenDark: '#3A5C3A',
    shirtGreenLight: '#5A9C5A',
    // Brown pants
    pants: '#6B5A4A',
    pantsDark: '#4A3D32',
    pantsLight: '#8B7A6A',
    // Work boots
    boots: '#4A3828',
    bootsDark: '#2A2018',
    bootsLight: '#6A5848',
    // Cap
    cap: '#CC4444',
    capDark: '#993333',
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

// Helper to draw a filled rectangle
function fillRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function createSmallPineSprite(): HTMLCanvasElement {
  const canvas = createCanvas(16, 24);
  const ctx = canvas.getContext('2d')!;
  const { darkest, dark, base, light, highlight } = COLORS.pine;
  const trunk = COLORS.trunk;

  // Trunk with shading
  for (let y = 18; y < 24; y++) {
    setPixel(ctx, 6, y, trunk.dark);
    setPixel(ctx, 7, y, trunk.base);
    setPixel(ctx, 8, y, trunk.base);
    setPixel(ctx, 9, y, trunk.light);
  }

  // Pine layers from top to bottom with proper shading
  // Top point
  setPixel(ctx, 7, 2, dark);
  setPixel(ctx, 8, 2, base);

  // Layer 1
  for (let x = 6; x <= 9; x++) {
    setPixel(ctx, x, 3, x < 8 ? dark : base);
    setPixel(ctx, x, 4, x < 8 ? darkest : dark);
  }

  // Layer 2
  for (let x = 5; x <= 10; x++) {
    const shade = x < 7 ? darkest : x < 9 ? dark : base;
    setPixel(ctx, x, 5, shade);
    setPixel(ctx, x, 6, x < 7 ? dark : x < 9 ? base : light);
  }
  // Highlight clusters
  setPixel(ctx, 9, 5, light);
  setPixel(ctx, 10, 6, highlight);

  // Layer 3
  for (let x = 4; x <= 11; x++) {
    const shade = x < 6 ? darkest : x < 9 ? dark : base;
    setPixel(ctx, x, 7, shade);
    setPixel(ctx, x, 8, x < 6 ? dark : x < 9 ? base : light);
    setPixel(ctx, x, 9, x < 7 ? darkest : x < 9 ? dark : base);
  }
  setPixel(ctx, 10, 7, light);
  setPixel(ctx, 11, 8, highlight);

  // Layer 4
  for (let x = 3; x <= 12; x++) {
    const shade = x < 6 ? darkest : x < 9 ? dark : base;
    setPixel(ctx, x, 10, shade);
    setPixel(ctx, x, 11, x < 6 ? dark : x < 9 ? base : light);
    setPixel(ctx, x, 12, x < 7 ? darkest : x < 9 ? dark : base);
  }
  setPixel(ctx, 11, 10, light);
  setPixel(ctx, 12, 11, highlight);

  // Bottom layer
  for (let x = 2; x <= 13; x++) {
    const shade = x < 6 ? darkest : x < 9 ? dark : base;
    setPixel(ctx, x, 13, shade);
    setPixel(ctx, x, 14, x < 6 ? dark : x < 9 ? base : light);
    setPixel(ctx, x, 15, x < 7 ? darkest : x < 9 ? dark : base);
    setPixel(ctx, x, 16, x < 6 ? darkest : x < 8 ? dark : darkest);
    setPixel(ctx, x, 17, darkest);
  }
  setPixel(ctx, 12, 13, light);
  setPixel(ctx, 13, 14, highlight);

  return canvas;
}

function createLargePineSprite(): HTMLCanvasElement {
  const canvas = createCanvas(20, 36);
  const ctx = canvas.getContext('2d')!;
  const { darkest, dark, base, light, highlight } = COLORS.pine;
  const trunk = COLORS.trunk;

  // Trunk with shading
  for (let y = 28; y < 36; y++) {
    setPixel(ctx, 8, y, trunk.dark);
    setPixel(ctx, 9, y, trunk.base);
    setPixel(ctx, 10, y, trunk.base);
    setPixel(ctx, 11, y, trunk.light);
  }

  // Build tree layers
  const layers = [
    { y: 2, halfWidth: 1 },
    { y: 4, halfWidth: 2 },
    { y: 7, halfWidth: 3 },
    { y: 10, halfWidth: 4 },
    { y: 13, halfWidth: 5 },
    { y: 16, halfWidth: 6 },
    { y: 19, halfWidth: 7 },
    { y: 22, halfWidth: 8 },
    { y: 25, halfWidth: 9 },
  ];

  layers.forEach((layer, idx) => {
    const centerX = 10;
    for (let dx = -layer.halfWidth; dx <= layer.halfWidth; dx++) {
      const x = centerX + dx;
      for (let dy = 0; dy < 3; dy++) {
        const y = layer.y + dy;
        // Shading based on position
        let color: string;
        if (dx < -layer.halfWidth / 2) {
          color = dy === 1 ? dark : darkest;
        } else if (dx < layer.halfWidth / 2) {
          color = dy === 0 ? dark : dy === 1 ? base : dark;
        } else {
          color = dy === 1 ? light : base;
        }
        setPixel(ctx, x, y, color);
      }
    }
    // Add highlight clusters on right side
    if (layer.halfWidth > 2) {
      setPixel(ctx, centerX + layer.halfWidth - 1, layer.y, highlight);
      setPixel(ctx, centerX + layer.halfWidth, layer.y + 1, light);
    }
  });

  return canvas;
}

function createOakSprite(): HTMLCanvasElement {
  const canvas = createCanvas(24, 28);
  const ctx = canvas.getContext('2d')!;
  const { darkest, dark, base, light, highlight } = COLORS.oak;
  const trunk = COLORS.trunk;

  // Trunk with shading and roots
  for (let y = 20; y < 28; y++) {
    const width = y > 25 ? 6 : 4;
    const startX = 10 - width / 2;
    for (let x = startX; x < startX + width; x++) {
      const relX = x - startX;
      if (relX === 0) setPixel(ctx, x, y, trunk.dark);
      else if (relX === width - 1) setPixel(ctx, x, y, trunk.highlight);
      else if (relX < width / 2) setPixel(ctx, x, y, trunk.base);
      else setPixel(ctx, x, y, trunk.light);
    }
  }

  // Round canopy with organic shape
  const centerX = 12;
  const centerY = 10;

  // Draw irregular canopy
  for (let y = 0; y < 21; y++) {
    for (let x = 0; x < 24; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      // Squashed ellipse with noise
      const distX = dx / 10;
      const distY = dy / 8;
      const dist = Math.sqrt(distX * distX + distY * distY);

      // Add irregularity
      const noise = Math.sin(x * 1.5) * 0.1 + Math.cos(y * 1.3) * 0.1;

      if (dist + noise < 1) {
        // Determine shade based on position (light from top-right)
        let color: string;
        if (dx < -3 && dy > 0) {
          color = darkest;
        } else if (dx < 0 || dy > 2) {
          color = dark;
        } else if (dx > 3 && dy < -2) {
          color = highlight;
        } else if (dx > 0 && dy < 0) {
          color = light;
        } else {
          color = base;
        }
        setPixel(ctx, x, y, color);
      }
    }
  }

  // Add leaf cluster details
  const clusters = [
    { x: 16, y: 4, c: highlight },
    { x: 18, y: 6, c: light },
    { x: 17, y: 8, c: highlight },
    { x: 5, y: 12, c: darkest },
    { x: 4, y: 14, c: darkest },
    { x: 6, y: 16, c: dark },
  ];
  clusters.forEach(({ x, y, c }) => setPixel(ctx, x, y, c));

  return canvas;
}

function createDeadTreeSprite(): HTMLCanvasElement {
  const canvas = createCanvas(18, 28);
  const ctx = canvas.getContext('2d')!;
  const { dark, base, light, highlight } = COLORS.dead;

  // Main trunk
  for (let y = 10; y < 28; y++) {
    setPixel(ctx, 8, y, dark);
    setPixel(ctx, 9, y, base);
    setPixel(ctx, 10, y, light);
  }

  // Top of trunk
  for (let y = 4; y < 10; y++) {
    setPixel(ctx, 8, y, dark);
    setPixel(ctx, 9, y, base);
  }
  setPixel(ctx, 9, 3, dark);

  // Left branch (reaching up-left)
  const leftBranch = [
    [7, 8], [6, 7], [5, 6], [4, 5], [3, 4], [2, 3], [1, 2],
  ];
  leftBranch.forEach(([x, y]) => {
    setPixel(ctx, x, y, dark);
    setPixel(ctx, x, y + 1, base);
  });
  // Branch tip
  setPixel(ctx, 0, 1, dark);
  setPixel(ctx, 0, 2, base);

  // Right branch (reaching up-right)
  const rightBranch = [
    [11, 9], [12, 8], [13, 7], [14, 6], [15, 5],
  ];
  rightBranch.forEach(([x, y]) => {
    setPixel(ctx, x, y, base);
    setPixel(ctx, x, y + 1, light);
  });
  setPixel(ctx, 16, 4, base);
  setPixel(ctx, 17, 3, light);

  // Small left branch
  setPixel(ctx, 7, 14, dark);
  setPixel(ctx, 6, 13, dark);
  setPixel(ctx, 5, 12, base);

  // Small right branch
  setPixel(ctx, 11, 16, base);
  setPixel(ctx, 12, 15, light);
  setPixel(ctx, 13, 14, highlight);

  return canvas;
}

// Stump sprites
function createSmallStumpSprite(): HTMLCanvasElement {
  const canvas = createCanvas(16, 10);
  const ctx = canvas.getContext('2d')!;
  const trunk = COLORS.trunk;
  const wood = COLORS.wood;

  // Stump sides
  for (let y = 4; y < 10; y++) {
    for (let x = 5; x <= 10; x++) {
      if (x === 5) setPixel(ctx, x, y, trunk.dark);
      else if (x === 10) setPixel(ctx, x, y, trunk.highlight);
      else if (x < 8) setPixel(ctx, x, y, trunk.base);
      else setPixel(ctx, x, y, trunk.light);
    }
  }

  // Top surface with rings
  for (let x = 5; x <= 10; x++) {
    setPixel(ctx, x, 3, wood.base);
    setPixel(ctx, x, 4, wood.light);
  }
  // Ring detail
  setPixel(ctx, 7, 3, wood.ring);
  setPixel(ctx, 8, 4, wood.ring);

  return canvas;
}

function createLargeStumpSprite(): HTMLCanvasElement {
  const canvas = createCanvas(20, 12);
  const ctx = canvas.getContext('2d')!;
  const trunk = COLORS.trunk;
  const wood = COLORS.wood;

  // Stump sides
  for (let y = 4; y < 12; y++) {
    for (let x = 6; x <= 13; x++) {
      if (x <= 7) setPixel(ctx, x, y, trunk.dark);
      else if (x >= 12) setPixel(ctx, x, y, trunk.highlight);
      else if (x < 10) setPixel(ctx, x, y, trunk.base);
      else setPixel(ctx, x, y, trunk.light);
    }
  }

  // Top surface with rings
  for (let x = 6; x <= 13; x++) {
    setPixel(ctx, x, 2, wood.dark);
    setPixel(ctx, x, 3, wood.base);
    setPixel(ctx, x, 4, wood.light);
  }
  // Ring details
  setPixel(ctx, 8, 3, wood.ring);
  setPixel(ctx, 9, 3, wood.ring);
  setPixel(ctx, 10, 3, wood.ring);
  setPixel(ctx, 9, 4, wood.ring);

  return canvas;
}

function createOakStumpSprite(): HTMLCanvasElement {
  const canvas = createCanvas(24, 12);
  const ctx = canvas.getContext('2d')!;
  const trunk = COLORS.trunk;
  const wood = COLORS.wood;

  // Stump sides
  for (let y = 4; y < 12; y++) {
    for (let x = 8; x <= 15; x++) {
      if (x <= 9) setPixel(ctx, x, y, trunk.dark);
      else if (x >= 14) setPixel(ctx, x, y, trunk.highlight);
      else if (x < 12) setPixel(ctx, x, y, trunk.base);
      else setPixel(ctx, x, y, trunk.light);
    }
  }

  // Top surface with rings
  for (let x = 8; x <= 15; x++) {
    setPixel(ctx, x, 2, wood.dark);
    setPixel(ctx, x, 3, wood.base);
    setPixel(ctx, x, 4, wood.light);
  }
  // Ring details
  setPixel(ctx, 10, 3, wood.ring);
  setPixel(ctx, 11, 3, wood.ring);
  setPixel(ctx, 12, 3, wood.ring);
  setPixel(ctx, 11, 4, wood.ring);

  return canvas;
}

function createDeadStumpSprite(): HTMLCanvasElement {
  const canvas = createCanvas(18, 10);
  const ctx = canvas.getContext('2d')!;
  const { dark, base, light } = COLORS.dead;

  for (let y = 4; y < 10; y++) {
    setPixel(ctx, 8, y, dark);
    setPixel(ctx, 9, y, base);
    setPixel(ctx, 10, y, light);
  }

  return canvas;
}

function createPlayerSprite(): HTMLCanvasElement {
  const canvas = createCanvas(14, 20);
  const ctx = canvas.getContext('2d')!;
  const p = COLORS.player;

  // Hair (with volume)
  fillRect(ctx, 5, 0, 4, 2, p.hair);
  setPixel(ctx, 4, 1, p.hair);
  setPixel(ctx, 9, 1, p.hair);
  setPixel(ctx, 6, 0, p.hairHighlight);

  // Face with shading
  for (let y = 2; y < 5; y++) {
    for (let x = 5; x <= 8; x++) {
      if (x === 5) setPixel(ctx, x, y, p.skinShadow);
      else if (x === 8) setPixel(ctx, x, y, p.skinHighlight);
      else setPixel(ctx, x, y, p.skin);
    }
  }

  // Eyes
  setPixel(ctx, 6, 2, '#2B3A4D');
  setPixel(ctx, 7, 2, '#2B3A4D');
  // Eye highlights
  setPixel(ctx, 6, 2, '#FFFFFF');

  // Beard
  for (let x = 5; x <= 8; x++) {
    setPixel(ctx, x, 4, x < 7 ? p.beard : p.beardLight);
    setPixel(ctx, x, 5, p.beard);
  }
  setPixel(ctx, 6, 6, p.beard);
  setPixel(ctx, 7, 6, p.beardLight);

  // Plaid shirt body
  for (let y = 5; y <= 11; y++) {
    for (let x = 4; x <= 9; x++) {
      // Create plaid pattern
      const isVerticalStripe = x === 5 || x === 8;
      const isHorizontalStripe = y === 7 || y === 10;

      if (isVerticalStripe && isHorizontalStripe) {
        setPixel(ctx, x, y, p.shirtBlack);
      } else if (isVerticalStripe || isHorizontalStripe) {
        setPixel(ctx, x, y, p.shirtRedDark);
      } else if (x <= 5) {
        setPixel(ctx, x, y, p.shirtRedDark);
      } else if (x >= 8) {
        setPixel(ctx, x, y, p.shirtRedLight);
      } else {
        setPixel(ctx, x, y, p.shirtRed);
      }
    }
  }

  // Arms (skin)
  setPixel(ctx, 3, 6, p.skinShadow);
  setPixel(ctx, 3, 7, p.skin);
  setPixel(ctx, 10, 6, p.skin);
  setPixel(ctx, 10, 7, p.skinHighlight);

  // Jeans with shading
  for (let y = 12; y <= 16; y++) {
    // Left leg
    setPixel(ctx, 4, y, p.pantsDark);
    setPixel(ctx, 5, y, p.pants);
    setPixel(ctx, 6, y, p.pantsLight);
    // Right leg
    setPixel(ctx, 7, y, p.pantsDark);
    setPixel(ctx, 8, y, p.pants);
    setPixel(ctx, 9, y, p.pantsLight);
  }

  // Boots with shading
  for (let y = 17; y <= 19; y++) {
    // Left boot
    setPixel(ctx, 4, y, p.bootsDark);
    setPixel(ctx, 5, y, p.boots);
    setPixel(ctx, 6, y, p.bootsLight);
    // Right boot
    setPixel(ctx, 7, y, p.bootsDark);
    setPixel(ctx, 8, y, p.boots);
    setPixel(ctx, 9, y, p.bootsLight);
  }

  return canvas;
}

function createPlayerChopSprite(): HTMLCanvasElement {
  const canvas = createCanvas(20, 20);
  const ctx = canvas.getContext('2d')!;
  const p = COLORS.player;
  const a = COLORS.axe;

  // Hair
  fillRect(ctx, 5, 0, 4, 2, p.hair);
  setPixel(ctx, 4, 1, p.hair);
  setPixel(ctx, 9, 1, p.hair);
  setPixel(ctx, 6, 0, p.hairHighlight);

  // Face
  for (let y = 2; y < 5; y++) {
    for (let x = 5; x <= 8; x++) {
      if (x === 5) setPixel(ctx, x, y, p.skinShadow);
      else if (x === 8) setPixel(ctx, x, y, p.skinHighlight);
      else setPixel(ctx, x, y, p.skin);
    }
  }
  setPixel(ctx, 6, 2, '#2B3A4D');
  setPixel(ctx, 7, 2, '#2B3A4D');

  // Beard
  for (let x = 5; x <= 8; x++) {
    setPixel(ctx, x, 4, x < 7 ? p.beard : p.beardLight);
    setPixel(ctx, x, 5, p.beard);
  }
  setPixel(ctx, 6, 6, p.beard);
  setPixel(ctx, 7, 6, p.beardLight);

  // Shirt (same plaid pattern)
  for (let y = 5; y <= 11; y++) {
    for (let x = 4; x <= 9; x++) {
      const isVerticalStripe = x === 5 || x === 8;
      const isHorizontalStripe = y === 7 || y === 10;

      if (isVerticalStripe && isHorizontalStripe) {
        setPixel(ctx, x, y, p.shirtBlack);
      } else if (isVerticalStripe || isHorizontalStripe) {
        setPixel(ctx, x, y, p.shirtRedDark);
      } else if (x <= 5) {
        setPixel(ctx, x, y, p.shirtRedDark);
      } else if (x >= 8) {
        setPixel(ctx, x, y, p.shirtRedLight);
      } else {
        setPixel(ctx, x, y, p.shirtRed);
      }
    }
  }

  // Extended arm holding axe
  setPixel(ctx, 10, 5, p.skin);
  setPixel(ctx, 11, 4, p.skin);
  setPixel(ctx, 12, 3, p.skinHighlight);

  // Axe handle
  setPixel(ctx, 13, 2, a.handle);
  setPixel(ctx, 14, 1, a.handle);
  setPixel(ctx, 15, 0, a.handleLight);

  // Axe head
  fillRect(ctx, 16, 0, 3, 4, a.blade);
  setPixel(ctx, 16, 0, a.bladeDark);
  setPixel(ctx, 16, 1, a.bladeDark);
  setPixel(ctx, 18, 0, a.edge);
  setPixel(ctx, 18, 1, a.edge);
  setPixel(ctx, 18, 2, a.bladeLight);
  setPixel(ctx, 18, 3, a.bladeLight);

  // Other arm
  setPixel(ctx, 3, 6, p.skinShadow);
  setPixel(ctx, 3, 7, p.skin);

  // Jeans
  for (let y = 12; y <= 16; y++) {
    setPixel(ctx, 4, y, p.pantsDark);
    setPixel(ctx, 5, y, p.pants);
    setPixel(ctx, 6, y, p.pantsLight);
    setPixel(ctx, 7, y, p.pantsDark);
    setPixel(ctx, 8, y, p.pants);
    setPixel(ctx, 9, y, p.pantsLight);
  }

  // Boots
  for (let y = 17; y <= 19; y++) {
    setPixel(ctx, 4, y, p.bootsDark);
    setPixel(ctx, 5, y, p.boots);
    setPixel(ctx, 6, y, p.bootsLight);
    setPixel(ctx, 7, y, p.bootsDark);
    setPixel(ctx, 8, y, p.boots);
    setPixel(ctx, 9, y, p.bootsLight);
  }

  return canvas;
}

function createWoodSprite(): HTMLCanvasElement {
  const canvas = createCanvas(10, 8);
  const ctx = canvas.getContext('2d')!;
  const w = COLORS.wood;

  // Log body with shading
  for (let x = 2; x <= 7; x++) {
    setPixel(ctx, x, 2, w.dark);
    setPixel(ctx, x, 3, w.base);
    setPixel(ctx, x, 4, w.light);
    setPixel(ctx, x, 5, w.base);
  }

  // Left end (dark, cut surface)
  setPixel(ctx, 1, 2, w.dark);
  setPixel(ctx, 1, 3, w.base);
  setPixel(ctx, 1, 4, w.base);
  setPixel(ctx, 1, 5, w.dark);
  setPixel(ctx, 0, 3, w.dark);
  setPixel(ctx, 0, 4, w.dark);

  // Right end (light, cut surface with ring)
  setPixel(ctx, 8, 2, w.base);
  setPixel(ctx, 8, 3, w.light);
  setPixel(ctx, 8, 4, w.light);
  setPixel(ctx, 8, 5, w.base);
  setPixel(ctx, 9, 3, w.ring);
  setPixel(ctx, 9, 4, w.ring);

  // Ring detail on surface
  setPixel(ctx, 8, 3, w.ring);

  return canvas;
}

function createChipperSprite(): HTMLCanvasElement {
  const canvas = createCanvas(36, 28);
  const ctx = canvas.getContext('2d')!;
  const c = COLORS.chipper;

  // Main body with shading
  for (let y = 10; y < 22; y++) {
    for (let x = 4; x < 32; x++) {
      if (x < 10) setPixel(ctx, x, y, c.bodyDark);
      else if (x > 26) setPixel(ctx, x, y, c.bodyLight);
      else setPixel(ctx, x, y, c.body);
    }
  }

  // Hopper (input funnel)
  for (let y = 2; y < 10; y++) {
    const width = 8 + (10 - y);
    const startX = 10 - (width - 8) / 2;
    for (let x = startX; x < startX + width; x++) {
      if (x < startX + 2) setPixel(ctx, x, y, c.metalDark);
      else if (x > startX + width - 3) setPixel(ctx, x, y, c.metalLight);
      else setPixel(ctx, x, y, c.metal);
    }
  }

  // Output chute
  for (let y = 14; y < 20; y++) {
    for (let x = 28; x < 36; x++) {
      if (x < 30) setPixel(ctx, x, y, c.metalDark);
      else if (x > 33) setPixel(ctx, x, y, c.metalLight);
      else setPixel(ctx, x, y, c.metal);
    }
  }

  // Accent stripes
  for (let x = 4; x < 32; x++) {
    setPixel(ctx, x, 12, c.accentDark);
    setPixel(ctx, x, 13, c.accent);
    setPixel(ctx, x, 14, c.accentLight);
  }

  // Wheels with 3D effect
  for (let x = 6; x <= 11; x++) {
    for (let y = 22; y <= 27; y++) {
      const dx = x - 8.5;
      const dy = y - 24.5;
      if (dx * dx + dy * dy <= 9) {
        if (dx < 0 && dy < 0) setPixel(ctx, x, y, '#444');
        else if (dx > 0 && dy > 0) setPixel(ctx, x, y, '#111');
        else setPixel(ctx, x, y, '#222');
      }
    }
  }
  for (let x = 24; x <= 29; x++) {
    for (let y = 22; y <= 27; y++) {
      const dx = x - 26.5;
      const dy = y - 24.5;
      if (dx * dx + dy * dy <= 9) {
        if (dx < 0 && dy < 0) setPixel(ctx, x, y, '#444');
        else if (dx > 0 && dy > 0) setPixel(ctx, x, y, '#111');
        else setPixel(ctx, x, y, '#222');
      }
    }
  }

  // "CHIP" label
  ctx.fillStyle = '#FFF';
  ctx.font = 'bold 7px monospace';
  ctx.fillText('CHIP', 13, 19);

  return canvas;
}

function createAxeSprite(): HTMLCanvasElement {
  const canvas = createCanvas(12, 14);
  const ctx = canvas.getContext('2d')!;
  const a = COLORS.axe;

  // Handle with shading
  for (let y = 5; y < 14; y++) {
    setPixel(ctx, 4, y, a.handleDark);
    setPixel(ctx, 5, y, a.handle);
    setPixel(ctx, 6, y, a.handleLight);
  }

  // Axe head
  for (let y = 0; y < 7; y++) {
    for (let x = 5; x < 11; x++) {
      if (x < 7) setPixel(ctx, x, y, a.bladeDark);
      else if (x > 9) setPixel(ctx, x, y, a.edge);
      else if (x > 8) setPixel(ctx, x, y, a.bladeLight);
      else setPixel(ctx, x, y, a.blade);
    }
  }

  // Handle wrap
  setPixel(ctx, 4, 6, '#2A2A2A');
  setPixel(ctx, 5, 6, '#3A3A3A');
  setPixel(ctx, 6, 6, '#4A4A4A');

  return canvas;
}

function createWorkerSprite(): HTMLCanvasElement {
  const canvas = createCanvas(14, 20);
  const ctx = canvas.getContext('2d')!;
  const w = COLORS.worker;

  // Cap
  fillRect(ctx, 5, 0, 4, 2, w.cap);
  setPixel(ctx, 4, 1, w.cap);
  setPixel(ctx, 9, 1, w.capDark);
  setPixel(ctx, 6, 0, w.capDark);
  // Cap brim
  fillRect(ctx, 4, 2, 6, 1, w.capDark);

  // Face with shading
  for (let y = 3; y < 6; y++) {
    for (let x = 5; x <= 8; x++) {
      if (x === 5) setPixel(ctx, x, y, w.skinShadow);
      else if (x === 8) setPixel(ctx, x, y, w.skinHighlight);
      else setPixel(ctx, x, y, w.skin);
    }
  }

  // Eyes
  setPixel(ctx, 6, 3, '#2B3A4D');
  setPixel(ctx, 7, 3, '#2B3A4D');

  // Green work shirt
  for (let y = 6; y <= 11; y++) {
    for (let x = 4; x <= 9; x++) {
      if (x <= 5) setPixel(ctx, x, y, w.shirtGreenDark);
      else if (x >= 8) setPixel(ctx, x, y, w.shirtGreenLight);
      else setPixel(ctx, x, y, w.shirtGreen);
    }
  }

  // Arms
  setPixel(ctx, 3, 7, w.skinShadow);
  setPixel(ctx, 3, 8, w.skin);
  setPixel(ctx, 10, 7, w.skin);
  setPixel(ctx, 10, 8, w.skinHighlight);

  // Brown pants
  for (let y = 12; y <= 16; y++) {
    setPixel(ctx, 4, y, w.pantsDark);
    setPixel(ctx, 5, y, w.pants);
    setPixel(ctx, 6, y, w.pantsLight);
    setPixel(ctx, 7, y, w.pantsDark);
    setPixel(ctx, 8, y, w.pants);
    setPixel(ctx, 9, y, w.pantsLight);
  }

  // Work boots
  for (let y = 17; y <= 19; y++) {
    setPixel(ctx, 4, y, w.bootsDark);
    setPixel(ctx, 5, y, w.boots);
    setPixel(ctx, 6, y, w.bootsLight);
    setPixel(ctx, 7, y, w.bootsDark);
    setPixel(ctx, 8, y, w.boots);
    setPixel(ctx, 9, y, w.bootsLight);
  }

  return canvas;
}

function createWorkerChopSprite(): HTMLCanvasElement {
  const canvas = createCanvas(20, 20);
  const ctx = canvas.getContext('2d')!;
  const w = COLORS.worker;
  const a = COLORS.axe;

  // Cap
  fillRect(ctx, 5, 0, 4, 2, w.cap);
  setPixel(ctx, 4, 1, w.cap);
  setPixel(ctx, 9, 1, w.capDark);
  fillRect(ctx, 4, 2, 6, 1, w.capDark);

  // Face
  for (let y = 3; y < 6; y++) {
    for (let x = 5; x <= 8; x++) {
      if (x === 5) setPixel(ctx, x, y, w.skinShadow);
      else if (x === 8) setPixel(ctx, x, y, w.skinHighlight);
      else setPixel(ctx, x, y, w.skin);
    }
  }
  setPixel(ctx, 6, 3, '#2B3A4D');
  setPixel(ctx, 7, 3, '#2B3A4D');

  // Shirt
  for (let y = 6; y <= 11; y++) {
    for (let x = 4; x <= 9; x++) {
      if (x <= 5) setPixel(ctx, x, y, w.shirtGreenDark);
      else if (x >= 8) setPixel(ctx, x, y, w.shirtGreenLight);
      else setPixel(ctx, x, y, w.shirtGreen);
    }
  }

  // Extended arm with axe
  setPixel(ctx, 10, 6, w.skin);
  setPixel(ctx, 11, 5, w.skin);
  setPixel(ctx, 12, 4, w.skinHighlight);

  // Axe
  setPixel(ctx, 13, 3, a.handle);
  setPixel(ctx, 14, 2, a.handle);
  setPixel(ctx, 15, 1, a.handleLight);
  fillRect(ctx, 16, 0, 3, 4, a.blade);
  setPixel(ctx, 18, 0, a.edge);
  setPixel(ctx, 18, 1, a.edge);

  // Other arm
  setPixel(ctx, 3, 7, w.skinShadow);
  setPixel(ctx, 3, 8, w.skin);

  // Pants
  for (let y = 12; y <= 16; y++) {
    setPixel(ctx, 4, y, w.pantsDark);
    setPixel(ctx, 5, y, w.pants);
    setPixel(ctx, 6, y, w.pantsLight);
    setPixel(ctx, 7, y, w.pantsDark);
    setPixel(ctx, 8, y, w.pants);
    setPixel(ctx, 9, y, w.pantsLight);
  }

  // Boots
  for (let y = 17; y <= 19; y++) {
    setPixel(ctx, 4, y, w.bootsDark);
    setPixel(ctx, 5, y, w.boots);
    setPixel(ctx, 6, y, w.bootsLight);
    setPixel(ctx, 7, y, w.bootsDark);
    setPixel(ctx, 8, y, w.boots);
    setPixel(ctx, 9, y, w.bootsLight);
  }

  return canvas;
}

function createWorkerCarrySprite(): HTMLCanvasElement {
  const canvas = createCanvas(14, 20);
  const ctx = canvas.getContext('2d')!;
  const w = COLORS.worker;
  const wood = COLORS.wood;

  // Cap
  fillRect(ctx, 5, 0, 4, 2, w.cap);
  setPixel(ctx, 4, 1, w.cap);
  setPixel(ctx, 9, 1, w.capDark);
  fillRect(ctx, 4, 2, 6, 1, w.capDark);

  // Face
  for (let y = 3; y < 6; y++) {
    for (let x = 5; x <= 8; x++) {
      if (x === 5) setPixel(ctx, x, y, w.skinShadow);
      else if (x === 8) setPixel(ctx, x, y, w.skinHighlight);
      else setPixel(ctx, x, y, w.skin);
    }
  }
  setPixel(ctx, 6, 3, '#2B3A4D');
  setPixel(ctx, 7, 3, '#2B3A4D');

  // Shirt (slightly hunched from carrying)
  for (let y = 6; y <= 11; y++) {
    for (let x = 4; x <= 9; x++) {
      if (x <= 5) setPixel(ctx, x, y, w.shirtGreenDark);
      else if (x >= 8) setPixel(ctx, x, y, w.shirtGreenLight);
      else setPixel(ctx, x, y, w.shirtGreen);
    }
  }

  // Arms holding wood bundle on shoulder
  setPixel(ctx, 3, 5, w.skin);
  setPixel(ctx, 10, 5, w.skinHighlight);

  // Wood bundle on shoulder
  for (let x = 2; x <= 11; x++) {
    setPixel(ctx, x, 3, wood.dark);
    setPixel(ctx, x, 4, wood.base);
  }
  setPixel(ctx, 11, 3, wood.light);
  setPixel(ctx, 11, 4, wood.ring);

  // Pants
  for (let y = 12; y <= 16; y++) {
    setPixel(ctx, 4, y, w.pantsDark);
    setPixel(ctx, 5, y, w.pants);
    setPixel(ctx, 6, y, w.pantsLight);
    setPixel(ctx, 7, y, w.pantsDark);
    setPixel(ctx, 8, y, w.pants);
    setPixel(ctx, 9, y, w.pantsLight);
  }

  // Boots
  for (let y = 17; y <= 19; y++) {
    setPixel(ctx, 4, y, w.bootsDark);
    setPixel(ctx, 5, y, w.boots);
    setPixel(ctx, 6, y, w.bootsLight);
    setPixel(ctx, 7, y, w.bootsDark);
    setPixel(ctx, 8, y, w.boots);
    setPixel(ctx, 9, y, w.bootsLight);
  }

  return canvas;
}

function createWorkerSleepSprite(): HTMLCanvasElement {
  const canvas = createCanvas(16, 10);
  const ctx = canvas.getContext('2d')!;
  const w = COLORS.worker;

  // Worker lying down (side view)
  // Head with cap
  fillRect(ctx, 0, 2, 3, 3, w.cap);
  setPixel(ctx, 0, 5, w.capDark);
  setPixel(ctx, 1, 5, w.capDark);
  setPixel(ctx, 2, 5, w.capDark);

  // Face
  for (let x = 3; x <= 5; x++) {
    setPixel(ctx, x, 2, w.skinShadow);
    setPixel(ctx, x, 3, w.skin);
    setPixel(ctx, x, 4, w.skinHighlight);
  }
  // Closed eyes (Z's)
  setPixel(ctx, 4, 3, '#2B3A4D');

  // Body (lying flat)
  for (let x = 6; x <= 11; x++) {
    setPixel(ctx, x, 2, w.shirtGreenDark);
    setPixel(ctx, x, 3, w.shirtGreen);
    setPixel(ctx, x, 4, w.shirtGreenLight);
  }

  // Legs
  for (let x = 12; x <= 15; x++) {
    setPixel(ctx, x, 2, w.pantsDark);
    setPixel(ctx, x, 3, w.pants);
    setPixel(ctx, x, 4, w.pantsLight);
  }

  // Z's floating above (sleeping indicator)
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 6px monospace';
  ctx.fillText('z', 3, 1);
  ctx.fillText('Z', 6, 0);

  return canvas;
}

function createShackSprite(): HTMLCanvasElement {
  const canvas = createCanvas(40, 36);
  const ctx = canvas.getContext('2d')!;

  const shackColors = {
    roofDark: '#5C3A21',
    roof: '#7A4D2A',
    roofLight: '#9A6A40',
    wallDark: '#6B4423',
    wall: '#8B5A2B',
    wallLight: '#A67C52',
    door: '#4A3020',
    doorFrame: '#3A2515',
    window: '#87CEEB',
    windowFrame: '#5C3A21',
  };

  // Roof (triangular)
  for (let y = 0; y < 14; y++) {
    const width = 40 - y * 2;
    const startX = y;
    for (let x = startX; x < startX + width; x++) {
      let color: string;
      if (x < startX + width / 3) {
        color = shackColors.roofDark;
      } else if (x > startX + (width * 2) / 3) {
        color = shackColors.roofLight;
      } else {
        color = shackColors.roof;
      }
      setPixel(ctx, x, y, color);
    }
  }

  // Wall
  for (let y = 14; y < 36; y++) {
    for (let x = 4; x < 36; x++) {
      let color: string;
      if (x < 12) {
        color = shackColors.wallDark;
      } else if (x > 28) {
        color = shackColors.wallLight;
      } else {
        color = shackColors.wall;
      }
      setPixel(ctx, x, y, color);
    }
  }

  // Door
  for (let y = 20; y < 36; y++) {
    for (let x = 16; x < 24; x++) {
      setPixel(ctx, x, y, shackColors.door);
    }
  }
  // Door frame
  for (let y = 20; y < 36; y++) {
    setPixel(ctx, 15, y, shackColors.doorFrame);
    setPixel(ctx, 24, y, shackColors.doorFrame);
  }
  for (let x = 15; x <= 24; x++) {
    setPixel(ctx, x, 19, shackColors.doorFrame);
  }
  // Door handle
  setPixel(ctx, 22, 27, '#FFD700');
  setPixel(ctx, 22, 28, '#CC9900');

  // Window (left)
  for (let y = 16; y < 22; y++) {
    for (let x = 7; x < 13; x++) {
      setPixel(ctx, x, y, shackColors.window);
    }
  }
  // Window frame
  for (let y = 15; y < 23; y++) {
    setPixel(ctx, 6, y, shackColors.windowFrame);
    setPixel(ctx, 13, y, shackColors.windowFrame);
  }
  for (let x = 6; x <= 13; x++) {
    setPixel(ctx, x, 15, shackColors.windowFrame);
    setPixel(ctx, x, 22, shackColors.windowFrame);
  }
  // Window cross
  setPixel(ctx, 9, 16, shackColors.windowFrame);
  setPixel(ctx, 9, 17, shackColors.windowFrame);
  setPixel(ctx, 9, 18, shackColors.windowFrame);
  setPixel(ctx, 9, 19, shackColors.windowFrame);
  setPixel(ctx, 9, 20, shackColors.windowFrame);
  setPixel(ctx, 9, 21, shackColors.windowFrame);
  for (let x = 7; x < 13; x++) {
    setPixel(ctx, x, 18, shackColors.windowFrame);
  }

  // Window (right)
  for (let y = 16; y < 22; y++) {
    for (let x = 27; x < 33; x++) {
      setPixel(ctx, x, y, shackColors.window);
    }
  }
  // Window frame
  for (let y = 15; y < 23; y++) {
    setPixel(ctx, 26, y, shackColors.windowFrame);
    setPixel(ctx, 33, y, shackColors.windowFrame);
  }
  for (let x = 26; x <= 33; x++) {
    setPixel(ctx, x, 15, shackColors.windowFrame);
    setPixel(ctx, x, 22, shackColors.windowFrame);
  }
  // Window cross
  setPixel(ctx, 29, 16, shackColors.windowFrame);
  setPixel(ctx, 29, 17, shackColors.windowFrame);
  setPixel(ctx, 29, 18, shackColors.windowFrame);
  setPixel(ctx, 29, 19, shackColors.windowFrame);
  setPixel(ctx, 29, 20, shackColors.windowFrame);
  setPixel(ctx, 29, 21, shackColors.windowFrame);
  for (let x = 27; x < 33; x++) {
    setPixel(ctx, x, 18, shackColors.windowFrame);
  }

  // Sign above door
  ctx.fillStyle = '#FFF';
  ctx.font = 'bold 6px monospace';
  ctx.fillText('REST', 15, 18);

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
    worker: createWorkerSprite(),
    workerChop: createWorkerChopSprite(),
    workerCarry: createWorkerCarrySprite(),
    workerSleep: createWorkerSleepSprite(),
    wood: createWoodSprite(),
    chipper: createChipperSprite(),
    shack: createShackSprite(),
    axe: createAxeSprite(),
  };
}

export function getTreeSprite(sprites: SpriteSheet, type: TreeType, isDead: boolean = false): HTMLCanvasElement {
  if (isDead) {
    return sprites.treeStumps[type];
  }
  return sprites.trees[type];
}
