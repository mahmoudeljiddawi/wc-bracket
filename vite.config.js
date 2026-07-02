import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { execFile } from 'node:child_process'

// Dev-only endpoint: POST /api/sync runs sync-worldcup.mjs so the browser
// can trigger a real API pull (on page load and via the button). In
// production (static hosting) this endpoint doesn't exist and the app
// falls back to the results.json baked in at build time.
const syncOnDemand = (apiKey) => {
  let lastSync = 0
  let inFlight = false
  const COOLDOWN_MS = 30_000 // free tier allows 10 req/min; one sync per 30s is plenty

  return {
    name: 'sync-worldcup-on-demand',
    configureServer(server) {
      server.middlewares.use('/api/sync', (req, res) => {
        const respond = (code, body) => {
          res.statusCode = code
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }
        if (inFlight || Date.now() - lastSync < COOLDOWN_MS) {
          return respond(200, { synced: false, reason: 'cooldown' })
        }
        inFlight = true
        execFile(
          'node',
          ['sync-worldcup.mjs'],
          {
            cwd: server.config.root,
            env: { ...process.env, FOOTBALL_DATA_KEY: process.env.FOOTBALL_DATA_KEY || apiKey },
          },
          (err, stdout, stderr) => {
            inFlight = false
            if (err) return respond(500, { synced: false, error: (stderr || err.message).trim() })
            lastSync = Date.now()
            respond(200, { synced: true })
          }
        )
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    // GitHub Pages serves project sites under /<repo>/ — the deploy
    // workflow sets BASE_PATH accordingly; local builds default to /.
    base: process.env.BASE_PATH || '/',
    plugins: [react(), syncOnDemand(env.FOOTBALL_DATA_KEY)],
  }
})
