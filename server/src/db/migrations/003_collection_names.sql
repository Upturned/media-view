-- Collection names are unique (technical doc §6.6): compared like tag names, ignoring case and
-- treating space and '_' as the same, since `@name` in a search writes spaces as '_'.
-- (No collections exist before milestone 6, so there are no duplicates to resolve.)
ALTER TABLE collections ADD COLUMN name_norm TEXT NOT NULL DEFAULT '';
UPDATE collections SET name_norm = lower(replace(name, '_', ' '));
CREATE UNIQUE INDEX collections_name ON collections(name_norm);
