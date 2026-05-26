#!/usr/bin/env node
// Test fixture: process that ignores all argv and hangs forever
// until killed. Used by tests/spawn-smoke-kill-chain.test.js to
// verify the SIGTERM → grace → SIGKILL escalation in
// compressor.mjs terminateSubprocess against a real OS process.
//
// Critical: setInterval keeps the event loop alive WITHOUT pegging
// the CPU. A while(true) loop would burn 100% CPU and prevent the
// OS from delivering signals on some platforms; an idle process
// holding an open setInterval handle behaves identically to a
// real-world subprocess waiting on slow I/O (e.g., a hung claude
// --print call waiting for the Anthropic API).
//
// Lifecycle: process spawns, registers the interval, and blocks
// indefinitely until SIGTERM / SIGKILL. The interval callback
// itself does nothing; it exists only to keep the loop alive.

setInterval(() => {
  // intentionally empty — the timer is just to keep us alive
}, 1000);

// Diagnostic stdout so a test can confirm the fixture actually
// started (vs. crashing before the interval registered).
process.stdout.write('hang-forever started\n');
