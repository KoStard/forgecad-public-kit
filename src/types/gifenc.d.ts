declare module 'gifenc' {
  export interface GIFEncoderOptions {
    initialCapacity?: number;
    auto?: boolean;
  }

  export type GIFPaletteColor = [number, number, number] | [number, number, number, number];
  export type GIFPalette = ReadonlyArray<GIFPaletteColor>;

  export interface GIFFrameOptions {
    palette: GIFPalette;
    delay?: number;
    repeat?: number;
  }

  export interface GIFEncoderInstance {
    writeFrame(indexed: ArrayLike<number>, width: number, height: number, options: GIFFrameOptions): void;
    bytesView(): Uint8Array;
    finish(): void;
    bytes(): Uint8Array;
  }

  export function GIFEncoder(options?: GIFEncoderOptions): GIFEncoderInstance;
  export function quantize(pixels: ArrayLike<number>, maxColors: number): GIFPalette;
  export function applyPalette(pixels: ArrayLike<number>, palette: GIFPalette): Uint8Array;

  const defaultExport: typeof GIFEncoder;
  export default defaultExport;
}
