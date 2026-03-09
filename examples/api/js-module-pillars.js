import { box, union } from "forgecad";

let moduleLoadCount = 0;
moduleLoadCount += 1;

export const capHeight = 6;

export function loadCount() {
  return moduleLoadCount;
}

export default class PillarPair {
  constructor(spacing, height) {
    this.spacing = spacing;
    this.height = height;
  }

  build() {
    const pillar = box(6, 6, this.height, true);
    return union(
      pillar.translate(-this.spacing / 2, 0, this.height / 2),
      pillar.translate(this.spacing / 2, 0, this.height / 2),
    );
  }
}
