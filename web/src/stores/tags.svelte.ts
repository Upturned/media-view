import type { TagRef, TagTypeInfo } from '@media-view/shared';
import { client, unwrap } from '../api.ts';

/** Tag types: colors, names and order are used everywhere a tag is shown. */
export const tagTypes = $state({ list: [] as TagTypeInfo[], loaded: false });

export async function loadTagTypes(): Promise<void> {
  try {
    tagTypes.list = (await unwrap(client.api['tag-types'].$get())).types;
  } finally {
    tagTypes.loaded = true;
  }
}

export function typeOf(typeId: number): TagTypeInfo | undefined {
  return tagTypes.list.find((t) => t.id === typeId);
}

export const typeColor = (typeId: number) => typeOf(typeId)?.color ?? '#6B7A99';
export const typeKeys = () => tagTypes.list.map((t) => t.key);
export const defaultType = () => tagTypes.list.find((t) => t.isDefault) ?? tagTypes.list[0];

/** Black or white text on a type color, by contrast (technical doc §13.4). */
export function inkFor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const l = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * l((n >> 16) & 255) + 0.7152 * l((n >> 8) & 255) + 0.0722 * l(n & 255);
  return lum > 0.179 ? '#000000' : '#FFFFFF';
}

/** A tag's search key, `#character:aerin_valecrest`. */
export function tagTypeKey(tag: TagRef): string {
  return typeOf(tag.typeId)?.key ?? 'general';
}

/** Group tags by type, in the types' order. */
export function groupByType<T extends { typeId: number }>(tags: T[]): { type: TagTypeInfo; tags: T[] }[] {
  return tagTypes.list
    .map((type) => ({ type, tags: tags.filter((t) => t.typeId === type.id) }))
    .filter((g) => g.tags.length > 0);
}
