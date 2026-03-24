import type { ShapeRuntimeMesh } from './shapeBackend';

export interface MeshInertiaResult {
  /** Center of mass in mm coordinates */
  centerOfMass: [number, number, number];
  /** Volume in mm³ */
  volumeMm3: number;
  /** Inertia tensor components in kg·m² (already scaled for mass) */
  ixx: number;
  iyy: number;
  izz: number;
  ixy: number;
  ixz: number;
  iyz: number;
}

/**
 * Compute inertia tensor from a triangle mesh using the divergence theorem
 * (Mirtich / Eberly method).
 *
 * All mesh coordinates are in mm. The returned inertia components are in kg·m²,
 * already scaled for the given mass. The inertia is about the center of mass.
 */
export function computeMeshInertia(mesh: ShapeRuntimeMesh, massKg: number): MeshInertiaResult {
  const { numProp, numTri, triVerts, vertProperties } = mesh;

  // Accumulators for volume integrals (in mm units)
  let vol = 0;
  // First moments (for center of mass)
  let sx = 0,
    sy = 0,
    sz = 0;
  // Second moments (for inertia tensor about origin)
  let sxx = 0,
    syy = 0,
    szz = 0;
  let sxy = 0,
    sxz = 0,
    syz = 0;

  for (let t = 0; t < numTri; t++) {
    const i0 = triVerts[t * 3] * numProp;
    const i1 = triVerts[t * 3 + 1] * numProp;
    const i2 = triVerts[t * 3 + 2] * numProp;

    const ax = vertProperties[i0],
      ay = vertProperties[i0 + 1],
      az = vertProperties[i0 + 2];
    const bx = vertProperties[i1],
      by = vertProperties[i1 + 1],
      bz = vertProperties[i1 + 2];
    const cx = vertProperties[i2],
      cy = vertProperties[i2 + 1],
      cz = vertProperties[i2 + 2];

    // Edge vectors
    const e1x = bx - ax,
      e1y = by - ay,
      e1z = bz - az;
    const e2x = cx - ax,
      e2y = cy - ay,
      e2z = cz - az;

    // Cross product d = e1 × e2
    const dx = e1y * e2z - e1z * e2y;
    const dy = e1z * e2x - e1x * e2z;
    const dz = e1x * e2y - e1y * e2x;

    // Signed volume of tetrahedron with origin: (a · d) / 6
    vol += (ax * dx + ay * dy + az * dz) / 6;

    // First moments: each tetrahedron contributes integral of x dV etc.
    // For tetrahedron (0,a,b,c): integral of x dV = det * (a_x + b_x + c_x) / 24
    // where det = a · (b × c) = a · d  (since d = (b-a)×(c-a), we need the
    // determinant which is a · ((b-a)×(c-a)) = a·d, same as 6 * vol contribution)
    const det = ax * dx + ay * dy + az * dz;

    sx += (det * (ax + bx + cx)) / 24;
    sy += (det * (ay + by + cy)) / 24;
    sz += (det * (az + bz + cz)) / 24;

    // Second moments: for tetrahedron (0,a,b,c):
    // integral of x² dV = det/60 * (a_x² + b_x² + c_x² + a_x*b_x + a_x*c_x + b_x*c_x)
    // integral of xy dV = det/120 * (2*a_x*a_y + 2*b_x*b_y + 2*c_x*c_y
    //                                + a_x*b_y + a_y*b_x + a_x*c_y + a_y*c_x + b_x*c_y + b_y*c_x)
    sxx += (det * (ax * ax + bx * bx + cx * cx + ax * bx + ax * cx + bx * cx)) / 60;
    syy += (det * (ay * ay + by * by + cy * cy + ay * by + ay * cy + by * cy)) / 60;
    szz += (det * (az * az + bz * bz + cz * cz + az * bz + az * cz + bz * cz)) / 60;

    sxy += (det * (2 * ax * ay + 2 * bx * by + 2 * cx * cy + ax * by + ay * bx + ax * cy + ay * cx + bx * cy + by * cx)) / 120;
    sxz += (det * (2 * ax * az + 2 * bx * bz + 2 * cx * cz + ax * bz + az * bx + ax * cz + az * cx + bx * cz + bz * cx)) / 120;
    syz += (det * (2 * ay * az + 2 * by * bz + 2 * cy * cz + ay * bz + az * by + ay * cz + az * cy + by * cz + bz * cy)) / 120;
  }

  const absVol = Math.abs(vol);
  if (absVol < 1e-30) {
    // Degenerate mesh — return zeros
    return {
      centerOfMass: [0, 0, 0],
      volumeMm3: 0,
      ixx: 0,
      iyy: 0,
      izz: 0,
      ixy: 0,
      ixz: 0,
      iyz: 0,
    };
  }

  // Center of mass in mm
  const comX = sx / vol;
  const comY = sy / vol;
  const comZ = sz / vol;

  // Inertia tensor about origin (in mm^5 density units):
  // I_xx = integral of (y² + z²) dV = syy + szz
  // etc. Then scale by density = mass / volume.
  const _density = massKg / absVol; // kg / mm³

  // Raw moments about origin (mm^5)
  const Ixx_o = syy + szz;
  const Iyy_o = sxx + szz;
  const Izz_o = sxx + syy;
  const Ixy_o = -sxy;
  const Ixz_o = -sxz;
  const Iyz_o = -syz;

  // Parallel axis theorem: shift from origin to center of mass
  // I_com = I_origin - volume * (com² terms)
  // For diagonal: I_xx_com = I_xx_o - V*(comY² + comZ²)
  // For off-diagonal: I_xy_com = I_xy_o - V*(comX*comY)  (note: subtract, not add)
  const Ixx_com = Ixx_o - absVol * (comY * comY + comZ * comZ);
  const Iyy_com = Iyy_o - absVol * (comX * comX + comZ * comZ);
  const Izz_com = Izz_o - absVol * (comX * comX + comY * comY);
  const Ixy_com = Ixy_o + absVol * comX * comY; // note: -(-V*cx*cy) = +
  const Ixz_com = Ixz_o + absVol * comX * comZ;
  const Iyz_com = Iyz_o + absVol * comY * comZ;

  // Convert from mm^5 to m^5: multiply by (1e-3)^5 = 1e-15
  // Then multiply by density (kg/mm³) to get kg·m²
  // But density = massKg / absVol (mm³), so:
  //   I (kg·m²) = I_com (mm^5) * density (kg/mm³) * 1e-15 (m^5/mm^5)
  //             = I_com * (massKg / absVol) * 1e-15
  // Simpler: scale = massKg / absVol * 1e-15  ... but let's just do mm→m on each factor.
  // Actually: I_com is in mm^5. density is kg/mm³.
  // I (kg·mm²) = I_com * density = I_com * massKg / absVol
  // I (kg·m²)  = I_com * massKg / absVol * 1e-6   (since 1 mm² = 1e-6 m²)
  const scale = (massKg / absVol) * 1e-6;

  return {
    centerOfMass: [comX, comY, comZ],
    volumeMm3: absVol,
    ixx: Ixx_com * scale,
    iyy: Iyy_com * scale,
    izz: Izz_com * scale,
    ixy: Ixy_com * scale,
    ixz: Ixz_com * scale,
    iyz: Iyz_com * scale,
  };
}
