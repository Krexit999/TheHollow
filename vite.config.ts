/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    /**
     * SIXTY SECONDS, NOT FIVE (A.101).
     *
     * A dozen tests in this suite are real fixed-step SIMULATIONS — a 16-hour
     * Cinder shaft is 576k steps, a live-stepped hour with twenty-four drills
     * is another. Each passes in well under a second alone and takes tens of
     * seconds under full parallelism, so vitest's 5s default made the suite's
     * pass/fail depend on how busy the machine was: three consecutive full runs
     * failed on THREE DIFFERENT SETS of tests, none of them broken.
     *
     * A.100 raised one such test's budget and A.101 raised two more before
     * noticing it was chasing instances of a class. A test that depends on
     * machine load has a harness bug, not a flaky subject — so the budget is
     * stated once, here, and the individual overrides that remain are the ones
     * documenting WHY a particular test is slow.
     *
     * This does not hide a hang: a genuinely stuck test still fails, one minute
     * later. What it stops is a green suite reporting red because something
     * else was compiling.
     */
    testTimeout: 60_000,
  },
});
