import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },
  // 强制清除缓存配置
  optimizeDeps: {
    force: true, // 强制重新优化依赖
    include: [
      'react',
      'react-dom',
      'motion/react',
      'lucide-react',
    ],
  },
  server: {
    fs: {
      strict: false, // 允许访问工作区外的文件
    },
    hmr: {
      overlay: true, // 显示错误覆盖层
    },
  },
  build: {
    sourcemap: true, // 生成 sourcemap 以便调试
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'motion-vendor': ['motion/react'],
          'ui-vendor': ['lucide-react'],
        },
      },
    },
  },
  // 禁用缓存
  cacheDir: '.vite-temp',
})