import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'dogear.mjs');

function tmp(prefix) { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }

function setup({ gitRepo = false } = {}) {
  const root = tmp('dogear-project-');
  if (gitRepo) {
    const g = (...a) => execFileSync('git', ['-C', root, ...a], { stdio: 'ignore' });
    g('init', '-q', '-b', 'feature-x');
    fs.writeFileSync(path.join(root, 'a.js'), '1');
    g('add', '.');
    g('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init');
  }
  const env = { ...process.env, DOGEAR_DATA_DIR: tmp('dogear-data-'), CLAUDE_PROJECT_DIR: root };
  delete env.DOGEAR_DISABLED;
  const run = (mode, input) => {
    const r = spawnSync(process.execPath, [SCRIPT, mode], { input: JSON.stringify({ cwd: root, ...input }), env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout ? JSON.parse(r.stdout) : null;
  };
  const cli = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { env, cwd: root, encoding: 'utf8' }).stdout;
  const session = (id) => ({
    prompt: (prompt) => run('prompt', { session_id: id, prompt }),
    edit: (file) => run('tool', { session_id: id, tool_name: 'Edit', tool_input: { file_path: path.join(root, file) } }),
    tool: (tool_name, tool_input, tool_response) => run('tool', { session_id: id, tool_name, tool_input, tool_response }),
    fail: (command) => run('toolfail', { session_id: id, tool_name: 'Bash', tool_input: { command }, error: 'Exit code 1' }),
    stop: (last_assistant_message) => run('stop', { session_id: id, last_assistant_message }),
    end: () => run('end', { session_id: id, reason: 'logout' }),
    start: (source = 'startup') => run('start', { session_id: id, source }),
  });
  return { root, session, cli };
}

test('a new session opens with the last one\'s note', () => {
  const { session } = setup();
  const a = session('A');
  a.prompt('Make formatPrice drop the cents for whole-dollar amounts');
  a.edit('src/price.js');
  a.tool('Bash', { command: 'npm test 2>&1 | tail -5' }, { stdout: '# pass 3' });
  a.stop('Done. 1200 now shows as $12. Next: add a test for whole-dollar amounts.');
  a.end();

  const out = session('B').start();
  const ctx = out.hookSpecificOutput.additionalContext;
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(ctx, /^\[Dogear\]/);
  assert.match(ctx, /Do not act on them unprompted/);
  assert.match(ctx, /Asked: "Make formatPrice drop the cents/);
  assert.match(ctx, /Changed: src\/price\.js/);
  assert.match(ctx, /Last check: `npm test` passed/);
  assert.match(ctx, /Ended with: "Done\. 1200 now shows as \$12\. Next: add a test/);
  assert.match(ctx, /session closed/);
  assert.match(out.systemMessage, /📑 Dogear: picked up your last session \(just now\)/);
});

test('silent when there is nothing to hand on', () => {
  const { session } = setup();
  assert.equal(session('B').start(), null, 'first ever session');
  const a = session('A');
  a.stop('hi');
  assert.equal(session('B').start(), null, 'a session that did nothing');
});

test('resume gets nothing: the conversation is already back', () => {
  const { session } = setup();
  const a = session('A');
  a.prompt('Refactor the parser');
  a.edit('src/parser.js');
  a.stop('ok');
  assert.equal(session('B').start('resume'), null);
});

test('a question-only session never buries the session that did the work', () => {
  const { session } = setup();
  const a = session('A');
  a.prompt('Add discount codes');
  a.edit('src/cart.js');
  a.stop('Added SAVE10. Free shipping is next.');
  const b = session('B');
  b.prompt('Where did we leave off?');
  b.stop('You added SAVE10; free shipping is next.');
  const ctx = session('C').start().hookSpecificOutput.additionalContext;
  assert.match(ctx, /Asked: "Add discount codes"/);
  assert.doesNotMatch(ctx, /Where did we leave off/);
});

test('plan from tasks: open first, done counted', () => {
  const { session } = setup();
  const a = session('A');
  a.prompt('Ship the billing page');
  a.tool('TaskCreate', { subject: 'Build invoice table', description: 'x' }, 'Task #1 created successfully: Build invoice table');
  a.tool('TaskCreate', { subject: 'Wire Stripe portal link', description: 'x' }, 'Task #2 created successfully: Wire Stripe portal link');
  a.tool('TaskCreate', { subject: 'Write e2e test', description: 'x' }, { task: { id: '3' } });
  a.tool('TaskUpdate', { taskId: '1', status: 'completed' });
  a.tool('TaskUpdate', { taskId: '2', status: 'in_progress' });
  a.stop('Paused mid-way.');
  const ctx = session('B').start().hookSpecificOutput.additionalContext;
  assert.match(ctx, /Plan: ◐ Wire Stripe portal link · ○ Write e2e test · ✓ 1 done/);
});

test('plan from TodoWrite', () => {
  const { session } = setup();
  const a = session('A');
  a.prompt('Fix login');
  a.tool('TodoWrite', { todos: [{ content: 'Reproduce bug', status: 'completed' }, { content: 'Patch session refresh', status: 'in_progress' }] });
  a.stop('…');
  assert.match(session('B').start().hookSpecificOutput.additionalContext, /Plan: ◐ Patch session refresh · ✓ 1 done/);
});

test('failed check, latest ask, interrupted session', () => {
  const { session } = setup();
  const a = session('A');
  a.prompt('Add CSV export');
  a.prompt('Also handle commas inside quoted fields');
  a.edit('src/export.ts');
  a.fail('pnpm vitest run');
  a.stop('The quoted-comma test still fails.');
  const ctx = session('B').start().hookSpecificOutput.additionalContext;
  assert.match(ctx, /Asked: "Add CSV export"/);
  assert.match(ctx, /Latest ask: "Also handle commas inside quoted fields"/);
  assert.match(ctx, /Last check: `pnpm vitest run` FAILED/);
  assert.match(ctx, /still open or interrupted/);
});

test('git: branch, uncommitted files, and a branch switch', () => {
  const { root, session } = setup({ gitRepo: true });
  const a = session('A');
  a.prompt('Tweak a');
  fs.writeFileSync(path.join(root, 'a.js'), '2');
  fs.writeFileSync(path.join(root, 'new.js'), '');
  a.edit('a.js');
  a.stop('done');
  execFileSync('git', ['-C', root, 'checkout', '-qb', 'other'], { stdio: 'ignore' });
  const ctx = session('B').start().hookSpecificOutput.additionalContext;
  assert.match(ctx, /branch feature-x \(you're now on other\)/);
  assert.match(ctx, /Uncommitted: 2 files: a\.js, new\.js/);
});

test('ignores slash commands, non-check commands, files outside the project', () => {
  const { session } = setup();
  const a = session('A');
  a.prompt('/dogear');
  a.prompt('Real work');
  a.tool('TodoWrite', { todos: [{ content: 'Do it', status: 'pending' }] });
  a.tool('Bash', { command: 'git status && ls test/' }, { stdout: '' });
  a.tool('Write', { file_path: '/tmp/elsewhere.txt' });
  a.edit('.claude/settings.json');
  a.stop('ok');
  const ctx = session('B').start().hookSpecificOutput.additionalContext;
  assert.match(ctx, /Asked: "Real work"/);
  assert.doesNotMatch(ctx, /Last check|Changed:|\/dogear/);
});

test('compaction restores this session\'s own specifics', () => {
  const { session } = setup();
  const a = session('A');
  a.prompt('Migrate to the new API client');
  a.edit('src/client.ts');
  a.stop('Halfway.');
  const out = a.start('compact');
  assert.match(out.hookSpecificOutput.additionalContext, /This session so far/);
  assert.equal(out.systemMessage, undefined);
});

test('/dogear show, pin, unpin, off, on, clear', () => {
  const { session, cli } = setup();
  assert.match(cli(), /Nothing dog-eared yet/);
  const a = session('A');
  a.prompt('Draft the README');
  a.edit('README.md');
  a.stop('ok');
  assert.match(cli('show'), /The next session will open with:[\s\S]*Draft the README/);

  assert.match(cli('pin', "Don't touch the legacy checkout flow"), /📌 Pinned/);
  const out = session('B').start();
  assert.match(out.hookSpecificOutput.additionalContext, /Pinned notes:\n- Don't touch the legacy checkout flow/);
  cli('unpin');
  assert.doesNotMatch(session('C').start().hookSpecificOutput.additionalContext, /Pinned/);

  cli('off');
  assert.equal(session('D').start(), null);
  assert.match(cli(), /Off for this project/);
  cli('on');
  assert.ok(session('E').start());

  cli('clear');
  assert.equal(session('F').start(), null);
});

test('pins alone still reach a fresh project', () => {
  const { session, cli } = setup();
  cli('pin', 'Use pnpm, never npm');
  const out = session('A').start();
  assert.match(out.hookSpecificOutput.additionalContext, /Use pnpm, never npm/);
  assert.match(out.systemMessage, /1 pinned note loaded/);
});

test('long text is trimmed, and garbage input never breaks the session', () => {
  const { session } = setup();
  const a = session('A');
  a.prompt('x'.repeat(5000));
  a.edit('src/x.js');
  a.stop(Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n'));
  const ctx = session('B').start().hookSpecificOutput.additionalContext;
  assert.ok(ctx.length < 2000, `context is ${ctx.length} chars`);
  const r = spawnSync(process.execPath, [SCRIPT, 'start'], { input: 'not json', encoding: 'utf8', env: { ...process.env, DOGEAR_DATA_DIR: tmp('dogear-data-') } });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});
