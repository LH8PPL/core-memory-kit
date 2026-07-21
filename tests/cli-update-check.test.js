// @doors: 1, 3
// Door 1: the {checked, stale, latest, installed, reason} response shape.
// Door 2 N/A: pure read path — nothing on disk changes.
// Door 3: the external call IS the subject — the registry GET's URL and abort
//   signal are pinned via the injected fetcher (no LLM spawn; Door 3.5 N/A).
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: the check writes no log — doctor's rendered output is asserted
//   in the HC-9 integration cases below (its message + status ARE the
//   observable surface).

// Task 245 (D-382) — the stale-global self-check.
//
// THE HOLE THIS CLOSES: every doctor check compares against the INSTALLED
// binary, so a silently-failed `npm i -g` upgrade reads as healthy — an
// un-upgraded pair is internally consistent. Observed live: the PreCompact
// hook absent from the kit's own repo for hours after Task 235 shipped, while
// doctor reported green. The fix is cause-independent: ask the registry what
// `latest` is and say so out loud.
//
// THE POSTURE UNDER TEST: soft, never-throws, never-flakes. Offline, HTTP
// errors, bad payloads, timeouts, CI — every one must degrade to
// {checked:false}, silently. The check may only ESCALATE a passing HC-9 to
// warn; it must never mask a real failure or fail doctor on its own.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkPublishedLatest,
  REGISTRY_LATEST_URL,
  UPDATE_CHECK_TIMEOUT_MS,
} from '../packages/cli/src/version-drift.mjs';
import { runDoctor } from '../packages/cli/src/doctor.mjs';

const okFetcher = (version) => async () => ({
  ok: true,
  json: async () => ({ version }),
});

describe('checkPublishedLatest — the soft registry probe', () => {
  it('reports stale when the registry is ahead, with both versions (Door 1)', async () => {
    const r = await checkPublishedLatest({
      installedVersion: '0.6.0',
      fetcher: okFetcher('0.6.1'),
      env: {},
    });
    expect(r).toEqual({ checked: true, latest: '0.6.1', installed: '0.6.0', stale: true });
  });

  it('reports fresh when versions match, and when installed is NEWER (pre-release dev tree)', async () => {
    const same = await checkPublishedLatest({
      installedVersion: '0.6.1', fetcher: okFetcher('0.6.1'), env: {},
    });
    expect(same.stale).toBe(false);
    // A dev tree ahead of the registry must not nag about "upgrading" backwards.
    const ahead = await checkPublishedLatest({
      installedVersion: '0.7.0', fetcher: okFetcher('0.6.1'), env: {},
    });
    expect(ahead.stale).toBe(false);
  });

  it('pins the external call: the registry URL and an abort signal (Door 3)', async () => {
    const calls = [];
    const fetcher = async (url, opts) => {
      calls.push({ url, hasSignal: opts?.signal instanceof AbortSignal });
      return { ok: true, json: async () => ({ version: '0.6.1' }) };
    };
    await checkPublishedLatest({ installedVersion: '0.6.0', fetcher, env: {} });
    expect(calls).toEqual([{ url: REGISTRY_LATEST_URL, hasSignal: true }]);
    // The URL is the npm registry's package metadata endpoint — the same GET
    // `npm view` makes. Nothing beyond the package name leaves the machine.
    expect(REGISTRY_LATEST_URL).toMatch(/^https:\/\/registry\.npmjs\.org\//);
  });

  it('is skipped under CI, VITEST, and CMK_SKIP_UPDATE_CHECK', async () => {
    for (const env of [{ CI: 'true' }, { VITEST: 'true' }, { CMK_SKIP_UPDATE_CHECK: '1' }]) {
      const r = await checkPublishedLatest({
        installedVersion: '0.6.0',
        fetcher: async () => { throw new Error('must not be called'); },
        env,
      });
      expect(r).toEqual({ checked: false, reason: 'ci-or-disabled' });
    }
  });

  it('degrades silently on network error, HTTP error, and bad payload', async () => {
    const net = await checkPublishedLatest({
      installedVersion: '0.6.0',
      fetcher: async () => { throw new Error('ECONNREFUSED'); },
      env: {},
    });
    expect(net).toEqual({ checked: false, reason: 'network' });

    const http = await checkPublishedLatest({
      installedVersion: '0.6.0',
      fetcher: async () => ({ ok: false, status: 503 }),
      env: {},
    });
    expect(http).toEqual({ checked: false, reason: 'http-503' });

    const bad = await checkPublishedLatest({
      installedVersion: '0.6.0',
      fetcher: async () => ({ ok: true, json: async () => ({ nope: true }) }),
      env: {},
    });
    expect(bad).toEqual({ checked: false, reason: 'bad-payload' });
  });

  // Budget pair for UPDATE_CHECK_TIMEOUT_MS (design §8.5 class): the timeout
  // exists so an unreachable registry cannot wedge doctor. At-cap: a fetcher
  // that resolves before the deadline is honored. Over-cap: one that outlives
  // it is aborted and degrades to checked:false — doctor never hangs.
  it('a fetcher slower than the timeout degrades to checked:false (over-cap)', async () => {
    const r = await checkPublishedLatest({
      installedVersion: '0.6.0',
      timeoutMs: 30,
      fetcher: (url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason));
          // never resolves on its own — only the abort can settle it
        }),
      env: {},
    });
    expect(r).toEqual({ checked: false, reason: 'network' });
  });

  it('a fetcher inside the timeout is honored (at-cap)', async () => {
    const r = await checkPublishedLatest({
      installedVersion: '0.6.0',
      timeoutMs: UPDATE_CHECK_TIMEOUT_MS,
      fetcher: okFetcher('0.6.1'),
      env: {},
    });
    expect(r.checked).toBe(true);
  });
});

describe('HC-9 integration — doctor says it out loud, softly', () => {
  function tempProject() {
    return mkdtempSync(join(tmpdir(), 'cmk-update-check-'));
  }

  async function doctorHc9({ fetcher, kitVersion = '0.6.0', claudeMd }) {
    const projectRoot = tempProject();
    try {
      if (claudeMd) {
        writeFileSync(join(projectRoot, 'CLAUDE.md'), claudeMd, 'utf8');
      }
      const r = await runDoctor({
        projectRoot,
        userDir: join(projectRoot, 'user'),
        kitVersion,
        registryFetcher: fetcher,
        kitBindingProbe: async () => ({ ok: true }),
        embedderBindingProbe: async () => ({ ok: true }),
        backendCliProbe: () => ({ ok: true }),
      });
      return r.checks.find((c) => c.id === 'HC-9');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  }

  // A managed block whose marker matches kitVersion exactly → HC-9 'pass'.
  const INSTALLED_AT = (v) =>
    `# Project\n\n<!-- core-memory-kit:start v${v} -->\nmanaged\n<!-- core-memory-kit:end -->\n`;

  it('escalates a passing HC-9 to warn with the exact upgrade command', async () => {
    const c9 = await doctorHc9({
      fetcher: okFetcher('0.6.1'),
      claudeMd: INSTALLED_AT('0.6.0'),
    });
    expect(c9.status).toBe('warn');
    expect(c9.message).toMatch(/behind the published v0\.6\.1/);
    expect(c9.message).toMatch(/verify with `cmk version`/); // the D-382 lesson, in the message
    expect(c9.recoveryCommand).toBe('npm install -g @lh8ppl/core-memory-kit@latest');
  });

  it('escalates a SKIP too — the stale-global fact is about the binary, not this project', async () => {
    // No CLAUDE.md → kit not installed here → HC-9 skip. The binary being
    // behind the registry is still true and still worth saying.
    const c9 = await doctorHc9({ fetcher: okFetcher('0.6.1') });
    expect(c9.status).toBe('warn');
  });

  it('leaves HC-9 untouched when fresh, and when the registry is unreachable', async () => {
    const fresh = await doctorHc9({
      fetcher: okFetcher('0.6.0'),
      claudeMd: INSTALLED_AT('0.6.0'),
    });
    expect(fresh.status).toBe('pass');

    const offline = await doctorHc9({
      fetcher: async () => { throw new Error('offline'); },
      claudeMd: INSTALLED_AT('0.6.0'),
    });
    expect(offline.status).toBe('pass'); // soft: offline is never a finding
  });

  it('never masks a real HC-9 failure — fail keeps its message and recovery', async () => {
    // Project marker OLDER than the binary → HC-9 'fail' (the real drift case,
    // with `cmk install` as recovery). A stale registry answer must not
    // replace that with the softer upgrade nag.
    const c9 = await doctorHc9({
      fetcher: okFetcher('99.0.0'),
      claudeMd: INSTALLED_AT('0.5.0'),
    });
    expect(c9.status).toBe('fail');
    expect(c9.recoveryCommand).toBe('cmk install');
    expect(c9.message).not.toMatch(/behind the published/);
  });
});
