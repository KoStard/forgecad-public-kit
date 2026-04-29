export const FOLDED_SERVICE_PANEL_COVER_SPEC = {
  panel: { width: 180, height: 110 },
  thickness: 1.5,
  bendRadius: 2.0,
  bendAllowance: { kFactor: 0.42 },
  cornerRelief: { size: 4.0 },
};

const FOLDED_SERVICE_PANEL_REGION_NAMES = [
  'panel',
  'bend-top',
  'flange-top',
  'bend-right',
  'flange-right',
  'bend-bottom',
  'flange-bottom',
  'bend-left',
  'flange-left',
];

function mountingHole(radius, u, v) {
  return {
    sketch: circle2d(radius),
    u,
    v,
  };
}

function assertIncludesAll(actual, expected, label) {
  for (const name of expected) {
    if (!actual.includes(name)) {
      throw new Error(`${label} is missing "${name}". Got: ${actual.join(', ')}`);
    }
  }
}

export function buildFoldedServicePanelCoverPart() {
  let part = sheetMetal(FOLDED_SERVICE_PANEL_COVER_SPEC)
    .flange('top', { length: 18, angleDeg: 90 })
    .flange('right', { length: 18, angleDeg: 90 })
    .flange('bottom', { length: 18, angleDeg: 90 })
    .flange('left', { length: 18, angleDeg: 90 })
    .cutout('panel', rect(72, 36), { selfAnchor: 'center' })
    .cutout('flange-right', roundedRect(26, 10, 5), { selfAnchor: 'center' });

  const holes = [
    mountingHole(2.2, -68, -37),
    mountingHole(2.2, 68, -37),
    mountingHole(2.2, -68, 37),
    mountingHole(2.2, 68, 37),
  ];

  for (const hole of holes) {
    part = part.cutout('panel', hole.sketch, {
      u: hole.u,
      v: hole.v,
      selfAnchor: 'center',
    });
  }

  return part;
}

function assertDescendant(face, label, semantic, minMembers = 1) {
  if (!face.descendant) {
    throw new Error(`${label} did not expose descendant metadata.`);
  }
  if (face.descendant.semantic !== semantic) {
    throw new Error(`${label} expected descendant semantic "${semantic}", got "${face.descendant.semantic}".`);
  }
  if (face.descendant.memberCount < minMembers) {
    throw new Error(`${label} expected at least ${minMembers} member(s), got ${face.descendant.memberCount}.`);
  }
}

export function buildFoldedServicePanelCoverOutputs() {
  const part = buildFoldedServicePanelCoverPart();
  const regionNames = part.regionNames();
  assertIncludesAll(regionNames, FOLDED_SERVICE_PANEL_REGION_NAMES, 'Sheet-metal regionNames()');
  if (regionNames.length !== FOLDED_SERVICE_PANEL_REGION_NAMES.length) {
    throw new Error(`Sheet-metal regionNames() should expose ${FOLDED_SERVICE_PANEL_REGION_NAMES.length} entries, got ${regionNames.length}.`);
  }

  const folded = part.folded();
  const flat = part.flatPattern();

  assertIncludesAll(folded.faceNames(), FOLDED_SERVICE_PANEL_REGION_NAMES, 'Folded faceNames()');
  assertIncludesAll(flat.faceNames(), FOLDED_SERVICE_PANEL_REGION_NAMES, 'Flat faceNames()');

  assertDescendant(folded.face('panel'), 'Folded panel', 'region');
  assertDescendant(folded.face('flange-right'), 'Folded flange-right', 'region');
  assertDescendant(folded.face('bend-right'), 'Folded bend-right', 'set', 2);
  assertDescendant(flat.face('panel'), 'Flat panel', 'region');
  assertDescendant(flat.face('flange-right'), 'Flat flange-right', 'region');
  assertDescendant(flat.face('bend-right'), 'Flat bend-right', 'face');

  return { part, folded, flat };
}

export function buildFoldedServicePanelCoverScene(options = {}) {
  const { folded, flat } = buildFoldedServicePanelCoverOutputs();
  const flatOffsetX = options.flatOffsetX ?? 280;
  const foldedColor = options.foldedColor ?? '#a2b0b7';
  const flatColor = options.flatColor ?? '#d7bf95';

  return [
    { name: 'Folded Service Panel Cover', shape: folded, color: foldedColor },
    { name: 'Flat Service Panel Cover', shape: flat.translate(flatOffsetX, 0, 0), color: flatColor },
  ];
}

return buildFoldedServicePanelCoverScene();
