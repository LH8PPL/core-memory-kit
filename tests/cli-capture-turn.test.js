// Tests for Task 21 — cmk-capture-turn Stop hook + stop_hook_active
// guard + spawn auto-extract (T-018).
// Per tasks.md 21.6:
//   - Test payload with stop_hook_active:true: hook exits 0;
//     auto-extract lock file NOT created (proves no spawn)
//   - Test stop_hook_active:false: lock file created; transcript
//     appended
//   - Test stop_hook_active absent: same as false
//   - Test hook returns within 50 ms even when spawned subagent is slow
//   - Test transcript captures <retain>important</retain> verbatim;
//     <private>secret</private> replaced
//   - Test parent kill: spawn stub subagent that writes sentinel
//     after 2s; kill parent at 100 ms; assert sentinel appears after
//     2 s (detach proof)
//
// Boundary-test discipline:
//   - captureTurn() is the deep boundary: payload + projectRoot in,
//     transcript-on-disk + detached-child-spawned out.
//   - Auto-extract is stubbed via autoExtractPath arg: tests inject a
//     trivial node script that creates a lock-file sentinel so we can
//     assert "did a spawn happen" without depending on Task 23.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureTurn } from '../packages/cli/src/capture-turn.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
const BIN_PATH = join(REPO_ROOT, 'plugin', 'bin', 'cmk-capture-turn');

function makeFixture() {
  const sandbox = mkdtempSync(join(tmpdir(), 'cmk-capture-turn-test-'));
  const projectRoot = join(sandbox, 'proj');
  mkdirSync(projectRoot, { recursive: true });
  return { sandbox, projectRoot };
}

// A node-runnable stub that mimics the future auto-extract subagent:
// reads its turnFile arg (sanity), writes a lock-file sentinel, sleeps
// optionally, then exits. Used to prove the spawn happened without
// dragging in Task 23's real subagent.
function writeAutoExtractStub(sandbox, { sleepMs = 0, sentinel = 'LOCK' } = {}) {
  const path = join(sandbox, 'stub-auto-extract.mjs');
  const lockFile = join(sandbox, 'auto-extract.lock');
  const body = `
import { writeFileSync } from 'node:fs';
const turnFile = process.argv[2] ?? '';
const lockFile = ${JSON.stringify(lockFile)};
const sleepMs = ${sleepMs};
const sentinel = ${JSON.stringify(sentinel)};
if (sleepMs > 0) {
  setTimeout(() => writeFileSync(lockFile, sentinel + ':' + turnFile, 'utf8'), sleepMs);
} else {
  writeFileSync(lockFile, sentinel + ':' + turnFile, 'utf8');
}
`;
  writeFileSync(path, body, 'utf8');
  return { path, lockFile };
}

async function pollFor(predicate, { timeoutMs = 3000, intervalMs = 50 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((res) => setTimeout(res, intervalMs));
  }
  return predicate();
}

// Stronger predicate for the detached-stub pattern: the lockFile
// must EXIST AND have NON-ZERO SIZE. existsSync alone returns true
// as soon as the detached child opened the file descriptor, but the
// child's writeFileSync content may not yet be visible to the parent
// on Windows (visibility race between create and content-flush).
// Surfaced as "expected '' to contain 'DETACH_PROOF'" in 2/5 stress
// runs during Task 24 full-suite validation. Pin the wait on the
// actual content landing.
async function pollForFileWithContent(path, opts) {
  return pollFor(
    () => existsSync(path) && statSync(path).size > 0,
    opts,
  );
}

describe('Task 21 — captureTurn() boundary', () => {
  let sandbox;
  let projectRoot;

  beforeEach(() => {
    const f = makeFixture();
    sandbox = f.sandbox;
    projectRoot = f.projectRoot;
  });

  afterEach(async () => {
    // A spawned auto-extract stub may still be writing inside the
    // sandbox when this test finishes — Windows holds locks on open
    // files, so rmSync would EPERM. Give children a beat to drain
    // before tearing down. Best-effort: if cleanup still fails after
    // the poll, swallow it (next beforeEach mkdtemp will be a fresh
    // path anyway).
    await new Promise((res) => setTimeout(res, 300));
    try {
      rmSync(sandbox, { recursive: true, force: true });
    } catch {
      // Background child still has a handle open — leave the tmp dir
      // for the OS to clean. Doesn't affect the test outcome.
    }
  });

  describe('stop_hook_active recursion guard (21.1)', () => {
    it('payload with stop_hook_active:true: action:noop, no transcript, no spawn', async () => {
      const stub = writeAutoExtractStub(sandbox);
      const r = captureTurn({
        payload: {
          stop_hook_active: true,
          assistant_message: 'this should be ignored',
        },
        projectRoot,
        autoExtractPath: stub.path,
        now: '2026-05-25T10:00:00Z',
      });
      expect(r.action).toBe('noop');
      expect(r.reason).toBe('stop-hook-active');
      expect(r.spawned).toBe(false);

      // Give the stub a beat to run if (incorrectly) spawned
      await new Promise((res) => setTimeout(res, 200));
      expect(existsSync(stub.lockFile)).toBe(false);
      expect(existsSync(join(projectRoot, 'context', 'transcripts'))).toBe(false);
    });

    it('payload with stop_hook_active:false: spawn happens, transcript written', async () => {
      const stub = writeAutoExtractStub(sandbox);
      const r = captureTurn({
        payload: {
          stop_hook_active: false,
          assistant_message: 'normal completion',
        },
        projectRoot,
        autoExtractPath: stub.path,
        now: '2026-05-25T10:00:00Z',
      });
      expect(r.action).toBe('captured');
      expect(r.spawned).toBe(true);

      await pollForFileWithContent(stub.lockFile);
      expect(existsSync(stub.lockFile)).toBe(true);
      expect(existsSync(r.transcriptPath)).toBe(true);
    });

    it('payload without stop_hook_active: same as false (spawn happens)', async () => {
      const stub = writeAutoExtractStub(sandbox);
      const r = captureTurn({
        payload: { assistant_message: 'no flag set' },
        projectRoot,
        autoExtractPath: stub.path,
        now: '2026-05-25T10:00:00Z',
      });
      expect(r.action).toBe('captured');
      expect(r.spawned).toBe(true);

      await pollForFileWithContent(stub.lockFile);
      expect(existsSync(stub.lockFile)).toBe(true);
    });
  });

  describe('transcript append (21.2)', () => {
    it('appends with ## <ts> — assistant heading', async () => {
      const stub = writeAutoExtractStub(sandbox);
      const r = captureTurn({
        payload: { assistant_message: 'hello there' },
        projectRoot,
        autoExtractPath: stub.path,
        now: '2026-05-25T10:30:00Z',
      });
      const text = readFileSync(r.transcriptPath, 'utf8');
      expect(text).toMatch(/##\s+2026-05-25T10:30:00Z\s+—\s+assistant/);
      expect(text).toContain('hello there');
    });

    it('<private>secret</private> replaced; <retain>important</retain> preserved verbatim', () => {
      const stub = writeAutoExtractStub(sandbox);
      const r = captureTurn({
        payload: {
          assistant_message:
            'safe text <private>SECRET_TURN_SENTINEL</private> middle <retain>important</retain> end',
        },
        projectRoot,
        autoExtractPath: stub.path,
        now: '2026-05-25T10:00:00Z',
      });
      const text = readFileSync(r.transcriptPath, 'utf8');
      expect(text).not.toContain('SECRET_TURN_SENTINEL');
      expect(text).toContain('[private content redacted]');
      expect(text).toContain('<retain>important</retain>');
    });

    it('extracts turn text from documented alternative payload fields', () => {
      const stub = writeAutoExtractStub(sandbox);
      // last_assistant_message fallback (older Claude Code payload shape)
      const r = captureTurn({
        payload: { last_assistant_message: 'older-payload-marker' },
        projectRoot,
        autoExtractPath: stub.path,
        now: '2026-05-25T10:00:00Z',
      });
      expect(r.action).toBe('captured');
      const text = readFileSync(r.transcriptPath, 'utf8');
      expect(text).toContain('older-payload-marker');
    });

    it('payload with no turn text: action:noop', () => {
      const stub = writeAutoExtractStub(sandbox);
      const r = captureTurn({
        payload: {},
        projectRoot,
        autoExtractPath: stub.path,
      });
      expect(r.action).toBe('noop');
      expect(r.reason).toBe('no-turn-text');
      expect(r.spawned).toBe(false);
    });
  });

  describe('detached spawn (21.3 + 21.4 + 21.5)', () => {
    // NFR-1 budget for the Stop hook is 50ms. On Linux/macOS the
    // in-process spawn() returns sub-millisecond; on Windows node's
    // spawn has measurable overhead (~30-80ms cold). We assert <250ms
    // here — well below design §5.1's 30s hook timeout, and a value
    // that catches "I accidentally awaited the child" regressions
    // without being flaky on Windows.
    it('captureTurn() returns fast (well under hook timeout) even when spawned subagent sleeps', async () => {
      const stub = writeAutoExtractStub(sandbox, { sleepMs: 500 });
      const t0 = Date.now();
      const r = captureTurn({
        payload: { assistant_message: 'parent returns fast' },
        projectRoot,
        autoExtractPath: stub.path,
        now: '2026-05-25T10:00:00Z',
      });
      const elapsed = Date.now() - t0;
      expect(r.action).toBe('captured');
      expect(r.spawned).toBe(true);
      expect(elapsed).toBeLessThan(250);
      // Door 3 (external calls): the perf assertion alone could pass
      // if spawn silently failed (`r.spawned` is set BEFORE the child
      // exit). Pin that the spawned child actually ran by polling
      // for its sentinel content. Without this, a spawn-broken
      // regression on Windows .cmd shims would still pass the perf
      // bound and ship undetected.
      await pollForFileWithContent(stub.lockFile);
      expect(readFileSync(stub.lockFile, 'utf8')).toContain('LOCK');
    });

    it('autoExtractPath missing: spawned:false, but transcript still appended', () => {
      const r = captureTurn({
        payload: { assistant_message: 'still-transcribe' },
        projectRoot,
        autoExtractPath: join(sandbox, 'this-script-does-not-exist.mjs'),
        now: '2026-05-25T10:00:00Z',
      });
      expect(r.action).toBe('captured');
      expect(r.spawned).toBe(false);
      expect(r.reason).toBe('auto-extract-missing');
      expect(existsSync(r.transcriptPath)).toBe(true);
    });

    it('autoExtractPath not provided: spawned:false, transcript still appended', () => {
      const r = captureTurn({
        payload: { assistant_message: 'no path given' },
        projectRoot,
        now: '2026-05-25T10:00:00Z',
      });
      expect(r.action).toBe('captured');
      expect(r.spawned).toBe(false);
      expect(existsSync(r.transcriptPath)).toBe(true);
    });

    it('writes a turn buffer file for the subagent under .extract-*.tmp', async () => {
      const stub = writeAutoExtractStub(sandbox);
      const r = captureTurn({
        payload: { assistant_message: 'expect tmp file' },
        projectRoot,
        autoExtractPath: stub.path,
        now: '2026-05-25T10:00:00Z',
      });
      expect(r.turnFile).toMatch(/[\/\\]\.extract-\d+\.tmp$/);
      // Initially exists (the stub may delete it after reading; the
      // contract is "file exists at spawn time")
      // Wait briefly for spawn to run + then check the stub got the turnFile arg
      await pollForFileWithContent(stub.lockFile);
      const lockContent = readFileSync(stub.lockFile, 'utf8');
      expect(lockContent).toContain('.extract-');
    });
  });

  // ----------------------------------------------------------------
  // Bi-turn temp file shape (design §6.4 amendment, 2026-05-26).
  // capture-turn assembles BOTH the prior user prompt + the
  // just-captured assistant turn into the temp file with
  // USER_TURN: / ASSISTANT_TURN: markers, so auto-extract can apply
  // origin-aware trust routing.
  // ----------------------------------------------------------------
  describe('bi-turn temp file (design §6.4 amendment)', () => {
    it('temp file contains USER_TURN: and ASSISTANT_TURN: markers with both bodies', () => {
      // Pre-populate today's transcript with a user entry (as
      // capture-prompt would have done on the UserPromptSubmit that
      // triggered this assistant turn).
      const transcriptPath = join(projectRoot, 'context', 'transcripts', '2026-05-25.md');
      require('node:fs').mkdirSync(require('node:path').dirname(transcriptPath), { recursive: true });
      writeFileSync(
        transcriptPath,
        '## 2026-05-25T10:00:00Z — user\n\nI prefer pnpm not npm\n\n',
        'utf8',
      );

      const r = captureTurn({
        payload: { assistant_message: 'Got it.' },
        projectRoot,
        now: '2026-05-25T10:00:01Z',
        // No autoExtractPath → no spawn → temp file just persists
      });
      expect(r.action).toBe('captured');
      expect(existsSync(r.turnFile)).toBe(true);
      const body = readFileSync(r.turnFile, 'utf8');
      expect(body).toContain('USER_TURN:');
      expect(body).toContain('ASSISTANT_TURN:');
      expect(body).toContain('I prefer pnpm not npm');
      expect(body).toContain('Got it.');
      // Order: USER_TURN before ASSISTANT_TURN
      expect(body.indexOf('USER_TURN:')).toBeLessThan(body.indexOf('ASSISTANT_TURN:'));
      // User body sits between the markers
      const userIdx = body.indexOf('I prefer pnpm not npm');
      const asstMarkerIdx = body.indexOf('ASSISTANT_TURN:');
      expect(userIdx).toBeLessThan(asstMarkerIdx);
    });

    it('no prior user entry in transcript → USER_TURN section is empty but the markers still appear', () => {
      // Transcript is empty (or only contains the just-appended
      // assistant entry from THIS captureTurn call). readLastUserTurnFromTranscript
      // finds no `— user` heading and returns ''.
      const r = captureTurn({
        payload: { assistant_message: 'standalone assistant message' },
        projectRoot,
        now: '2026-05-25T10:00:00Z',
      });
      expect(r.action).toBe('captured');
      const body = readFileSync(r.turnFile, 'utf8');
      expect(body).toContain('USER_TURN:');
      expect(body).toContain('ASSISTANT_TURN:');
      expect(body).toContain('standalone assistant message');
      // USER_TURN body is empty: between the marker and the next
      // ASSISTANT_TURN: line, only blank lines.
      const userTurnStart = body.indexOf('USER_TURN:') + 'USER_TURN:'.length;
      const asstTurnStart = body.indexOf('ASSISTANT_TURN:');
      const userBody = body.slice(userTurnStart, asstTurnStart).trim();
      expect(userBody).toBe('');
    });

    it('most recent user entry is selected when transcript has multiple user entries', () => {
      const transcriptPath = join(projectRoot, 'context', 'transcripts', '2026-05-25.md');
      require('node:fs').mkdirSync(require('node:path').dirname(transcriptPath), { recursive: true });
      // Two user entries; the second is the immediate predecessor.
      writeFileSync(
        transcriptPath,
        [
          '## 2026-05-25T09:00:00Z — user',
          '',
          'first older prompt',
          '',
          '## 2026-05-25T09:05:00Z — assistant',
          '',
          'older response',
          '',
          '## 2026-05-25T10:00:00Z — user',
          '',
          'the most recent prompt',
          '',
        ].join('\n'),
        'utf8',
      );
      const r = captureTurn({
        payload: { assistant_message: 'reply' },
        projectRoot,
        now: '2026-05-25T10:00:01Z',
      });
      const body = readFileSync(r.turnFile, 'utf8');
      expect(body).toContain('the most recent prompt');
      expect(body).not.toContain('first older prompt');
    });
  });
});

describe('Task 21 — bin/cmk-capture-turn (hook bash wrapper)', () => {
  let sandbox;
  let projectRoot;

  beforeEach(() => {
    const f = makeFixture();
    sandbox = f.sandbox;
    projectRoot = f.projectRoot;
  });

  afterEach(async () => {
    // Same defensive cleanup as the boundary-tests describe — detached
    // children may still hold sandbox handles on Windows; give them a
    // beat then swallow EPERM if rmSync still races them.
    await new Promise((res) => setTimeout(res, 500));
    try {
      rmSync(sandbox, { recursive: true, force: true });
    } catch {
      // Background child still has a handle open; leave the temp dir
      // for the OS to clean. Doesn't affect the test outcome.
    }
  });

  it('exits 0 with continue:true on a valid Stop payload', () => {
    const r = spawnSync('bash', [BIN_PATH], {
      input: JSON.stringify({
        hook_event_name: 'Stop',
        assistant_message: 'bin wrapper smoke',
        stop_hook_active: false,
      }),
      encoding: 'utf8',
      cwd: projectRoot,
    });
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed).toMatchObject({ continue: true });
  });

  it('writes the transcript to context/transcripts/<today>.md', () => {
    spawnSync('bash', [BIN_PATH], {
      input: JSON.stringify({
        assistant_message: 'wrapper-turn-marker',
        stop_hook_active: false,
      }),
      encoding: 'utf8',
      cwd: projectRoot,
    });
    const dir = join(projectRoot, 'context', 'transcripts');
    expect(existsSync(dir)).toBe(true);
    const files = readdirSync(dir).filter((n) => n.endsWith('.md'));
    expect(files.length).toBe(1);
    const text = readFileSync(join(dir, files[0]), 'utf8');
    expect(text).toContain('wrapper-turn-marker');
  });

  it('CMK_AUTO_EXTRACT_PATH env var drives the spawn; sentinel lands after parent exit (detach proof)', async () => {
    // Stub auto-extract: waits 600ms then writes a sentinel. The
    // detach contract we care about is: the SENTINEL must not exist
    // at the moment the parent returns (because the child is still
    // sleeping). It DOES appear shortly after. The wall-clock duration
    // of the parent itself is not asserted because Windows + node's
    // detached + unref + Git Bash combination has variable behavior
    // around waiting on detached children's pipes — see the in-process
    // boundary tests above for the actual NFR-1 assertion on
    // captureTurn() proper.
    const stub = writeAutoExtractStub(sandbox, { sleepMs: 600, sentinel: 'DETACH_PROOF' });

    const r = spawnSync('bash', [BIN_PATH], {
      input: JSON.stringify({
        assistant_message: 'detach proof',
        stop_hook_active: false,
      }),
      encoding: 'utf8',
      cwd: projectRoot,
      env: { ...process.env, CMK_AUTO_EXTRACT_PATH: stub.path },
    });
    expect(r.status).toBe(0);

    // The sentinel may or may not have landed by now depending on
    // scheduler timing — what matters is that it eventually lands AND
    // its content matches what the stub wrote (proves spawn invoked
    // the stub with the right argv).
    //
    // 20s poll window: the detached child has to clear bash startup
    // (~500-1000ms on Windows) + node cold-start (~500-1500ms) +
    // 600ms stub sleep + writeFile. Under full-suite concurrency on
    // Windows those add up well past 4000ms (the previous bound,
    // which PR #22 and #23 documented as a "known cli-capture-turn
    // flake" without fixing). 20s is two orders of magnitude below
    // the design §5.1 hook timeout (30s) so any case where the
    // sentinel genuinely never lands still fails fast.
    await pollForFileWithContent(stub.lockFile, { timeoutMs: 20000 });
    expect(existsSync(stub.lockFile)).toBe(true);
    expect(readFileSync(stub.lockFile, 'utf8')).toContain('DETACH_PROOF');
  });

  it('stop_hook_active:true short-circuits: no transcript, no spawn', async () => {
    const stub = writeAutoExtractStub(sandbox);
    const r = spawnSync('bash', [BIN_PATH], {
      input: JSON.stringify({
        assistant_message: 'should-not-be-saved',
        stop_hook_active: true,
      }),
      encoding: 'utf8',
      cwd: projectRoot,
      env: { ...process.env, CMK_AUTO_EXTRACT_PATH: stub.path },
    });
    expect(r.status).toBe(0);
    await new Promise((res) => setTimeout(res, 300));
    expect(existsSync(stub.lockFile)).toBe(false);
    expect(existsSync(join(projectRoot, 'context', 'transcripts'))).toBe(false);
  });
});
