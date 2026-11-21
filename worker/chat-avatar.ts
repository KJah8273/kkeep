/**
 * A portable PNG normalizer for avatars and profile banners prepared by the client.
 * It validates the complete raster, bounds decompression and discards all
 * ancillary chunks, including text, EXIF and colour profiles. No image-service
 * binding is required and uploaded bytes are never served unchanged.
 */
const SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_INPUT = 2 * 1024 * 1024;
const CRC_TABLE = Uint32Array.from({length: 256}, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
function invalid(): never {throw new Error('Choose a PNG, JPEG or WebP photo and crop it again.');}
function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {bytes.set(part, offset); offset += part.length;}
  return bytes;
}
function chunk(kind: string, payload: Uint8Array): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(payload.length + 12), view = new DataView(bytes.buffer);
  view.setUint32(0, payload.length);
  bytes.set(new TextEncoder().encode(kind), 4);
  bytes.set(payload, 8);
  view.setUint32(bytes.length - 4, crc(bytes.subarray(4, bytes.length - 4)));
  return bytes;
}
async function collect(stream: ReadableStream<Uint8Array>, max: number): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader(), parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > max) {await reader.cancel(); return invalid();}
      parts.push(next.value);
    }
  } catch {return invalid();}
  finally {reader.releaseLock();}
  return concat(parts);
}

export async function normalizeChatAvatar(bytes: Uint8Array<ArrayBuffer>, contentType: string, mediaKind: 'avatar' | 'banner' = 'avatar'): Promise<{bytes: Uint8Array<ArrayBuffer>; type: 'image/png'; width: number; height: number}> {
  if (contentType.split(';', 1)[0].trim().toLowerCase() !== 'image/png' || bytes.length < 45 || bytes.length > MAX_INPUT || !SIGNATURE.every((value, index) => bytes[index] === value)) return invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), idat: Uint8Array[] = [];
  let offset = 8, header: Uint8Array | undefined, width = 0, height = 0, channels = 0;
  let sawData = false, closedData = false, ended = false, palette = false, count = 0;
  while (offset + 12 <= bytes.length) {
    if (++count > 2048) return invalid();
    const length = view.getUint32(offset), end = offset + 12 + length;
    if (length > MAX_INPUT || end > bytes.length) return invalid();
    const kind = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (!/^[A-Za-z]{2}[A-Z][A-Za-z]$/.test(kind) || crc(bytes.subarray(offset + 4, end - 4)) !== view.getUint32(end - 4)) return invalid();
    const payload = bytes.subarray(offset + 8, end - 4);
    if (!header && kind !== 'IHDR') return invalid();
    if (kind === 'IHDR') {
      if (header || offset !== 8 || length !== 13) return invalid();
      width = view.getUint32(offset + 8); height = view.getUint32(offset + 12);
      if (width < 32 || height < 32 || width > (mediaKind === 'banner' ? 1024 : 512) || height > 512 || payload[8] !== 8 || ![2, 6].includes(payload[9]) || payload[10] || payload[11] || payload[12]) return invalid();
      channels = payload[9] === 6 ? 4 : 3;
      header = payload;
    } else if (kind === 'IDAT') {
      if (closedData) return invalid();
      sawData = true; idat.push(payload);
    } else if (kind === 'IEND') {
      if (!sawData || length || end !== bytes.length) return invalid();
      ended = true; offset = end; break;
    } else {
      if (sawData) closedData = true;
      if (kind === 'PLTE') {
        if (palette || sawData || !length || length > 768 || length % 3) return invalid();
        palette = true;
      } else if (kind === 'acTL' || kind === 'fcTL' || kind === 'fdAT' || kind[0] === kind[0].toUpperCase()) return invalid();
      // Every ancillary chunk is deliberately omitted from the stored image.
    }
    offset = end;
  }
  if (!ended || !header || offset !== bytes.length) return invalid();
  const stride = width * channels + 1, expected = height * stride, compressed = concat(idat);
  if (!compressed.length) return invalid();
  const pixels = await collect(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate')), expected);
  if (pixels.length !== expected) return invalid();
  for (let row = 0; row < height; row++) if (pixels[row * stride] > 4) return invalid();
  const normalized = await collect(new Blob([pixels]).stream().pipeThrough(new CompressionStream('deflate')), MAX_INPUT + 65536);
  return {bytes: concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', normalized), chunk('IEND', new Uint8Array())]), type: 'image/png', width, height};
}
