import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Split heavy libraries into long-cacheable chunks. three.js/R3F are only fetched when a 3D scene mounts (see components/Lazy.jsx).
const chunkFor = id => {
  if (!id.includes('node_modules')) return undefined
  if (/node_modules\/three\//.test(id)) return 'three'
  if (/node_modules\/@react-three\//.test(id)) return 'r3f'
  if (/node_modules\/gsap\//.test(id)) return 'gsap'
  if (/node_modules\/@supabase\//.test(id)) return 'supabase'
  if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return 'vendor'
  return undefined
}
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8000' } },
  build: { rollupOptions: { output: { manualChunks: chunkFor } } },
  test: { environment: 'jsdom', setupFiles: './src/test/setup.js', css: false, restoreMocks: true },
})
