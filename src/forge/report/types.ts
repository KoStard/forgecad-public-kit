/**
 * Public types for the report module.
 */

export type ReportViewId = 'front' | 'right' | 'top' | 'iso';

export interface ReportObjectVisual {
  visible?: boolean;
  color?: string;
  opacity?: number;
}

export interface ReportOptions {
  title?: string;
  views?: ReportViewId[];
  includeDisassembled?: boolean;
  objectVisuals?: Record<string, ReportObjectVisual>;
  /**
   * Max angular difference (degrees) from nearest projected view axis
   * for a dimension to be included in that view.
   */
  dimensionDirectionToleranceDeg?: number;
  generatedAt?: Date;
  lengthUnit?: import('../units').LengthUnit;
}

export interface ReportGenerationResult {
  pdf: Uint8Array<ArrayBuffer>;
  pageCount: number;
  componentCount: number;
  viewCount: number;
  bomItemCount: number;
}
