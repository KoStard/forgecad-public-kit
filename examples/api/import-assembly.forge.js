// importAssembly() demo
// Shows how to import an Assembly, access named parts, and convert to a group.

const angle = param("Shoulder Angle", 45, { min: -45, max: 120, unit: "°" });

// Import the sub-assembly — get back an ImportedAssembly
const subArm = importAssembly("api/import-assembly-source.forge.js", { "Link Length": 100 });

// Access a specific part by name (positioned at default joint state)
const baseShape = subArm.part("Base");
const linkShape = subArm.part("Link", { shoulder: angle });

// Solve the whole sub-assembly at a specific joint state
const solved = subArm.solve({ shoulder: angle });
console.log("BOM:", solved.bom());

// Convert to a named ShapeGroup — children match part names
const asGroup = subArm.toGroup({ shoulder: angle });
const groupedBase = asGroup.child("Base");
const groupedLink = asGroup.child("Link");

// Place a copy of the full sub-assembly, and a shifted copy
const copy1 = subArm.toGroup({ shoulder: angle });
const copy2 = subArm.toGroup({ shoulder: -20 }).translate(200, 0, 0);

return [copy1, copy2];
