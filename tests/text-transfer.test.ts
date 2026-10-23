import { expect, it } from 'vitest';
import { decodeTextPreview, MAX_TEXT_BYTES, textByteLength } from '../src/text-transfer';

it('measures UTF-8 bytes rather than JavaScript characters', () => {
  expect(textByteLength('你好👋')).toBe(10);
  expect(textByteLength('a\nb')).toBe(3);
  expect(textByteLength('\ud800')).toBe(3);
});

it('preserves whitespace, line breaks, markup and a leading BOM as literal text', () => {
  const text = '\ufeff  你好 👋\r\n<script>hello</script>\t';
  expect(decodeTextPreview(new TextEncoder().encode(text), 'text/plain')).toBe(text);
});

it('previews the exact size limit but leaves larger files and non-text downloads alone', () => {
  expect(decodeTextPreview(new Uint8Array(MAX_TEXT_BYTES).fill(65), 'text/plain')!.length).toBe(MAX_TEXT_BYTES);
  expect(decodeTextPreview(new Uint8Array(MAX_TEXT_BYTES + 1), 'text/plain')).toBeNull();
  expect(decodeTextPreview(new Uint8Array([65]), 'application/octet-stream')).toBeNull();
});
