-- OVE-199: journal content class + declared source language for launch corpus.
-- Additive. Safe to re-run. Default existing rows to real_ugc until plan reclassifies smoke.

alter table journal_entries
  add column if not exists content_class text,
  add column if not exists source_language text;

update journal_entries
set content_class = coalesce(content_class, 'real_ugc')
where content_class is null;

alter table journal_entries
  alter column content_class set default 'real_ugc';

alter table journal_entries
  alter column content_class set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entries_content_class_check'
      and conrelid = 'journal_entries'::regclass
  ) then
    alter table journal_entries
      add constraint journal_entries_content_class_check
      check (
        content_class in (
          'real_ugc',
          'founder_first_hand',
          'editorial',
          'catalog_fact',
          'production_smoke',
          'visual_fixture'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entries_source_language_check'
      and conrelid = 'journal_entries'::regclass
  ) then
    alter table journal_entries
      add constraint journal_entries_source_language_check
      check (
        source_language is null
        or source_language in ('uk', 'bg')
      );
  end if;
end $$;

create index if not exists journal_entries_content_class_idx
  on journal_entries (content_class);

create index if not exists journal_entries_public_launch_corpus_idx
  on journal_entries (visibility, lifecycle_state, content_class)
  where visibility = 'public'
    and lifecycle_state = 'active'
    and public_slug is not null;
