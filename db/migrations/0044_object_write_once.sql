-- SDD-01 P1 (SDD-01-CX-0015, PR #107): a stored object is written once, whatever the byte store does with a second
-- write to its key. Supabase Storage's S3 PutObject replaces an object and ignores If-None-Match (upstream 307c5e31),
-- so a HEAD before the PUT cannot keep a racing or repeated write out.
-- * The API claims an object's key here before it sends a byte (writeOnce, apps/api/src/byte-store.ts), in a
--   transaction of its own that commits first. A key already claimed, by this API or another instance racing it, is
--   refused before any I/O to the store; a racing claim waits for the first to commit or roll back.
-- * A claim names the bytes it was made for (their SHA-256 and length) and is never released or reused: a write
--   that failed after its claim leaves its key unwritable, and the next attempt is given a fresh key
--   (renderer_output_slot, renderer_capture_slot). The same bytes again are refused too: once means once.
-- * Only the API calls it (sophia_api); the table has no policy, so no member reads it.
-- 0001–0043 are not edited. Additive: an API that does not claim (no byte store, or the previous API) is unaffected.
BEGIN;

CREATE TABLE sophia.object_writes (
 storage_key text PRIMARY KEY
  CHECK (storage_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
 sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
 byte_length bigint NOT NULL CHECK (byte_length > 0),
 claimed_at timestamptz NOT NULL DEFAULT now()
);
-- No policy: only the owner's function writes it.
ALTER TABLE sophia.object_writes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sophia.object_writes FROM PUBLIC;

-- Claim `p_key`'s one write: true for the first claim, false for a key already claimed (never an error, so the caller
-- refuses with its own conflict). A malformed key or digest is refused outright.
CREATE FUNCTION sophia.claim_object_write(p_key text, p_sha256 text, p_bytes bigint) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF coalesce(p_key,'') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  RAISE EXCEPTION 'An object key is <project>/<source>' USING ERRCODE='22023'; END IF;
 IF coalesce(p_sha256,'') !~ '^[0-9a-f]{64}$' OR p_bytes IS NULL OR p_bytes < 1 THEN
  RAISE EXCEPTION 'An object write names its SHA-256 and length' USING ERRCODE='22023'; END IF;
 INSERT INTO sophia.object_writes(storage_key, sha256, byte_length) VALUES (p_key, p_sha256, p_bytes)
  ON CONFLICT (storage_key) DO NOTHING;
 RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION sophia.claim_object_write(text,text,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.claim_object_write(text,text,bigint) TO sophia_api;

COMMIT;
