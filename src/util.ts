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
  pdf: "application/pdf",
  zip: "application/zip",
  gz: "application/gzip",
  txt: "text/plain",
  md: "text/markdown",
  json: "application/json",
  csv: "text/csv",
};

/** Best-effort MIME from the file extension; falls back to octet-stream. */
export function guessMime(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  return (ext && MIME_BY_EXT[ext]) || "application/octet-stream";
}
