// Frame protocol: every QR frame is fully self-describing, so there is NO
// handshake — the receiver locks onto a stream mid-flight, and a new session
// id on any frame simply starts a fresh transfer.
//
// Layout (little-endian), 20-byte header, followed by an OPTIONAL fixed-size
// name field, followed by `blockLen` payload bytes:
//   0  u8   magic 0xD1
//   1  u8   magic 0x0C
//   2  u16  sessionId   random per sender start
//   4  u32  seq         drives the fountain PRNG (see fountain.ts)
//   8  u16  k           source block count
//  10  u16  blockLen    payload bytes per frame
//  12  u32  totalLen    file length in bytes
//  16  u32  payloadFnv  FNV-1a of the whole file — verified on completion
//  20  u8   nameLen     length of the file name (0 = legacy frame, no name)
//  21  ...  name        UTF-8 file name, zero-padded to NAME_FIELD_LEN bytes
//        blockLen payload bytes follow the name field
//
// Why the name rides in EVERY frame: fountain frames arrive in any order and
// the transfer can complete without ever seeing seq 0, so a name carried in
// a single "first" frame would sometimes be missing. The fixed-size field
// keeps every frame byte-identical in length, which keeps the QR version
// locked. Legacy frames (20 + blockLen bytes, no name) still parse fine.

export const HEADER_LEN = 20;
/** Fixed name field size in bytes (nameLen byte + NAME_FIELD_LEN name bytes). */
export const NAME_FIELD_LEN = 64;
/** Hard cap on the UTF-8 name that fits in the fixed field. */
export const NAME_MAX = NAME_FIELD_LEN - 1;
const MAGIC0 = 0xd1;
const MAGIC1 = 0x0c;

export interface FrameHeader {
  sessionId: number;
  seq: number;
  k: number;
  blockLen: number;
  totalLen: number;
  payloadFnv: number;
}

export function packFrame(h: FrameHeader, block: Uint8Array, name?: string): Uint8Array {
  const enc = name ? new TextEncoder().encode(name).subarray(0, NAME_MAX) : null;
  const nameLen = enc ? enc.length : 0;
  const out = new Uint8Array(HEADER_LEN + 1 + NAME_FIELD_LEN + block.length);
  const dv = new DataView(out.buffer);
  dv.setUint8(0, MAGIC0);
  dv.setUint8(1, MAGIC1);
  dv.setUint16(2, h.sessionId, true);
  dv.setUint32(4, h.seq, true);
  dv.setUint16(8, h.k, true);
  dv.setUint16(10, h.blockLen, true);
  dv.setUint32(12, h.totalLen, true);
  dv.setUint32(16, h.payloadFnv, true);
  dv.setUint8(20, nameLen);
  if (enc) out.set(enc, HEADER_LEN + 1);
  out.set(block, HEADER_LEN + 1 + NAME_FIELD_LEN);
  return out;
}

export function parseFrame(
  bytes: Uint8Array,
): { header: FrameHeader; block: Uint8Array; name: string } | null {
  if (bytes.length <= HEADER_LEN) return null;
  if (bytes[0] !== MAGIC0 || bytes[1] !== MAGIC1) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header: FrameHeader = {
    sessionId: dv.getUint16(2, true),
    seq: dv.getUint32(4, true),
    k: dv.getUint16(8, true),
    blockLen: dv.getUint16(10, true),
    totalLen: dv.getUint32(12, true),
    payloadFnv: dv.getUint32(16, true),
  };
  if (header.k === 0 || header.blockLen === 0 || header.totalLen === 0) return null;
  let name = "";
  if (bytes.length === HEADER_LEN + header.blockLen) {
    // legacy frame — no name field
  } else {
    const nameLen = bytes[HEADER_LEN]!;
    if (nameLen > NAME_MAX) return null;
    if (bytes.length !== HEADER_LEN + 1 + NAME_FIELD_LEN + header.blockLen) return null;
    if (nameLen > 0) {
      name = new TextDecoder().decode(bytes.subarray(HEADER_LEN + 1, HEADER_LEN + 1 + nameLen));
    }
  }
  return { header, block: bytes.subarray(bytes.length - header.blockLen), name };
}

export function fnv1a(bytes: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** splitmix32 — deterministic across JS engines (integer ops only). */
export function splitmix32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x9e3779b9) | 0;
    let t = s ^ (s >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    t ^= t >>> 15;
    return t >>> 0;
  };
}
