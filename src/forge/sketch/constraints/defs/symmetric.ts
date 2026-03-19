import type { PointId, LineId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';
import { midpoint, reflectPointAcrossLine } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Forces points `a` and `b` to be mirror images of each other across
     * the infinite line through `axis`.
     *
     * When neither point is fixed, `b` is moved to the reflection of `a`.
     * When `b` is fixed, `a` is moved instead. Contributes **2 equations**
     * (one per axis): `b − reflect(a, axis) = [0, 0]`.
     */
    symmetric: { a: PointId; b: PointId; axis: LineId };
  }
}

registerConstraint<'symmetric', ConstraintTypeMap['symmetric']>({
  type: 'symmetric',
  label: '⟷',
  isDimension: false,
  equations: 2,

  displayPosition(c, { points }) {
    const a = points.get(c.a);
    const b = points.get(c.b);
    if (a && b) return midpoint(a, b);
    return [0, 0];
  },

  displayAnnotations(c, { points }) {
    const a = points.get(c.a), b = points.get(c.b);
    const annotations: AnnotationElement[] = [];
    if (a) annotations.push({ kind: 'symbol', position: [a.x, a.y], symbol: 'symmetric' });
    if (b) annotations.push({ kind: 'symbol', position: [b.x, b.y], symbol: 'symmetric' });
    return annotations;
  },

  solve(c, { points, lines, tolerance }) {
    const a = points.get(c.a);
    const b = points.get(c.b);
    const axis = lines.get(c.axis);
    if (!a || !b || !axis) return 0;
    const ax1 = points.get(axis.a);
    const ax2 = points.get(axis.b);
    if (!ax1 || !ax2) return 0;
    const ra = reflectPointAcrossLine(a, ax1, ax2);
    const rb = reflectPointAcrossLine(b, ax1, ax2);
    const err = Math.sqrt((b.x - ra[0]) ** 2 + (b.y - ra[1]) ** 2);
    if (err <= tolerance) return err;
    if (a.fixed && b.fixed) return err;
    if (a.fixed) {
      b.x = ra[0]; b.y = ra[1];
    } else if (b.fixed) {
      a.x = rb[0]; a.y = rb[1];
    } else {
      b.x = ra[0]; b.y = ra[1];
    }
    return err;
  },


  residual(c, { points, lines }) {
    const a = points.get(c.a); const b = points.get(c.b);
    const axis = lines.get(c.axis);
    if (!a || !b || !axis) return [0, 0];
    const ax1 = points.get(axis.a); const ax2 = points.get(axis.b);
    if (!ax1 || !ax2) return [0, 0];
    // Reflect a across axis
    const dx = ax2.x - ax1.x; const dy = ax2.y - ax1.y;
    const len2 = dx * dx + dy * dy || 1;
    const t = ((a.x - ax1.x) * dx + (a.y - ax1.y) * dy) / len2;
    const px = ax1.x + t * dx; const py = ax1.y + t * dy;
    const rx = 2 * px - a.x; const ry = 2 * py - a.y;
    return [b.x - rx, b.y - ry];
  },

  jacobian(c, { points, lines }) {
    const a = points.get(c.a); const b = points.get(c.b);
    const axis = lines.get(c.axis);
    if (!a || !b || !axis) return { residuals: [0, 0], partials: {} };
    const ax1 = points.get(axis.a); const ax2 = points.get(axis.b);
    if (!ax1 || !ax2) return { residuals: [0, 0], partials: {} };
    const dx = ax2.x - ax1.x, dy = ax2.y - ax1.y;
    const len2 = dx * dx + dy * dy || 1e-24;
    // r = b - reflect(a, axis), reflect uses: r = a - 2*h*n where h = signed dist, n = unit normal
    const nx = -dy / Math.sqrt(len2), ny = dx / Math.sqrt(len2);
    const nx2 = nx * nx, ny2 = ny * ny, nxny = nx * ny;
    // ∂r/∂a: -(∂reflect/∂a) = -(I - 2*n*nT) = 2*n*nT - I
    const dra_xx = 2 * nx2 - 1; // = (dy²-dx²)/len2
    const dra_xy = 2 * nxny;    // = -2*dx*dy/len2
    const dra_yx = 2 * nxny;
    const dra_yy = 2 * ny2 - 1; // = (dx²-dy²)/len2
    // Reflect a across axis
    const ux = a.x - ax1.x, uy = a.y - ax1.y;
    const t = (ux * dx + uy * dy) / len2;
    const px = ax1.x + t * dx, py = ax1.y + t * dy;
    const rx = 2 * px - a.x, ry = 2 * py - a.y;
    const r0 = b.x - rx, r1 = b.y - ry;
    // For axis endpoints, use h = ux*nx + uy*ny (signed distance from a to axis)
    const h = ux * nx + uy * ny;
    const lenA = Math.sqrt(len2);
    // Derivatives of nx, ny w.r.t. axis endpoint coords:
    // nx = -dy/lenA, ny = dx/lenA
    // ∂reflected/∂axisVar involves ∂(h*n)/∂axisVar
    // For simplicity, compute numerically-stable axis partials:
    const S = ux * dx + uy * dy;
    const la3 = len2 * lenA;
    // ∂r[0]/∂ax1.x, ∂r[1]/∂ax1.x etc. via chain rule on the reflection formula
    // reflected.x = 2*ax1.x + 2*S*dx/len2 - a.x
    // ∂reflected.x/∂ax1.x = 2 + 2*(∂(S*dx/len2))/∂ax1.x
    // This is complex but can be expressed using S, dx, dy, len2
    const Sdx = S * dx, Sdy = S * dy;
    // ∂S/∂ax1.x = -(dx+ux), ∂dx/∂ax1.x = -1, ∂len2/∂ax1.x = -2*dx
    // ∂(S*dx/len2)/∂ax1.x = ((-(dx+ux)*dx + S*(-1))*len2 - S*dx*(-2*dx))/len2²
    //   = (-(dx+ux)*dx - S)/len2 + 2*S*dx²/len2²
    const drx_fax = -(dx + ux) * dx / len2 - S / len2 + 2 * Sdx * dx / (len2 * len2);
    const drx_fay = -(dy) * dx / len2 - 0 + 2 * Sdx * dy / (len2 * len2);
    // Wait, let me be more careful with ∂S/∂ax1.y:
    // S = ux*dx + uy*dy where ux=a.x-ax1.x, uy=a.y-ax1.y, dx=ax2.x-ax1.x, dy=ax2.y-ax1.y
    // ∂S/∂ax1.y = ux*0 + (-1)*dy + (-1)*dx*0 + uy*(-1) ... no.
    // ∂ux/∂ax1.y = 0, ∂dx/∂ax1.y = 0, ∂uy/∂ax1.y = -1, ∂dy/∂ax1.y = -1
    // ∂S/∂ax1.y = 0 + 0 + (-1)*dy + uy*(-1) = -(dy + uy)
    // reflected.x = 2*ax1.x + 2*S*dx/len2 - a.x
    // ∂reflected.x/∂ax1.y = 2*(∂(S*dx/len2)/∂ax1.y)
    // ∂dx/∂ax1.y = 0, ∂len2/∂ax1.y = -2*dy
    // ∂(S*dx/len2)/∂ax1.y = (-(dy+uy)*dx*len2 - S*dx*(-2*dy))/len2²
    //   = -(dy+uy)*dx/len2 + 2*S*dx*dy/len2²
    // Similarly for reflected.y:
    // reflected.y = 2*ax1.y + 2*S*dy/len2 - a.y
    // ∂(S*dy/len2)/∂ax1.x = ((-(dx+ux)*dy + 0)*len2 - S*dy*(-2*dx))/len2²
    //   = -(dx+ux)*dy/len2 + 2*S*dy*dx/len2²
    const len4 = len2 * len2;
    // r = b - reflected, so ∂r/∂var = -∂reflected/∂var
    // ∂reflected.x/∂ax1.x = 2 + 2*drx_fax where drx_fax = (-(dx+ux)*dx - S)/len2 + 2*S*dx²/len4
    const drflx_ax1x = 2 + 2 * ((-(dx + ux) * dx - S) / len2 + 2 * Sdx * dx / len4);
    const drfly_ax1x = 2 * ((-(dx + ux) * dy) / len2 + 2 * Sdy * dx / len4);
    const drflx_ax1y = 2 * ((-(dy + uy) * dx) / len2 + 2 * Sdx * dy / len4);
    const drfly_ax1y = 2 + 2 * ((-(dy + uy) * dy - S) / len2 + 2 * Sdy * dy / len4);
    // For ax2: ∂ux/∂ax2 = 0, ∂uy/∂ax2 = 0, ∂dx/∂ax2.x = 1, ∂dy/∂ax2.y = 1
    // ∂S/∂ax2.x = ux, ∂len2/∂ax2.x = 2*dx
    // ∂(S*dx/len2)/∂ax2.x = (ux*dx + S)*len2 - S*dx*2*dx) / len4
    //   = (ux*dx + S)/len2 - 2*S*dx²/len4
    const drflx_ax2x = 2 * ((ux * dx + S) / len2 - 2 * Sdx * dx / len4);
    const drfly_ax2x = 2 * (ux * dy / len2 - 2 * Sdy * dx / len4);
    // ∂S/∂ax2.y = uy, ∂len2/∂ax2.y = 2*dy
    const drflx_ax2y = 2 * (uy * dx / len2 - 2 * Sdx * dy / len4);
    const drfly_ax2y = 2 * ((uy * dy + S) / len2 - 2 * Sdy * dy / len4);
    return {
      residuals: [r0, r1],
      partials: {
        [`${c.b}.x`]: [1, 0],
        [`${c.b}.y`]: [0, 1],
        [`${c.a}.x`]: [dra_xx, dra_yx],
        [`${c.a}.y`]: [dra_xy, dra_yy],
        [`${axis.a}.x`]: [-drflx_ax1x, -drfly_ax1x],
        [`${axis.a}.y`]: [-drflx_ax1y, -drfly_ax1y],
        [`${axis.b}.x`]: [-drflx_ax2x, -drfly_ax2x],
        [`${axis.b}.y`]: [-drflx_ax2y, -drfly_ax2y],
      },
    };
  },

  computeDof(c, { refCount }) {
    refCount.set(c.a, (refCount.get(c.a) ?? 0) + 1);
    refCount.set(c.b, (refCount.get(c.b) ?? 0) + 1);
  },
});
