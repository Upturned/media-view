import fs from 'node:fs';
import sharp, { type Sharp } from 'sharp';
import { decodeBmp, decodeIco } from './bitmap.ts';

/** A `sharp` pipeline on an image file. BMP and ICO are decoded first: `sharp` reads neither. */
export function openImage(file: string, ext: string): Sharp {
  if (ext === 'bmp' || ext === 'ico') {
    try {
      const buf = fs.readFileSync(file);
      const r = ext === 'bmp' ? decodeBmp(buf) : decodeIco(buf);
      if ('png' in r) return sharp(r.png, { failOn: 'none' });
      return sharp(r.data, { raw: { width: r.width, height: r.height, channels: 4 } });
    } catch {
      // not what its name says: let sharp try (a PNG named .bmp still makes a thumbnail)
    }
  }
  return sharp(file, { failOn: 'none' });
}
