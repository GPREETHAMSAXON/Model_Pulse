'use strict';

const { runDriftJob } = require('./drift');
const { runLlmJob  } = require('./llmCron');

const INTERVAL_MS = 60 * 60 * 1000; // 1 hour
let timer = null;

function startCron() {
  console.log('[cron] Drift + LLM job scheduler started — runs every 60 minutes');

  // Run immediately on startup after DBs settle
  setTimeout(async () => {
    await runDriftJob().catch(err => console.error('[cron] Initial drift job failed:', err.message));
    await runLlmJob().catch(err => console.error('[cron] Initial LLM job failed:', err.message));
  }, 10000);

  timer = setInterval(async () => {
    await runDriftJob().catch(err => console.error('[cron] Drift job failed:', err.message));
    await runLlmJob().catch(err => console.error('[cron] LLM job failed:', err.message));
  }, INTERVAL_MS);

  if (timer.unref) timer.unref();
}

function stopCron() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { startCron, stopCron };
