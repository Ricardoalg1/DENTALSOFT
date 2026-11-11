declare module "jpeg-lossless-decoder-js" {
  /** Decodificador JPEG sin pérdida (sintaxis DICOM 1.2.840.10008.1.2.4.57 y .70). */
  export class Decoder {
    constructor(buffer?: ArrayBuffer, numBytes?: number);
    /** Devuelve cols × filas × bytes por componente × componentes. */
    decompress(buffer: ArrayBuffer, offset?: number, length?: number): ArrayBuffer;
  }
}
