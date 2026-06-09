// @doors: 1
// Door 2 N/A: pure function, no disk/state.
// Door 3 N/A: no subprocess.
// Door 4 N/A: no NDJSON log.
// Door 5 N/A: no message queue.

// Tests for sanitize.mjs — home-path abstraction (write-path fix #1, the
// privacy leak: a durable fact written to a committed/shared tier must never
// carry the local username). Boundary: given arbitrary text, sanitizeHomePaths
// returns text with home-dir prefixes abstracted to `~`, preserving the rest.

import { describe, it, expect } from 'vitest';
import { sanitizeHomePaths } from '../packages/cli/src/sanitize.mjs';

describe('sanitizeHomePaths — home-dir abstraction (#1 privacy)', () => {
  it('abstracts a Windows C:\\Users\\<name> prefix, keeping the tail', () => {
    expect(
      sanitizeHomePaths(
        'interpreter at C:\\Users\\tamir.bn-sh\\AppData\\Local\\Programs\\Python\\Python313\\python.exe',
      ),
    ).toBe('interpreter at ~\\AppData\\Local\\Programs\\Python\\Python313\\python.exe');
  });

  it('abstracts a Windows forward-slash C:/Users/<name> prefix', () => {
    expect(sanitizeHomePaths('see C:/Users/tamir.bn-sh/code/app.py')).toBe(
      'see ~/code/app.py',
    );
  });

  it('abstracts a Linux /home/<name> prefix', () => {
    expect(sanitizeHomePaths('venv at /home/someuser/.venv/bin/python')).toBe(
      'venv at ~/.venv/bin/python',
    );
  });

  it('abstracts a macOS /Users/<name> prefix', () => {
    expect(sanitizeHomePaths('cloned to /Users/someuser/projects/x')).toBe(
      'cloned to ~/projects/x',
    );
  });

  it('abstracts a bare home dir with no trailing path', () => {
    expect(sanitizeHomePaths('home is C:\\Users\\tamir.bn-sh')).toBe('home is ~');
    expect(sanitizeHomePaths('home is /home/someuser')).toBe('home is ~');
  });

  it('handles multiple occurrences in one string', () => {
    expect(
      sanitizeHomePaths('from /home/someuser/a to /home/someuser/b'),
    ).toBe('from ~/a to ~/b');
  });

  it('abstracts lowercased home prefixes too (case-insensitive FS — privacy)', () => {
    expect(sanitizeHomePaths('c:\\users\\someuser\\code')).toBe('~\\code');
    expect(sanitizeHomePaths('/home/SomeUser/.venv')).toBe('~/.venv');
  });

  it('leaves text without home paths untouched', () => {
    const s = 'FastAPI: thin routes, logic in services, port 8000';
    expect(sanitizeHomePaths(s)).toBe(s);
  });

  it('does not touch relative or non-home absolute paths', () => {
    expect(sanitizeHomePaths('./src/app.py and /etc/hosts and /var/log')).toBe(
      './src/app.py and /etc/hosts and /var/log',
    );
  });

  it('is a no-op on non-string input', () => {
    expect(sanitizeHomePaths(undefined)).toBe(undefined);
    expect(sanitizeHomePaths(42)).toBe(42);
  });
});
