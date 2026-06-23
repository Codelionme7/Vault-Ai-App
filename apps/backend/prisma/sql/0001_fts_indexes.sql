-- EchoVault AI — full-text search GIN indexes (optional performance optimization).
--
-- Apply after the schema exists:  npm run prisma:fts --workspace @echovault/backend
--
-- Expression indexes matching the tsvector expressions in src/search/fts-query.ts,
-- so Postgres can serve `@@`/`ts_rank` from a GIN index instead of a sequential
-- scan. Full-text search works without these (just slower); they're idempotent.
--
-- NOTE: `prisma db push` does not know about these indexes and may drop them.
-- Re-run this script after a `db push`, or manage it via a proper migration.

CREATE INDEX IF NOT EXISTS recordings_fts_idx ON recordings USING GIN (
  (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(notes, '')), 'C') ||
    setweight(to_tsvector('english', array_to_string(tags, ' ')), 'B')
  )
);

CREATE INDEX IF NOT EXISTS transcripts_fts_idx ON transcripts USING GIN (
  (to_tsvector('english', coalesce(text, '')))
);
