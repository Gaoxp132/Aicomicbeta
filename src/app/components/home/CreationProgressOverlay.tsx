/**
 * CreationProgressOverlay - Immersive creation progress animation
 * Extracted from HomeCreationPanel.tsx (v6.0.71)
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles, Wand2, BookOpen, Palette,
  Loader2, Users, Grid3x3, CheckCircle2, X
} from 'lucide-react';

const CREATION_STEPS = [
  { id: 'think', label: '构思创意', icon: Sparkles, color: 'from-purple-500 to-violet-500', detail: 'AI正在理解你的想法...' },
  { id: 'script', label: '创作剧本', icon: BookOpen, color: 'from-blue-500 to-cyan-500', detail: '编写分集剧情和对话...' },
  { id: 'characters', label: '塑造角色', icon: Users, color: 'from-pink-500 to-rose-500', detail: '设计角色外貌和性格...' },
  { id: 'visualStyle', label: '视觉设计', icon: Palette, color: 'from-indigo-500 to-purple-500', detail: '生成视觉风格指南和角色外貌卡...' },
  { id: 'storyboard', label: '规划分镜', icon: Grid3x3, color: 'from-orange-500 to-amber-500', detail: '拆分场景和镜头语言...' },
  { id: 'done', label: '准备就绪', icon: CheckCircle2, color: 'from-green-500 to-emerald-500', detail: '即将开始生成视频！' },
];
const INSPIRATION_QUOTES = [
  '每个好故事都始于一个简单的想法', 'AI正在将你的灵感编织成精彩剧情',
  '角色正在被赋予独特的灵魂', '场景在AI的笔下徐徐展开',
  '创意的火花正在碰撞', '故事的世界观正在成型',
];

export function CreationProgressOverlay({ isVisible, phase, onCancel, storyTitle }: {
  isVisible: boolean; phase: string; onCancel?: () => void; storyTitle?: string;
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; delay: number }>>([]);

  useEffect(() => {
    if (!isVisible) { setCurrentStep(0); return; }
    if (phase.includes('构思') || phase.includes('创意')) setCurrentStep(0);
    else if (phase.includes('剧本') || phase.includes('创作')) setCurrentStep(1);
    else if (phase.includes('角色')) setCurrentStep(2);
    else if (phase.includes('视觉') || phase.includes('风格指南')) setCurrentStep(3);
    else if (phase.includes('分镜') || phase.includes('规划') || phase.includes('写入')) setCurrentStep(4);
    else if (phase.includes('成功') || phase.includes('完成') || phase.includes('就绪')) setCurrentStep(5);
  }, [phase, isVisible]);

  useEffect(() => {
    if (!isVisible) return;
    const timer = setInterval(() => { setCurrentStep(prev => prev < 4 ? prev + 1 : prev); }, 8000);
    return () => clearInterval(timer);
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible) return;
    const timer = setInterval(() => { setQuoteIndex(prev => (prev + 1) % INSPIRATION_QUOTES.length); }, 4000);
    return () => clearInterval(timer);
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible) { setParticles([]); return; }
    setParticles(Array.from({ length: 20 }, (_, i) => ({ id: i, x: Math.random() * 100, y: Math.random() * 100, delay: Math.random() * 3 })));
  }, [isVisible]);

  if (!isVisible) return null;
  const progress = Math.min(((currentStep + 1) / CREATION_STEPS.length) * 100, 100);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }} className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" />
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {particles.map(p => (
              <motion.div key={p.id} className="absolute w-1 h-1 rounded-full bg-purple-400/40"
                initial={{ x: `${p.x}vw`, y: `${p.y}vh`, opacity: 0 }}
                animate={{ y: [`${p.y}vh`, `${p.y - 30}vh`], opacity: [0, 0.6, 0], scale: [0.5, 1.5, 0.5] }}
                transition={{ duration: 6, repeat: Infinity, delay: p.delay, ease: 'easeInOut' }} />
            ))}
          </div>
          <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }} className="relative z-10 w-full max-w-md mx-4">
            <div className="text-center mb-8">
              <motion.div animate={{ rotate: [0, 360] }} transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-purple-500 to-pink-500 shadow-2xl shadow-purple-500/40 mb-4">
                <Wand2 className="w-9 h-9 text-white" />
              </motion.div>
              <motion.h2 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-xl font-bold text-white mb-1">
                {storyTitle || 'AI正在创作中'}
              </motion.h2>
              <AnimatePresence mode="wait">
                <motion.p key={quoteIndex} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.3 }} className="text-sm text-purple-300/70 italic">{INSPIRATION_QUOTES[quoteIndex]}</motion.p>
              </AnimatePresence>
            </div>
            <div className="bg-white/[0.03] backdrop-blur-2xl rounded-3xl border border-white/10 p-6 shadow-2xl">
              <div className="space-y-3">
                {CREATION_STEPS.map((step, index) => {
                  const Icon = step.icon;
                  const isActive = index === currentStep;
                  const isCompleted = index < currentStep;
                  return (
                    <motion.div key={step.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.1 }}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-500 ${isActive ? 'bg-white/[0.06] border border-white/10' : isCompleted ? 'opacity-60' : 'opacity-30'}`}>
                      <div className={`relative w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isActive ? `bg-gradient-to-br ${step.color} shadow-lg` : isCompleted ? 'bg-green-500/20' : 'bg-white/5'}`}>
                        {isActive && <motion.div className="absolute inset-0 rounded-xl" style={{ background: `linear-gradient(135deg, var(--tw-gradient-from), var(--tw-gradient-to))` }} animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 2, repeat: Infinity }} />}
                        {isCompleted ? <CheckCircle2 className="w-4 h-4 text-green-400 relative z-10" /> : isActive ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: 'linear' }} className="relative z-10"><Icon className="w-4 h-4 text-white" /></motion.div> : <Icon className="w-4 h-4 text-gray-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium ${isActive ? 'text-white' : isCompleted ? 'text-gray-400' : 'text-gray-600'}`}>{step.label}</div>
                        {isActive && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="text-xs text-gray-400 mt-0.5">{step.detail}</motion.div>}
                      </div>
                      {isActive && <Loader2 className="w-4 h-4 text-purple-400 animate-spin flex-shrink-0" />}
                      {isCompleted && <span className="text-[10px] text-green-400/60 flex-shrink-0">完成</span>}
                    </motion.div>
                  );
                })}
              </div>
              <div className="mt-5 pt-4 border-t border-white/5">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-2"><span>创作进度</span><span>{Math.round(progress)}%</span></div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <motion.div className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 rounded-full" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} />
                </div>
              </div>
            </div>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }} className="text-center text-xs text-gray-600 mt-4">AI创作通常需要30-90秒，请耐心等待</motion.p>
            {onCancel && (
              <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2 }} onClick={onCancel}
                className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/20 transition-all">
                <X className="w-4 h-4" />
              </motion.button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
