// Minimal ambient declarations for pako (the package ships no .d.ts).
// Covers the deflate/inflate surface the engine uses.
declare module 'pako' {
  type Data = Uint8Array | ArrayBuffer | number[];

  export function inflate(data: Data, options?: object): Uint8Array;
  export function inflateRaw(data: Data, options?: object): Uint8Array;
  export function deflate(data: Data | string, options?: object): Uint8Array;
  export function deflateRaw(data: Data | string, options?: object): Uint8Array;
  export function ungzip(data: Data, options?: object): Uint8Array;
  export function gzip(data: Data | string, options?: object): Uint8Array;

  const pako: {
    inflate: typeof inflate;
    inflateRaw: typeof inflateRaw;
    deflate: typeof deflate;
    deflateRaw: typeof deflateRaw;
    ungzip: typeof ungzip;
    gzip: typeof gzip;
  };
  export default pako;
}
