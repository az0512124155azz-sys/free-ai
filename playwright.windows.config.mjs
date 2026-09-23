import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir:'./tests/visual',
  testMatch:/windows-shell\.spec\.mjs/,
  timeout:60_000,
  workers:1,
  fullyParallel:false,
  outputDir:'artifacts/windows-visual/results',
  snapshotPathTemplate:'{testDir}/baselines/{arg}{ext}',
  reporter:[['list']],
  expect:{
    timeout:10_000
  }
});
