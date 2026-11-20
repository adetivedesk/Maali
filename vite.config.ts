import { defineConfig } from 'vitest/config'
import { loadEnv, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { DEMO_AS_OF_DATE } from './src/lib/format'

/**
 * Serves the Vercel functions in /api from the Vite dev server, so `npm run dev`
 * talks to Neon exactly like production does (no `vercel dev` needed).
 */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api', async (req, res, next) => {
        const name = (req.url ?? '/').split('?')[0].replace(/^\/+|\/+$/g, '')
        if (!/^[a-z-]+$/.test(name)) return next()
        try {
          const mod = await server.ssrLoadModule(`/api/${name}.ts`)
          const handler = mod[req.method ?? 'GET']
          if (typeof handler !== 'function') { res.statusCode = 405; return res.end() }
          const chunks: Buffer[] = []
          for await (const c of req) chunks.push(c as Buffer)
          const request = new Request(`http://localhost${req.originalUrl ?? req.url}`, {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body: chunks.length ? Buffer.concat(chunks) : undefined,
          })
          const response: Response = await handler(request)
          res.statusCode = response.status
          response.headers.forEach((v, k) => res.setHeader(k, v))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (e) {
          if (e instanceof Error && /Failed to load url/.test(e.message)) return next()
          res.statusCode = 500
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // Expose server-only env (DATABASE_URL from .env.local) to the dev API handlers.
  Object.assign(process.env, { ...loadEnv(mode, process.cwd(), ''), ...process.env })
  return {
    base: './', // relative assets so the build also works under /<repo>/ on GitHub Pages
    plugins: [react(), tailwindcss(), devApi()],
    // Tests check exact demo figures (overdue days etc.), so they run on the demo snapshot date.
    test: { env: { VITE_AS_OF_DATE: DEMO_AS_OF_DATE } },
  }
})
