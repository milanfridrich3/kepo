-- Feedback from signed-in people (Settings → Feedback).
--  * One row per message. category is one of bug, idea, privacy, other.
--  * user_id cascades: deleting an account deletes the feedback it sent.
--  * notified_at is set once the notification email (if any address is configured) was accepted by the provider.
-- Additive: nothing existing is changed.
CREATE TABLE feedback (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('bug', 'idea', 'privacy', 'other')),
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 10 AND 4000),
  language TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notified_at TIMESTAMPTZ
);

CREATE INDEX idx_feedback_user_created ON feedback(user_id, created_at DESC);
CREATE INDEX idx_feedback_category_created ON feedback(category, created_at DESC);
