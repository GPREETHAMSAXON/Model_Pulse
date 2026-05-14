'use strict';

const { runDriftJob }    = require('./drift');
const { runLlmJob }      = require('./llmCron');
const { runAccuracyJob } = require('./accuracyCron');

const INTERVAL_MS = 60 * 60 * 1000;
let timer = null;

function startCron() {
  console.log('[cron] Drift + LLM + Accuracy job scheduler started — runs every 60 minutes');

  setTimeout(async () => {
    await runDriftJob().catch(err    => console.error('[cron] Drift job failed:', err.message));
    await runLlmJob().catch(err      => console.error('[cron] LLM job failed:', err.message));
    await runAccuracyJob().catch(err => console.error('[cron] Accuracy job failed:', err.message));
  }, 10000);

  timer = setInterval(async () => {
    await runDriftJob().catch(err    => console.error('[cron] Drift job failed:', err.message));
    await runLlmJob().catch(err      => console.error('[cron] LLM job failed:', err.message));
    await runAccuracyJob().catch(err => console.error('[cron] Accuracy job failed:', err.message));
  }, INTERVAL_MS);

  if (timer.unref) timer.unref();
}

function stopCron() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { startCron, stopCron };
