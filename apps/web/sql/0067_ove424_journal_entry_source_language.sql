-- OVE-424: every journal entry that can be rendered declares the language it
-- was written in.
--
-- `source_language` has existed since OVE-199 as launch-corpus provenance:
-- nullable, constrained to uk/bg, and written by nothing but the deletion path.
-- Meanwhile the page rendered a Ukrainian entry inside a `lang="bg"` document
-- whenever a Bulgarian reader asked for it, which tells a screen reader to
-- apply Bulgarian phonetics to Ukrainian text and tells Google the wrong
-- content language. The column is exactly the fact the page needs; it was
-- simply never filled in.
--
-- ## 1. Widen the value set to uk/bg/ru
--
-- `ru` was missing and it is a real authoring language, not a hypothetical
-- one: `BULGARIA_PUBLIC_LOCALES` is (bg, ru), so a gardener can hold a Russian
-- interface and write in Russian. Running the classification below against the
-- development database found existing Russian entries immediately — the old
-- constraint rejected the update. Without this step, publishing would have
-- started failing for those gardeners the moment the column was required.
--
-- The constraint keeps admitting NULL, because a CHECK is satisfied by NULL.
-- That is deliberate; see step 3.
--
-- ## 2. Fill what is null, on rows the table will accept a write to
--
-- The three alphabets separate on letters only one of them uses:
--
--     і ї є ґ   Ukrainian only
--     ы э ё     Russian only — Bulgarian has none of them
--     ъ         Bulgarian, in ordinary prose, constantly
--
-- and anything still undecided falls to the default locale.
--
-- The order and the fallback both matter, and both were corrected against real
-- rows rather than reasoned about. `ъ` is in Russian too, but rarely, and
-- Russian text is already taken by the line above it. Falling back to Bulgarian
-- instead of the default locale misfiled every short Ukrainian entry that
-- happened to contain none of і ї є ґ — `Перший запис про сорт.` has no such
-- letter, and was classified Bulgarian. On the development corpus the
-- correction moves ninety-four rows, every one of them to `uk`, and moves no
-- genuinely Bulgarian text.
--
-- The classes are spelled as explicit letters. Postgres regexes are POSIX, not
-- PCRE: `\p{Cyrillic}` is not a character class here — it matches the literal
-- letters p, {, C … and would have classified every row as Bulgarian without
-- erroring.
--
-- This is a heuristic, applied once, to rows written before the column was
-- filled at publish. Nothing reads it as a general language detector: from
-- OVE-424 onward the value is the author's own interface language, recorded at
-- publish rather than inferred.
--
-- **The `where lifecycle_state = 'active'` clause is not an optimisation.**
-- `journal_entries_lifecycle_state_check` and
-- `journal_entries_deletion_retention_check` are both `NOT VALID`: a migration
-- narrowed the allowed lifecycle states to (active, deleted_retention) and left
-- the older `archived` rows in place unvalidated. Postgres does not check a
-- NOT VALID constraint against existing rows, but it does check it on every
-- update — so those rows cannot be written to at all. A blanket
-- `update journal_entries` fails on the first one it reaches. Sixteen such rows
-- exist in the development database.
--
-- Every row a public surface can render is `active` (`activePublicEntries`
-- requires it), so this covers the whole rendering surface.
--
-- ## 3. Why the column is not `NOT NULL`
--
-- It cannot be, while rows exist that no statement can write to: eight of those
-- sixteen carry no language, and `SET NOT NULL` scans the whole table. Making
-- it required is blocked on reconciling `archived` with the lifecycle states
-- the schema now allows, which is a decision about what an archived entry is,
-- not a detail of this change.
--
-- Until then the render path treats a null as the default locale, and the
-- publish path never writes one.

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'journal_entries_source_language_check'
      and conrelid = 'journal_entries'::regclass
  ) then
    alter table journal_entries
      drop constraint journal_entries_source_language_check;
  end if;

  alter table journal_entries
    add constraint journal_entries_source_language_check
    check (source_language in ('uk', 'bg', 'ru'));
end $$;

update journal_entries
set source_language = case
  when coalesce(title, '') || ' ' || coalesce(body, '') ~ '[іїєґІЇЄҐ]' then 'uk'
  when coalesce(title, '') || ' ' || coalesce(body, '') ~ '[ыэёЫЭЁ]' then 'ru'
  when coalesce(title, '') || ' ' || coalesce(body, '') ~ '[ъЪ]' then 'bg'
  else 'uk'
end
where source_language is null
  and lifecycle_state = 'active';
