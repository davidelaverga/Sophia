-- SMC-M03 (PR #32; CX-0026, CX-0027): an amendment edits its report instead of replacing it, and its notes account for
-- every section it removed.
-- * The truth gate (CX-0026 #1). note_problems (0036) read "nothing changed", the conclusion, the recommendations and a
--   kept note naming a removed heading in full, so "the remainder of the report is unchanged" was published beside
--   facts that showed seven sections gone. Its rules stay, as amendment_note_problems' first part (a kept note that
--   excepts the heading it names, "everything but the comparison table", aside), which then reads the sections
--   removed (no section of the same anchor remains) and the sections revised.
--   - The notes are read as pieces (note_pieces), each saying "kept" (retained, still there, as they were, carried
--     forward, unaffected...), "changed", or both; whether something went (removed, merged, replaced, got rid of, not
--     kept, no longer...); and, for "kept", whether the text is the same (unchanged, as it was, not edited) or only
--     there. Negations and denials are read first (note_marks): nothing after "not", "neither", "nothing", "without
--     touching" is a removal ("neither edited nor removed", "deleted nothing from"), and a part taken from a section
--     ("removed a row from the table") is a change to it. An exception says the opposite of what it is excepted from
--     ("everything except the table is unchanged": the table went; "revised everything except the table": it is the
--     same). A list takes the words of the verb before it ("removed the summary, compatibility and limitations") or
--     of a keep or a removal after it ("compatibility, charging and limitations are retained"); a list between a
--     removal and a keep, or one ending in a verb of its own, says neither.
--   - A removed section that either note calls kept or unchanged, in full or by a key word of its own (one no
--     remaining heading has) that no added heading shares, gets one sentence each: for the kept note in 0036's words,
--     for the change note in its own; unless a piece saying it went names it too ("Removed the table, keeping the
--     comparison in prose").
--   - Every other removed section must be disclosed by a piece that says it went or excepts it: by its heading or a key
--     word of its own; by a word it shares with a remaining heading where the piece names no other removed section and
--     no remaining one by a word of its own ("removed the battery chemistry", "cut a sentence from the chemistry
--     section" say nothing of "Battery costs"); by a wholesale removal ("removed the other sections", "everything else
--     was dropped", "rewrote the whole report", "a recommendations-only version", "kept only the title"), never one
--     negated ("none of the other sections were removed"), of one section ("removed the old recommendations"), or
--     beside a claim that the rest was kept; or by a count ("6 sections removed", "removed the other six sections")
--     that covers it. A piece that only says something changed ("updated the comparison table") discloses nothing. A
--     renamed section needs no disclosure: the only outermost heading on each side under another anchor
--     (research_publish passes it in), or one that shares a key word of its own with an added heading ("Recommendations
--     for buyers", "Revised recommendations"), unless the notes claim the rest was kept and name it nowhere else.
--     Otherwise one sentence names them.
--   - A revised section that a piece calls the same, by its heading or a key word only it has ("the comparison table
--     is unchanged" of a table that lost rows), gets one sentence, unless a piece that does not say "kept" names it
--     too, or the same clause qualifies the claim ("unchanged, except for one row"). The report's outermost heading
--     is matched only in full: its words are the report's topic. section_facts compares each section's own text, so
--     a heading it lists as revised did change.
--   - For an amendment whose base the task can still read, a section called kept or left quiet adds a last sentence:
--     new notes do not bring it back, and where to restore it from. A task that cannot read its base (a rebuild that
--     dropped a withdrawn one) need not disclose what it removed, but may not claim the rest kept; no problem names a
--     removed section and the refusal carries no facts, since those headings are the base's.
--   A claim about the rest is never checked against revisions: the facts carry no heading paths, so a revised
--   subsection of a section the note names cannot be told from a change the note hides (0036's rules still judge the
--   conclusion and the recommendations). The rules read English: notes in another language pass as they did. Every
--   problem is at most 300 characters, distinct after that cut, and at most 20 (the submission contract: a longer one
--   fails the runtime's check after the task's one refusal is spent). The runtime adds a fixed note to every refusal
--   asking for new notes, so a problem that new notes cannot fix says so. The notes are read once, and the removed
--   and revised sections set-wise, so a call costs the length of its facts.
-- * template_notes keeps whole headings within its 200 characters, the removed first, then the added, then the
--   revised, and counts what does not fit (", … and 3 more"), where left(..., 200) cut the last heading in half.
-- * An amendment's draft starts as its base (CX-0026 #2). When its create is dispatched (an admitted or rebuilt task
--   whose manifest still has a base), the attempt's first draft is a copy of the base's text, so research_read_context
--   shows the report as the task's current draft: inside the runtime's closed contract, and still there after a
--   compaction. A copy, never the base's own source: source_closure follows a draft to its task's manifest, so the
--   base would then draw on this task's inputs (and the copy, through that manifest, draws on the base). The
--   create's text (research_task_statement; research_prompt, 0025, is unchanged) says what an update is: the draft is
--   the whole report, change only what is asked, name what is removed, the base is the document and not a source;
--   and, for a base longer than one draft call can carry under the route's output limit (20,000 characters), to
--   report a blocker instead of a shorter report. It names the report by its title as a JSON string: the title was
--   written by a worker that read web pages, and this text is the task, not data.
-- * research_publish, replaced: the same, and the gate is given the renamed and the outermost heading; a draft that is
--   still the version it amends, unchanged, is refused once, with the notes' problems under the same one refusal; an
--   earlier draft of the attempt (the base's copy among them) leaves the model's list of citations. A version may cite
--   what its base cited from an input of its lineage that this task was not given again, or an earlier version of the
--   report (research_citable): in the submit's check and in research_draft_citations, one line changed. Dropped
--   citations stay facts, never a refusal: a source replaced on purpose must publish. The base stays a cited source
--   (CC-0019 #7), but no version of the report counts as a source added or dropped: the next version's text never names
--   its base, so a base listed once would show as dropped by every honest follow-up.
-- * Every research task is asked to keep a length, a section list or a limit on searches or reads its question states,
--   and to say in its limitations where it could not. Asked, not enforced.
-- 0001-0036 are not edited. note_problems, template_notes, research_draft_citations, research_publish and
-- dispatch_runtime_outbox are replaced with the same signatures and grants; note_problems calls the new gate with no
-- context (removals are judged, nothing names a version to restore from).
BEGIN;

-- --- the truth gate ---------------------------------------------------------------------------------------------

-- A heading's or a note's key words: its English lexemes of three letters or more, without the words any section or
-- note may use ("report", "section", "updated", "removed", "the rest"...). Read from its first 200 characters, a note's
-- length, so a long heading costs no more and no word is too long to read.
CREATE FUNCTION sophia.note_words(p_text text) RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT coalesce(array_agg(DISTINCT l.lexeme),'{}') FROM unnest(to_tsvector('english'::regconfig,left(coalesce(p_text,''),200))) l
  WHERE l.lexeme ~ '^[[:alpha:]][[:alnum:]-]{2,}$'
   AND l.lexeme <> ALL ('{report,section,text,content,document,version,draft,part,page,note,updat,revis,new,final,previous,prior,origin,current,main,overview,detail,key,chang,remov,drop,kept,keep,retain,unchang,rest,remaind,everyth,els}'::text[]) $$;
REVOKE ALL ON FUNCTION sophia.note_words(text) FROM PUBLIC;

-- The words for a part of a section, not a section: a row, a figure, a sentence, a citation...
CREATE FUNCTION sophia.note_part_words() RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT 'rows?|columns?|cells?|figures?|numbers?|values?|prices?|dates?|units?|labels?|entr(y|ies)|lines?|sentences?|paragraphs?|words?'
  ||'|wording|typos?|footnotes?|captions?|links?|citations?|references?|mentions?|examples?|bullets?|points?|items?|claims?|caveats?|details?'
  ||'|charts?|images?|duplicates?|duplication|repetitions?|redundancy|filler|errors?|mistakes?' $$;
REVOKE ALL ON FUNCTION sophia.note_part_words() FROM PUBLIC;

-- A note's piece with what its negations and denials say marked: gone_ where it says something went ("not kept", "no
-- longer", "not ... anymore", "nothing else was kept"), same_ where the text is the same ("unchanged", "not edited",
-- "no edits to", "neither changed nor removed", "did not need any changes", "left the table out of the edits"), keep_
-- where it is there ("not removed", "removed nothing", "nothing was taken out of", "no cuts to", "removing it was not
-- needed"); and "revised" where a part is taken from a section. What follows a marker is read as negated too
-- (note_pieces): "not touched or removed" says nothing went.
CREATE FUNCTION sophia.note_marks(p_text text) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE
 edited_v constant text:='(changed?|altered|alter|edited|edit|modified|modify|touched|touch|affected|revised|revise|rewritten|rewrite'
  ||'|reworded|reword|updated|update|reworked|rework|amended|amend|adjusted|adjust|refreshed|tweaked|corrected|trimmed|shortened|expanded'
  ||'|reorganized|reorganised|restructured)';
 removed_v constant text:='(removed|remove|dropped|drop|deleted|delete|cut|omitted|omit|moved|move|lost|lose|merged|merge|combined|folded'
  ||'|replaced|replace|renamed|rename|scrapped|scrap|eliminated|eliminate|excluded|exclude|discarded|discard|retired|erased|stripped|ditched'
  ||'|taken\s+out|take\s+out|took\s+out|moved\s+out|left\s+out|leave\s+out)';
 unkept constant text:='(\mnot|\mnever|n[''’]t|\mno\s+longer)\s+(be\s+|been\s+|being\s+)?(kept|keep|retained|retain|preserved|preserve'
  ||'|included|include|carried\s+(over|forward)|there|present|part\s+of|in\s+(the|this)\s+(new\s+)?(report|version|draft|update|text))\M'
  ||'|\mno\s+longer\M|\mthere\s+(is|are|was|were)\s+no\M(?!\s+(longer\s+)?(changes?|edits?|updates?|other|need|differences?|revisions?|alterations?|cuts?|removals?|deletions?)\M)'
  ||'|\m(neither|none\s+of)\M[^,;]*?\m(survived|survives|remained|remains?|stayed|stays?|kept|retained|preserved|made\s+it'
  ||'|(is|are)\s+(in|there|left))\M'
  ||'|(\m(no|not|never)|n[''’]t)\M[^,;]*?\many\s*(more|longer)\M'
  ||'|\m(nothing|none|no\s+other\s+sections?)\s+(else\s+)?((was|were|is|are|has\s+been|have\s+been)\s+)?(kept|retained|preserved)\M';
 unedited constant text:='\m(no\s+(changes?|edits?|updates?|revisions?|alterations?|modifications?|rewrites?)(\s+(to|in|on|for))?'
  ||'|nothing\s+(else\s+)?changed|no\s+other\s+changes?|unchanged|nothing\s+happened\s+to)\M'
  ||'|(\mnot|\mnever|n[''’]t)\s+(been\s+|be\s+)?'||edited_v||'\M'
  ||'|\m(no|none|nothing|neither|zero)\M[^,:]*?\m(touched|changed|altered|edited|modified|rewritten|revised|updated|reworded'
  ||'|reworked|amended)\M'
  ||'|\m(did|does|do)(\s+not|n[''’]t)\s+need\s+(any\s+)?(edits?|editing|changes?|updates?|revisions?|work)\M';
 unremoved constant text:='(\mnot|\mnever|n[''’]t)\s+(been\s+|be\s+)?'||removed_v||'\M'
  ||'|\m(no|none|nothing|neither|zero)\M[^,:]*?\m'||removed_v||'\M'
  ||'|\m(removed|dropped|deleted|cut|omitted|merged|replaced|scrapped|eliminated|erased|discarded|took\s+out|taken\s+out)\s+(nothing|none)\M'
  ||'|\mno\s+(cuts?|removals?|deletions?)\M'
  ||'|\m(removing|dropping|cutting|deleting|merging|replacing)\s+[^,;]*?\s+(was|is|were|seemed)(\s+not|n[''’]t)\s+(necessary|needed|required|asked)\M';
 -- A part removed from a section ("removed a stale row from the comparison table", "cut the table's last row", "cut the
 -- table down to three rows") is a change to that section, which stays; "replaced the table with a sentence in the
 -- recommendations" is not.
 part constant text:=sophia.note_part_words();
 part_of constant text:='\m(removed|remove|removes|removing|dropped|drop|drops|dropping|deleted|delete|deleting|cut|cuts|cutting|omitted'
  ||'|omitting|replaced|replace|replacing|merged|merging|scrapped|eliminated|erased|stripped|took\s+out|taken\s+out)\s+'
  ||'((([[:alnum:]-]+\s+)*?[[:alnum:]-]+[''’]s\s+)((?!(with|by|for|into|to|from|in|of|and|or)\M)[[:alnum:]-]+\s+)*?('||part||')\M'
  ||'|((?!(with|by|for|into|to|from|in|of|and|or)\M)[[:alnum:]-]+\s+)*?('||part||')\s+(from|in|of|out\s+of|inside|within)\M)'
  ||'|\m(cut|cuts|cutting|pared|trimmed)\s+[^,;]*?\s+down\s+to\M';
 untouched constant text:='\m(left|leaving|leave|leaves|kept|keeping|keep|keeps)\s+[^,;]*?\s+out\s+of\s+(the\s+|this\s+|these\s+|that\s+|any\s+)?'
  ||'((round|pass)\s+of\s+)?(edits?|editing|changes?|revisions?|updates?|rewrite|rewriting)\M';
BEGIN
 -- In this order: "not kept" before "not edited" before "not removed", and a denial before a part removed.
 RETURN regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(p_text,''),unkept,' gone_ ','g'),unedited,' same_ ','g'),
  unremoved,' keep_ ','g'),untouched,' same_ ','g'),part_of,' revised ','g');
END $$;
REVOKE ALL ON FUNCTION sophia.note_marks(text) FROM PUBLIC;

-- A note as pieces, each with what it says of what it names: 'keep' (unchanged, retained, kept, the same, still there,
-- carried forward, as they were, survives, is included, not removed...), 'change' (revised, removed, new...) or
-- 'mixed'; whether it says that something went (removed, removing, removal, dropped, merged, replaced, got rid of, is
-- out, no longer, not kept, without the X...); for a keep, whether it says the text is the same (unchanged, untouched,
-- as it was, as in version 1, word for word, not edited, no edits to), not only that it is there (kept, retained, still
-- there, not removed); whether it says so in its own words (own) or takes them from the pieces around it; whether it is
-- an excepted object; and its clause. Its words are read after note_marks, and what follows a negation is no change and
-- no removal ("did not change or remove the table"). Clauses end at . ; ! ? a line break, or a dash between two parts
-- that each say something ("Comparison table - removed" is one); pieces at a comma, and, but, while, yet... An
-- exception (except, excluding, other than, apart from, aside from, besides, save for, minus, and "everything but X")
-- is a piece of its own, saying the opposite of what it is excepted from ("everything except the table is unchanged":
-- the table went; "revised everything except the table": it is the same), or what a "which" clause after it says. One
-- about "that" ("apart from that, ...") or "nothing" is dropped; one followed by a clause ("except that one row was
-- removed") or an action ("besides removing the table") is that clause. A run of pieces that say neither belongs to the
-- piece after it, passing over an excepted one, when that one names its subject first and the subject may be the whole
-- list ("compatibility, charging and limitations are retained"; not "the summary is", not "the rest is"); else to the
-- piece before it ("removed the summary, compatibility and limitations"); else to the one after; else to its note: a
-- kept note says what was kept, a change note what changed, and neither says that something went. A run between a
-- removal and such a keep ("removed the old recommendations, and the summary and limitations are as they were"), or one
-- that ends in a verb of its own ("the table is now a paragraph", "the summary and limitations are fine"), says
-- neither.
CREATE FUNCTION sophia.note_pieces(p_note text, p_kept boolean)
RETURNS TABLE(body text, polarity text, gone boolean, same boolean, own boolean, excepts boolean, clause integer)
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE
 same_text constant text:='\m(same_|untouched|intact|identical|unaltered|unmodified|unaffected|unedited|unrevised|undisturbed|same|verbatim'
  ||'|as\s+before|as\s+(it|they)\s+(was|were|stood|stand|stands)|as\s+is|as-is|as\s+(originally\s+)?written|word\s+for\s+word'
  ||'|as\s+in\s+(v|version\s*)[0-9]+|as\s+in\s+(the\s+)?(earlier|previous|original|prior|first|last|old)|like\s+(v|version\s*)[0-9]+'
  ||'|(follows?|followed|mirrors?|matches|match)\s+(v|version\s*)[0-9]+|(come|comes|came|taken|copied)\s+((straight|directly)\s+)?from\s+(v|version\s*)[0-9]+'
  ||'|left\s+(alone|as)|as\s+(you|we|i)\s+left\s+(it|them))\M|\mleft\s+[^,;]*?\s+alone\M|\mcopied\s+[^,;]*?\s+from\s+(v|version\s*)[0-9]+\M';
 keeps constant text:=same_text||'|\m(keep_|retained|retain|retains|retaining|kept|keep|keeps|keeping|preserved|preserve|preserves|preserving'
  ||'|maintained|maintain|maintains|maintaining|stays?|stayed|remains?|remained|persists?|persisted|carr(y|ies|ied|ying)\s+(over|forward)'
  ||'|survives?|survived|leave|leaves|leaving|still\s+(there|here|included|present|stands?|part\s+of|in|includes?|including|has|have|contains?'
  ||'|holds?|shows?|around))\M|\m(is|are|was|were)\s+(still\s+)?(all\s+)?(there|here|present|included|around)\M|\mlives\s+on\M'
  ||'|\min\s+place\M(?!\s+of\M)';
 went constant text:='\m(gone_|removed|remove|removes|removing|removal|dropped|drop|drops|dropping|deleted|delete|deletes|deleting|deletion'
  ||'|cut|cuts|cutting|merged|merge|merges|merging|combined|combining|folded|folding|omitted|omits|omit|omitting|excluded|exclude|excludes'
  ||'|replaced|replace|replaces|replacing|renamed|renaming|retitled|retired|retiring|scrapped|scrapping|discarded|eliminated|erased|struck|excised|axed|purged|culled'
  ||'|stripped|ditched|gone|without|took\s+(out|away|down)|taken\s+(out|away|down)|left\s+out|leaves?\s+out|leaving\s+out|got\s+rid|getting\s+rid'
  ||'|did\s+away|done\s+away)\M|\m(took|taken|left|leave|leaves|leaving|kept|keeping|pulled|pulling)\s+[^,;]*?\s+out\M'
  ||'|\m(pulled|moved)\s+[^,;]*?\s+(from|into)\M|\mswapped\s+(out\s+)?[^,;]*?\s+(for|with)\M|\mswapped\s+out\M'
  ||'|\m(is|are|was|were)\s+(now\s+)?out\M(?!\s+of\M)|\m(is|are|was|were)\s+now\s+(a|an|part\s+of)\M'
  ||'|\m(turned|turn|turns|converted|convert|converts|transformed|rewrote|rewritten)\s+(the\s+|its\s+|their\s+)?'
  ||'((?!(in|of|from|for|on|at|to|with|by)\M)[[:alnum:]-]+\s+){0,5}?into\M';
 changes constant text:=went||'|\m(revised|revise|revises|rewrote|rewritten|rewrite|rewrites|updated|update|updates|expanded|expands|extended'
  ||'|added|adds|new|changed|split|restructured|reorganized|reorganised|corrected|refined|tightened|reworked|reworded|edited|trimmed'
  ||'|shortened|condensed|turned|lost|loses|gained|minus|fewer|shorter|longer|smaller|larger)\M';
 -- What a negation ends: nothing after it is read as a change or a removal ("updated the table rather than removing it", "resisted removing it").
 negated constant text:='(\m(no|not|never|nothing|none|neither|nor|zero)\M|n[''’]t\M|\mrather\s+than\M|\m(avoided|avoiding|resisted|refrained|declined)\M|\msame_|\mkeep_).*$';
 exception constant text:='\m(except(\s+for)?|excepting|excluding|other\s+than|apart\s+from|aside\s+from|besides|save\s+for|but\s+for|minus)\M';
 -- Where an excepted object's own predicate may start ("everything except the table | is unchanged"): this, or a keep
 -- or a change word.
 verb constant text:='\m(is|are|was|were|be|been|has|have|had|did|does|do)\M';
 relative constant text:='^\s*(which|that|who)\M';
 copula constant text:='\m(is|are|was|were|has|have|had)\M|n[''’]t\M';
 -- Words before a piece's first keep or change word that name no subject ("also revised", "have kept").
 filler constant text:='\m(the|a|an|i|we|it|its|they|this|that|these|those|have|has|had|also|then|just|only|simply|and|so|first|finally'
  ||'|both|further|additionally|was|were|is|are|be|been|all|each|every|of|to|in|on|with|for|as|at|by|now|again)\M|[^[:alpha:]]+';
 -- A subject that is not the list before it: the rest, everything else, the other sections; or a singular verb.
 own_subject constant text:='\m(the\s+)?(rest|remainder)\M|\meverything\M|\m(all|anything|nothing)\s+else\M'
  ||'|\m(all|every|each)\s+(of\s+)?(the\s+)?(other|remaining|original|existing)\M|\m(the\s+)?(other|remaining)\s+(sections?|parts?|text|content)\M'
  ||'|\motherwise\M|\m(is|was|has)\s*$';
 sentence text; seg text; buf text; clauses text[]:='{}'; c text; part text; after text; act text; t text; head text; gov text;
 bodies text[]; excepted boolean[]; mains integer[]; says text[]; goes boolean[]; sames boolean[]; heads text[]; owns boolean[];
 ci integer:=0; s integer; e integer; o integer; k integer; j integer; x integer; n integer; src integer; nx integer; pv integer;
BEGIN
 FOREACH sentence IN ARRAY regexp_split_to_array(lower(coalesce(p_note,'')),'[.;!?\n]+') LOOP
  buf:=NULL;
  FOREACH seg IN ARRAY regexp_split_to_array(sentence,'\s[-–—]+\s|[–—]') LOOP
   IF buf IS NULL THEN buf:=seg;
   ELSIF (buf ~ keeps OR buf ~ changes) AND (seg ~ keeps OR seg ~ changes) THEN clauses:=clauses||buf; buf:=seg;
   ELSE buf:=buf||', '||seg; END IF;
  END LOOP;
  clauses:=clauses||buf;
 END LOOP;
 FOREACH c IN ARRAY clauses LOOP
  ci:=ci+1;
  c:=regexp_replace(c,'\m(everything|anything|nothing|all|(all|every|each|the)\s+([[:alpha:]]+\s+)?(sections?|parts?|text|content|rest))\s+but\M',
   '\1 except','g');
  c:=regexp_replace(c,exception||'\s+(that|this|these|those|it|them)\s*(,|$)',' , ','g');
  c:=regexp_replace(c,'(^|\s+)without\s+(any\s+|a\s+single\s+|a\s+|the\s+slightest\s+)?(changes?|edits?|editing|alterations?|modifications?'
   ||'|revisions?|rewording|rewrites?|exceptions?|updates?|touching|changing|altering|modifying|revising|rewriting|rewording|editing)\M'
   ||'|(^|\s+)without\s+([[:alpha:]]+\s+){1,3}(removed|dropped|deleted|cut|changed|altered|edited|touched|lost|missing)\M',', same_ ','g');
  c:=regexp_replace(c,'(^|\s+)without\s+(cutting|removing|dropping|deleting|losing|omitting|merging|replacing|scrapping|eliminating)\M',
   ', keep_ ','g');
  bodies:='{}'; excepted:='{}'; mains:='{}';
  FOREACH part IN ARRAY regexp_split_to_array(c,',|\s+(and|but|while|whereas|though|although|yet|&)\s+') LOOP
   CONTINUE WHEN btrim(part)='';
   s:=regexp_instr(part,exception);
   IF s=0 THEN bodies:=bodies||part; excepted:=excepted||false; mains:=mains||0; CONTINUE; END IF;
   e:=regexp_instr(part,exception,1,1,1);
   after:=substr(part,e);
   -- "Except that one row was removed" and "besides removing the table" say something of their own; "except for nothing"
   -- excepts nothing.
   act:=substring(after FROM '^\s*([[:alpha:]]+ing)\M');
   IF after ~ '^\s*(that|where|when)\s' OR after ~ '^\s*(nothing|none|no)\M' OR act ~ keeps OR act ~ changes THEN
    IF btrim(substr(part,1,s-1))<>'' THEN bodies:=bodies||substr(part,1,s-1); excepted:=excepted||false; mains:=mains||0; END IF;
    IF after !~ '^\s*(nothing|none|no)\M' THEN
     bodies:=bodies||regexp_replace(after,'^\s*(that|where|when)\s',''); excepted:=excepted||false; mains:=mains||0;
    END IF;
    CONTINUE;
   END IF;
   -- Where the words before it say nothing, the object ends at its predicate ("everything except the table | is
   -- unchanged"); else it runs to the end ("the table is unchanged except | that one row was removed").
   o:=0; j:=0;
   t:=sophia.note_marks(substr(part,1,s-1));
   IF NOT (t ~ keeps OR regexp_replace(t,negated,'') ~ changes) THEN
    -- Each pattern is matched alone: compiled once, they stay in PostgreSQL's small cache of regular expressions,
    -- which one pattern joining them all would push out.
    FOR x IN 1..4 LOOP
     j:=least(nullif(regexp_instr(after,verb,j+1),0),nullif(regexp_instr(after,keeps,j+1),0),nullif(regexp_instr(after,changes,j+1),0));
     EXIT WHEN j IS NULL;
     IF btrim(regexp_replace(substr(after,1,j-1),filler,' ','g'))<>'' THEN o:=j; EXIT; END IF;
    END LOOP;
   END IF;
   -- In the order read: the object, then its predicate ("everything except the table | is unchanged, including the
   -- summary"), or the predicate, then the object ("revised everything | except the table, the summary and ...").
   part:=substr(part,1,s-1)||' '||CASE WHEN o>0 THEN substr(after,o) ELSE '' END;
   IF o>0 THEN
    bodies:=bodies||substr(after,1,o-1); excepted:=excepted||true; mains:=mains||CASE WHEN btrim(part)<>'' THEN cardinality(bodies)+1 ELSE 0 END;
   END IF;
   IF btrim(part)<>'' THEN bodies:=bodies||part; excepted:=excepted||false; mains:=mains||0; END IF;
   IF o=0 THEN
    bodies:=bodies||after; excepted:=excepted||true; mains:=mains||CASE WHEN btrim(part)<>'' THEN cardinality(bodies)-1 ELSE 0 END;
   END IF;
  END LOOP;
  n:=coalesce(cardinality(bodies),0); says:='{}'; goes:='{}'; sames:='{}'; heads:='{}'; owns:='{}';
  FOR k IN 1..n LOOP
   t:=sophia.note_marks(bodies[k]);
   says:=says||CASE WHEN excepted[k] THEN NULL WHEN t ~ keeps AND regexp_replace(t,negated,'') ~ changes THEN 'mixed' WHEN t ~ keeps THEN 'keep'
    WHEN regexp_replace(t,negated,'') ~ changes THEN 'change' END;
   goes:=goes||(says[k] IS NOT NULL AND regexp_replace(t,negated,'') ~ went);
   sames:=sames||(says[k] IS NOT NULL AND t ~ same_text);
   owns:=owns||(says[k] IS NOT NULL);
   -- Where its subject stands: 'first' (none before its first keep or change word), 'own' (one that is not the list
   -- before it), else 'last'.
   j:=least(nullif(regexp_instr(t,keeps),0),nullif(regexp_instr(t,changes),0));
   head:=CASE WHEN j IS NULL THEN t ELSE substr(t,1,j-1) END;
   heads:=heads||CASE WHEN says[k] IS NULL THEN NULL WHEN btrim(regexp_replace(head,filler,' ','g'))='' THEN 'first'
    WHEN head ~ own_subject OR substr(t,length(head)+1) ~ '^\s*(stays|remains|keeps|retains|carries|persists|follows|stands|comes|matches|mirrors)\M'
    THEN 'own' ELSE 'last' END;
  END LOOP;
  -- An excepted object says the opposite of what it is excepted from: its own piece, else the next piece when that one
  -- is about the rest ("besides the table, the rest is unchanged"), else the one before it, else the one after, else
  -- its note; or what a "which" clause right after it says.
  FOR k IN 1..n LOOP
   CONTINUE WHEN NOT excepted[k];
   IF k<n AND NOT excepted[k+1] AND says[k+1] IS NOT NULL AND bodies[k+1] ~ relative THEN
    says[k]:=says[k+1]; goes[k]:=goes[k+1]; sames[k]:=sames[k+1];
   ELSE
    gov:=CASE WHEN mains[k]>0 THEN says[mains[k]] END;
    IF gov IS NULL THEN
     nx:=NULL; pv:=NULL;
     FOR x IN k+1..n LOOP IF NOT excepted[x] AND says[x] IS NOT NULL AND bodies[x] !~ relative THEN nx:=x; EXIT; END IF; END LOOP;
     FOR x IN REVERSE k-1..1 LOOP IF NOT excepted[x] AND says[x] IS NOT NULL AND bodies[x] !~ relative THEN pv:=x; EXIT; END IF; END LOOP;
     gov:=CASE WHEN says[nx]='keep' AND heads[nx]='own' THEN 'keep' WHEN pv IS NOT NULL THEN says[pv] WHEN nx IS NOT NULL THEN says[nx]
      WHEN p_kept THEN 'keep' ELSE 'change' END;
    END IF;
    says[k]:=CASE gov WHEN 'keep' THEN 'change' WHEN 'change' THEN 'keep' ELSE 'mixed' END;
    goes[k]:=gov='keep'; sames[k]:=gov='change';
   END IF;
   heads[k]:='first'; owns[k]:=true;
  END LOOP;
  k:=1;
  WHILE k<=n LOOP
   IF says[k] IS NOT NULL THEN k:=k+1; CONTINUE; END IF;
   j:=k;
   WHILE j<n AND says[j+1] IS NULL LOOP j:=j+1; END LOOP;
   -- The piece after the run, passing over an excepted one ("the summary, other than the table, is unchanged").
   nx:=NULL;
   FOR x IN j+1..n LOOP IF NOT excepted[x] THEN nx:=x; EXIT; END IF; END LOOP;
   IF says[nx] IS NULL THEN nx:=NULL; END IF;
   -- The run k..j: 0 when it may belong to a removal before it or a keep after it, or ends in a verb of its own.
   src:=CASE WHEN bodies[j] ~ copula AND bodies[j] !~ relative THEN 0
    WHEN heads[nx]='last' THEN CASE WHEN k>1 AND goes[k-1] AND says[nx]='keep' THEN 0 ELSE nx END
    WHEN k>1 THEN k-1 ELSE nx END;
   FOR x IN k..j LOOP
    says[x]:=CASE src WHEN 0 THEN 'mixed' ELSE says[src] END;
    goes[x]:=CASE src WHEN 0 THEN false ELSE goes[src] END;
    sames[x]:=CASE src WHEN 0 THEN false ELSE sames[src] END;
   END LOOP;
   k:=j+1;
  END LOOP;
  FOR k IN 1..n LOOP
   body:=bodies[k]; polarity:=coalesce(says[k],CASE WHEN p_kept THEN 'keep' ELSE 'change' END); gone:=coalesce(goes[k],false);
   same:=coalesce(sames[k],false); own:=owns[k]; excepts:=excepted[k]; clause:=ci;
   RETURN NEXT;
  END LOOP;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION sophia.note_pieces(text,boolean) FROM PUBLIC;

-- How many sections a piece of a note says were removed without naming them: all of them (1000000) for a wholesale
-- removal ("removed the other sections", "everything else was dropped", "the rest was cut", "removed all sections",
-- "the other sections are gone", "rewrote the whole report", "reduced the report to...", "a recommendations-only
-- version", "rewrote the report as recommendations only", "only the title is kept", "kept only the title", "the report
-- is now recommendations only", "nothing else was kept"), else the largest count it gives ("6 sections removed",
-- "dropped the other six sections", "removed six of the seven sections"), else 0. What follows a negation in the piece
-- is not read ("none of the other sections were removed", "I did not cut the remaining sections"); a removal names the
-- rest, never one section ("removed the old recommendations"); and "nothing but X changed" says what changed, not what
-- went (only "nothing but X is kept" does).
CREATE FUNCTION sophia.note_removes_all(p_piece text) RETURNS integer LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$
 WITH n AS (SELECT lower(coalesce(p_piece,'')) AS whole,
   regexp_replace(lower(coalesce(p_piece,'')),'(\m(no|none|not|never|nothing|neither|nor|zero)\M|n[''’]t\M).*$','') AS t,
   '(?:removed|removing|dropped|dropping|deleted|deleting|cut|cutting|omitted|merged|combined|folded|left\s+out|took\s+out|taken\s+out'
   ||'|replaced|replacing|scrapped|eliminated|discarded|erased|stripped|excluded|retired|gone)' AS rm,
   '(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)' AS num,
   '(?:other\s+|earlier\s+|original\s+|remaining\s+)?sections?' AS sections,
   '(?:all\s+)?(?:the\s+)?(?:other\s+|earlier\s+|original\s+|remaining\s+)?' AS which)
 SELECT CASE
  WHEN whole ~ ('\mnothing\s+(else\s+)?((was|is|has\s+been)\s+)?(kept|retained|left|preserved)\M|\m(nothing|none)\s+(else\s+)?(but|except'
     ||'|other\s+than|apart\s+from|besides)\M[^,;]*?\m(kept|retained|left|preserved|remains?|remained|stays?|stayed|survives?|survived)\M(?!\s+out\M)')
    OR t ~ ('\m'||rm||'\s+(all\s+)?(of\s+)?(the\s+)?(rest(\s+of\s+the\s+(report|text|document))?|(other|remaining|original|earlier|previous|old)\s+(sections?|parts?|text|content))\M(?!\s+(of|in|on|about|for)\M)')
    OR t ~ ('\m(all\s+)?(the\s+)?(other|remaining|original|earlier|previous|old)\s+(sections?|parts?|text|content)\s+((were|was|are|is|have\s+been|has\s+been)\s+)?'||rm||'\M')
    OR t ~ ('\m'||rm||'\s+everything\s+else\M|\meverything\s+else\s+((was|is|has\s+been)\s+)?'||rm||'\M')
    OR t ~ ('\m'||rm||'\s+everything\s*$|\m'||rm||'\s+(all\s+(of\s+)?(the\s+)?([[:alpha:]]+\s+)?sections?|every\s+([[:alpha:]]+\s+)?section)\M'
     ||'(?!\s+(of|in|on|about|for|from|that|which|with|where)\M)')
    OR t ~ ('\m(everything|all\s+(the\s+)?([[:alpha:]]+\s+)?sections?|every\s+([[:alpha:]]+\s+)?section)\s+((was|were|is|are|has\s+been|have\s+been)\s+)?'||rm||'\M')
    OR t ~ ('\m(the\s+)?(rest|remainder)\s+((of\s+the\s+(report|text|document)\s+)?(was|is|has\s+been)\s+)?'||rm||'\M')
    OR t ~ '\m(rewrote|rewritten|replaced|restructured|reorganized|reorganised|rebuilt|redid|redone)\s+(the\s+)?(whole|entire)\s+(report|document|text)\M(?![''’]s)'
    OR t ~ '\m(rewrote|rewritten|replaced)\s+(the\s+)?(report|document)\s+(as|with|into|by)\M.*(\monly\M|-only\M)'
    OR t ~ '\m(reduced|cut|pared|stripped|trimmed)\s+(the\s+)?(whole\s+|entire\s+)?(report|document)\s+down\s+to\M|\mreduced\s+(the\s+)?(report|document)\s+to\M'
    OR t ~ '\m[[:alpha:]]+(-|\s+)only\s+(version|report|edition|rewrite)\M'
    OR t ~ '\monly\s+(the\s+)?[[:alpha:]]+(\s+[[:alpha:]]+)?\s+((is|was|were|are|has\s+been|have\s+been)\s+)?(kept|retained|left|preserved)\M(?!\s+out\M)'
    OR t ~ '\m(keeps?|kept|keeping|retains?|retained|leaves?|left)\s+only\s+(the|its)\M'
    OR t ~ '\m(report|document|version)\s+(is\s+)?now\s+([^,;]*?\s)?only\M|\m(report|document|version)\s+now\s+(has|contains|holds|keeps)\s+only\M'
   THEN 1000000
  -- The number is the one group each count captures.
  ELSE coalesce((SELECT max(CASE x[1] WHEN 'one' THEN 1 WHEN 'two' THEN 2 WHEN 'three' THEN 3 WHEN 'four' THEN 4 WHEN 'five' THEN 5
     WHEN 'six' THEN 6 WHEN 'seven' THEN 7 WHEN 'eight' THEN 8 WHEN 'nine' THEN 9 WHEN 'ten' THEN 10 WHEN 'eleven' THEN 11
     WHEN 'twelve' THEN 12 ELSE least(x[1]::numeric,1000000)::integer END)
    FROM (SELECT regexp_matches(t,'\m'||num||'\s+'||sections||'\s+(?:(?:were|was|are|is|have\s+been|has\s+been)\s+)?'||rm||'\M','g') AS x
     UNION ALL SELECT regexp_matches(t,'\m'||rm||'\s+'||which||num||'\s+'||sections||'\M','g')
     UNION ALL SELECT regexp_matches(t,'\m'||rm||'\s+'||num||'\s+of\s+(?:the\s+)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+'
      ||sections||'\M','g')) m),0) END
 FROM n $$;
REVOKE ALL ON FUNCTION sophia.note_removes_all(text) FROM PUBLIC;

-- Whether the notes claim that the rest of the report was kept or that nothing else changed ("the rest", "everything
-- else", "all other sections", "otherwise", "only X changed", "no other changes"...): how a refusal says it.
CREATE FUNCTION sophia.note_blanket(p_change text, p_kept text) RETURNS boolean LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$
 SELECT lower(coalesce(p_change,'')||E'.\n'||coalesce(p_kept,'')) ~ ('\m(the\s+)?(rest|remainder)\M|\meverything\M|\m(all|anything)\s+else\M'
  ||'|\m(all|every|each)\s+(of\s+)?(the\s+)?(other|remaining|original|existing)\M|\m(the\s+)?(other|remaining)\s+(sections?|parts?|text|content)\M'
  ||'|\m(whole|entire)\s+(report|text|document)\M|\motherwise\M|\mnothing\s+else\M|\mno\s+(other|further)\s+(changes?|edits?)\M'
  ||'|\m(only|solely|exclusively)\M|-only\M|\m(limited|confined|restricted)\s+to\M') $$;
REVOKE ALL ON FUNCTION sophia.note_blanket(text,text) FROM PUBLIC;

-- Headings, in order, within p_room characters: whole (a note's), or quoted and cut at 60 (a problem's, at most 8).
-- What does not fit is counted (", … and 3 more"); nothing when not even the first fits.
CREATE FUNCTION sophia.note_names(p_names text[], p_room integer, p_quoted boolean) RETURNS text LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog AS $$
DECLARE n integer:=coalesce(cardinality(p_names),0); shown text:=''; item text; more text; k integer:=0;
BEGIN
 FOR i IN 1..CASE WHEN p_quoted THEN least(n,8) ELSE n END LOOP
  item:=CASE WHEN NOT p_quoted THEN p_names[i] WHEN length(p_names[i])>60 THEN '"'||left(p_names[i],59)||'…"' ELSE '"'||p_names[i]||'"' END;
  more:=CASE WHEN i<n THEN ', … and '||(n-i)||' more' ELSE '' END;
  EXIT WHEN length(shown)+CASE WHEN i>1 THEN 2 ELSE 0 END+length(item)+length(more)>p_room;
  shown:=shown||CASE WHEN i>1 THEN ', ' ELSE '' END||item; k:=i;
 END LOOP;
 RETURN CASE WHEN k=0 THEN '' WHEN k=n THEN shown ELSE shown||', … and '||(n-k)||' more' END;
END $$;
REVOKE ALL ON FUNCTION sophia.note_names(text[],integer,boolean) FROM PUBLIC;

-- Where an amendment's notes contradict its facts, one distinct sentence each, at most 20 of at most 300 characters.
-- p_ctx (research_publish's): {"renamed": [the old outermost heading, when the outermost one was renamed], "disclose":
-- whether the task can read its base (false for a rebuild that dropped a withdrawn base, or a base withdrawn since):
-- then removals need not be disclosed, and no problem names a removed section, "baseVersion", "baseSourceId": the
-- version the task amends, while it can read it, "title": the new text's outermost heading, when it has one}. With
-- '{}', removals are judged and nothing names a version to restore from.
CREATE FUNCTION sophia.amendment_note_problems(p_change text, p_kept text, p_facts jsonb, p_ctx jsonb) RETURNS text[]
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE changed integer:=jsonb_array_length(p_facts->'added')+jsonb_array_length(p_facts->'revised')+jsonb_array_length(p_facts->'removed');
 notes text:=coalesce(p_change,'')||E'.\n'||coalesce(p_kept,''); kept text:=lower(coalesce(p_kept,'')); out text[]:='{}';
 readable boolean:=coalesce((p_ctx->>'disclose')::boolean,true); conclusion boolean; recommendation boolean; h text; gone text[];
 renamed text[]; called text[]; quiet text[]; revised text[]; covered integer; named text[]:='{}'; told_quiet boolean:=false;
 rest boolean; rest_kept boolean; lead text; restore text; bodies text[]; polarities text[]; goes boolean[]; sames boolean[];
 of_kept boolean[]; owns boolean[]; excepts boolean[]; clauses integer[];
BEGIN
 -- 0036's rules, as they were. Which kind changed: the anchors of the changed sections' headings, by section_facts'
 -- own rule.
 SELECT coalesce(bool_or(a ~ 'conclusion'),false), coalesce(bool_or(a ~ 'recommendation'),false) INTO conclusion, recommendation
  FROM (SELECT sophia.heading_anchor(x) AS a FROM unnest(ARRAY['added','revised','removed']) k, jsonb_array_elements_text(p_facts->k) x) t;
 -- "No changes" or "nothing changed", unless "except X", "but X" and the like follow, or "to/in/about X" where X begins
 -- with a section left unchanged or a conclusion or recommendation (judged below), never the whole text.
 IF changed>0 AND (lower(coalesce(p_change,'')) ~ '^\s*unchanged\s*\.?\s*$' OR EXISTS(SELECT 1 FROM regexp_matches(lower(coalesce(p_change,'')),
    '(?:\mno changes?|\mnothing changed)\M(?!,?\s+(?:except|but|save|apart|aside|besides|beyond|other|outside)\M)'
    ||'(?:,?\s+(?:to|in|about)\s+(?:the\s+)?([^.;,:!?\n–—]*))?','g') x(m), sophia.heading_anchor(coalesce(x.m[1],'')) a
   WHERE a='' OR a ~ '^(report|document|text|content|draft|version|substance|anything|any|it|its|this|that|everything|all)(-|$)'
    OR NOT (a ~ '^(conclusions?|recommendations?)(-|$)' OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_facts->'unchanged') y,
     sophia.heading_anchor(y) u WHERE u<>'' AND (a=u OR left(a,length(u)+1)=u||'-'))))) THEN
  out:=out||format('The note says nothing changed, but %s sections changed.',changed); END IF;
 IF (p_facts->>'conclusionChanged')::boolean AND conclusion AND sophia.note_keeps(notes,'conclusions?','recommendations?') THEN
  out:=out||'The note calls the conclusion unchanged, but it changed.'::text; END IF;
 IF (p_facts->>'conclusionChanged')::boolean AND recommendation AND sophia.note_keeps(notes,'recommendations?','conclusions?') THEN
  out:=out||'The note calls the recommendations unchanged, but they changed.'::text; END IF;
 -- The removed sections: each removed heading once, in order, unless a section with that anchor remains (a repeated
 -- heading).
 SELECT coalesce(array_agg(r.x ORDER BY r.i),'{}') INTO gone FROM (SELECT e.x, min(e.i) AS i
   FROM jsonb_array_elements_text(p_facts->'removed') WITH ORDINALITY e(x,i)
   WHERE sophia.heading_anchor(e.x) NOT IN (SELECT sophia.heading_anchor(y) FROM unnest(ARRAY['added','revised','unchanged']) k,
     jsonb_array_elements_text(p_facts->k) y)
   GROUP BY e.x) r;
 IF cardinality(gone)=0 AND jsonb_array_length(p_facts->'revised')=0 THEN RETURN out[1:20]; END IF;

 -- The notes, read once: pieces with what each says (note_pieces). The rest of the report is claimed kept by a "kept"
 -- piece about the rest ("the remainder is unchanged", "everything else is retained") or by a piece that says only
 -- something changed ("only the recommendations changed"); rest_kept is the first kind alone.
 SELECT coalesce(array_agg(x.body ORDER BY x.n),'{}'), coalesce(array_agg(x.polarity ORDER BY x.n),'{}'),
   coalesce(array_agg(x.gone ORDER BY x.n),'{}'), coalesce(array_agg(x.same ORDER BY x.n),'{}'), coalesce(array_agg(x.of_kept ORDER BY x.n),'{}'),
   coalesce(array_agg(x.own ORDER BY x.n),'{}'), coalesce(array_agg(x.excepts ORDER BY x.n),'{}'), coalesce(array_agg(x.clause ORDER BY x.n),'{}')
  INTO bodies, polarities, goes, sames, of_kept, owns, excepts, clauses
  FROM (SELECT row_number() OVER () AS n, y.* FROM (SELECT z.*, true AS of_kept FROM sophia.note_pieces(p_kept,true) z
    UNION ALL SELECT z.*, false FROM sophia.note_pieces(p_change,false) z) y) x;
 SELECT coalesce(bool_or(sophia.note_blanket(u.body,NULL) AND (u.polarity='keep'
   OR u.body ~ '\m(only|solely|exclusively)\M|-only\M|\m(limited|confined|restricted)\s+to\M')),false),
  coalesce(bool_or(u.polarity='keep' AND u.body ~ ('\m(the\s+)?(rest|remainder)\M|\meverything\M|\m(all|anything)\s+else\M'
   ||'|\m(all|every|each)\s+(of\s+)?(the\s+)?(other|remaining|original|existing)\M|\m(the\s+)?(other|remaining)\s+(sections?|parts?|text|content)\M'
   ||'|\motherwise\M')),false) INTO rest, rest_kept
  FROM unnest(bodies,polarities) u(body,polarity);
 -- A kept note naming a removed section in full, as 0036 refused it, unless the piece naming it says in its own words
 -- that the section went, or excepts it ("everything except the comparison table"); a list taking its words from the
 -- pieces around it ("the comparison table, moved below the summary") does not. Without its name when the task cannot
 -- read its base.
 FOREACH h IN ARRAY gone LOOP
  IF length(h)>=4 AND strpos(kept,lower(h))>0 AND NOT EXISTS(SELECT 1 FROM unnest(bodies,goes,of_kept,owns) u(body,gone,of_kept,own)
    WHERE u.of_kept AND u.own AND u.gone AND strpos(u.body,lower(h))>0) THEN
   out:=out||CASE WHEN readable THEN format('The kept note names "%s", which was removed.',h)
    ELSE 'The kept note names a section that is no longer in the report.' END;
   named:=named||h;
  END IF;
 END LOOP;

 IF cardinality(gone)>0 THEN
  SELECT coalesce(array_agg(x),'{}') INTO renamed FROM jsonb_array_elements_text(coalesce(p_ctx->'renamed','[]')) x;
  -- Each removed section 0036 has not named, as one called kept or unchanged, one disclosed, one renamed, or one left
  -- quiet. A key word of its own is one no remaining heading has; a renamed one (besides the positional rename
  -- research_publish passes in) shares a word of its own with an added heading ("Recommendations for buyers",
  -- "Revised recommendations"). Pieces are read with their key words and their text as words between single spaces
  -- (for a heading named in full, never across two).
  -- * A "kept" piece of the change note naming it in full calls it unchanged.
  -- * A piece that says the section went (or excepts it) discloses it by its heading or a key word of its own, whatever
  --   else the notes call kept ("Removed the table, keeping the comparison in prose").
  -- * Otherwise a "kept" piece naming it by a key word of its own that no added heading shares calls it kept, or
  --   unchanged ("the table is retained" of a "Comparison table" become "Comparison at a glance").
  -- * Otherwise a renamed one is set aside, unless the notes claim the rest was kept and no piece that does not say
  --   "kept" names it ("Revised the recommendations; the rest is unchanged" of a "Comparison table" become "Comparison
  --   summary").
  -- * Otherwise a piece that says something went by a word it shares with a remaining heading discloses it, unless that
  --   piece names another removed section by a word of its own ("removed the battery chemistry section" says nothing of
  --   "Battery costs") or a remaining one by a word only remaining headings have ("cut a sentence from the battery
  --   chemistry section", of a chemistry section still there, says nothing of "Battery costs").
  -- A piece that only says something changed ("updated the comparison table", "rewrote the recommendations, and the
  -- table and limitations are as they were") discloses nothing. A wholesale removal said beside a claim that the rest
  -- was kept ("rewrote the report as recommendations only; the rest is unchanged") covers nothing; a count still does.
  WITH p AS MATERIALIZED (SELECT u.n, u.polarity, u.gone, u.of_kept, u.body, ' '||btrim(regexp_replace(u.body,'[^[:alnum:]]+',' ','g'))||' ' AS t,
     -- A list that went, whose subject is the whole report ("everything except the title ... was removed").
     CASE WHEN u.gone AND u.body ~ ('^\s*(the\s+)?(everything|rest|remainder|all\s+(the\s+)?(other\s+|earlier\s+|original\s+)?sections?'
       ||'|every\s+([[:alpha:]]+\s+)?section)\s*$') THEN 1000000 ELSE sophia.note_removes_all(u.body) END AS removes
    FROM unnest(bodies,polarities,goes,of_kept) WITH ORDINALITY u(body,polarity,gone,of_kept,n)),
   pw AS MATERIALIZED (SELECT DISTINCT p.n, w FROM p, unnest(sophia.note_words(p.body)) w),
   texts AS (SELECT coalesce(string_agg(p.t,'|') FILTER (WHERE NOT p.of_kept AND p.polarity='keep'),'') AS unchanged,
     coalesce(string_agg(p.t,'|') FILTER (WHERE p.polarity<>'keep' AND p.gone),'') AS went,
     coalesce(max(p.removes) FILTER (WHERE NOT rest_kept OR p.removes<1000000),0) AS removes FROM p),
   g AS (SELECT u.h, u.i, btrim(regexp_replace(lower(left(u.h,200)),'[^[:alnum:]]+',' ','g')) AS t FROM unnest(gone) WITH ORDINALITY u(h,i)
     WHERE u.h <> ALL (named) AND u.h <> ALL (renamed)),
   remaining AS MATERIALIZED (SELECT DISTINCT w FROM unnest(ARRAY['revised','unchanged']) k, jsonb_array_elements_text(p_facts->k) y,
     unnest(sophia.note_words(y)) w),
   added AS MATERIALIZED (SELECT DISTINCT w FROM jsonb_array_elements_text(p_facts->'added') y, unnest(sophia.note_words(y)) w),
   words AS MATERIALIZED (SELECT g.i, x.w, r.w IS NULL AS own, a.w IS NOT NULL AS shared FROM g CROSS JOIN LATERAL unnest(sophia.note_words(g.h)) x(w)
     LEFT JOIN remaining r ON r.w=x.w LEFT JOIN added a ON a.w=x.w),
   gw AS MATERIALIZED (SELECT DISTINCT w FROM unnest(gone) x, unnest(sophia.note_words(x)) w),
   claimed AS (SELECT DISTINCT p.n FROM words JOIN pw ON pw.w=words.w JOIN p ON p.n=pw.n WHERE words.own AND p.polarity<>'keep' AND p.gone
     UNION SELECT pw.n FROM pw JOIN remaining r ON r.w=pw.w WHERE NOT EXISTS(SELECT 1 FROM gw WHERE gw.w=pw.w)),
   s AS (SELECT words.i, bool_or(words.own AND words.shared) AS renamed,
      coalesce(bool_or(words.own AND p.polarity<>'keep'),false) AS mentioned,
      coalesce(bool_or(words.own AND p.polarity<>'keep' AND p.gone),false) AS own_went,
      coalesce(bool_or(words.own AND NOT words.shared AND p.of_kept AND p.polarity='keep'),false) AS own_kept,
      coalesce(bool_or(words.own AND NOT words.shared AND NOT p.of_kept AND p.polarity='keep'),false) AS own_unchanged,
      coalesce(bool_or(NOT words.own AND p.polarity<>'keep' AND p.gone AND c.n IS NULL),false) AS shared_went
     FROM words LEFT JOIN pw ON pw.w=words.w LEFT JOIN p ON p.n=pw.n LEFT JOIN claimed c ON c.n=p.n GROUP BY words.i),
   c AS (SELECT g.h, g.i, CASE
      WHEN g.t<>'' AND strpos(texts.unchanged,' '||g.t||' ')>0 THEN 'unchanged'
      WHEN s.own_went OR (g.t<>'' AND strpos(texts.went,' '||g.t||' ')>0) THEN 'disclosed'
      WHEN s.own_kept THEN 'kept'
      WHEN s.own_unchanged THEN 'unchanged'
      WHEN s.renamed AND (s.mentioned OR NOT rest) THEN 'renamed'
      WHEN s.shared_went THEN 'disclosed'
      ELSE 'quiet' END AS kind
    FROM g CROSS JOIN texts LEFT JOIN s ON s.i=g.i)
  SELECT coalesce(array_agg(CASE WHEN NOT readable AND c.kind='kept' THEN 'The kept note names a section that is no longer in the report.'
      WHEN NOT readable THEN 'The change note calls a section unchanged that is no longer in the report.'
      ELSE format(CASE c.kind WHEN 'kept' THEN 'The kept note names "%s", which was removed.' ELSE 'The change note calls "%s" unchanged, but it was removed.' END,
       CASE WHEN length(c.h)>200 THEN left(c.h,199)||'…' ELSE c.h END) END ORDER BY c.i) FILTER (WHERE c.kind IN ('kept','unchanged')),'{}'),
   coalesce(array_agg(c.h ORDER BY c.i) FILTER (WHERE c.kind='quiet'),'{}'), (SELECT texts.removes FROM texts)
   INTO called, quiet, covered FROM c;
  out:=out||called;
  -- The quiet ones, unless a wholesale removal or a count covers them; where the task cannot read its base, only when
  -- the notes claim the rest was kept, and by their number.
  IF cardinality(quiet)>0 AND covered<cardinality(quiet) AND readable THEN
   lead:=CASE WHEN rest THEN 'The notes say the rest of the report was kept, but ' ELSE 'The notes do not say that ' END
    ||CASE WHEN cardinality(quiet)=1 THEN '1 section was' ELSE cardinality(quiet)||' sections were' END||' removed: ';
   out:=out||(lead||sophia.note_names(quiet,299-length(lead),true)||'.');
   told_quiet:=true;
  ELSIF cardinality(quiet)>0 AND covered<cardinality(quiet) AND rest THEN
   out:=out||('The notes say the rest of the report was kept, but '||CASE WHEN cardinality(quiet)=1 THEN '1 section of the earlier version is'
    ELSE cardinality(quiet)||' sections of the earlier version are' END||' no longer in it.');
  END IF;
  -- Where the task can read its base, a section called kept or left quiet can be restored from it: said last, and
  -- always within the 20.
  IF (cardinality(called)>0 OR told_quiet OR cardinality(named)>0) AND readable AND p_ctx->>'baseVersion' IS NOT NULL THEN
   restore:=left(format('New notes do not bring these sections back: research_write_draft replaced the whole report. Unless the request asked '
    ||'to remove them, restore them from version %s (sourceId %s) with research_write_draft, then submit again; if it did, name them in changeNote.',
    p_ctx->>'baseVersion',p_ctx->>'baseSourceId'),300);
  END IF;
 END IF;

 -- A revised section that a piece saying the text is the same names ("the comparison table is unchanged", "Comparison
 -- table as it was"), by its whole heading or a key word only it has among the headings, while no piece that does not
 -- say "kept" names it ("trimmed the comparison table; the rest of it is unchanged") and no later piece of its clause
 -- qualifies it: an exception, or a change to a row, a figure, a word..., naming no other heading ("unchanged, except for
 -- one row", "same format, one row removed", "keeps its layout but has one row fewer"; not "but the sources were
 -- updated"). section_facts compares each section's own text, never its
 -- subsections', so a named heading it lists as revised is a change the note denies. Not a heading that is also
 -- unchanged (a repeated one), nor the conclusion or recommendations (0036's rules above), nor the outermost heading by
 -- its words alone (they are the report's topic: "the phone comparison table is unchanged"); a word after a possessive
 -- names a part of another section ("the summary's comparison"); and "kept" or "still there" says the section is
 -- there, which a revised one is.
 IF jsonb_array_length(p_facts->'revised')>0 THEN
  WITH p AS MATERIALIZED (SELECT u.n, u.polarity, u.same, u.of_kept, u.excepts, u.clause, x.bare,
     ' '||btrim(regexp_replace(x.bare,'[^[:alnum:]]+',' ','g'))||' ' AS t
    FROM unnest(bodies,polarities,sames,of_kept,excepts,clauses) WITH ORDINALITY u(body,polarity,same,of_kept,excepts,clause,n)
     CROSS JOIN LATERAL (SELECT regexp_replace(u.body,'\m[[:alnum:]-]+[''’]s\s+[[:alnum:]-]+',' ','g') AS bare) x),
   pw AS MATERIALIZED (SELECT DISTINCT p.n, w FROM p, unnest(sophia.note_words(p.bare)) w),
   r AS (SELECT e.x AS h, min(e.i) AS i, btrim(regexp_replace(lower(left(e.x,200)),'[^[:alnum:]]+',' ','g')) AS t
     FROM jsonb_array_elements_text(p_facts->'revised') WITH ORDINALITY e(x,i)
     WHERE sophia.heading_anchor(e.x) !~ '(conclusion|recommendation)'
      AND lower(e.x) NOT IN (SELECT lower(y) FROM jsonb_array_elements_text(p_facts->'unchanged') y)
     GROUP BY e.x),
   elsewhere AS MATERIALIZED (SELECT DISTINCT w FROM unnest(ARRAY['added','removed','unchanged']) k, jsonb_array_elements_text(p_facts->k) y,
     unnest(sophia.note_words(y)) w UNION SELECT w FROM unnest(sophia.note_words(p_ctx->>'title')) w),
   alone AS MATERIALIZED (SELECT x.w FROM (SELECT DISTINCT e.x, w FROM jsonb_array_elements_text(p_facts->'revised') e(x),
     unnest(sophia.note_words(e.x)) w) x WHERE NOT EXISTS(SELECT 1 FROM elsewhere o WHERE o.w=x.w) GROUP BY x.w HAVING count(*)=1),
   hits AS (SELECT r.i, p.n FROM r JOIN p ON r.t<>'' AND strpos(p.t,' '||r.t||' ')>0
     UNION SELECT r.i, pw.n FROM r CROSS JOIN LATERAL unnest(sophia.note_words(r.h)) x(w) JOIN alone a ON a.w=x.w JOIN pw ON pw.w=x.w),
   headings AS MATERIALIZED (SELECT DISTINCT w FROM unnest(ARRAY['added','removed','revised','unchanged']) k, jsonb_array_elements_text(p_facts->k) y,
     unnest(sophia.note_words(y)) w),
   hr AS MATERIALIZED (SELECT DISTINCT r.i, w FROM r JOIN hits ON hits.i=r.i CROSS JOIN LATERAL unnest(sophia.note_words(r.h)||'{}'::text[]) w),
   qualifies AS (SELECT DISTINCT hits.i, q.n, q.of_kept, q.clause FROM hits JOIN p q ON q.excepts OR (q.polarity<>'keep'
      AND q.bare ~ ('\m('||sophia.note_part_words()||')\M'))
     WHERE NOT EXISTS(SELECT 1 FROM pw JOIN headings hd ON hd.w=pw.w WHERE pw.n=q.n
      AND NOT EXISTS(SELECT 1 FROM hr WHERE hr.i=hits.i AND hr.w=pw.w)))
  SELECT coalesce(array_agg(format('The note calls "%s" unchanged, but it was revised.',CASE WHEN length(r.h)>200 THEN left(r.h,199)||'…' ELSE r.h END)
    ORDER BY r.i),'{}') INTO revised
   FROM r WHERE EXISTS(SELECT 1 FROM hits JOIN p ON p.n=hits.n WHERE hits.i=r.i AND p.polarity='keep' AND p.same
     AND NOT EXISTS(SELECT 1 FROM qualifies q WHERE q.i=r.i AND q.of_kept=p.of_kept AND q.clause=p.clause AND q.n>p.n))
    AND NOT EXISTS(SELECT 1 FROM hits JOIN p ON p.n=hits.n WHERE hits.i=r.i AND p.polarity<>'keep');
  out:=out||revised;
 END IF;
 out:=coalesce((SELECT array_agg(d.x ORDER BY d.i) FROM (SELECT left(u.y,300) AS x, min(u.i) AS i FROM unnest(out) WITH ORDINALITY u(y,i)
   GROUP BY 1) d),'{}');
 RETURN CASE WHEN restore IS NULL THEN out[1:20] ELSE out[1:19]||restore END;
END $$;
REVOKE ALL ON FUNCTION sophia.amendment_note_problems(text,text,jsonb,jsonb) FROM PUBLIC;

-- note_problems (0036), replaced: the gate above with no context. Its grants stay (none).
CREATE OR REPLACE FUNCTION sophia.note_problems(p_change text, p_kept text, p_facts jsonb) RETURNS text[] LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$
 SELECT sophia.amendment_note_problems(p_change,p_kept,p_facts,'{}') $$;

-- template_notes (0027), replaced: notes written from the facts, when the model's still contradicted them after its
-- repair, in 0027's form ("1 revised: X; 2 added: Y, Z; 1 removed: W.", "4 unchanged: ...") and each within 200
-- characters, but with whole headings: the counts first, then the removed headings, the added and the revised in the
-- room left, what does not fit counted (", … and 3 more").
CREATE OR REPLACE FUNCTION sophia.template_notes(p_facts jsonb) RETURNS TABLE(change_note text, retained_note text)
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE kinds constant text[]:=ARRAY['revised','added','removed']; heads text[]:='{}'; lists text[]:=ARRAY['','','']; names text[];
 room integer; k integer;
BEGIN
 FOR k IN 1..3 LOOP
  heads:=heads||CASE WHEN jsonb_array_length(p_facts->kinds[k])>0 THEN jsonb_array_length(p_facts->kinds[k])||' '||kinds[k] END;
 END LOOP;
 room:=199-coalesce(length(array_to_string(heads,'; ')),0);
 FOREACH k IN ARRAY ARRAY[3,2,1] LOOP
  CONTINUE WHEN heads[k] IS NULL;
  SELECT array_agg(x ORDER BY i) INTO names FROM jsonb_array_elements_text(p_facts->kinds[k]) WITH ORDINALITY e(x,i);
  lists[k]:=sophia.note_names(names,room-2,false);
  IF lists[k]<>'' THEN room:=room-2-length(lists[k]); END IF;
 END LOOP;
 change_note:=coalesce(nullif(array_to_string(ARRAY(SELECT heads[x]||CASE WHEN lists[x]<>'' THEN ': '||lists[x] ELSE '' END
   FROM generate_series(1,3) x WHERE heads[x] IS NOT NULL ORDER BY x),'; '),''),'No section changed')||'.';
 retained_note:=NULL;
 IF jsonb_array_length(p_facts->'unchanged')>0 THEN
  SELECT array_agg(x ORDER BY i) INTO names FROM jsonb_array_elements_text(p_facts->'unchanged') WITH ORDINALITY e(x,i);
  retained_note:=jsonb_array_length(p_facts->'unchanged')||' unchanged';
  retained_note:=retained_note||coalesce(': '||nullif(sophia.note_names(names,197-length(retained_note),false),''),'')||'.';
 END IF;
 RETURN NEXT;
END $$;

-- --- what a version may cite --------------------------------------------------------------------------------------

-- Whether a version of this task may cite a source: what it may read (research_readable), or what its base cited that
-- its draft starts with: an input of its lineage this task was not given again (its text stays unreadable to the task:
-- the runtime's disclosure guard indexes the task's own inputs), or an earlier version of the same report (a version
-- may cite the one it amends, CC-0019 #7). Never a question, another task's manifest or draft, or a source that is
-- withdrawn.
CREATE FUNCTION sophia.research_citable(s sophia.research_scope, p_source uuid) RETURNS boolean LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT sophia.research_readable(s,p_source) OR EXISTS(
  SELECT 1 FROM sophia.source_texts m CROSS JOIN LATERAL (SELECT m.body::jsonb->'base' AS base) x
   JOIN sophia.source_dependencies d ON d.project_id=m.project_id AND d.derived_source_id=(x.base->>'sourceId')::uuid AND d.source_id=p_source
  WHERE m.project_id=s.project_id AND m.source_id=s.manifest_source_id
   AND (EXISTS(SELECT 1 FROM sophia.artifact_versions v WHERE v.project_id=s.project_id
      AND v.artifact_id=(x.base->>'artifactId')::uuid AND v.source_id=p_source)
    OR EXISTS(SELECT 1 FROM sophia.research_tasks t JOIN sophia.jobs j ON j.project_id=t.project_id AND j.id=t.job_id
      JOIN sophia.source_dependencies i ON i.project_id=j.project_id AND i.derived_source_id=j.input_source_id AND i.source_id=p_source
     WHERE t.project_id=s.project_id AND t.root_job_id=s.root_job_id)
     AND NOT EXISTS(SELECT 1 FROM sophia.research_tasks q WHERE q.project_id=s.project_id AND q.question_source_id=p_source))
   AND NOT sophia.source_withdrawn(s.project_id,p_source)) $$;
REVOKE ALL ON FUNCTION sophia.research_citable(sophia.research_scope,uuid) FROM PUBLIC;

-- research_draft_citations (0036), replaced: the same, and an id the task may cite (research_citable), where it read
-- research_readable.
CREATE OR REPLACE FUNCTION sophia.research_draft_citations(s sophia.research_scope, p_result jsonb, p_candidates jsonb) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 WITH d AS (SELECT r.source_id, r.sha256 FROM sophia.research_drafts r WHERE r.project_id=s.project_id AND r.attempt_id=s.attempt_id
   ORDER BY r.seq DESC LIMIT 1),
  current AS (SELECT replace(lower(t.body),E'\\','') AS body FROM d
   JOIN sophia.source_texts t ON t.project_id=s.project_id AND t.source_id=d.source_id
   WHERE d.sha256=p_result->>'draftSha256' AND jsonb_typeof(p_result->'citations')='array'),
  listed AS (SELECT lower(c) AS id FROM current, jsonb_array_elements_text(p_result->'citations') c),
  offered AS (SELECT CASE WHEN lower(c.v#>>'{}') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     THEN lower(c.v#>>'{}')::uuid END AS id, c.o
    FROM jsonb_array_elements(CASE jsonb_typeof(p_candidates) WHEN 'array' THEN p_candidates ELSE '[]' END) WITH ORDINALITY c(v,o)
    WHERE c.o<=7282 AND jsonb_typeof(c.v)='string'),
  named AS MATERIALIZED (SELECT n.id, min(n.o) AS first FROM offered n
   WHERE n.id IS NOT NULL AND EXISTS(SELECT 1 FROM current)
    AND NOT EXISTS(SELECT 1 FROM listed l WHERE l.id=n.id::text)
    AND n.id IS DISTINCT FROM s.question_source_id AND n.id IS DISTINCT FROM s.manifest_source_id
    AND NOT EXISTS(SELECT 1 FROM sophia.research_drafts r WHERE r.project_id=s.project_id AND r.attempt_id=s.attempt_id
     AND r.source_id=n.id)
    AND EXISTS(SELECT 1 FROM sophia.source_objects o WHERE o.project_id=s.project_id AND o.id=n.id)
   GROUP BY n.id),
  readable AS MATERIALIZED (SELECT id, first FROM named WHERE sophia.research_citable(s,id)),
  extra AS (SELECT r.id, r.first FROM readable r, current WHERE strpos(current.body,r.id::text)>0
   ORDER BY r.first LIMIT greatest(0,200-(SELECT count(DISTINCT id) FROM listed)))
 SELECT CASE WHEN EXISTS(SELECT 1 FROM extra)
  THEN jsonb_set(p_result,'{citations}',(p_result->'citations')||(SELECT jsonb_agg(id ORDER BY first) FROM extra))
  ELSE p_result END $$;

-- --- the amendment's draft and task statement ------------------------------------------------------------------

-- The research create's text: research_prompt's (0025), then what every task is asked. An amendment's says first,
-- before the question, what an update is (see the header): its draft starts as its base (dispatch_runtime_outbox seeds
-- it before it sends this). Its lines are application text, model-facing: a change to them changes how the worker
-- updates a report. The report's title is a worker's text, so it is quoted as a JSON string: a quote in it cannot end
-- the title and start an instruction.
CREATE FUNCTION sophia.research_task_statement(p_project uuid, p_manifest jsonb) RETURNS text LANGUAGE plpgsql STABLE
SET search_path=pg_catalog,sophia AS $$
DECLARE
 -- A base longer than this is more than one research_write_draft call can carry under the route's output limit
 -- (16000 tokens, reasoning included; a turn cut there fails the task).
 rewrite_limit constant integer:=20000;
 -- What every research task is asked, after its manifest; a rule for every task is one more line here.
 asked constant text[]:=ARRAY['If the question states a length, the sections it wants, or a limit on web searches or page reads, keep to it, '
  ||'and say in the limitations where you could not.'];
 statement text:=sophia.research_prompt(p_manifest); cut integer:=strpos(statement,E'\n\nQuestion: '); n integer; title text; size integer;
BEGIN
 SELECT v.version_number, regexp_replace(a.title,'\s+',' ','g'), char_length(t.body) INTO n, title, size
  FROM sophia.artifact_versions v JOIN sophia.artifacts a ON a.project_id=v.project_id AND a.id=v.artifact_id
  LEFT JOIN sophia.source_texts t ON t.project_id=v.project_id AND t.source_id=v.source_id
  WHERE v.project_id=p_project AND v.id=(p_manifest->'base'->>'versionId')::uuid AND v.source_id=(p_manifest->'base'->>'sourceId')::uuid;
 IF n IS NOT NULL AND cut>0 THEN
  statement:=left(statement,cut+1)||concat_ws(E'\n',
   format('This task updates version %s of an existing report, %s. It does not write a new report.',n,to_json(title)::text),
   format('- Your draft already holds version %s''s full text: research_read_context shows it as your current draft. '
    ||'Read it whole, then edit it. When you write, pass its sha256 as expectedSha256, not null.',n),
   '- research_write_draft replaces the whole report, and the published version is exactly your draft: a section, table, link or '
    ||'citation your draft leaves out is deleted, not kept.',
   '- Change only what the question asks. Keep every other section, table and citation link as it stands.',
   '- Remove or restructure a section only when the question asks; then name each removed section in changeNote. retainedNote '
    ||'names only what you kept unchanged.',
   format('- Version %s is the document you are editing, not a source: keep the citations already in the text, and cite any new '
    ||'source you read.',n),
   '- If the question limits web searches or reads, keep to it.',
   CASE WHEN size>rewrite_limit THEN '- This report is longer than one draft call can carry here. Do not rewrite it: call '
    ||'research_report_blocker naming the requested change. Never submit a shortened report.' END)
   ||substr(statement,cut);
 END IF;
 RETURN statement||E'\n\n'||array_to_string(asked,E'\n');
END $$;
REVOKE ALL ON FUNCTION sophia.research_task_statement(uuid,jsonb) FROM PUBLIC;

-- dispatch_runtime_outbox (0025), replaced: the same, and a research create whose manifest has a base starts its
-- attempt with a draft that is a copy of the base's text, and is sent research_task_statement's text. The base is
-- readable here: a create whose base was withdrawn is refused above (native_delivery_ineligible reads the manifest's
-- closure, its base included). The seed is written once: an attempt's create is sent once (one runtime command per
-- outbox row; a rebuild is a new attempt), and the drafts' key refuses a second seq 1.
CREATE OR REPLACE FUNCTION sophia.dispatch_runtime_outbox(p_project uuid, p_outbox uuid, p_lease_token uuid) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE o sophia.outbox; g sophia.goals; c sophia.commands; b sophia.execution_bindings; rt sophia.runtime_instances; why text;
 kind text; payload jsonb:='{}'; next_seq bigint; command_body jsonb; rc_id uuid:=gen_random_uuid(); manifest jsonb; txt text;
 job_kind text; job_id uuid; base uuid; seed sophia.source_objects;
BEGIN
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 SELECT * INTO o FROM sophia.outbox WHERE project_id=p_project AND id=p_outbox FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Outbox row not found' USING ERRCODE='22023'; END IF;
 IF o.state<>'dispatching' OR o.lease_token IS DISTINCT FROM p_lease_token THEN RAISE EXCEPTION 'Lease lost; reconcile before recording' USING ERRCODE='40001'; END IF;
 IF o.lease_until<clock_timestamp() THEN
  UPDATE sophia.outbox SET state='outcome_unknown' WHERE project_id=p_project AND id=p_outbox;
  RETURN jsonb_build_object('result','outcome_unknown','reason','the dispatch lease expired');
 END IF;
 SELECT * INTO g FROM sophia.goals WHERE project_id=p_project AND id=o.goal_id FOR UPDATE;
 SELECT * INTO c FROM sophia.commands WHERE project_id=p_project AND id=o.command_id FOR UPDATE;
 IF o.destination='control.settle' THEN
  PERFORM sophia.settle_native_control(p_project,g.id);
  UPDATE sophia.outbox SET state='settled', lease_until=NULL WHERE project_id=p_project AND id=p_outbox;
  UPDATE sophia.commands SET state='checked' WHERE project_id=p_project AND id=c.id AND state IN ('admitted','dispatching');
  RETURN jsonb_build_object('result','settled');
 END IF;
 SELECT * INTO b FROM sophia.execution_bindings WHERE project_id=p_project AND id=o.binding_id FOR UPDATE;
 SELECT * INTO rt FROM sophia.runtime_instances WHERE project_id=p_project AND resource_id=b.resource_id AND runtime_unit_id=b.runtime_unit_id AND state='active';
 IF o.cleanup THEN
  kind:=c.kind;  -- hold or stop (admit_goal_command writes native.stop rows for both)
  IF b.state IN ('settled','lost') OR (b.state='created' AND NOT EXISTS(SELECT 1 FROM sophia.runtime_commands WHERE project_id=p_project AND binding_id=b.id)) THEN
   -- Nothing native was ever started (or it is already settled): the fence is the whole effect.
   UPDATE sophia.execution_bindings SET state='settled' WHERE project_id=p_project AND id=b.id AND state<>'lost';
   UPDATE sophia.outbox SET state='settled', lease_until=NULL WHERE project_id=p_project AND id=p_outbox;
   UPDATE sophia.commands SET state='checked' WHERE project_id=p_project AND id=c.id AND state IN ('admitted','dispatching');
   PERFORM sophia.settle_native_control(p_project,g.id);
   RETURN jsonb_build_object('result','settled','reason','no native session to fence');
  END IF;
  IF rt.id IS NULL THEN RETURN sophia.deny_native_delivery(o,c,'no active runtime for its executor resource and runtime unit'); END IF;
 ELSE
  why:=sophia.native_delivery_ineligible(o,g,c,b,rt);
  IF why IS NOT NULL THEN RETURN sophia.deny_native_delivery(o,c,why); END IF;
  why:=sophia.runtime_unavailable(rt);
  IF why IS NOT NULL THEN RETURN sophia.defer_native_delivery(o,c,why); END IF;
  kind:=substr(o.destination,8);
  IF kind='create' THEN
   SELECT j.kind, j.id, t.body::jsonb INTO job_kind, job_id, manifest FROM sophia.jobs j
    JOIN sophia.source_texts t ON t.project_id=j.project_id AND t.source_id=j.input_source_id
    WHERE j.project_id=p_project AND j.command_id=c.id;
   IF job_kind='research' THEN
    -- One research worker: another research task already started and not yet ended keeps this one queued.
    IF EXISTS(SELECT 1 FROM sophia.jobs j2 JOIN sophia.execution_bindings b2 ON b2.project_id=j2.project_id AND b2.attempt_id=j2.attempt_id
      JOIN sophia.work_attempts w2 ON w2.project_id=j2.project_id AND w2.id=j2.attempt_id
      JOIN sophia.goals g2 ON g2.project_id=w2.project_id AND g2.id=w2.goal_id
      WHERE j2.project_id=p_project AND j2.kind='research' AND j2.id<>job_id AND j2.state IN ('pending','running','outcome_unknown')
       AND b2.state IN ('launching','running','idle') AND g2.status IN ('ready','running','checking')) THEN
     RETURN sophia.defer_native_delivery(o,c,'waiting for the research worker: another research task is under way');
    END IF;
    -- An amendment edits its base: the attempt's first draft is a copy of the base's text. A copy, never the base's
    -- own source: source_closure follows a draft to its task's manifest, so the base would draw on this task's inputs.
    -- The copy draws on the base through that manifest; it has no dependency of its own, so a version published from
    -- it unedited lists only what it cites.
    base:=(manifest->'base'->>'sourceId')::uuid;
    IF base IS NOT NULL THEN
     SELECT t.body INTO txt FROM sophia.source_texts t WHERE t.project_id=p_project AND t.source_id=base;
     seed:=sophia.put_text_source(p_project,c.actor_id,'text/markdown; charset=utf-8',txt);
     INSERT INTO sophia.research_drafts(project_id,attempt_id,seq,call_key,source_id,sha256)
     VALUES(p_project,b.attempt_id,1,'base:'||(manifest->'base'->>'versionId'),seed.id,seed.sha256);
    END IF;
    payload:=jsonb_build_object('role',manifest->>'role','route',manifest->>'route','text',sophia.research_task_statement(p_project,manifest));
   ELSE
    payload:=jsonb_build_object('role','sophia-brief-v1','text',sophia.draft_brief_prompt(manifest));
   END IF;
  ELSIF kind IN ('steer','input') THEN
   SELECT t.body INTO txt FROM sophia.source_texts t WHERE t.project_id=p_project AND t.source_id=c.body_source_id;
   IF txt IS NULL THEN RETURN sophia.deny_native_delivery(o,c,'its instruction has no readable text'); END IF;
   payload:=jsonb_build_object('text',txt);
  END IF;
 END IF;
 UPDATE sophia.runtime_instances SET command_sequence=command_sequence+1 WHERE id=rt.id RETURNING command_sequence INTO next_seq;
 command_body:=jsonb_build_object('schema','sophia.runtime-command.v1','commandId',rc_id,
  'binding',jsonb_build_object('projectId',p_project,'goalId',g.id,'goalRevision',g.revision,'attemptId',b.attempt_id,
   'resourceId',b.resource_id,'authorityEpoch',o.authority_epoch,'runtimeUnitId',b.runtime_unit_id),
  'kind',kind,'expectedNativeSessionId',CASE WHEN kind='resume' THEN to_jsonb(b.native_session_id) ELSE 'null'::jsonb END,
  'contextPacketId',CASE WHEN kind='create' THEN to_jsonb((SELECT input_source_id::text FROM sophia.jobs WHERE project_id=p_project AND command_id=c.id)) ELSE 'null'::jsonb END,
  'payload',payload);
 INSERT INTO sophia.runtime_commands(project_id,runtime_id,seq,id,outbox_id,command_id,binding_id,attempt_id,kind,authority_epoch,body)
 VALUES(p_project,rt.id,next_seq,rc_id,o.id,c.id,b.id,b.attempt_id,kind,o.authority_epoch,command_body);
 UPDATE sophia.outbox SET state='acknowledged', lease_until=NULL, outcome_reason=NULL WHERE project_id=p_project AND id=p_outbox;
 UPDATE sophia.commands SET state='dispatching' WHERE project_id=p_project AND id=c.id AND state='admitted';
 IF kind='create' THEN
  UPDATE sophia.execution_bindings SET state='launching' WHERE project_id=p_project AND id=b.id AND state='created';
  UPDATE sophia.jobs SET reason=NULL WHERE project_id=p_project AND command_id=c.id AND state='pending'
   AND (reason LIKE 'waiting for Sophia''s runtime%' OR reason LIKE 'waiting for the research worker%');
 END IF;
 RETURN jsonb_build_object('result','enqueued','runtimeId',rt.id,'seq',next_seq,'runtimeCommandId',rc_id);
END $$;
REVOKE ALL ON FUNCTION sophia.dispatch_runtime_outbox(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.dispatch_runtime_outbox(uuid,uuid,uuid) TO sophia_worker;

-- --- publication, replaced --------------------------------------------------------------------------------------

-- research_publish (0027), replaced: the same, and
-- * an amendment's notes pass amendment_note_problems: with the renamed outermost heading (one on each side, under
--   another anchor), and, while the task can read its base, the base's version to restore removed sections from; a
--   refusal to a task that cannot read its base carries no facts;
-- * a draft that is still the version it amends, unchanged, is refused, with those problems, under the same one
--   refusal: the second submit publishes it with notes from the facts, as the refusal says (the model's notes on a
--   report it did not change cannot be checked against facts that show no change);
-- * an earlier draft of the attempt (the base's copy among them) leaves the model's list, which must still name a
--   source; the citations are checked with research_citable;
-- * the sources added and dropped leave out the report's own versions.
CREATE OR REPLACE FUNCTION sophia.research_publish(s sophia.research_scope, p_key text, p_result jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE t sophia.research_tasks; j sophia.jobs; g sophia.goals; d sophia.research_drafts; a sophia.artifacts; prev sophia.artifact_versions;
 v sophia.artifact_versions; citations uuid[]; previous uuid[]; lims text[]; vnum integer; validation sophia.source_objects;
 result sophia.source_objects; v_title text:=btrim(p_result->>'title'); v_summary text:=btrim(p_result->>'summary');
 v_answer text:=btrim(p_result->>'resultSummary'); v_change text:=nullif(btrim(coalesce(p_result->>'changeNote','')),'');
 v_kept text:=nullif(btrim(coalesce(p_result->>'retainedNote','')),''); bad uuid; artifact uuid; v_bytes bigint; v_previous_bytes bigint;
 sections jsonb; problems text[]; replaced boolean:=false; new_text text; old_text text; base jsonb; base_ok boolean:=false; renamed jsonb;
 versions uuid[]; title text;
BEGIN
 SELECT * INTO t FROM sophia.research_tasks WHERE project_id=s.project_id AND job_id=s.job_id FOR UPDATE;
 SELECT * INTO j FROM sophia.jobs WHERE project_id=s.project_id AND id=s.job_id FOR UPDATE;
 SELECT * INTO g FROM sophia.goals WHERE project_id=s.project_id AND id=s.goal_id;
 IF v_title IS NULL OR length(v_title) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'A report has a title of 1 to 200 characters' USING ERRCODE='22023'; END IF;
 IF v_summary IS NULL OR length(v_summary) NOT BETWEEN 1 AND 240 THEN RAISE EXCEPTION 'A report has a description of 1 to 240 characters' USING ERRCODE='22023'; END IF;
 IF v_answer IS NULL OR length(v_answer) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'A result summary is 1 to 2000 characters' USING ERRCODE='22023'; END IF;
 IF length(v_change)>200 OR length(v_kept)>200 THEN RAISE EXCEPTION 'A version note is at most 200 characters' USING ERRCODE='22023'; END IF;
 SELECT coalesce(array_agg(x ORDER BY i),'{}') INTO lims FROM jsonb_array_elements_text(coalesce(p_result->'limitations','[]')) WITH ORDINALITY AS e(x,i);
 IF cardinality(lims)>8 OR EXISTS(SELECT 1 FROM unnest(lims) l WHERE length(l) NOT BETWEEN 1 AND 300) THEN
  RAISE EXCEPTION 'At most 8 limitations of 1 to 300 characters' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_result->'citations')<>'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_result->'citations') c
   WHERE c !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
  RAISE EXCEPTION 'Citations are source ids' USING ERRCODE='22023'; END IF;
 SELECT coalesce(array_agg(DISTINCT c::uuid),'{}') INTO citations FROM jsonb_array_elements_text(p_result->'citations') c;
 IF cardinality(citations) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'A report cites 1 to 200 sources' USING ERRCODE='22023'; END IF;

 SELECT * INTO d FROM sophia.research_drafts WHERE project_id=s.project_id AND attempt_id=s.attempt_id ORDER BY seq DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Research draft not found' USING ERRCODE='22023'; END IF;
 IF d.sha256 IS DISTINCT FROM p_result->>'draftSha256' THEN RAISE EXCEPTION 'Stale draft: submit the draft you last read' USING ERRCODE='40001'; END IF;
 -- An earlier draft of the attempt is no source: it leaves the model's list, which must still name one.
 SELECT coalesce(array_agg(x ORDER BY x),'{}') INTO citations FROM unnest(citations) x WHERE NOT EXISTS(SELECT 1 FROM sophia.research_drafts r
  WHERE r.project_id=s.project_id AND r.attempt_id=s.attempt_id AND r.source_id=x AND r.seq<d.seq);
 SELECT x INTO bad FROM unnest(citations) x WHERE x=d.source_id OR NOT sophia.research_citable(s,x) LIMIT 1;
 IF bad IS NOT NULL OR cardinality(citations)=0 THEN RAISE EXCEPTION 'Citation not found' USING ERRCODE='22023'; END IF;

 IF j.artifact_id IS NOT NULL THEN
  SELECT * INTO a FROM sophia.artifacts WHERE project_id=s.project_id AND id=j.artifact_id FOR UPDATE;
 ELSE
  SELECT ar.* INTO a FROM sophia.artifacts ar JOIN sophia.jobs jj ON jj.project_id=ar.project_id AND jj.artifact_id=ar.id
   JOIN sophia.research_tasks rt ON rt.project_id=jj.project_id AND rt.job_id=jj.id
   WHERE ar.project_id=s.project_id AND rt.root_job_id=t.root_job_id LIMIT 1 FOR UPDATE OF ar;
 END IF;
 IF a.id IS NOT NULL THEN
  SELECT * INTO prev FROM sophia.artifact_versions WHERE project_id=s.project_id AND id=a.stable_version_id;
  IF v_change IS NULL THEN RAISE EXCEPTION 'An amended report says what changed' USING ERRCODE='22023'; END IF;
 END IF;

 -- The facts, then the truth gate on the notes.
 SELECT body INTO new_text FROM sophia.source_texts WHERE project_id=s.project_id AND source_id=d.source_id;
 SELECT body INTO old_text FROM sophia.source_texts WHERE project_id=s.project_id AND source_id=prev.source_id;
 sections:=sophia.section_facts(CASE WHEN prev.id IS NULL THEN NULL ELSE coalesce(old_text,'') END,new_text);
 IF prev.id IS NULL THEN v_kept:=NULL; END IF;
 problems:='{}';
 IF prev.id IS NOT NULL THEN
  SELECT m.body::jsonb->'base' INTO base FROM sophia.source_texts m WHERE m.project_id=s.project_id AND m.source_id=s.manifest_source_id;
  base_ok:=base->>'sourceId' IS NOT NULL AND sophia.research_readable(s,(base->>'sourceId')::uuid);
  -- A renamed title is no removal: one outermost heading on each side, under another anchor. The new text's one
  -- outermost heading is the report's title, whose words name its topic, not a section.
  SELECT CASE WHEN count(*) FILTER (WHERE o.was)=1 AND count(*) FILTER (WHERE NOT o.was)=1
    AND min(o.anchor) FILTER (WHERE o.was)<>min(o.anchor) FILTER (WHERE NOT o.was) THEN jsonb_agg(o.heading) FILTER (WHERE o.was) ELSE '[]' END,
   CASE WHEN count(*) FILTER (WHERE NOT o.was)=1 THEN min(o.heading) FILTER (WHERE NOT o.was) END
   INTO renamed, title FROM (SELECT true AS was, x.anchor, x.heading FROM sophia.markdown_outline(old_text) x WHERE x.path ~ '^/[^/]*$'
    UNION ALL SELECT false, x.anchor, x.heading FROM sophia.markdown_outline(new_text) x WHERE x.path ~ '^/[^/]*$') o;
  problems:=sophia.amendment_note_problems(v_change,v_kept,sections,jsonb_build_object('renamed',renamed,'title',title,'disclose',base_ok,
   'baseVersion',CASE WHEN base_ok THEN (SELECT bv.version_number FROM sophia.artifact_versions bv
     WHERE bv.project_id=s.project_id AND bv.id=(base->>'versionId')::uuid) END,
   'baseSourceId',CASE WHEN base_ok THEN base->>'sourceId' END));
  IF d.sha256=prev.source_hash THEN
   problems:=(format('This is about the draft, not the notes: it is still version %s, unchanged. Make the requested change with '
    ||'research_write_draft before you submit again; new notes alone change nothing. If no change is needed, submit it again as it is: it '
    ||'is published unchanged, with notes from the facts.',prev.version_number)||problems)[1:20];
  END IF;
 END IF;
 IF cardinality(problems)>0 THEN
  IF t.notes_rejected_at IS NULL OR t.notes_rejected_call=p_key THEN
   UPDATE sophia.research_tasks SET notes_rejected_at=coalesce(notes_rejected_at,now()), notes_rejected_call=p_key
    WHERE project_id=s.project_id AND job_id=t.job_id;
   -- The facts name the base's headings: not to a task that cannot read its base.
   RETURN jsonb_build_object('taskId',j.id,'outcome','notes_rejected','problems',to_jsonb(problems))
    ||CASE WHEN base_ok THEN jsonb_build_object('sections',sections) ELSE '{}' END;
  END IF;
  SELECT tn.change_note, tn.retained_note INTO v_change, v_kept FROM sophia.template_notes(sections) tn;
  replaced:=true;
 END IF;

 IF a.id IS NULL THEN
  artifact:=gen_random_uuid();
  INSERT INTO sophia.artifacts(project_id,id,title,format,summary,summary_updated_at)
  VALUES(s.project_id,artifact,v_title,'markdown',v_summary,now()) RETURNING * INTO a;
 ELSIF a.summary_author_id IS NULL AND a.summary IS DISTINCT FROM v_summary THEN
  -- A member's own description stays; the worker's is replaced with the new version's.
  UPDATE sophia.artifacts SET summary=v_summary, summary_revision=summary_revision+1, summary_updated_at=now()
   WHERE project_id=s.project_id AND id=a.id RETURNING * INTO a;
 END IF;
 SELECT coalesce(max(version_number),0)+1 INTO vnum FROM sophia.artifact_versions WHERE project_id=s.project_id AND artifact_id=a.id;

 SELECT coalesce(array_agg(dep.source_id ORDER BY dep.source_id),'{}') INTO previous FROM sophia.source_dependencies dep
  WHERE prev.id IS NOT NULL AND dep.project_id=s.project_id AND dep.derived_source_id=prev.source_id;
 -- A version of this report it cites stays a source (CC-0019 #7), but is no source added or dropped: a version cites
 -- its base only when the model lists it, and the next one's text does not name it, so it would read as dropped.
 SELECT coalesce(array_agg(av.source_id),'{}') INTO versions FROM sophia.artifact_versions av
  WHERE av.project_id=s.project_id AND av.artifact_id=a.id;
 SELECT byte_length INTO v_bytes FROM sophia.source_objects WHERE project_id=s.project_id AND id=d.source_id;
 SELECT byte_length INTO v_previous_bytes FROM sophia.source_objects WHERE project_id=s.project_id AND id=prev.source_id;
 validation:=sophia.put_text_source(s.project_id,s.actor_id,'application/json',jsonb_pretty(jsonb_build_object(
  'schema','sophia.research-validation.v1','taskId',s.job_id,'draftSha256',d.sha256,
  'checks',jsonb_build_array(
   jsonb_build_object('check','draft_is_current','ok',true,'seq',d.seq),
   jsonb_build_object('check','citations_readable_by_task','ok',true,'count',cardinality(citations)),
   jsonb_build_object('check','authority_current','ok',true,'authorityEpoch',g.authority_epoch,'goalRevision',g.revision),
   jsonb_build_object('check','notes_agree_with_facts','ok',true,'replacedFromFacts',replaced)))));
 IF prev.id IS NOT NULL THEN
  UPDATE sophia.artifact_versions SET state='superseded' WHERE project_id=s.project_id AND id=prev.id AND state='stable';
 END IF;
 INSERT INTO sophia.artifact_versions(project_id,artifact_id,parent_id,source_id,source_hash,goal_id,goal_revision,authority_epoch,state,
  validation_source_id,checks_passed,version_number,change_note,retained_note,change_facts,trigger,job_id,limitations)
 VALUES(s.project_id,a.id,prev.id,d.source_id,d.sha256,g.id,g.revision,g.authority_epoch,'stable',validation.id,true,vnum,
  coalesce(v_change,CASE WHEN vnum=1 THEN 'First version' END),v_kept,
  jsonb_build_object('versionNumber',vnum,'previousVersionId',prev.id,'cited',cardinality(citations),
   'added',(SELECT coalesce(jsonb_agg(x ORDER BY x),'[]') FROM unnest(citations) x WHERE NOT x=ANY(previous) AND NOT x=ANY(versions)),
   'dropped',(SELECT coalesce(jsonb_agg(x ORDER BY x),'[]') FROM unnest(previous) x WHERE NOT x=ANY(citations) AND NOT x=ANY(versions)),
   'bytes',v_bytes,'previousBytes',v_previous_bytes,'sections',sections,'notesFromFacts',replaced),
  jsonb_strip_nulls(jsonb_build_object('kind','research','taskId',s.job_id,'amendsTaskId',t.amends_job_id)),s.job_id,lims)
 RETURNING * INTO v;
 UPDATE sophia.artifacts SET stable_version_id=v.id WHERE project_id=s.project_id AND id=a.id;
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id)
  SELECT s.project_id,x,d.source_id FROM unnest(citations) x ON CONFLICT DO NOTHING;
 result:=sophia.put_text_source(s.project_id,s.actor_id,'text/markdown; charset=utf-8',
  v_answer||CASE WHEN cardinality(lims)>0 THEN E'\n\nLimitations:\n'||(SELECT string_agg('- '||l,E'\n') FROM unnest(lims) l) ELSE '' END);
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id) VALUES(s.project_id,d.source_id,result.id) ON CONFLICT DO NOTHING;
 UPDATE sophia.jobs SET state='succeeded', result_source_id=result.id, artifact_id=a.id, result_revision=result_revision+1, reason=NULL
  WHERE project_id=s.project_id AND id=j.id RETURNING * INTO j;
 UPDATE sophia.research_tasks SET closed_by_call=p_key WHERE project_id=s.project_id AND job_id=j.id;
 UPDATE sophia.work_attempts SET state='accepted' WHERE project_id=s.project_id AND id=s.attempt_id;
 UPDATE sophia.goals SET status='completed', state_revision=state_revision+1 WHERE project_id=s.project_id AND id=g.id;
 PERFORM sophia.emit_service_event(s.project_id,'native_task.result_ready','job',j.id,j.result_revision+3,'native_task.result_ready',
  jsonb_build_array(result.id,v.source_id));
 RETURN jsonb_build_object('taskId',j.id,'outcome','published','artifactId',a.id,'versionId',v.id,'versionNumber',v.version_number,
  'sourceId',v.source_id,'sha256',v.source_hash,'resultSourceId',result.id,'notesFromFacts',replaced);
END $$;

COMMIT;
