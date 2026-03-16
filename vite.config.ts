import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// v6.0.133: motion/react pre-bundling fix — 彻底解决 Figma 预览永久 loading 问题
//
// ── 根因分析 ──────────────────────────────────────────────────────────────────
// motion/react (dist/es/react.mjs) 的实际内容是:
//   export * from 'framer-motion';
//   export { m, motion } from 'framer-motion';
//
// 在 Figma Make 代理环境下，Vite 的 on-demand transform 路径为:
//   Browser → Figma Proxy → Vite Dev Server → resolve motion/react
//                                            → framer-motion (pnpm virtual store)
//                                            → framer-motion/dist/es/index.mjs
//
// 该多跳解析链在代理环境下会超时或返回 500。由于 App.tsx 对
// SeriesCreationPanel (依赖 motion/react) 做 eager import，
// 任何一跳 hang 都会阻塞整个初始模块图，导致 React 无法挂载
// ── 症状即"页面一直加载不出来" ──
//
// ── 修复策略 ──────────────────────────────────────────────────────────────────
// 将 motion/react + framer-motion + motion 全部加入 optimizeDeps.include:
//   · Vite 在 dev-server 启动时（本地，不经过 Figma 代理）完成 pre-bundling
//   · 将整条 motion/react → framer-motion 链打包为单个 .vite/deps/xxx.js
//   · 浏览器请求 motion/react 时命中预编译缓存，直接返回静态文件
//   · 无需任何 on-demand transform，彻底消除代理超时风险
//
// resolve.dedupe 加入 framer-motion/motion 防止 pnpm 多版本共存导致重复实例。
//
// v6.0.121: vite.config.ts framer-motion alias 路径简化（path.resolve('./node_modules/framer-motion')）
// v6.0.113: 引入 framer-motion 直接依赖 + alias 修复
// v6.0.133: 改为 optimizeDeps.include（更可靠，无需 alias 路径假设）
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: [
      'framer-motion',
      'motion',
      'motion/react',      // ← CRITICAL: pre-bundle the motion/react subpath export
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