/**
 * PolishPreviewModal — AI润色前后对比预览
 * v6.0.172: 显示原文 vs 润色结果，用户可选择接受或拒绝
 * v6.0.173: 增加词级diff高亮（LCS算法），标记新增/删除/保留的文本段
 */

import { useEffect, useRef, useMemo } from 'react';
import { motion } from 'motion/react';
import { X, Check, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '../ui';

interface PolishPreviewData {
  originalDescription: string;
  originalDialogue?: string;
  polishedDescription?: string;
  polishedDialogue?: string;
  sceneNumber: number;
}

interface PolishPreviewModalProps {
  data: PolishPreviewData;
  onAccept: () => void;
  onReject: () => void;
}

// ── 词级Diff算法（基于LCS） ────────────────────────────────────────
type DiffSegment = { type: 'equal' | 'add' | 'remove'; text: string };

/** 将中文文本按字/标点分割，英文按词分割 */
function tokenize(text: string): string[] {
  // 匹配：连续英文单词 | 连续数字 | 单个中文字符 | 标点符号 | 空白符
  const regex = /[a-zA-Z]+|[0-9]+|[\u4e00-\u9fff]|[，。！？、；：""''（）【】《》…—\-,.!?;:'"()\[\]{}<>\/\\]+|\s+/g;
  const tokens: string[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    tokens.push(match[0]);
  }
  return tokens;
}

/** 计算两组token的最长公共子序列(LCS) */
function lcs(a: string[], b: string[]): number[][] {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

/** 基于LCS回溯生成diff */
function computeDiff(original: string, polished: string): { origSegments: DiffSegment[]; polSegments: DiffSegment[] } {
  const a = tokenize(original);
  const b = tokenize(polished);
  const dp = lcs(a, b);

  // Backtrack
  const origOps: ('equal' | 'remove')[] = [];
  const polOps: ('equal' | 'add')[] = [];
  let i = a.length, j = b.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      origOps.unshift('equal');
      polOps.unshift('equal');
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      polOps.unshift('add');
      j--;
    } else {
      origOps.unshift('remove');
      i--;
    }
  }

  // Merge consecutive same-type ops into segments
  const origSegments: DiffSegment[] = [];
  let oi = 0;
  for (const op of origOps) {
    const text = a[oi++];
    if (origSegments.length > 0 && origSegments[origSegments.length - 1].type === op) {
      origSegments[origSegments.length - 1].text += text;
    } else {
      origSegments.push({ type: op, text });
    }
  }

  const polSegments: DiffSegment[] = [];
  let pi = 0;
  for (const op of polOps) {
    const text = b[pi++];
    if (polSegments.length > 0 && polSegments[polSegments.length - 1].type === op) {
      polSegments[polSegments.length - 1].text += text;
    } else {
      polSegments.push({ type: op, text });
    }
  }

  return { origSegments, polSegments };
}

// ── 渲染Diff片段 ───────────────────────────────────────────────────
function DiffText({ segments, mode }: { segments: DiffSegment[]; mode: 'original' | 'polished' }) {
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === 'equal') {
          return <span key={i}>{seg.text}</span>;
        }
        if (mode === 'original' && seg.type === 'remove') {
          return (
            <span key={i} className="bg-red-500/25 text-red-300 rounded-sm px-0.5 line-through decoration-red-400/50">
              {seg.text}
            </span>
          );
        }
        if (mode === 'polished' && seg.type === 'add') {
          return (
            <span key={i} className="bg-green-500/25 text-green-300 rounded-sm px-0.5">
              {seg.text}
            </span>
          );
        }
        return <span key={i}>{seg.text}</span>;
      })}
    </>
  );
}

// ── DiffBlock组件 ──────────────────────────────────────────────────
function DiffBlock({ label, original, polished, colorFrom, colorTo }: {
  label: string;
  original: string;
  polished?: string;
  colorFrom: string;
  colorTo: string;
}) {
  if (!polished) return null;

  const diff = useMemo(() => computeDiff(original, polished), [original, polished]);
  const changeCount = useMemo(() => {
    const adds = diff.polSegments.filter(s => s.type === 'add').length;
    const removes = diff.origSegments.filter(s => s.type === 'remove').length;
    return adds + removes;
  }, [diff]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</h4>
        <span className="text-[10px] text-gray-600">
          {changeCount} 处变更
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Original */}
        <div className="relative">
          <div className="absolute -top-0.5 left-3 px-2 py-0.5 bg-gray-800 rounded text-[10px] text-gray-500 -translate-y-1/2 z-10">
            原文
          </div>
          <div className="bg-red-500/5 border border-red-500/15 rounded-xl p-4 pt-5 text-sm text-gray-300 leading-relaxed min-h-[80px]">
            <DiffText segments={diff.origSegments} mode="original" />
          </div>
        </div>
        {/* Polished */}
        <div className="relative">
          <div className={`absolute -top-0.5 left-3 px-2 py-0.5 bg-gray-800 rounded text-[10px] -translate-y-1/2 z-10 flex items-center gap-1`}
            style={{ color: colorFrom }}>
            <Sparkles className="w-2.5 h-2.5" />
            润色后
          </div>
          <div className={`border rounded-xl p-4 pt-5 text-sm text-white leading-relaxed min-h-[80px]`}
            style={{
              borderColor: `${colorFrom}30`,
              background: `linear-gradient(135deg, ${colorFrom}08, ${colorTo}08)`,
            }}>
            <DiffText segments={diff.polSegments} mode="polished" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 主模态框 ────────────────────────────────────────────────────────
export function PolishPreviewModal({ data, onAccept, onReject }: PolishPreviewModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-focus for keyboard events
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  // Keyboard shortcut: Enter to accept, Escape to reject
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); onAccept(); }
      if (e.key === 'Escape') { e.preventDefault(); onReject(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onAccept, onReject]);

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onReject(); }}
      tabIndex={0}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.2 }}
        className="bg-gray-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 sticky top-0 bg-gray-900/95 backdrop-blur-sm z-10 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/20">
              <Sparkles className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold">AI润色预览</h3>
              <p className="text-xs text-gray-500">场景 {data.sceneNumber} — 确认是否采用润色结果</p>
            </div>
          </div>
          <button
            onClick={onReject}
            className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-5">
          {data.polishedDescription && (
            <DiffBlock
              label="场景描述"
              original={data.originalDescription}
              polished={data.polishedDescription}
              colorFrom="#8b5cf6"
              colorTo="#d946ef"
            />
          )}

          {data.polishedDialogue && data.originalDialogue && (
            <DiffBlock
              label="对白"
              original={data.originalDialogue}
              polished={data.polishedDialogue}
              colorFrom="#06b6d4"
              colorTo="#3b82f6"
            />
          )}

          {data.polishedDialogue && !data.originalDialogue && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider">AI新增对白</h4>
              <div className="relative">
                <div className="absolute -top-0.5 left-3 px-2 py-0.5 bg-gray-800 rounded text-[10px] text-cyan-400 -translate-y-1/2 z-10 flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" />
                  新增
                </div>
                <div className="bg-cyan-500/5 border border-cyan-500/15 rounded-xl p-4 pt-5 text-sm text-white leading-relaxed italic">
                  "{data.polishedDialogue}"
                </div>
              </div>
            </div>
          )}

          {/* Word count comparison */}
          <div className="flex items-center gap-4 text-[11px] text-gray-500">
            {data.polishedDescription && (
              <span className="flex items-center gap-1.5">
                描述字数：{data.originalDescription.length}
                <ArrowRight className="w-3 h-3" />
                <span className={data.polishedDescription.length > data.originalDescription.length ? 'text-green-400' : 'text-amber-400'}>
                  {data.polishedDescription.length}
                </span>
              </span>
            )}
            {data.polishedDialogue && data.originalDialogue && (
              <span className="flex items-center gap-1.5">
                对白字数：{data.originalDialogue.length}
                <ArrowRight className="w-3 h-3" />
                <span className={data.polishedDialogue.length > data.originalDialogue.length ? 'text-green-400' : 'text-amber-400'}>
                  {data.polishedDialogue.length}
                </span>
              </span>
            )}
          </div>

          {/* Diff legend */}
          <div className="flex items-center gap-4 text-[10px]">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm bg-red-500/25 border border-red-500/30" />
              <span className="text-gray-500">删除的内容</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm bg-green-500/25 border border-green-500/30" />
              <span className="text-gray-500">新增的内容</span>
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 sticky bottom-0 bg-gray-900/95 backdrop-blur-sm rounded-b-2xl">
          <div className="text-[10px] text-gray-600 flex items-center gap-3">
            <span><kbd className="px-1 py-0.5 bg-white/5 rounded text-gray-500">Enter</kbd> 采用</span>
            <span><kbd className="px-1 py-0.5 bg-white/5 rounded text-gray-500">Esc</kbd> 放弃</span>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={onReject} variant="ghost" className="text-gray-400 hover:text-white">
              <X className="w-4 h-4 mr-1.5" />
              放弃
            </Button>
            <Button
              onClick={onAccept}
              className="bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white"
            >
              <Check className="w-4 h-4 mr-1.5" />
              采用润色结果
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
