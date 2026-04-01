// Reference: T-junction pipe fitting
const outerR = 15;
const innerR = 12;
const mainLen = 80;
const branchLen = 40;

// Main pipe along X axis
const mainOuter = cylinder(mainLen, outerR).rotate(0, 90, 0).translate(mainLen / 2, 0, 0);
const mainInner = cylinder(mainLen + 2, innerR).rotate(0, 90, 0).translate(mainLen / 2, 0, 0);

// Branch pipe along Z axis, rising from the center of the main pipe
const branchOuter = cylinder(branchLen, outerR).translate(mainLen / 2, 0, 0);
const branchInner = cylinder(branchLen + outerR, innerR).translate(mainLen / 2, 0, 0);

// Union outer shells, then subtract inner bores
const outer = union(mainOuter, branchOuter);
const inner = union(mainInner, branchInner);

return outer.subtract(inner);
