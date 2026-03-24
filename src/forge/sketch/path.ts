import { Sketch } from './core';
import { polygon } from './primitives';

export class PathBuilder {
  private points: [number, number][] = [];
  private x = 0;
  private y = 0;

  moveTo(x: number, y: number): this {
    this.x = x;
    this.y = y;
    this.points.push([x, y]);
    return this;
  }

  lineTo(x: number, y: number): this {
    this.x = x;
    this.y = y;
    this.points.push([x, y]);
    return this;
  }

  lineH(dx: number): this {
    return this.lineTo(this.x + dx, this.y);
  }

  lineV(dy: number): this {
    return this.lineTo(this.x, this.y + dy);
  }

  lineAngled(length: number, degrees: number): this {
    const rad = (degrees * Math.PI) / 180;
    return this.lineTo(this.x + length * Math.cos(rad), this.y + length * Math.sin(rad));
  }

  close(): Sketch {
    if (this.points.length < 3) throw new Error('Path needs at least 3 points');
    const pts = this.points;
    let signedArea = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      signedArea += (x2 - x1) * (y2 + y1);
    }
    if (signedArea > 0) pts.reverse();
    return polygon(pts);
  }

  stroke(width: number, join: 'Round' | 'Square' = 'Square'): Sketch {
    if (this.points.length < 2) throw new Error('Stroke needs at least 2 points');
    const hw = width / 2;
    const pts = this.points;
    const n = pts.length;

    const normals: [number, number][] = [];
    for (let i = 0; i < n - 1; i++) {
      const dx = pts[i + 1][0] - pts[i][0],
        dy = pts[i + 1][1] - pts[i][1];
      const len = Math.sqrt(dx * dx + dy * dy);
      normals.push([-dy / len, dx / len]);
    }

    const left: [number, number][] = [],
      right: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const [px, py] = pts[i];
      if (i === 0 || i === n - 1) {
        const ni = normals[i === 0 ? 0 : n - 2];
        left.push([px + ni[0] * hw, py + ni[1] * hw]);
        right.push([px - ni[0] * hw, py - ni[1] * hw]);
      } else {
        const n1 = normals[i - 1],
          n2 = normals[i];
        let mx = n1[0] + n2[0],
          my = n1[1] + n2[1];
        let mlen = Math.sqrt(mx * mx + my * my);
        if (mlen < 1e-9) {
          mx = n1[0];
          my = n1[1];
          mlen = 1;
        }
        mx /= mlen;
        my /= mlen;
        const scale = hw / (mx * n1[0] + my * n1[1]);
        left.push([px + mx * scale, py + my * scale]);
        right.push([px - mx * scale, py - my * scale]);
      }
    }

    const poly: [number, number][] = [...left, ...right.reverse()];
    let sa = 0;
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i];
      const [x2, y2] = poly[(i + 1) % poly.length];
      sa += (x2 - x1) * (y2 + y1);
    }
    if (sa > 0) poly.reverse();

    let result = polygon(poly);
    if (join === 'Round') result = result.offset(-hw / 2, 'Round').offset(hw / 2, 'Round');
    return result;
  }
}

export function path(): PathBuilder {
  return new PathBuilder();
}

export function stroke(points: [number, number][], width: number, join: 'Round' | 'Square' = 'Square'): Sketch {
  const builder = new PathBuilder();
  builder.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) builder.lineTo(points[i][0], points[i][1]);
  return builder.stroke(width, join);
}
