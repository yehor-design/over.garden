-- OVE-326: enforce the online-only analytics vocabulary for new writes while
-- preserving every pre-existing analytics row as immutable history.
alter table analytics_events
  drop constraint if exists analytics_events_event_name_check;

alter table analytics_events
  add constraint analytics_events_event_name_check
  check (
    event_name in (
      'activation_started',
      'space_created',
      'object_created',
      'entry_logged',
      'entry_photo_attached',
      'progress_screen_shown',
      'own_record_revisited',
      'follow_up_value_pulse',
      'journal_blocks_reordered',
      'journal_cover_changed'
    )
  ) not valid;
