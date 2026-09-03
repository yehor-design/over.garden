-- Rollback of 0048: drops the claim-ordering index. The claim returns to
-- reading every remaining unit of a capture and sorting it to take one, so a
-- full observed capture becomes roughly twice as slow and degrades as its own
-- payloads grow the heap. No data is affected.

drop index if exists catalog_source_capture_units_claim_order_idx;
