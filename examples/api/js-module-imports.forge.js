import { buildAssembly } from "./js-module-scene.js";

const { loadCount } = require("./js-module-pillars.js");

if (loadCount() !== 1) {
  throw new Error(`Expected shared JS module cache, got ${loadCount()}`);
}

export default buildAssembly();
