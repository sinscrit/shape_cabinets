const paramsFromAI = {
  width_mm: 600,
  height_mm: 1200,
  depth_mm: 350,
  board_thickness_mm: 18,
  shelf_count: 3,
  toe_kick_height_mm: 80
};

const { cuboid, cylinder } = require('@jscad/modeling').primitives;
const { translate, rotateY } = require('@jscad/modeling').transforms;
const { union, subtract } = require('@jscad/modeling').booleans;

const getParameterDefinitions = () => [
  { name: 'exploded', type: 'checkbox', checked: false, caption: 'Exploded view' }
];

// Simple screw model (shaft + head), oriented along Z before rotation
const makeScrewPrimitive = () => {
  const shaftLen = 35;         // mm
  const shaftRadius = 2;       // ~4 mm screw
  const headHeight = 4;        // mm
  const headRadius = 4;        // mm

  const shaft = cylinder({ height: shaftLen, radius: shaftRadius, segments: 24 });
  const head = translate(
    [0, 0, shaftLen],
    cylinder({ height: headHeight, radius: headRadius, segments: 24 })
  );

  return union(shaft, head); // axis along +Z
};

// Hole cylinder (for subtract), axis along X
const screwHole = (x, y, z, T) => {
  const r = 2;
  const h = T + 2; // slightly more than thickness
  const cyl = cylinder({ height: h, radius: r, segments: 24 });
  const aligned = rotateY(Math.PI / 2, cyl); // Z→X
  return translate([x, y, z], aligned);
};

const main = (params) => {
  const p = paramsFromAI;
  const explode = params.exploded ? 80 : 0;

  const W = p.width_mm;
  const H = p.height_mm;
  const D = p.depth_mm;
  const T = p.board_thickness_mm;
  const toe = p.toe_kick_height_mm;
  const shelves = p.shelf_count;

  const parts = [];

  // Side panel X positions (already exploded)
  const leftX = -W / 2 + T / 2 - explode;
  const rightX = W / 2 - T / 2 + explode;

  // Base solids
  let leftPanel = translate(
    [leftX, 0, H / 2],
    cuboid({ size: [T, D, H] })
  );

  let rightPanel = translate(
    [rightX, 0, H / 2],
    cuboid({ size: [T, D, H] })
  );

  // Hole pattern
  const edgeOffsetY = D / 2 - 37;
  const frontY = edgeOffsetY;
  const backY = -edgeOffsetY;

  const topZ = H - T / 2;
  const bottomZ = toe + T / 2;

  const topHoleZ1 = topZ - 37;
  const topHoleZ2 = topZ - 100;

  const bottomHoleZ1 = bottomZ + 37;
  const bottomHoleZ2 = bottomZ + 100;

  const innerHeight = H - toe - T;
  const shelfSpacing = innerHeight / (shelves + 1);

  const shelfZs = [];
  for (let i = 1; i <= shelves; i++) {
    shelfZs.push(toe + T + shelfSpacing * i);
  }

  // Collect centered hole shapes and screw locations (X=0, cabinet coordinates)
  let sideHolesCentered = [];
  let screwLocs = []; // { y, z }

  const addHolePair = (z1, z2) => {
    [frontY, backY].forEach(y => {
      [z1, z2].forEach(z => {
        sideHolesCentered.push(screwHole(0, y, z, T));
        screwLocs.push({ y, z });
      });
    });
  };

  // Top & bottom holes
  addHolePair(topHoleZ1, topHoleZ2);
  addHolePair(bottomHoleZ1, bottomHoleZ2);

  // Shelf holes (one per shelf front/back)
  shelfZs.forEach(z => {
    [frontY, backY].forEach(y => {
      sideHolesCentered.push(screwHole(0, y, z, T));
      screwLocs.push({ y, z });
    });
  });

  // Apply holes to each side
  const makeSideWithHoles = (sideSolid, sideX) => {
    const translatedHoles = sideHolesCentered.map(h =>
      translate([sideX, 0, 0], h)
    );
    return subtract(sideSolid, union(translatedHoles));
  };

  leftPanel = makeSideWithHoles(leftPanel, leftX);
  rightPanel = makeSideWithHoles(rightPanel, rightX);

  parts.push(leftPanel, rightPanel);

  // Screws for each side, oriented along X, moved slightly in exploded view
  const screwPrim = makeScrewPrimitive(); // axis along +Z

  const makeSideScrews = (side, sideX) => {
    const offsetX = (side === 'left' ? -explode / 2 : explode / 2);
    return union(
      ...screwLocs.map(({ y, z }) => {
        // Rotate screw so its axis is along X (like the hole)
        let s = rotateY(Math.PI / 2, screwPrim);
        // Center on panel thickness, then offset with exploded
        return translate([sideX + offsetX, y, z], s);
      })
    );
  };

  const leftScrews = makeSideScrews('left', leftX);
  const rightScrews = makeSideScrews('right', rightX);

  parts.push(leftScrews, rightScrews);

  // Top panel (explode in +Y)
  const top = translate(
    [0, explode, topZ],
    cuboid({ size: [W, D, T] })
  );
  parts.push(top);

  // Bottom panel (explode in -Y)
  const bottom = translate(
    [0, -explode, bottomZ],
    cuboid({ size: [W, D, T] })
  );
  parts.push(bottom);

  // Back panel (explode further -Y)
  const back = translate(
    [0, -D / 2 - explode, (H + toe) / 2],
    cuboid({ size: [W, T, H - toe] })
  );
  parts.push(back);

  // Shelves (slight spread in Y)
  shelfZs.forEach((z, i) => {
    const shelf = translate(
      [0, (explode / 2) * (i - 1), z],
      cuboid({ size: [W - 2 * T, D - T, T] })
    );
    parts.push(shelf);
  });

  return union(parts);
};

module.exports = { main, getParameterDefinitions };
