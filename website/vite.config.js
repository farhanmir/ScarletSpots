import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Read the VERSION file — single source of truth for the website version.
const APP_VERSION = readFileSync(resolve(__dirname, 'VERSION'), 'utf8').trim()

// Git SHA: prefer env var (set by CI / deploy script), fall back to live git.
const GIT_SHA =
  process.env.GIT_SHA ||
  (() => {
    try { return execSync('git rev-parse --short HEAD').toString().trim() }
    catch { return 'dev' }
  })()

const BUILD_TIME = new Date().toISOString()

export default defineConfig({
  plugins: [react()],
  define: {
    // Available everywhere in the React app as plain global identifiers.
    // Usage: console.log(__APP_VERSION__, __GIT_SHA__, __BUILD_TIME__)
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __GIT_SHA__: JSON.stringify(GIT_SHA),
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
})

