/**
 * Validate a bounded GIF raster stream and retain its animation while removing
 * comments, application metadata and trailing bytes. The LZW validator tracks
 * dictionary lengths instead of allocating every decompressed animation frame.
 * Format reference: https://www.w3.org/Graphics/GIF/spec-gif89a.txt
 */
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_FRAMES = 240;
const MAX_FRAME_PIXELS = 80_000_000;
const MAX_CANVAS_PIXELS = 120_000_000;
const MAX_SUBBLOCKS = 65_536;
function invalid(message = 'This GIF could not be opened. Choose another GIF.'): never {throw new Error(message);}
function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {bytes.set(part, offset); offset += part.length;}
  return bytes;
}
function blocks(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const parts: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += 255) {
    const part = bytes.subarray(i, i + 255); parts.push(new Uint8Array([part.length]), part);
  }
  parts.push(new Uint8Array([0]));
  return concat(parts);
}

/** Check every code, decoded pixel count and palette index without expanding it. */
function validateLzw(bytes: Uint8Array, minSize: number, pixels: number, palette: number): Uint8Array<ArrayBuffer> {
  if (minSize < 2 || minSize > 8 || !bytes.length) return invalid();
  const clear = 1 << minSize, end = clear + 1, lengths = new Uint16Array(4096);
  lengths.fill(1, 0, clear);
  let size = minSize + 1, available = end + 1, previous = -1, bit = 0, count = 0;
  while (bit + size <= bytes.length * 8) {
    const offset = bit >>> 3;
    const code = ((bytes[offset] | ((bytes[offset + 1] || 0) << 8) | ((bytes[offset + 2] || 0) << 16)) >>> (bit & 7)) & ((1 << size) - 1);
    bit += size;
    if (code === clear) {size = minSize + 1; available = end + 1; previous = -1; continue;}
    if (code === end) {
      if (count !== pixels) return invalid();
      const clean = new Uint8Array(bytes.subarray(0, Math.ceil(bit / 8)));
      if (bit & 7) clean[clean.length - 1] &= (1 << (bit & 7)) - 1;
      return clean;
    }
    if (code > available || code >= 4096 || (code === available && previous < 0) || (previous < 0 && code >= clear) || (code < clear && code >= palette)) return invalid();
    const length = code === available ? lengths[previous] + 1 : lengths[code];
    if (!length || (count += length) > pixels) return invalid();
    if (previous >= 0 && available < 4096) {
      lengths[available++] = lengths[previous] + 1;
      if (available === (1 << size) && size < 12) size++;
    }
    previous = code;
  }
  return invalid();
}

export function normalizeChatGif(bytes: Uint8Array<ArrayBuffer>, kind: 'avatar' | 'banner'): {bytes: Uint8Array<ArrayBuffer>; type: 'image/gif'; width: number; height: number; frames: number} {
  if (bytes.length < 14 || bytes.length > MAX_BYTES || !/^GIF8[79]a$/.test(String.fromCharCode(...bytes.subarray(0, 6)))) return invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint16(6, true), height = view.getUint16(8, true);
  if (width < 32 || height < 32 || width > 2048 || height > (kind === 'banner' ? 1024 : 2048) || width * height > 2_100_000) return invalid('Choose a smaller GIF, up to 2048 pixels wide and 2 megapixels per frame.');
  let offset = 13, frames = 0, totalPixels = 0, blockCount = 0, pendingControl: Uint8Array | undefined, loop: number | undefined;
  const globalPalette = bytes[10] & 128 ? 2 << (bytes[10] & 7) : 0;
  if (offset + globalPalette * 3 > bytes.length || (globalPalette && bytes[11] >= globalPalette)) return invalid();
  const screen = new Uint8Array(bytes.subarray(6, 13)); screen[6] = 0;
  const parts: Uint8Array[] = [new TextEncoder().encode('GIF89a'), screen, bytes.subarray(offset, offset + globalPalette * 3)];
  offset += globalPalette * 3;
  function subBlocks(): Uint8Array<ArrayBuffer> {
    const chunks: Uint8Array[] = [];
    for (;;) {
      if (++blockCount > MAX_SUBBLOCKS || offset >= bytes.length) return invalid();
      const length = bytes[offset++];
      if (!length) return concat(chunks);
      if (offset + length > bytes.length) return invalid();
      chunks.push(bytes.subarray(offset, offset + length)); offset += length;
    }
  }
  while (offset < bytes.length) {
    const marker = bytes[offset++];
    if (marker === 0x3b) {
      if (!frames || pendingControl) return invalid();
      parts.push(new Uint8Array([0x3b]));
      return {bytes: concat(parts), type: 'image/gif', width, height, frames};
    }
    if (marker === 0x21) {
      if (offset >= bytes.length) return invalid();
      const label = bytes[offset++];
      if (label === 0xf9) {
        if (pendingControl || offset + 6 > bytes.length || bytes[offset] !== 4 || bytes[offset + 5] !== 0) return invalid();
        const data = new Uint8Array(bytes.subarray(offset + 1, offset + 5));
        if ((data[0] & 0xe0) || ((data[0] >>> 2) & 7) > 3) return invalid();
        data[0] &= ~2; // A profile image must never wait for interactive input.
        pendingControl = data; offset += 6;
      } else if (label === 0xff) {
        if (offset + 12 > bytes.length || bytes[offset++] !== 11) return invalid();
        const name = String.fromCharCode(...bytes.subarray(offset, offset + 11)); offset += 11;
        const data = subBlocks();
        if (name === 'NETSCAPE2.0' || name === 'ANIMEXTS1.0') {
          if (data.length !== 3 || data[0] !== 1) return invalid();
          const value = data[1] | (data[2] << 8);
          if (loop === undefined) {
            loop = value;
            parts.push(new Uint8Array([0x21, 0xff, 11]), new TextEncoder().encode('NETSCAPE2.0'), new Uint8Array([3, 1, data[1], data[2], 0]));
          }
        }
      } else if (label === 0xfe) subBlocks();
      else return invalid();
      continue;
    }
    if (marker !== 0x2c || offset + 9 > bytes.length) return invalid();
    const descriptor = bytes.subarray(offset, offset + 9), left = view.getUint16(offset, true), top = view.getUint16(offset + 2, true);
    const frameWidth = view.getUint16(offset + 4, true), frameHeight = view.getUint16(offset + 6, true), packed = bytes[offset + 8];
    offset += 9;
    if (!frameWidth || !frameHeight || left + frameWidth > width || top + frameHeight > height || (packed & 0x18)) return invalid();
    if (++frames > MAX_FRAMES || (totalPixels += frameWidth * frameHeight) > MAX_FRAME_PIXELS || frames * width * height > MAX_CANVAS_PIXELS) return invalid('Choose a shorter or smaller GIF, up to 240 frames.');
    const localPalette = packed & 128 ? 2 << (packed & 7) : 0, palette = localPalette || globalPalette;
    if (!palette || offset + localPalette * 3 >= bytes.length || (pendingControl && (pendingControl[0] & 1) && pendingControl[3] >= palette)) return invalid();
    const table = bytes.subarray(offset, offset + localPalette * 3); offset += localPalette * 3;
    const minSize = bytes[offset++], compressed = subBlocks(), raster = validateLzw(compressed, minSize, frameWidth * frameHeight, palette);
    if (pendingControl) {parts.push(new Uint8Array([0x21, 0xf9, 4]), pendingControl, new Uint8Array([0])); pendingControl = undefined;}
    parts.push(new Uint8Array([0x2c]), descriptor, table, new Uint8Array([minSize]), blocks(raster));
  }
  return invalid();
}
