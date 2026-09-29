import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir:'./tests/audit',
  testMatch:/windows-(?:known-fixes|w5a-native|w5b-restart|w5c-buttons)\.spec\.mjs$/,
  timeout:180_000,
  workers:1,
  fullyParallel:false,
  outputDir:'artifacts/windows-audit/results',
  reporter:[['list']],
  expect:{timeout:12_000}
});
