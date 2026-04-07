import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 5173,
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
})
