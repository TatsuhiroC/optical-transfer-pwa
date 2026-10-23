// Text uses the existing file protocol, so older receivers can save it as .txt.
export const MAX_TEXT_BYTES = 4 * 1024 * 1024;
export const TEXT_FILE_NAME = "message.txt";

/** UTF-8 size, including multibyte characters, without allocating a byte array. */
export function textByteLength(text: string): number {
  return new Blob([text]).size;
}

/** Only preview bounded, valid UTF-8 plaintext; never interpret received markup. */
export function decodeTextPreview(payload: Uint8Array, mime: string): string | null {
  if (mime !== "text/plain" || payload.length > MAX_TEXT_BYTES) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(payload);
  } catch {
    return null;
  }
}
