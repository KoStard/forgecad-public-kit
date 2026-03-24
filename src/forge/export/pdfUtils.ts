/**
 * Shared PDF generation utilities.
 *
 * Extracted from report.ts so that cuttingLayout.ts can reuse the same
 * PdfBuilder class and drawing primitives.
 */

export type ColorRgb = [number, number, number];
export type Vec2 = [number, number];

const encoder = new TextEncoder();

export function byteLength(text: string): number {
  return encoder.encode(text).length;
}

export function formatNumber(v: number): string {
  if (!Number.isFinite(v)) return '0';
  const s = v.toFixed(3);
  return s.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

export function escapePdfText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

export function commandSetFill(color: ColorRgb): string {
  return `${formatNumber(color[0])} ${formatNumber(color[1])} ${formatNumber(color[2])} rg\n`;
}

export function commandSetStroke(color: ColorRgb): string {
  return `${formatNumber(color[0])} ${formatNumber(color[1])} ${formatNumber(color[2])} RG\n`;
}

export function commandText(text: string, x: number, y: number, size: number): string {
  return `BT /F1 ${formatNumber(size)} Tf 1 0 0 1 ${formatNumber(x)} ${formatNumber(y)} Tm (${escapePdfText(text)}) Tj ET\n`;
}

export function commandLine(a: Vec2, b: Vec2): string {
  return `${formatNumber(a[0])} ${formatNumber(a[1])} m ${formatNumber(b[0])} ${formatNumber(b[1])} l S\n`;
}

export function commandRect(x: number, y: number, w: number, h: number): string {
  return `${formatNumber(x)} ${formatNumber(y)} ${formatNumber(w)} ${formatNumber(h)} re`;
}

export function estimateTextWidth(text: string, fontSize: number): number {
  return Math.max(8, text.length * fontSize * 0.52);
}

export function truncateToWidth(text: string, maxWidth: number, fontSize: number): string {
  if (estimateTextWidth(text, fontSize) <= maxWidth) return text;
  const safeWidth = Math.max(4, maxWidth);
  const perChar = Math.max(1, fontSize * 0.52);
  const maxChars = Math.max(3, Math.floor(safeWidth / perChar));
  if (maxChars <= 3) return '...';
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 3)}...`;
}

/** A4 landscape page dimensions in PDF points. */
export const PAGE_WIDTH = 842;
export const PAGE_HEIGHT = 595;
export const PAGE_MARGIN = 36;

export class PdfBuilder {
  private objects: string[] = [];

  addObject(content: string): number {
    this.objects.push(content);
    return this.objects.length;
  }

  addStreamObject(dictBody: string, streamContent: string): number {
    const data = streamContent.endsWith('\n') ? streamContent : `${streamContent}\n`;
    const length = byteLength(data);
    return this.addObject(`<< ${dictBody} /Length ${length} >>\nstream\n${data}endstream`);
  }

  build(rootId: number): Uint8Array {
    const parts: string[] = [];
    const offsets: number[] = [0];
    let cursor = 0;

    const push = (chunk: string) => {
      parts.push(chunk);
      cursor += byteLength(chunk);
    };

    push('%PDF-1.4\n%\u00a0\u00a1\u00a2\u00a3\n');

    for (let i = 0; i < this.objects.length; i += 1) {
      offsets.push(cursor);
      push(`${i + 1} 0 obj\n${this.objects[i]}\nendobj\n`);
    }

    const xrefPos = cursor;
    push(`xref\n0 ${this.objects.length + 1}\n`);
    push('0000000000 65535 f \n');
    for (let i = 1; i <= this.objects.length; i += 1) {
      push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
    }

    push(`trailer\n<< /Size ${this.objects.length + 1} /Root ${rootId} 0 R >>\n`);
    push(`startxref\n${xrefPos}\n%%EOF\n`);

    return encoder.encode(parts.join(''));
  }
}
