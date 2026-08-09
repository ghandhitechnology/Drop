CREATE TABLE IF NOT EXISTS usage_days (
  device_hash TEXT NOT NULL,
  local_day DATE NOT NULL,
  timezone TEXT NOT NULL,
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (device_hash, local_day)
);

CREATE TABLE IF NOT EXISTS usage_reservations (
  device_hash TEXT NOT NULL,
  local_day DATE NOT NULL,
  analysis_id UUID NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('reserved', 'consumed')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  consumed_at TIMESTAMPTZ,
  PRIMARY KEY (device_hash, local_day, analysis_id),
  FOREIGN KEY (device_hash, local_day)
    REFERENCES usage_days (device_hash, local_day)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS usage_reservations_expiry
  ON usage_reservations (expires_at)
  WHERE state = 'reserved';
