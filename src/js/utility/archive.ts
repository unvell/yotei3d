
import pako from "pako";
import { byteToString } from "./utility";

type ChunkReadyCallback = (buffer: ArrayBuffer | null) => void;

export class Archive {
  isLoading = false;
  dataLength = 0;
  loadingLength = 0;
  chunkListeners: { [uid: number]: ChunkReadyCallback[] } = {};
  cachedChunks: { [uid: number]: unknown } = {};
  chunks?: { [uid: number]: ArchiveChunk };

  onChunkReady(uid: number, callback: ChunkReadyCallback): void {
    let chunkListeners = this.chunkListeners[uid];
    if (!chunkListeners) {
      chunkListeners = [];
      this.chunkListeners[uid] = chunkListeners;
    }
    chunkListeners.push(callback);
  }

  callChunkReady(uid: number, buffer: ArrayBuffer | null): void {
    const chunkListeners = this.chunkListeners[uid];
    if (!chunkListeners) return;
    for (let i = 0; i < chunkListeners.length; i++) {
      chunkListeners[i](buffer);
    }
  }

  loadFromStream(data: ArrayBuffer): null | void {
    if (!data) return;

    const headerBuffer = new Uint32Array(data.slice(0, 32));

    if (headerBuffer[0] != 0x61626f73
      && headerBuffer[0] != 0x61626f74) return null;

    let verflags = headerBuffer[1];
    const ver = verflags & 0xffff;
    if (ver !== 0x0100) return null;

    let pos = headerBuffer[2];
    const chunkStartPos = pos;

    pos += headerBuffer[4];
    verflags = headerBuffer[5];
    const chunkCount = headerBuffer[6];

    if (chunkCount > 0x1FFFE) {
      // invalid chunk count
      return;
    }

    const archive = this;
    archive.chunks = {};

    const readChunks = function () {
      const _blockLen = 24;
      const chunkBuffer = data.slice(pos, pos + _blockLen);
      const chunkHeaderBuffer = new Uint32Array(chunkBuffer);
      const uid = chunkHeaderBuffer[0];
      const chunkOffset = chunkHeaderBuffer[2];
      const chunkLength = chunkHeaderBuffer[3];
      const offset = chunkStartPos + chunkOffset;
      const flags = chunkHeaderBuffer[4];
      const trunkFlags = flags & 0xffff;

      const index = new ArchiveChunk(uid, chunkHeaderBuffer[1], trunkFlags,
        chunkOffset, chunkLength, data.slice(offset, offset + chunkLength));

      archive.chunks![uid] = index;

      pos += _blockLen;
    };

    for (let i = 0; i < chunkCount; i++) {
      readChunks();
    }

    for (const [uid, chunk] of Object.entries(archive.chunks)) {
      archive.callChunkReady(parseInt(uid), chunk.data);
    }
  }

  getChunkData(uid: number, format?: number): ArrayBuffer | null | undefined {
    if (!this.chunks) return;

    const chunk = this.chunks[uid];
    if (!chunk) return;

    if (format) {
      if (chunk.format != format) {
        return;
      }
    }

    return chunk.data;
  }

  getChunkTextData(uid: number, format?: number): string | null {
    const data = this.getChunkData(uid, format);
    return data ? byteToString(data) : null;
  }

  static canLoadFromArchive(
    scene: any, uri: string, format: number | undefined,
    bundle: any, callback: (buffer: ArrayBuffer | null, archive: any, uid: number) => void,
  ): boolean {
    const matches = uri.match(/^(?:sob|tob):\/\/(\w+)\/(\w+)$/i);
    if (matches !== null && matches.length >= 3) {
      const bundleName = matches[1];
      const uid = parseInt(matches[2], 16);

      if (bundleName === "__this__") {
        if (!bundle) {
          console.warn("required data from invalid bundle");
          return true;
        }
        callback.call(scene, bundle.getChunkData(uid, format), bundle, uid);
      } else {
        const archive: Archive = scene._bundles[bundleName].archive;
        archive.onChunkReady(uid, function (buffer) {
          callback.call(scene, buffer, archive, uid);
        });
      }
      return true;
    }
    return false;
  }

  static createFromStream(data: ArrayBuffer): Archive {
    const archive = new Archive();
    archive.loadFromStream(data);
    return archive;
  }
}

export class ArchiveChunk {
  uid: number;
  format: number;
  flags: number;
  offset: number;
  length: number;
  buffer: ArrayBuffer | null;

  constructor(
    uid: number, format: number, flags: number,
    offset: number, length: number, buffer: ArrayBuffer | null,
  ) {
    this.uid = uid;
    this.format = format;
    this.flags = flags;
    this.offset = offset;
    this.length = length;
    this.buffer = buffer;
  }

  get data(): ArrayBuffer | null {
    if (!this.buffer) return null;

    if (this.flags & 0x1) {
      return pako.inflate(new Uint8Array(this.buffer)).buffer as ArrayBuffer;
    } else {
      return this.buffer;
    }
  }
}
