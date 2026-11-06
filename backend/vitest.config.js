import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { env: { NODE_ENV: 'test' }, pool: 'forks', poolOptions: { forks: { singleFork: true } }, testTimeout: 15000, hookTimeout: 120000 } });
