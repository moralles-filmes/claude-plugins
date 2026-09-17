#!/usr/bin/env node
// PostToolUse hook for Claude Code: after a router dry-run/classify/dispatch, show its summary_line to the user
// (executor, model, status, cost) without depending on the model to repeat it. Never blocks; silent otherwise.
import { noticeFor } from '../lib/summary.mjs';
try {
  if (process.env.AI_ROUTER_WORKER!=='1') {
    let raw=''; for await (const chunk of process.stdin) raw+=chunk;
    const line=noticeFor(JSON.parse(raw));
    if (line) process.stdout.write(JSON.stringify({systemMessage:line}));
  }
} catch {}
