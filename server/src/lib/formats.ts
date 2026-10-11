/**
 * File formats outside the supported images (technical doc §7.4): what other modules take — the scan
 * moves those files there by itself — and the image formats the app can't show yet.
 */

export type OtherModule = 'videos' | 'audio' | 'texts';

export const MODULE_EXTS: Record<OtherModule, readonly string[]> = {
  videos: ['mp4', 'mkv', 'mov', 'avi', 'webm', 'wmv', 'm4v', 'flv', 'mpg', 'mpeg', '3gp'],
  audio: ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'wma', 'opus'],
  texts: ['txt', 'md', 'pdf', 'doc', 'docx', 'rtf', 'odt', 'epub'],
};

/** Image formats the app can't show (yet): "Not supported" on Library Health. TIFF, BMP and ICO arrive in milestone 8. */
export const UNSUPPORTED_IMAGE_EXTS: readonly string[] = [
  'psd', 'psb', 'heic', 'heif', 'cr2', 'cr3', 'nef', 'arw', 'dng', 'orf', 'rw2', 'raf',
  'kra', 'clip', 'xcf', 'jxl', 'jp2', 'j2k', 'tga', 'exr', 'tif', 'tiff', 'bmp', 'ico',
];

export function moduleFor(ext: string): OtherModule | null {
  const e = ext.toLowerCase();
  return (Object.keys(MODULE_EXTS) as OtherModule[]).find((m) => MODULE_EXTS[m].includes(e)) ?? null;
}

export const isUnsupportedImage = (ext: string) => UNSUPPORTED_IMAGE_EXTS.includes(ext.toLowerCase());
