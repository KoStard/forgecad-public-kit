#!/usr/bin/env tsx
/**
 * Generate standalone SVG files for each constraint annotation type.
 * Output: cli/snapshots/constraint-svgs/symbols/<name>.svg
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { AnnotationElement, ConstraintSymbol } from '../src/forge/sketch/constraints/types';

// Import rendering functions from sketch-svg (we'll call them via the full document builder)
// Instead, we'll generate minimal sketches that exercise each annotation type.

const outDir = join(import.meta.dirname, 'snapshots/constraint-svgs/symbols');
mkdirSync(outDir, { recursive: true });

// We need the renderSymbol, renderDimension, renderAngleArc functions.
// Since they're not exported, we'll re-use them by building constraint annotation elements
// and rendering them inline here with a thin wrapper.

const BG = '#1a1a2e';
const COLOR = '#4ade80';
const WARN_COLOR = '#faad14';

function svgDoc(viewBox: string, width: number, height: number, content: string, title: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}">
  <rect x="${viewBox.split(' ')[0]}" y="${viewBox.split(' ')[1]}" width="${viewBox.split(' ')[2]}" height="${viewBox.split(' ')[3]}" fill="${BG}"/>
  <text x="0" y="${parseFloat(viewBox.split(' ')[1]) + 1.5}" fill="#888" font-size="1.2" font-family="sans-serif" text-anchor="middle">${title}</text>
${content}
</svg>`;
}

// ─── Symbol rendering (copy from sketch-svg.ts to avoid import issues) ───

function renderSymbol(pos: [number, number], symbol: ConstraintSymbol, color: string, rotation?: number): string[] {
  const x = pos[0].toFixed(3);
  const y = (-pos[1]).toFixed(3);
  const rot = rotation !== undefined ? ` transform="rotate(${(-rotation * 180 / Math.PI).toFixed(1)} ${x} ${y})"` : '';
  const S = 1.2;

  switch (symbol) {
    case 'parallel': {
      return [
        `  <line x1="${(pos[0] - S * 0.3).toFixed(3)}" y1="${(-pos[1] - S * 0.5).toFixed(3)}" x2="${(pos[0] + S * 0.3).toFixed(3)}" y2="${(-pos[1]).toFixed(3)}" stroke="${color}" stroke-width="0.3"${rot}/>`,
        `  <line x1="${(pos[0] + S * 0.3).toFixed(3)}" y1="${(-pos[1]).toFixed(3)}" x2="${(pos[0] - S * 0.3).toFixed(3)}" y2="${(-pos[1] + S * 0.5).toFixed(3)}" stroke="${color}" stroke-width="0.3"${rot}/>`,
        `  <line x1="${(pos[0] + S * 0.1).toFixed(3)}" y1="${(-pos[1] - S * 0.5).toFixed(3)}" x2="${(pos[0] + S * 0.7).toFixed(3)}" y2="${(-pos[1]).toFixed(3)}" stroke="${color}" stroke-width="0.3"${rot}/>`,
        `  <line x1="${(pos[0] + S * 0.7).toFixed(3)}" y1="${(-pos[1]).toFixed(3)}" x2="${(pos[0] + S * 0.1).toFixed(3)}" y2="${(-pos[1] + S * 0.5).toFixed(3)}" stroke="${color}" stroke-width="0.3"${rot}/>`,
      ];
    }
    case 'equal': {
      return [
        `  <line x1="${(pos[0] - S * 0.5).toFixed(3)}" y1="${(-pos[1] - S * 0.2).toFixed(3)}" x2="${(pos[0] + S * 0.5).toFixed(3)}" y2="${(-pos[1] - S * 0.2).toFixed(3)}" stroke="${color}" stroke-width="0.3"${rot}/>`,
        `  <line x1="${(pos[0] - S * 0.5).toFixed(3)}" y1="${(-pos[1] + S * 0.2).toFixed(3)}" x2="${(pos[0] + S * 0.5).toFixed(3)}" y2="${(-pos[1] + S * 0.2).toFixed(3)}" stroke="${color}" stroke-width="0.3"${rot}/>`,
      ];
    }
    case 'perpendicular': {
      return [
        `  <polyline points="${(pos[0] + S * 0.6).toFixed(3)},${(-pos[1]).toFixed(3)} ${(pos[0]).toFixed(3)},${(-pos[1]).toFixed(3)} ${(pos[0]).toFixed(3)},${(-pos[1] + S * 0.6).toFixed(3)}" fill="none" stroke="${color}" stroke-width="0.3"${rot}/>`,
      ];
    }
    case 'horizontal':
      return [`  <text x="${x}" y="${y}" fill="${color}" font-size="1.8" font-family="sans-serif" text-anchor="middle" dominant-baseline="central" font-weight="bold">H</text>`];
    case 'vertical':
      return [`  <text x="${x}" y="${y}" fill="${color}" font-size="1.8" font-family="sans-serif" text-anchor="middle" dominant-baseline="central" font-weight="bold">V</text>`];
    case 'fixed': {
      return [
        `  <line x1="${(pos[0] - S).toFixed(3)}" y1="${(-pos[1] + S * 0.3).toFixed(3)}" x2="${(pos[0] + S).toFixed(3)}" y2="${(-pos[1] + S * 0.3).toFixed(3)}" stroke="${color}" stroke-width="0.3"/>`,
        `  <line x1="${(pos[0] - S * 0.7).toFixed(3)}" y1="${(-pos[1] + S * 0.3).toFixed(3)}" x2="${(pos[0] - S).toFixed(3)}" y2="${(-pos[1] + S * 0.8).toFixed(3)}" stroke="${color}" stroke-width="0.2"/>`,
        `  <line x1="${(pos[0] - S * 0.2).toFixed(3)}" y1="${(-pos[1] + S * 0.3).toFixed(3)}" x2="${(pos[0] - S * 0.5).toFixed(3)}" y2="${(-pos[1] + S * 0.8).toFixed(3)}" stroke="${color}" stroke-width="0.2"/>`,
        `  <line x1="${(pos[0] + S * 0.3).toFixed(3)}" y1="${(-pos[1] + S * 0.3).toFixed(3)}" x2="${(pos[0]).toFixed(3)}" y2="${(-pos[1] + S * 0.8).toFixed(3)}" stroke="${color}" stroke-width="0.2"/>`,
        `  <line x1="${(pos[0] + S * 0.8).toFixed(3)}" y1="${(-pos[1] + S * 0.3).toFixed(3)}" x2="${(pos[0] + S * 0.5).toFixed(3)}" y2="${(-pos[1] + S * 0.8).toFixed(3)}" stroke="${color}" stroke-width="0.2"/>`,
      ];
    }
    case 'midpoint': {
      return [
        `  <polygon points="${x},${(-(pos[1]) - S * 0.5).toFixed(3)} ${(pos[0] + S * 0.4).toFixed(3)},${y} ${x},${(-(pos[1]) + S * 0.5).toFixed(3)} ${(pos[0] - S * 0.4).toFixed(3)},${y}" fill="${color}" opacity="0.7"/>`,
      ];
    }
    case 'coincident': {
      return [
        `  <circle cx="${x}" cy="${y}" r="${(S * 0.5).toFixed(2)}" fill="none" stroke="${color}" stroke-width="0.25"/>`,
        `  <circle cx="${x}" cy="${y}" r="${(S * 0.15).toFixed(2)}" fill="${color}"/>`,
      ];
    }
    case 'collinear': {
      return [
        `  <circle cx="${x}" cy="${y}" r="${(S * 0.3).toFixed(2)}" fill="${color}" opacity="0.8"/>`,
      ];
    }
    case 'tangent':
      return [`  <text x="${x}" y="${y}" fill="${color}" font-size="1.6" font-family="sans-serif" text-anchor="middle" dominant-baseline="central" font-weight="bold">T</text>`];
    case 'concentric': {
      return [
        `  <circle cx="${x}" cy="${y}" r="${(S * 0.3).toFixed(2)}" fill="none" stroke="${color}" stroke-width="0.25"/>`,
        `  <circle cx="${x}" cy="${y}" r="${(S * 0.6).toFixed(2)}" fill="none" stroke="${color}" stroke-width="0.25"/>`,
      ];
    }
    case 'ccw': {
      const r = S * 0.6;
      return [
        `  <path d="M${(pos[0] + r).toFixed(3)},${(-pos[1]).toFixed(3)} A${r.toFixed(3)},${r.toFixed(3)} 0 1,0 ${(pos[0]).toFixed(3)},${(-pos[1] - r).toFixed(3)}" fill="none" stroke="${color}" stroke-width="0.3"/>`,
        `  <polygon points="${(pos[0]).toFixed(3)},${(-pos[1] - r - S * 0.3).toFixed(3)} ${(pos[0] + S * 0.25).toFixed(3)},${(-pos[1] - r + S * 0.1).toFixed(3)} ${(pos[0] - S * 0.25).toFixed(3)},${(-pos[1] - r + S * 0.1).toFixed(3)}" fill="${color}"/>`,
      ];
    }
    case 'symmetric': {
      return [
        `  <polygon points="${(pos[0] - S * 0.3).toFixed(3)},${(-pos[1] - S * 0.3).toFixed(3)} ${(pos[0]).toFixed(3)},${(-pos[1]).toFixed(3)} ${(pos[0] - S * 0.3).toFixed(3)},${(-pos[1] + S * 0.3).toFixed(3)}" fill="${color}" opacity="0.7"/>`,
        `  <polygon points="${(pos[0] + S * 0.3).toFixed(3)},${(-pos[1] - S * 0.3).toFixed(3)} ${(pos[0]).toFixed(3)},${(-pos[1]).toFixed(3)} ${(pos[0] + S * 0.3).toFixed(3)},${(-pos[1] + S * 0.3).toFixed(3)}" fill="${color}" opacity="0.7"/>`,
      ];
    }
    default:
      return [`  <text x="${x}" y="${y}" fill="${color}" font-size="1.5" font-family="sans-serif" text-anchor="middle">?</text>`];
  }
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Generate symbol SVGs ───

const symbols: { name: ConstraintSymbol; label: string; context?: string }[] = [
  { name: 'parallel', label: 'Parallel ∥', context: 'on-line' },
  { name: 'equal', label: 'Equal =', context: 'on-line' },
  { name: 'perpendicular', label: 'Perpendicular ⊥' },
  { name: 'horizontal', label: 'Horizontal H', context: 'on-line' },
  { name: 'vertical', label: 'Vertical V', context: 'on-line' },
  { name: 'fixed', label: 'Fixed ⚓' },
  { name: 'midpoint', label: 'Midpoint ◆' },
  { name: 'coincident', label: 'Coincident ⊙' },
  { name: 'collinear', label: 'Collinear ·' },
  { name: 'tangent', label: 'Tangent T' },
  { name: 'concentric', label: 'Concentric ◎' },
  { name: 'ccw', label: 'CCW ↺' },
  { name: 'symmetric', label: 'Symmetric ⟷' },
];

for (const sym of symbols) {
  // Render symbol at origin, with optional context geometry
  let contextLines = '';
  if (sym.context === 'on-line') {
    // Show a horizontal line through the symbol
    contextLines = `  <line x1="-4" y1="0" x2="4" y2="0" stroke="#555" stroke-width="0.2"/>\n`;
  }

  const symbolLines = renderSymbol([0, 0], sym.name, COLOR);
  const content = contextLines + symbolLines.join('\n');
  const svg = svgDoc('-5 -4 10 8', 300, 240, content, sym.label);
  writeFileSync(join(outDir, `${sym.name}.svg`), svg);
}

// ─── Dimension line preview ───
{
  const from: [number, number] = [-5, 0];
  const to: [number, number] = [5, 0];
  // Show a line being measured
  const line = `  <line x1="${from[0]}" y1="0" x2="${to[0]}" y2="0" stroke="#555" stroke-width="0.3"/>`;
  const dots = `  <circle cx="${from[0]}" cy="0" r="0.4" fill="#555"/><circle cx="${to[0]}" cy="0" r="0.4" fill="#555"/>`;

  // Dimension annotation
  const offset = 3;
  const dx = to[0] - from[0], dy = to[1] - from[1];
  const len = Math.hypot(dx, dy);
  const nx = -dy / len, ny = dx / len;
  const p1: [number, number] = [from[0] + nx * offset, from[1] + ny * offset];
  const p2: [number, number] = [to[0] + nx * offset, to[1] + ny * offset];
  const extLen = offset + 0.5;
  const arrowLen = Math.min(1.0, len * 0.15);
  const arrowW = arrowLen * 0.35;
  const udx = dx / len, udy = dy / len;

  const dimLines = [
    // Extension lines
    `  <line x1="${from[0]}" y1="${-(from[1] + 0.3)}" x2="${from[0]}" y2="${-(from[1] + extLen)}" stroke="${COLOR}" stroke-width="0.15" opacity="0.6"/>`,
    `  <line x1="${to[0]}" y1="${-(to[1] + 0.3)}" x2="${to[0]}" y2="${-(to[1] + extLen)}" stroke="${COLOR}" stroke-width="0.15" opacity="0.6"/>`,
    // Dimension line
    `  <line x1="${p1[0]}" y1="${-p1[1]}" x2="${p2[0]}" y2="${-p2[1]}" stroke="${COLOR}" stroke-width="0.2"/>`,
    // Arrowheads
    `  <polygon points="${p1[0]},${-p1[1]} ${p1[0] + arrowLen},${-p1[1] - arrowW} ${p1[0] + arrowLen},${-p1[1] + arrowW}" fill="${COLOR}"/>`,
    `  <polygon points="${p2[0]},${-p2[1]} ${p2[0] - arrowLen},${-p2[1] - arrowW} ${p2[0] - arrowLen},${-p2[1] + arrowW}" fill="${COLOR}"/>`,
    // Value text
    `  <text x="0" y="${-offset - 0.8}" fill="${COLOR}" font-size="1.8" font-family="sans-serif" text-anchor="middle" font-weight="bold">10</text>`,
  ];

  const content = line + '\n' + dots + '\n' + dimLines.join('\n');
  const svg = svgDoc('-8 -6 16 10', 400, 250, content, 'Dimension Line (length=10)');
  writeFileSync(join(outDir, 'dimension.svg'), svg);
}

// ─── Angle arc preview ───
{
  // Two lines from origin at 0° and 45°
  const r = 6;
  const angle = 45 * Math.PI / 180;
  const line1 = `  <line x1="0" y1="0" x2="${r}" y2="0" stroke="#555" stroke-width="0.3"/>`;
  const line2 = `  <line x1="0" y1="0" x2="${(r * Math.cos(angle)).toFixed(3)}" y2="${(-r * Math.sin(angle)).toFixed(3)}" stroke="#555" stroke-width="0.3"/>`;
  const dot = `  <circle cx="0" cy="0" r="0.4" fill="#555"/>`;

  // Angle arc
  const arcR = 3;
  const x1 = arcR;
  const y1 = 0;
  const x2 = arcR * Math.cos(angle);
  const y2 = -arcR * Math.sin(angle);

  const arcLines = [
    `  <path d="M${x1},${-y1} A${arcR},${arcR} 0 0,0 ${x2.toFixed(3)},${y2.toFixed(3)}" fill="none" stroke="${COLOR}" stroke-width="0.3"/>`,
    // Value text at arc midpoint
    `  <text x="${((arcR + 1.5) * Math.cos(angle / 2)).toFixed(3)}" y="${(-(arcR + 1.5) * Math.sin(angle / 2)).toFixed(3)}" fill="${COLOR}" font-size="1.6" font-family="sans-serif" text-anchor="middle" dominant-baseline="central">45°</text>`,
  ];

  const content = line1 + '\n' + line2 + '\n' + dot + '\n' + arcLines.join('\n');
  const svg = svgDoc('-3 -8 14 12', 400, 340, content, 'Angle Arc (45°)');
  writeFileSync(join(outDir, 'angle-arc.svg'), svg);
}

console.log(`Generated ${symbols.length + 2} symbol SVGs in ${outDir}`);
