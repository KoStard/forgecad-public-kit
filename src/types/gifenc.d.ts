declare module 'gifenc' {
  export interface GIFFrameOptions {
    palette: ArrayLike<number>;
    delay?: number;
    repeat?: number;
  }

  export interface GIFEncoderInstance {
    writeFrame(
      indexed: ArrayLike<number>,
      width: number,
      height: number,
      options: GIFFrameOptions,
    ): void;
    finish(): void;
    bytes(): Uint8Array;
  }

  export interface GifencModule {
    GIFEncoder(): GIFEncoderInstance;
    quantize(pixels: ArrayLike<number>, maxColors: number): Uint8Array;
    applyPalette(pixels: ArrayLike<number>, palette: ArrayLike<number>): Uint8Array;
  }

  const gifenc: GifencModule;
  export default gifenc;
}
