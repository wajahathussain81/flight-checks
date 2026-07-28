import { defineConfig } from 'vitest/config'

// vite.config.ts sets root to src/web for the dashboard build; vitest prefers
// this file, keeping test discovery anchored at the repo root.
export default defineConfig({})
