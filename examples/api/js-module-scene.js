import { box, union } from "forgecad";
import PillarPair, { capHeight } from "./js-module-pillars.js";

export function buildAssembly() {
  const base = box(40, 18, 4, true);
  const pillars = new PillarPair(24, 12).build().translate(0, 0, 2);
  const cap = box(14, 18, capHeight, true).translate(0, 0, 17);
  return union(base, pillars, cap).color("#d6a86a");
}
