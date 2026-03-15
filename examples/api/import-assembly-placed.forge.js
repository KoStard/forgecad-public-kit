// importAssembly + placement references demo
// Reference points are declared in the source file via assembly.withReferences().
// The consumer gets them automatically — no re-declaration needed.

const sub = importAssembly("api/import-assembly-source.forge.js");

console.log("ref names:", sub.referenceNames()); // ["points.origin", "points.top"]

// Place copy A so its origin lands at [0, 0, 0]
const copyA = sub.placeReference("origin", [0, 0, 0]).toGroup({ shoulder: 40 });

// Place copy B so its top face aligns with [200, 0, 0]
const copyB = sub.placeReference("top", [200, 0, 0]).toGroup({ shoulder: -15 });

// Access individual parts from a placed assembly
const placedArm = sub.placeReference("origin", [400, 0, 0]);
const base = placedArm.part("Base");
const link = placedArm.part("Link", { shoulder: 60 });

return [copyA, copyB, base, link];
