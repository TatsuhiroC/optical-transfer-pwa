// Shared helpers used by both modes.

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  bmp: "image/bmp",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  pdf: "application/pdf",
  zip: "application/zip",
  gz: "application/gzip",
  txt: "text/plain",
  md: "text/markdown",
  json: "application/json",
  csv: "text/csv",
};

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/bmp": "bmp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "application/gzip": "gz",
  "text/plain": "txt",
  "text/markdown": "md",
  "application/json": "json",
  "text/csv": "csv",
};

/** Best-effort MIME from the file extension; falls back to octet-stream. */
export function guessMime(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  return (ext && MIME_BY_EXT[ext]) || "application/octet-stream";
}

/**
 * MIME from magic bytes — the receiver's safety net. The frame protocol only
 * carries a file NAME, so if a stream has no name (legacy frames) or the name
 * lost its extension, the payload itself still tells us what it is. WAV is
 * the poster child: RIFF....WAVE.
 */
export function sniffMime(bytes: Uint8Array): string | null {
  const ascii = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) {
      if (bytes[off + i] !== s.charCodeAt(i)) return false;
    }
    return true;
  };
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(1, "PNG\r\n\x1a\n")) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 6 && (ascii(0, "GIF87a") || ascii(0, "GIF89a"))) return "image/gif";
  if (bytes.length >= 12 && ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp";
  if (bytes.length >= 12 && ascii(0, "RIFF") && ascii(8, "WAVE")) return "audio/wav";
  if (bytes.length >= 5 && ascii(0, "%PDF")) return "application/pdf";
  if (bytes.length >= 4 && ascii(0, "OggS")) return "audio/ogg";
  if (bytes.length >= 3 && ascii(0, "ID3")) return "audio/mpeg";
  if (bytes.length >= 3 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0) return "audio/mpeg";
  if (bytes.length >= 4 && ascii(0, "PK\x03\x04")) return "application/zip";
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) return "application/gzip";
  return null;
}

export function extForMime(mime: string | null): string {
  return (mime && EXT_BY_MIME[mime]) || "bin";
}

/** True when the name ends in a plausible 1-5 char extension. */
export function hasExtension(name: string): boolean {
  return /\.[a-z0-9]{1,5}$/i.test(name);
}
