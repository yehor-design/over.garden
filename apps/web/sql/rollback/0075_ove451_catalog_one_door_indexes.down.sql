-- Rolls back OVE-451's catalogue indexes. The listing still answers without
-- them; it answers a sequential scan per view, which is what 0072 left behind.
drop index if exists catalog_items_catalog_name_idx;
drop index if exists catalog_items_catalog_rank_idx;
