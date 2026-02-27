import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// v6.0.132: Fix "Failed to fetch dynamically imported module" for App.tsx
// Root cause: motion/react re-exports from framer-motion via `export * from 'framer-motion'`
// In the Figma proxy environment, Vite's on-demand transform of this deep resolution chain
// (motion/dist/es/react.mjs → framer-motion → framer-motion/dist/es/index.mjs) can fail
// due to timeout or 500 errors through the proxy layer.
//
// Fix: optimizeDeps.include forces Vite to pre-bundle these packages during startup,
// converting the multi-hop ESM chain into a single pre-bundled file that loads instantly.
// resolve.dedupe ensures only one copy of framer-motion is ever resolved.
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: [
      'framer-motion',
      'motion',
      'react',
      'react-dom',
      'lucide-react',
      'sonner',
    ],
  },
  resolve: {
    dedupe: ['framer-motion', 'motion', 'react', 'react-dom'],
  },
})
