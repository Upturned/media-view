import { describe, expect, it } from 'vitest';
import { decodeBmp, decodeIco, type Raw } from '../src/lib/bitmap.ts';

/** A BMP file around a 40-byte info header, with a palette, extra header bytes (masks) and pixel rows. */
function bmp(o: { w: number; h: number; bpp: number; compression?: number; palette?: [number, number, number][]; extra?: Buffer; pixels: Buffer }): Buffer {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(o.w, 4);
  header.writeInt32LE(o.h, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(o.bpp, 14);
  header.writeUInt32LE(o.compression ?? 0, 16);
  header.writeUInt32LE(o.palette?.length ?? 0, 32);
  const palette = Buffer.from((o.palette ?? []).flatMap(([r, g, b]) => [b, g, r, 0]));
  const extra = o.extra ?? Buffer.alloc(0);
  const offset = 14 + 40 + extra.length + palette.length;
  const file = Buffer.alloc(14);
  file.write('BM', 0, 'latin1');
  file.writeUInt32LE(offset + o.pixels.length, 2);
  file.writeUInt32LE(offset, 10);
  return Buffer.concat([file, header, extra, palette, o.pixels]);
}

const px = (r: Raw, x: number, y: number) => [...r.data.subarray((y * r.width + x) * 4, (y * r.width + x) * 4 + 4)];

describe('BMP and ICO decoding', () => {
  it('reads 24-bit rows bottom-up, padded to 4 bytes', () => {
    // 1×2: bottom row blue, top row red (3 bytes + 1 padding each)
    const r = decodeBmp(bmp({ w: 1, h: 2, bpp: 24, pixels: Buffer.from([255, 0, 0, 0, 0, 0, 255, 0]) }));
    expect([r.width, r.height]).toEqual([1, 2]);
    expect(px(r, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(px(r, 0, 1)).toEqual([0, 0, 255, 255]);
  });

  it('reads a top-down 8-bit paletted bitmap', () => {
    const r = decodeBmp(bmp({ w: 2, h: -1, bpp: 8, palette: [[10, 20, 30], [200, 100, 50]], pixels: Buffer.from([1, 0, 0, 0]) }));
    expect(px(r, 0, 0)).toEqual([200, 100, 50, 255]);
    expect(px(r, 1, 0)).toEqual([10, 20, 30, 255]);
  });

  it('treats a 32-bit bitmap whose fourth byte is always 0 as opaque', () => {
    const r = decodeBmp(bmp({ w: 1, h: 1, bpp: 32, pixels: Buffer.from([0, 255, 0, 0]) }));
    expect(px(r, 0, 0)).toEqual([0, 255, 0, 255]);
  });

  it('reads 16-bit 5-6-5 bitfields', () => {
    const masks = Buffer.alloc(12);
    masks.writeUInt32LE(0xf800, 0);
    masks.writeUInt32LE(0x07e0, 4);
    masks.writeUInt32LE(0x001f, 8);
    const pixels = Buffer.alloc(4);
    pixels.writeUInt16LE(0xf800 | 0x001f, 0); // magenta
    const r = decodeBmp(bmp({ w: 1, h: 1, bpp: 16, compression: 3, extra: masks, pixels }));
    expect(px(r, 0, 0)).toEqual([255, 0, 255, 255]);
  });

  it('decodes 8-bit run-length encoding; skipped pixels stay transparent', () => {
    // row 0 (bottom): 3 × colour 1; end of line; row 1: delta (+1, +0), 1 × colour 0; end of bitmap
    const pixels = Buffer.from([3, 1, 0, 0, 0, 2, 1, 0, 1, 0, 0, 1]);
    const r = decodeBmp(bmp({ w: 3, h: 2, bpp: 8, compression: 1, palette: [[1, 2, 3], [9, 9, 9]], pixels }));
    expect(px(r, 2, 1)).toEqual([9, 9, 9, 255]);
    expect(px(r, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(px(r, 1, 0)).toEqual([1, 2, 3, 255]);
  });

  it('picks an icon’s largest image and applies its transparency mask', () => {
    // a 1×1 and a 2×1 4-bit image; the 2×1 one masks out its second pixel
    const dib = (w: number, pixels: number[], mask: number) => {
      const h = Buffer.alloc(40);
      h.writeUInt32LE(40, 0);
      h.writeInt32LE(w, 4);
      h.writeInt32LE(2, 8); // height × 2: colours + mask
      h.writeUInt16LE(1, 12);
      h.writeUInt16LE(4, 14);
      const palette = Buffer.alloc(16 * 4);
      palette.writeUInt32LE(0x00ff0000, 4); // index 1 = red (BGR0)
      return Buffer.concat([h, palette, Buffer.from([...pixels, 0, 0, 0]), Buffer.from([mask, 0, 0, 0])]);
    };
    const small = dib(1, [0x10], 0);
    const big = dib(2, [0x11], 0b01000000);
    const dir = Buffer.alloc(6 + 32);
    dir.writeUInt16LE(1, 2);
    dir.writeUInt16LE(2, 4);
    [[1, small, 38], [2, big, 38 + small.length]].forEach(([w, data, offset], i) => {
      const e = 6 + i * 16;
      dir[e] = w as number;
      dir.writeUInt16LE(4, e + 6);
      dir.writeUInt32LE((data as Buffer).length, e + 8);
      dir.writeUInt32LE(offset as number, e + 12);
    });
    const r = decodeIco(Buffer.concat([dir, small, big])) as Raw;
    expect([r.width, r.height]).toEqual([2, 1]);
    expect(px(r, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(px(r, 1, 0)[3]).toBe(0);
  });

  it('hands back an icon’s PNG image as it is', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const dir = Buffer.alloc(22);
    dir.writeUInt16LE(1, 2);
    dir.writeUInt16LE(1, 4);
    dir.writeUInt32LE(png.length, 6 + 8);
    dir.writeUInt32LE(22, 6 + 12);
    expect(decodeIco(Buffer.concat([dir, png]))).toEqual({ png });
  });

  it('refuses what isn’t a bitmap', () => {
    expect(() => decodeBmp(Buffer.from('not a bitmap at all, really'))).toThrow();
    expect(() => decodeIco(Buffer.from([1, 2, 3, 4, 5, 6]))).toThrow();
  });
});
