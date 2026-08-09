ALTER TABLE usage_reservations
  ADD COLUMN IF NOT EXISTS barcode_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS recognize_fingerprint TEXT;
