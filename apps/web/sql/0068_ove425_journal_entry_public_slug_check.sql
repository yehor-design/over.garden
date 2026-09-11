-- OVE-425: the journal entry slug column gets the CHECK it has never had.
--
-- `catalog_items`, `journal_topics` and `communities` all carry a regex
-- constraint on their slug column. `journal_entries.public_slug` never did,
-- and it is the only one of the four a gardener writes to: every other slug is
-- seeded or ingested. So the column that most needed a shape had none, and the
-- route contract was enforced nowhere below `isValidPublicJournalSlug`.
--
-- ## The block below is generated
--
-- It is `contracts/address/address-slug-checks.generated.sql`, verbatim, for
-- `journal_entries_public_slug_check`. `pnpm address:contract:build` renders
-- it from `src/lib/address/address-manifest.ts`, and
-- `src/lib/address/address-contract.test.ts` fails if this file and that one
-- differ. A migration is copied rather than generated at apply time because
-- what runs against production has to be reviewable as the statement it is.
--
-- ## Why the alphabet is spelled out
--
-- `[[:alpha:]]` and `[[:lower:]]` are Unicode-correct in this database — read
-- against production on 2026-09-11, they accept `ї` and `ъ` and reject `П`, an
-- apostrophe, an en dash and a space. They are still not what this column
-- wants: they admit every script's lower case, and the slugifier's output set
-- is exactly the thirty-seven Cyrillic letters uk/bg/ru write plus `a-z0-9`.
-- A range like `а-я` is not an option either: a range inside a bracket
-- expression is read in the database's collation, which here is `en_US.UTF-8`,
-- not in code-point order. And `\p{Cyrillic}` is PCRE — in a Postgres regex it
-- matches the literal letters `p`, `{`, `C`, … without erroring, which is how
-- migration `0067` nearly classified every journal entry as Bulgarian.
--
-- The alphabet is the reason this constraint also enforces `NFC` for free: a
-- decomposed `й` is `и` plus U+0306, and U+0306 is not one of the thirty-seven.
--
-- ## What it admits today
--
-- Every slug production holds: eleven rows, longest fifty-seven characters,
-- all of them lower-case Cyrillic, ASCII and hyphens. They exceed the
-- slugifier's own budget (sixty decoded, one hundred and eighty encoded) and
-- that is deliberate — a CHECK has to admit the history the table already
-- holds, and the budget governs what may be produced from here on. `OVE-429`
-- narrows the column once it has moved the rows that would then be refused.

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'journal_entries_public_slug_check'
      and conrelid = 'journal_entries'::regclass
  ) then
    alter table journal_entries
      drop constraint journal_entries_public_slug_check;
  end if;

  alter table journal_entries
    add constraint journal_entries_public_slug_check
    check (
      public_slug is null
      or (
        char_length(public_slug) between 1 and 96
        and public_slug ~ '^[a-z0-9абвгдежзийклмнопрстуфхцчшщъыьэюяёєіїґ]+(?:-[a-z0-9абвгдежзийклмнопрстуфхцчшщъыьэюяёєіїґ]+)*$'
      )
    );
end $$;
