-- A publication agreement belongs to the account, not to removable content.
-- Old receipts retain their original version and timestamp: the backfill
-- never interprets an older agreement as acceptance of the current notice.
create table if not exists publication_disclosure_acceptances (
  owner_user_id uuid not null references "user"(id) on delete cascade,
  disclosure_version text not null check (length(disclosure_version) between 1 and 80),
  accepted_at timestamptz not null,
  primary key (owner_user_id, disclosure_version)
);

insert into publication_disclosure_acceptances
  (owner_user_id, disclosure_version, accepted_at)
select entry.owner_user_id, entry.first_publication_disclosure_version,
       min(entry.first_publication_disclosed_at)
from journal_entries entry
join "user" account on account.id = entry.owner_user_id
where entry.first_publication_disclosure_version is not null
  and entry.first_publication_disclosed_at is not null
group by entry.owner_user_id, entry.first_publication_disclosure_version
on conflict (owner_user_id, disclosure_version) do nothing;

comment on table publication_disclosure_acceptances is
  'Versioned publication acceptance; no journal content. Survives entry deletion, cascades on account erasure.';
