export const ANCHOR3D_NAMES = [
  'center',
  'front',
  'back',
  'left',
  'right',
  'top',
  'bottom',
  'front-left',
  'front-right',
  'back-left',
  'back-right',
  'top-front',
  'top-back',
  'top-left',
  'top-right',
  'bottom-front',
  'bottom-back',
  'bottom-left',
  'bottom-right',
  'top-front-left',
  'top-front-right',
  'top-back-left',
  'top-back-right',
  'bottom-front-left',
  'bottom-front-right',
  'bottom-back-left',
  'bottom-back-right',
] as const;

export type Anchor3D = typeof ANCHOR3D_NAMES[number];

const ANCHOR3D_NAME_SET = new Set<string>(ANCHOR3D_NAMES);

export function isAnchor3D(value: string): value is Anchor3D {
  return ANCHOR3D_NAME_SET.has(value);
}

export function resolveAnchor3D(
  min: [number, number, number],
  max: [number, number, number],
  anchor: Anchor3D,
): [number, number, number] {
  const cx = (min[0] + max[0]) / 2;
  const cy = (min[1] + max[1]) / 2;
  const cz = (min[2] + max[2]) / 2;

  switch (anchor) {
    case 'center': return [cx, cy, cz];
    case 'front': return [cx, min[1], cz];
    case 'back': return [cx, max[1], cz];
    case 'left': return [min[0], cy, cz];
    case 'right': return [max[0], cy, cz];
    case 'top': return [cx, cy, max[2]];
    case 'bottom': return [cx, cy, min[2]];
    case 'front-left': return [min[0], min[1], cz];
    case 'front-right': return [max[0], min[1], cz];
    case 'back-left': return [min[0], max[1], cz];
    case 'back-right': return [max[0], max[1], cz];
    case 'top-front': return [cx, min[1], max[2]];
    case 'top-back': return [cx, max[1], max[2]];
    case 'top-left': return [min[0], cy, max[2]];
    case 'top-right': return [max[0], cy, max[2]];
    case 'bottom-front': return [cx, min[1], min[2]];
    case 'bottom-back': return [cx, max[1], min[2]];
    case 'bottom-left': return [min[0], cy, min[2]];
    case 'bottom-right': return [max[0], cy, min[2]];
    case 'top-front-left': return [min[0], min[1], max[2]];
    case 'top-front-right': return [max[0], min[1], max[2]];
    case 'top-back-left': return [min[0], max[1], max[2]];
    case 'top-back-right': return [max[0], max[1], max[2]];
    case 'bottom-front-left': return [min[0], min[1], min[2]];
    case 'bottom-front-right': return [max[0], min[1], min[2]];
    case 'bottom-back-left': return [min[0], max[1], min[2]];
    case 'bottom-back-right': return [max[0], max[1], min[2]];
    default:
      throw new Error(
        `Unknown anchor "${anchor}". Valid anchors: ${ANCHOR3D_NAMES.join(', ')}`,
      );
  }
}
