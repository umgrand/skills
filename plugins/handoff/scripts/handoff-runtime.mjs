#!/usr/bin/env node
/**
 * handoff-runtime.mjs
 * CLI runtime for the codex-handoff plugin.
 * Delegates tasks to the openai-codex plugin's codex-companion.mjs.
 */

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import crypto from 'node:crypto';

const HOME = process.env.HOME;
const INSTALLED_PLUGINS_PATH = join(HOME, '.claude', 'plugins', 'installed_plugins.json');
const REGISTRY_DIR = join(HOME, '.claude', 'plugins', 'local', 'codex-handoff', 'data');
const REGISTRY_PATH = join(REGISTRY_DIR, 'task-registry.json');
const REGISTRY_TMP_PATH = join(REGISTRY_DIR, 'task-registry.json.tmp');
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// 1. Codex Discovery
// ---------------------------------------------------------------------------

function discoverCodex() {
  try {
    if (!existsSync(INSTALLED_PLUGINS_PATH)) {
      return { ok: false, error: `installed_plugins.json not found at ${INSTALLED_PLUGINS_PATH}` };
    }

    const raw = readFileSync(INSTALLED_PLUGINS_PATH, 'utf8');
    const json = JSON.parse(raw);

    const entries = json?.plugins?.['codex@openai-codex'];
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return { ok: false, error: 'codex@openai-codex not found in installed_plugins.json' };
    }

    const installPath = entries[0]?.installPath;
    if (!installPath) {
      return { ok: false, error: 'codex@openai-codex entry has no installPath' };
    }

    const companionPath = join(installPath, 'scripts', 'codex-companion.mjs');
    if (!existsSync(companionPath)) {
      return { ok: false, error: `codex-companion.mjs not found at ${companionPath}` };
    }

    return { ok: true, path: companionPath };
  } catch (err) {
    return { ok: false, error: `Discovery failed: ${err.message}` };
  }
}

// ---------------------------------------------------------------------------
// 2. Task Registry
// ---------------------------------------------------------------------------

function readRegistry() {
  try {
    if (!existsSync(REGISTRY_PATH)) {
      return { tasks: {} };
    }
    const raw = readFileSync(REGISTRY_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { tasks: {} };
  }
}

function writeRegistry(registry) {
  if (!existsSync(REGISTRY_DIR)) {
    mkdirSync(REGISTRY_DIR, { recursive: true });
  }
  const pruned = pruneOldTasks(registry);
  const content = JSON.stringify(pruned, null, 2);
  writeFileSync(REGISTRY_TMP_PATH, content, 'utf8');
  renameSync(REGISTRY_TMP_PATH, REGISTRY_PATH);
}

function pruneOldTasks(registry) {
  const now = Date.now();
  const terminalStatuses = new Set(['completed', 'failed', 'cancelled']);
  const tasks = { ...registry.tasks };

  for (const [id, task] of Object.entries(tasks)) {
    if (!terminalStatuses.has(task.status)) continue;

    const refTime = task.completed_at || task.dispatched_at;
    if (!refTime) continue;

    const age = now - new Date(refTime).getTime();
    if (age > SEVEN_DAYS_MS) {
      delete tasks[id];
    }
  }

  return { ...registry, tasks };
}

function generateTaskId() {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const hexPart = crypto.randomBytes(3).toString('hex');
  return `handoff-${datePart}-${hexPart}`;
}

function registerTask(briefing, chainNext = null) {
  const registry = readRegistry();
  const id = generateTaskId();

  registry.tasks[id] = {
    id,
    task: briefing.task || '',
    status: 'pending',
    dispatched_at: null,
    completed_at: null,
    result: null,
    chain_next: chainNext,
    error: null,
    briefing,
  };

  writeRegistry(registry);
  return id;
}

function updateTaskStatus(id, updates) {
  const registry = readRegistry();
  if (!registry.tasks[id]) {
    registry.tasks[id] = { id };
  }
  registry.tasks[id] = { ...registry.tasks[id], ...updates };
  writeRegistry(registry);
}

function cancelChain(startId) {
  const registry = readRegistry();
  let currentId = startId;

  while (currentId) {
    const task = registry.tasks[currentId];
    if (!task) break;

    if (task.status === 'pending') {
      registry.tasks[currentId] = {
        ...task,
        status: 'cancelled',
        completed_at: new Date().toISOString(),
      };
    }

    currentId = task.chain_next || null;
  }

  writeRegistry(registry);
}

// ---------------------------------------------------------------------------
// 3. Prompt Assembly
// ---------------------------------------------------------------------------

function assemblePrompt(briefing) {
  const parts = [];

  if (briefing.task) {
    parts.push(`<task>\n${briefing.task}\n</task>`);
  }

  if (briefing.context) {
    parts.push(`<context>\n${briefing.context}\n</context>`);
  }

  if (Array.isArray(briefing.files) && briefing.files.length > 0) {
    const fileList = briefing.files.map(f => `- ${f}`).join('\n');
    parts.push(`<focus_files>\n${fileList}\n</focus_files>`);
  }

  if (Array.isArray(briefing.acceptance_criteria) && briefing.acceptance_criteria.length > 0) {
    const criteriaList = briefing.acceptance_criteria.map((c, i) => `${i + 1}. ${c}`).join('\n');
    parts.push(`<success_criteria>\n${criteriaList}\n</success_criteria>`);
  }

  if (Array.isArray(briefing.constraints) && briefing.constraints.length > 0) {
    const constraintList = briefing.constraints.map(c => `- ${c}`).join('\n');
    parts.push(`<constraints>\n${constraintList}\n</constraints>`);
  }

  return parts.join('\n\n');
}

function buildFlags(briefing) {
  const flags = [];

  if (briefing.effort) {
    flags.push(`--effort ${briefing.effort}`);
  }

  if (briefing.mode === 'write') {
    flags.push('--write');
  }

  return flags;
}

// ---------------------------------------------------------------------------
// 7. Chain Adaptation
// ---------------------------------------------------------------------------

function adaptBriefing(briefing, previousResult) {
  const adapted = { ...briefing };

  const resultText = typeof previousResult === 'string'
    ? previousResult
    : JSON.stringify(previousResult, null, 2);

  const injected = `Previous task result:\n${resultText}`;
  adapted.context = adapted.context
    ? `${adapted.context}\n\n${injected}`
    : injected;

  if (briefing.adaptation_rule) {
    adapted.task = `${adapted.task}\n\nAdditional instruction: ${briefing.adaptation_rule}`;
  }

  return adapted;
}

// ---------------------------------------------------------------------------
// 4. Dispatch Chain Command
// ---------------------------------------------------------------------------

function dispatchNext(codexPath, ids, tasks, index) {
  if (index >= ids.length) {
    console.log(JSON.stringify({ ok: true, event: 'chain_complete', completedIds: ids }));
    return;
  }

  const id = ids[index];
  const registry = readRegistry();
  const previousId = ids[index - 1];
  const previousTask = registry.tasks[previousId];
  const previousResult = previousTask?.result ?? null;

  const adapted = adaptBriefing(tasks[index], previousResult);

  updateTaskStatus(id, { status: 'running', dispatched_at: new Date().toISOString(), briefing: adapted });

  const prompt = assemblePrompt(adapted);
  const flags = buildFlags(adapted);
  const flagsStr = flags.join(' ');
  const cmd = `node ${JSON.stringify(codexPath)} task ${flagsStr} ${JSON.stringify(prompt)}`.trim();

  console.log(JSON.stringify({ ok: true, event: 'task_dispatched', taskId: id, index }));

  try {
    const output = execSync(cmd, {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 600000,
      encoding: 'utf8',
    });

    let result;
    try {
      result = JSON.parse(output);
    } catch {
      result = { raw: output };
    }

    updateTaskStatus(id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      result: output.trim(),
    });

    console.log(JSON.stringify({ ok: true, event: 'task_completed', taskId: id, index, result }));

    dispatchNext(codexPath, ids, tasks, index + 1);
  } catch (err) {
    const errorMessage = err.message || String(err);

    updateTaskStatus(id, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      error: errorMessage,
    });

    const nextId = ids[index + 1];
    if (nextId) {
      cancelChain(nextId);
    }

    console.log(JSON.stringify({ ok: false, event: 'chain_stopped', failedId: id, index, error: errorMessage }));
    process.exit(1);
  }
}

function dispatchChain(chainJson) {
  let tasks;
  try {
    tasks = typeof chainJson === 'string' ? JSON.parse(chainJson) : chainJson;
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: `Invalid chain JSON: ${err.message}` }));
    process.exit(1);
  }

  if (!Array.isArray(tasks) || tasks.length === 0) {
    console.error(JSON.stringify({ ok: false, error: 'dispatch-chain requires a non-empty JSON array of briefing objects' }));
    process.exit(1);
  }

  const discovery = discoverCodex();
  if (!discovery.ok) {
    console.error(JSON.stringify({ ok: false, error: discovery.error }));
    process.exit(1);
  }

  // Generate all IDs upfront
  const ids = tasks.map(() => generateTaskId());

  // Register all tasks with chain_next pointers
  for (let i = 0; i < tasks.length; i++) {
    const chainNext = i + 1 < ids.length ? ids[i + 1] : null;
    const registry = readRegistry();
    registry.tasks[ids[i]] = {
      id: ids[i],
      task: tasks[i].task || '',
      status: 'pending',
      dispatched_at: null,
      completed_at: null,
      result: null,
      chain_next: chainNext,
      error: null,
      briefing: tasks[i],
    };
    writeRegistry(registry);
  }

  console.log(JSON.stringify({ ok: true, event: 'chain_registered', ids }));

  // Dispatch first task directly (no previous result to adapt from)
  const firstId = ids[0];
  const firstBriefing = tasks[0];

  updateTaskStatus(firstId, { status: 'running', dispatched_at: new Date().toISOString() });

  const prompt = assemblePrompt(firstBriefing);
  const flags = buildFlags(firstBriefing);
  const flagsStr = flags.join(' ');
  const cmd = `node ${JSON.stringify(discovery.path)} task ${flagsStr} ${JSON.stringify(prompt)}`.trim();

  console.log(JSON.stringify({ ok: true, event: 'task_dispatched', taskId: firstId, index: 0 }));

  try {
    const output = execSync(cmd, {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 600000,
      encoding: 'utf8',
    });

    let result;
    try {
      result = JSON.parse(output);
    } catch {
      result = { raw: output };
    }

    updateTaskStatus(firstId, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      result: output.trim(),
    });

    console.log(JSON.stringify({ ok: true, event: 'task_completed', taskId: firstId, index: 0, result }));

    dispatchNext(discovery.path, ids, tasks, 1);
  } catch (err) {
    const errorMessage = err.message || String(err);

    updateTaskStatus(firstId, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      error: errorMessage,
    });

    if (ids[1]) {
      cancelChain(ids[1]);
    }

    console.log(JSON.stringify({ ok: false, event: 'chain_stopped', failedId: firstId, index: 0, error: errorMessage }));
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// 4. Dispatch Command
// ---------------------------------------------------------------------------

function dispatch(briefingJson) {
  let briefing;
  try {
    briefing = typeof briefingJson === 'string' ? JSON.parse(briefingJson) : briefingJson;
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: `Invalid briefing JSON: ${err.message}` }));
    process.exit(1);
  }

  const discovery = discoverCodex();
  if (!discovery.ok) {
    console.error(JSON.stringify({ ok: false, error: discovery.error }));
    process.exit(1);
  }

  const chainNext = briefing.chain_next || null;
  const taskId = registerTask(briefing, chainNext);

  updateTaskStatus(taskId, { status: 'running', dispatched_at: new Date().toISOString() });

  const prompt = assemblePrompt(briefing);
  const flags = buildFlags(briefing);
  const flagsStr = flags.join(' ');

  const cmd = `node ${JSON.stringify(discovery.path)} task ${flagsStr} ${JSON.stringify(prompt)}`.trim();

  try {
    const output = execSync(cmd, {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 600000,
      encoding: 'utf8',
    });

    let result;
    try {
      result = JSON.parse(output);
    } catch {
      result = { raw: output };
    }

    updateTaskStatus(taskId, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      result: output.trim(),
    });

    console.log(JSON.stringify({ ok: true, taskId, result }));
  } catch (err) {
    const errorMessage = err.message || String(err);

    updateTaskStatus(taskId, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      error: errorMessage,
    });

    if (chainNext) {
      cancelChain(chainNext);
    }

    console.log(JSON.stringify({ ok: false, taskId, error: errorMessage }));
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// 5. Status Command
// ---------------------------------------------------------------------------

function status() {
  const registry = readRegistry();
  const tasks = Object.values(registry.tasks).map(t => ({
    id: t.id,
    task: t.task,
    status: t.status,
    dispatched_at: t.dispatched_at,
    completed_at: t.completed_at,
    chain_next: t.chain_next,
    error: t.error,
  }));

  console.log(JSON.stringify({ ok: true, tasks }));
}

// ---------------------------------------------------------------------------
// 6. Cancel Command
// ---------------------------------------------------------------------------

function cancel(taskId) {
  const registry = readRegistry();

  let targetId = taskId;

  if (!targetId) {
    // Find first running task
    const running = Object.values(registry.tasks).find(t => t.status === 'running');
    if (!running) {
      console.log(JSON.stringify({ ok: false, error: 'No running task found' }));
      return;
    }
    targetId = running.id;
  }

  const task = registry.tasks[targetId];
  if (!task) {
    console.log(JSON.stringify({ ok: false, error: `Task ${targetId} not found` }));
    return;
  }

  // Best-effort: try to call codex-companion cancel
  const discovery = discoverCodex();
  if (discovery.ok) {
    try {
      execSync(`node ${JSON.stringify(discovery.path)} cancel`, {
        maxBuffer: 10 * 1024 * 1024,
        timeout: 30000,
        encoding: 'utf8',
      });
    } catch {
      // Best-effort; ignore errors
    }
  }

  updateTaskStatus(targetId, {
    status: 'failed',
    completed_at: new Date().toISOString(),
    error: 'Cancelled by user',
  });

  const chainNext = task.chain_next;
  if (chainNext) {
    cancelChain(chainNext);
  }

  console.log(JSON.stringify({ ok: true, cancelledId: targetId }));
}

// ---------------------------------------------------------------------------
// 8. CLI Entry Point
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'dispatch': {
    const briefingArg = args[1];
    if (!briefingArg) {
      console.error(JSON.stringify({ ok: false, error: 'dispatch requires a briefing JSON argument' }));
      process.exit(1);
    }
    dispatch(briefingArg);
    break;
  }

  case 'status': {
    status();
    break;
  }

  case 'cancel': {
    cancel(args[1] || null);
    break;
  }

  case 'dispatch-chain': {
    const chainArg = args[1];
    if (!chainArg) {
      console.error(JSON.stringify({ ok: false, error: 'dispatch-chain requires a chain JSON array argument' }));
      process.exit(1);
    }
    dispatchChain(chainArg);
    break;
  }

  case 'check-codex': {
    const result = discoverCodex();
    console.log(JSON.stringify(result));
    break;
  }

  default: {
    console.error(JSON.stringify({
      ok: false,
      error: `Unknown command: ${command || '(none)'}. Valid commands: dispatch, dispatch-chain, status, cancel, check-codex`,
    }));
    process.exit(1);
  }
}
