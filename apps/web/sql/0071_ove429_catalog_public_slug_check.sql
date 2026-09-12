-- OVE-429: the catalog's addresses carry the name and nothing else.
--
-- `/species/solanum-lycopersicum-species-backbone/advance-ua-register-09040016`
-- is what the ingest pipeline built, and `eu-oj-elietta-393160a01d` is what the
-- other one built. ADR-0026 D8 said the slug is the name; the pipeline never
-- implemented it, and 15 902 of the 101 619 addresses in this catalog carried a
-- state register's application number, a ten-character digest or a
-- `-species-backbone` suffix.
--
-- The addresses themselves are moved by `pnpm address:catalog:reslug`, because
-- the slugifier is TypeScript. This migration is what the move makes possible:
-- the generated `CHECK`, with a length bound the old addresses could not all
-- have satisfied and every new one does.
--
-- ## The block below is generated
--
-- It is `contracts/address/address-slug-checks.generated.sql`, verbatim, for
-- `catalog_items_public_slug_check`. `pnpm address:contract:build` renders it
-- from `src/lib/address/address-manifest.ts`, and
-- `src/lib/address/address-contract.test.ts` fails if this file and that one
-- differ.
--
-- ## What changes, and what does not
--
-- The pattern is the one `0001` already held — `^[a-z0-9]+(?:-[a-z0-9]+)*$`,
-- unchanged, because a catalog address is romanized Latin (ADR-0029 D4). What
-- is added is `char_length between 1 and 96`, which `0001` never bounded.
--
-- Read against production before applying: 101 619 slugs, the longest sixty
-- characters, none over ninety-six — the old generators capped their bases at
-- sixty and the new one caps at the same budget. The constraint is added
-- validated, so Postgres checks every row rather than trusting that read.

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'catalog_items_public_slug_check'
      and conrelid = 'catalog_items'::regclass
  ) then
    alter table catalog_items
      drop constraint catalog_items_public_slug_check;
  end if;

  alter table catalog_items
    add constraint catalog_items_public_slug_check
    check (
      public_slug is null
      or (
        char_length(public_slug) between 1 and 96
        and public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      )
    );
end $$;
