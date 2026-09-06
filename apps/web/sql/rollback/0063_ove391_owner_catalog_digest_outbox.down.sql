-- Rollback of 0063 (OVE-391). Digest rows leave, the outbox returns to
-- password resets alone, and the two added columns are dropped. Password
-- reset rows are untouched.

delete from auth_email_outbox where kind = 'owner_catalog_digest';

drop index if exists auth_email_outbox_pending_digest_uidx;

alter table auth_email_outbox
  drop constraint if exists auth_email_outbox_kind_shape_check;

alter table auth_email_outbox
  drop constraint if exists auth_email_outbox_kind_check;

alter table auth_email_outbox
  drop constraint if exists auth_email_outbox_recipient_fkey;

alter table auth_email_outbox
  drop column if exists recipient_user_id;

alter table auth_email_outbox
  drop column if exists payload;

alter table auth_email_outbox
  alter column verification_id set not null;

alter table auth_email_outbox
  add constraint auth_email_outbox_kind_check check (kind = 'password_reset');
