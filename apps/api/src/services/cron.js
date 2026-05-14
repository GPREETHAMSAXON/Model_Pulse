'use strict';

const { runDriftJob } = require('./drift');

// Simple cron implementation without external dependencies.
// Runs the drift job every hour on the hour.
// For production, replace with node-cron or a proper job queue (Bull, BullMQ).

const INTERVAL_MS = 60 * 60 * 1000; // 1 hour
let timer = null;


function startCron() {
  console.log('[cron] Drift job scheduler started — runs every 60 minutes');

  // Run immediately on startup (after a short delay to let DBs settle)
  setTimeout(async () => {
    await runDriftJob().catch((err) =>
      console.error('[cron] Initial drift job failed:', err.message)
    );
  }, 10000); // 10 second delay on first run

  // Then every hour
  timer = setInterval(async () => {
    await runDriftJob().catch((err) =>
      console.error('[cron] Scheduled drift job failed:', err.message)
    );
  }, INTERVAL_MS);

  // Prevent the timer from blocking process exit
  if (timer.unref) timer.unref();
}


function stopCron() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log('[cron] Drift job scheduler stopped');
  }
}


module.exports = { startCron, stopCron };
