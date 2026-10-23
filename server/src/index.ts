import 'dotenv/config';
import { createApp } from './app';
import { pool } from './db/pool';
import { configurationWarnings } from './config';
import { startReminderJob } from './reminders/job';

const port = Number(process.env.PORT) || 4000;
const app = createApp();

for (const warning of configurationWarnings()) console.warn(`[config] ${warning}`);

const server = app.listen(port, () => {
  console.log(`Kepo API listening on port ${port}`);
});

const stopReminders = startReminderJob(); // does nothing unless REMINDERS_ENABLED=true

// Render sends SIGTERM on every deploy/restart. Stop accepting connections,
// let in-flight requests finish, then close the pool, instead of cutting
// requests (and any open transaction) off mid-flight.
function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  stopReminders();
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
