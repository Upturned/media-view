/**
 * BMP and ICO decoding for thumbnails (technical doc §9): `sharp` reads neither, browsers show both.
 * Decodes to raw RGBA; an icon's PNG images are handed back as they are.
 */

export interface Raw {
  width: number;
  height: number;
  /** RGBA, top row first. */
  data: Buffer;
}

const BI_RGB = 0;
const BI_RLE8 = 1;
const BI_RLE4 = 2;
const BI_BITFIELDS = 3;
const BI_ALPHABITFIELDS = 6;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A `.bmp` file: the "BM" header, then the bitmap. */
export function decodeBmp(buf: Buffer): Raw {
  if (buf.length < 26 || buf.toString('latin1', 0, 2) !== 'BM') throw new Error('not a BMP');
  return decodeDib(buf, 14, buf.readUInt32LE(10), false);
}

/** A `.ico` / `.cur` file: its largest image, as RGBA or as the PNG it holds. */
export function decodeIco(buf: Buffer): Raw | { png: Buffer } {
  if (buf.length < 6 || buf.readUInt16LE(0) !== 0 || ![1, 2].includes(buf.readUInt16LE(2))) throw new Error('not an icon');
  const count = buf.readUInt16LE(4);
  let best: { w: number; bpp: number; size: number; offset: number } | null = null;
  for (let i = 0; i < count; i++) {
    const e = 6 + i * 16;
    if (e + 16 > buf.length) break;
    const entry = { w: buf.readUInt8(e) || 256, bpp: buf.readUInt16LE(e + 6), size: buf.readUInt32LE(e + 8), offset: buf.readUInt32LE(e + 12) };
    if (entry.offset + entry.size > buf.length) continue;
    if (!best || entry.w > best.w || (entry.w === best.w && entry.bpp > best.bpp)) best = entry;
  }
  if (!best) throw new Error('empty icon');
  const data = buf.subarray(best.offset, best.offset + best.size);
  if (data.subarray(0, 8).equals(PNG_SIGNATURE)) return { png: data };
  return decodeDib(data, 0, null, true);
}

/**
 * A device-independent bitmap: the header at `at`, the pixels at `pixels` (null: right after the
 * palette, as in an icon). An icon's height counts its AND mask too, which holds the transparency.
 */
function decodeDib(buf: Buffer, at: number, pixels: number | null, icon: boolean): Raw {
  const headerSize = buf.readUInt32LE(at);
  const core = headerSize === 12;
  const width = core ? buf.readUInt16LE(at + 4) : buf.readInt32LE(at + 4);
  let height = core ? buf.readInt16LE(at + 6) : buf.readInt32LE(at + 8);
  const bpp = buf.readUInt16LE(at + (core ? 10 : 14));
  const compression = core ? BI_RGB : buf.readUInt32LE(at + 16);
  if (icon) height = height / 2;
  const topDown = height < 0;
  height = Math.abs(height);
  if (width <= 0 || height <= 0 || width > 32768 || height > 32768) throw new Error('bad size');

  // Channel masks: in the header from v2 on, or right after a 40-byte header.
  let masks: number[] | null = null;
  let after = at + headerSize;
  if (compression === BI_BITFIELDS || compression === BI_ALPHABITFIELDS) {
    const n = compression === BI_ALPHABITFIELDS ? 4 : 3;
    const from = headerSize >= 52 ? at + 40 : after;
    masks = [0, 1, 2, 3].map((k) => (k < n || headerSize >= 56 ? buf.readUInt32LE(from + k * 4) : 0));
    if (headerSize < 52) after += n * 4;
  } else if (bpp === 16) masks = [0x7c00, 0x03e0, 0x001f, 0];

  const entry = core ? 3 : 4;
  const colors = bpp <= 8 ? (core ? 0 : buf.readUInt32LE(at + 32)) || 1 << bpp : 0;
  const palette: [number, number, number][] = [];
  for (let i = 0; i < colors && after + i * entry + 3 <= buf.length; i++) {
    const p = after + i * entry;
    palette.push([buf.readUInt8(p + 2), buf.readUInt8(p + 1), buf.readUInt8(p)]);
  }
  const start = pixels ?? after + colors * entry;

  const out = Buffer.alloc(width * height * 4);
  const put = (x: number, y: number, r: number, g: number, b: number, a = 255) => {
    if (x >= width || y >= height) return;
    const row = topDown ? y : height - 1 - y;
    const o = (row * width + x) * 4;
    out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a;
  };
  const indexed = (x: number, y: number, i: number) => {
    const c = palette[i] ?? [0, 0, 0];
    put(x, y, c[0], c[1], c[2]);
  };

  if (compression === BI_RLE8 || compression === BI_RLE4) {
    rle(buf, start, compression === BI_RLE4, width, height, indexed); // pixels it skips stay transparent
  } else {
    if (![1, 2, 4, 8, 16, 24, 32].includes(bpp)) throw new Error(`unsupported depth ${bpp}`);
    const stride = Math.floor((bpp * width + 31) / 32) * 4;
    if (start + stride * height > buf.length) throw new Error('truncated');
    const channel = (v: number, mask: number) => {
      if (!mask) return null;
      const low = mask & -mask;
      return Math.round(((v & mask) >>> 0) / low / (mask / low) * 255);
    };
    let anyAlpha = false;
    for (let y = 0; y < height; y++) {
      const row = start + y * stride;
      for (let x = 0; x < width; x++) {
        if (bpp <= 8) {
          const bit = x * bpp;
          const byte = buf.readUInt8(row + (bit >> 3));
          indexed(x, y, (byte >> (8 - bpp - (bit & 7))) & ((1 << bpp) - 1));
        } else if (bpp === 24 || (bpp === 32 && !masks)) {
          const p = row + x * (bpp / 8);
          const a = bpp === 32 ? buf.readUInt8(p + 3) : 255;
          if (bpp === 32 && a) anyAlpha = true;
          put(x, y, buf.readUInt8(p + 2), buf.readUInt8(p + 1), buf.readUInt8(p), a);
        } else {
          const v = bpp === 16 ? buf.readUInt16LE(row + x * 2) : buf.readUInt32LE(row + x * 4);
          const [mr = 0, mg = 0, mb = 0, ma = 0] = masks!;
          const a = channel(v, ma);
          if (a) anyAlpha = true;
          put(x, y, channel(v, mr) ?? 0, channel(v, mg) ?? 0, channel(v, mb) ?? 0, a ?? 255);
        }
      }
    }
    // 32-bit bitmaps often leave the fourth byte at 0: then it isn't transparency.
    if (bpp === 32 && !anyAlpha) for (let i = 3; i < out.length; i += 4) out[i] = 255;

    // An icon's AND mask: one bit per pixel, set = transparent (32-bit icons use their alpha).
    if (icon && (bpp < 32 || !anyAlpha)) {
      const maskStride = Math.floor((width + 31) / 32) * 4;
      const maskStart = start + stride * height;
      if (maskStart + maskStride * height <= buf.length) {
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            if ((buf.readUInt8(maskStart + y * maskStride + (x >> 3)) >> (7 - (x & 7))) & 1) {
              out[((topDown ? y : height - 1 - y) * width + x) * 4 + 3] = 0;
            }
          }
        }
      }
    }
  }
  return { width, height, data: out };
}

/** Run-length encoded 4- and 8-bit pixels, bottom row first. */
function rle(buf: Buffer, at: number, four: boolean, width: number, height: number, set: (x: number, y: number, i: number) => void): void {
  let x = 0;
  let y = 0;
  let p = at;
  while (p + 1 < buf.length && y < height) {
    const n = buf.readUInt8(p++);
    const v = buf.readUInt8(p++);
    if (n > 0) {
      for (let k = 0; k < n; k++) set(x++, y, four ? (k % 2 ? v & 15 : v >> 4) : v);
    } else if (v === 0) { x = 0; y++; } // end of line
    else if (v === 1) return; // end of bitmap
    else if (v === 2) { x += buf.readUInt8(p++); y += buf.readUInt8(p++); } // delta
    else {
      // absolute run of v pixels, padded to a word
      const bytes = four ? Math.ceil(v / 2) : v;
      for (let k = 0; k < v; k++) set(x++, y, four ? (k % 2 ? buf.readUInt8(p + (k >> 1)) & 15 : buf.readUInt8(p + (k >> 1)) >> 4) : buf.readUInt8(p + k));
      p += bytes + (bytes % 2);
    }
    if (x > width) x = width;
  }
}
