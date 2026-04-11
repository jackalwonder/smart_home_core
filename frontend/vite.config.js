import path from 'node:path'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const frontendRoot = process.cwd()
  const repoRoot = path.resolve(frontendRoot, '..')
  const frontendEnv = loadEnv(mode, frontendRoot, '')
  const repoEnv = loadEnv(mode, repoRoot, '')
  const env = { ...repoEnv, ...frontendEnv, ...process.env }
  const backendPort = env.BACKEND_PORT?.trim() || '8000'
  const backendHost = env.BACKEND_HOST?.trim() || '127.0.0.1'
  const backendTarget = env.VITE_DEV_PROXY_TARGET?.trim() || `http://${backendHost}:${backendPort}`
  const backendWsTarget = backendTarget.replace(/^http/i, 'ws')
  const readApiKey = env.APP_READ_API_KEY?.trim() || ''

  return {
    plugins: [vue()],
    test: {
      environment: 'node',
      globals: true,
      setupFiles: './src/test/setup.js',
      include: ['src/**/*.spec.js'],
      restoreMocks: true,
      clearMocks: true,
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          headers: readApiKey ? { 'X-API-Key': readApiKey } : undefined,
        },
        '/ws': {
          target: backendWsTarget,
          changeOrigin: true,
          ws: true,
          headers: readApiKey ? { 'X-API-Key': readApiKey } : undefined,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/three/examples/jsm')) {
              return 'three-extras'
            }
            if (id.includes('node_modules/three')) {
              return 'three-core'
            }
            if (id.includes('node_modules/vue') || id.includes('node_modules/pinia')) {
              return 'framework'
            }
            return undefined
          },
        },
      },
    },
  }
})
