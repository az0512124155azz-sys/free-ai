import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/linux-audit',
  testMatch:'linux-l1-pr143.spec.mjs',
  timeout:180000,
  expect:{timeout:10000},
  fullyParallel:false,
  workers:1,
  retries:0,
  reporter:[['line']],
  outputDir:'artifacts/linux-l1-pr143/test-results',
  use:{trace:'retain-on-failure',screenshot:'only-on-failure'}
});
