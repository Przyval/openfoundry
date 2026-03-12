-- Sentinel notifications table
CREATE TABLE IF NOT EXISTS sentinel_notifications (
  rid TEXT PRIMARY KEY,
  monitor_rid TEXT NOT NULL REFERENCES sentinel_monitors(rid) ON DELETE CASCADE,
  message TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'INFO' CHECK (severity IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL')),
  read BOOLEAN NOT NULL DEFAULT FALSE,
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sentinel_notifications_monitor ON sentinel_notifications(monitor_rid);
CREATE INDEX IF NOT EXISTS idx_sentinel_notifications_read ON sentinel_notifications(read);
CREATE INDEX IF NOT EXISTS idx_sentinel_notifications_created ON sentinel_notifications(created_at DESC);
