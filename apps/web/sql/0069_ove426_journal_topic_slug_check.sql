-- OVE-426: a topic slug may be written in the gardener's own alphabet.
--
-- `journal_topics.slug` has been `^[a-z0-9][a-z0-9-]{1,63}$` since the walking
-- skeleton. That is the reason a Cyrillic tag became a hash: the writer had
-- nowhere to put `помідори`, so it put `tag-81e9f6d3034d`. The filter that
-- produced the hash is fixed in the same change; without this migration the
-- fixed filter would simply fail the insert instead.
--
-- ## The block below is generated
--
-- It is `contracts/address/address-slug-checks.generated.sql`, verbatim, for
-- `journal_topics_slug_check`. `pnpm address:contract:build` renders it from
-- `src/lib/address/address-manifest.ts`, and
-- `src/lib/address/address-contract.test.ts` fails if this file and that one
-- differ.
--
-- ## What changes besides the alphabet
--
-- The old pattern admitted a trailing hyphen (`[a-z0-9-]{1,63}` has nothing to
-- say about the last character) and required at least two characters. The
-- generated one spells the separator between two non-empty runs, so a leading,
-- trailing or doubled hyphen is refused, and it bounds the length in
-- `char_length` instead of in the quantifier — which is the same bound for
-- ASCII and a truthful one for Cyrillic, where a quantifier counts characters
-- but the column's old comment meant bytes.
--
-- ## What it admits today
--
-- Every row production holds: five topics, all curated, all ASCII, the longest
-- twenty characters — `animals`, `observation-and-care`, `plants`,
-- `plant-varieties`, `species`. None of them is affected; all five pass the new
-- pattern unchanged.

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'journal_topics_slug_check'
      and conrelid = 'journal_topics'::regclass
  ) then
    alter table journal_topics
      drop constraint journal_topics_slug_check;
  end if;

  alter table journal_topics
    add constraint journal_topics_slug_check
    check (
      char_length(slug) between 1 and 64
      and slug ~ '^[a-z0-9абвгдежзийклмнопрстуфхцчшщъыьэюяёєіїґ]+(?:-[a-z0-9абвгдежзийклмнопрстуфхцчшщъыьэюяёєіїґ]+)*$'
    );
end $$;
