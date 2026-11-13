-- INC03-CC-002 P2 (0099, root-assigned): a held Personal input (0098: a person turn whose reply is `recorded`) is not
-- activity a welcome back is decided on. Plan: docs/plans/personal-inputs.md ("P2"). Pack v2 INC03-R04, C03-R01/R03.
-- * Replaces one function, sophia.personal_welcome_due(), under its own signature: the same language, volatility,
--   SECURITY DEFINER and search path; CREATE OR REPLACE keeps its owner and its grants (none: PUBLIC is revoked again).
-- * The only change: the newest turn it reads is the newest one that is not a held person turn. A held turn is
--   excluded before the newest is chosen, so it neither makes a welcome due nor stops one; a space with no other turn
--   (empty, or only held turns) has no welcome due.
-- * begin_personal_greeting and record_personal_greeting (0021) call it under the space's lock, unchanged: the same
--   claim, epoch, key and lock rules decide; only what counts as the last activity differs. The API's own reads (HISTORY,
--   WELCOME_DUE, the welcome's context) exclude held person turns the same way, until a later, separate admission of an
--   input by its id makes it eligible (none exists).
-- No earlier migration is edited; 0021 and 0098 stay as they are.
BEGIN;

CREATE OR REPLACE FUNCTION sophia.personal_welcome_due() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
 SELECT coalesce((SELECT t.created_at<now()-interval '1 hour' AND NOT (t.author='sophia' AND t.reply_to IS NULL)
   FROM sophia.personal_turns t WHERE t.owner_id=sophia.personal_owner()
    AND NOT (t.author='person' AND t.reply IS NOT DISTINCT FROM 'recorded')
   ORDER BY t.seq DESC LIMIT 1), false) $$;
REVOKE ALL ON FUNCTION sophia.personal_welcome_due() FROM PUBLIC;

COMMIT;
