import { defineConfig } from 'vite';

// base 相对化:构建产物可放在任意静态子路径下托管(见 HANDOFF.md P0 决策记录)
export default defineConfig({
  base: './',
  server: {
    port: 5173,
  },
});
