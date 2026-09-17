-- Extensions required by docs/data-model.md:
--   vector    (pgvector)   -- meeting_chunks.embedding, entities.embedding
--   unaccent               -- accent-insensitive Vietnamese text search
--   pg_trgm                -- trigram fuzzy search / entity name matching
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
