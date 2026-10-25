-- Private capability for reusing a pending signup; never linked to ballot identity.
ALTER TABLE entries ADD COLUMN receipt_hash text CHECK (receipt_hash IS NULL OR receipt_hash ~ '^[a-f0-9]{64}$');
CREATE UNIQUE INDEX entries_receipt_hash ON entries(event_id, receipt_hash);
