#!/usr/bin/env node
import { finalizePending } from './task-report.mjs';

try {
  process.stdout.write = () => true;
  await finalizePending({ pending: process.env.TASK_REPORT_PENDING || '.agent-state/automation/task-report-pending.json' });
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
