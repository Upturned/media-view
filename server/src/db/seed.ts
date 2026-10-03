import type { DB } from './connection.ts';

/** Default tag types and fields for a new library (technical doc §10.2). */

interface FieldSeed {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'date' | 'link' | 'choice' | 'tagref';
  options?: object;
}

const TYPES: { key: string; name: string; color: string; fields: FieldSeed[] }[] = [
  { key: 'general', name: 'General', color: '#6B7A99', fields: [] },
  {
    key: 'character', name: 'Character', color: '#2E9E5B', fields: [
      { key: 'full_name', label: 'Full name', kind: 'text' },
      { key: 'species', label: 'Species', kind: 'text' },
      { key: 'age', label: 'Age', kind: 'number' },
      { key: 'related_characters', label: 'Related characters', kind: 'tagref', options: { types: ['character'], multi: true } },
    ],
  },
  {
    key: 'source', name: 'Source', color: '#B0487A', fields: [
      { key: 'kind', label: 'Kind', kind: 'choice', options: { choices: ['book', 'game', 'series', 'film', 'comic', 'other'] } },
      { key: 'author', label: 'Author', kind: 'text' },
      { key: 'release_date', label: 'Release date', kind: 'date' },
    ],
  },
  {
    key: 'artist', name: 'Artist', color: '#D08A1E', fields: [
      { key: 'website', label: 'Website', kind: 'link' },
      { key: 'social', label: 'Social', kind: 'link' },
    ],
  },
];

export function seedDefaults(db: DB): void {
  const insertType = db.prepare(
    'INSERT INTO tag_types (key, name, color, position, is_default) VALUES (?, ?, ?, ?, ?)',
  );
  const insertField = db.prepare(
    'INSERT INTO tag_type_fields (type_id, key, label, kind, options, position) VALUES (?, ?, ?, ?, ?, ?)',
  );
  db.transaction(() => {
    TYPES.forEach((t, i) => {
      const typeId = insertType.run(t.key, t.name, t.color, i, t.key === 'general' ? 1 : 0).lastInsertRowid;
      t.fields.forEach((f, j) => {
        insertField.run(typeId, f.key, f.label, f.kind, f.options ? JSON.stringify(f.options) : null, j);
      });
    });
  })();
}
