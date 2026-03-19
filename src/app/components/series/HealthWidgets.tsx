/**
 * Video Health widgets — extracted from EpisodeManager.tsx and ChapterManager.tsx
 * v6.0.88: Keep files under 500 lines
 */

import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertTriangle, Wrench, X, Activity, ChevronDown, ChevronUp,
  CheckCircle, CheckCircle2, XCircle, AlertCircle, Film, FileVideo,
  Loader2, RefreshCw,
} from 'lucide-react';
import { Button, Card } from '../ui';
import { apiPost } from '../../utils';
import { sbVideoUrl, epMergedVideoUrl } from '../../utils';
import type { Series } from '../../types';
import { toast } from 'sonner';

// ═══════════════════════════════════════════════════════════════════
// VideoHealthAlert
// ═══════════════════════════════════════════════════════════════════

export function VideoHealthAlert({ errorCount, onFixAll, onDismiss, isFixing }: {
  errorCount: number; onFixAll: () => void; onDismiss: () => void; isFixing?: boolean;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
      className="relative flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl backdrop-blur-sm">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-amber-300">检测到 {errorCount} 个视频加载异常</p>
          <p className="text-xs text-amber-400/70 mt-0.5">可能是视频链接过期或合并数据损坏，建议重新合并修复</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" onClick={(e) => { e.stopPropagation(); onFixAll(); }} disabled={isFixing}
          className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs px-3">
          <Wrench className="w-3.5 h-3.5 mr-1.5" />{isFixing ? '修复中...' : '一键修复'}
        </Button>
        <button onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          className="p-1.5 rounded-lg text-amber-400/60 hover:text-amber-300 hover:bg-amber-500/10 transition-colors" aria-label="关闭提醒">
          <X className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SeriesVideoHealthChecker
// ═══════════════════════════════════════════════════════════════════

interface HealthDiagnostic { label: string; count: number; total: number; severity: 'ok' | 'warn' | 'error'; details?: string; }

export function SeriesVideoHealthChecker({ series, onRepairNeeded }: { series: Series; onRepairNeeded: () => void }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { diagnostics, overallHealth, hasIssues } = useMemo(() => {
    const episodes = series.episodes || [];
    const totalEpisodes = episodes.length;
    const episodesWithStoryboards = episodes.filter(ep => ep.storyboards && ep.storyboards.length > 0).length;
    const storyboardDiag: HealthDiagnostic = {
      label: '分镜覆盖', count: episodesWithStoryboards, total: totalEpisodes,
      severity: episodesWithStoryboards === totalEpisodes ? 'ok' : episodesWithStoryboards === 0 ? 'error' : 'warn',
      details: episodesWithStoryboards < totalEpisodes ? `${totalEpisodes - episodesWithStoryboards} 集缺少分镜` : undefined,
    };
    const totalStoryboards = episodes.reduce((sum, ep) => sum + (ep.storyboards?.length || 0), 0);
    const storyboardsWithVideo = episodes.reduce((sum, ep) =>
      sum + (ep.storyboards?.filter(sb => !!sbVideoUrl(sb)).length || 0), 0);
    const videoDiag: HealthDiagnostic = {
      label: '视频生成', count: storyboardsWithVideo, total: totalStoryboards,
      severity: totalStoryboards === 0 ? 'warn' : storyboardsWithVideo === totalStoryboards ? 'ok' : storyboardsWithVideo === 0 ? 'error' : 'warn',
      details: totalStoryboards > 0 && storyboardsWithVideo < totalStoryboards ? `${totalStoryboards - storyboardsWithVideo} 个分镜缺少视频` : undefined,
    };
    const episodesWithMerged = episodes.filter(ep => {
      const url = epMergedVideoUrl(ep);
      return url && url.trim().length > 10;
    }).length;
    const eligibleForMerge = episodes.filter(ep => ep.storyboards && ep.storyboards.some(sb => !!sbVideoUrl(sb))).length;
    const mergeDiag: HealthDiagnostic = {
      label: '视频合并', count: episodesWithMerged, total: eligibleForMerge,
      severity: eligibleForMerge === 0 ? 'warn' : episodesWithMerged === eligibleForMerge ? 'ok' : episodesWithMerged === 0 ? 'error' : 'warn',
      details: eligibleForMerge > 0 && episodesWithMerged < eligibleForMerge ? `${eligibleForMerge - episodesWithMerged} 集可合并但尚未合并` : undefined,
    };
    const diags = [storyboardDiag, videoDiag, mergeDiag];
    const hasIssues = diags.some(d => d.severity !== 'ok');
    const errorCount = diags.filter(d => d.severity === 'error').length;
    const overallHealth: 'healthy' | 'warning' | 'critical' = errorCount >= 2 ? 'critical' : hasIssues ? 'warning' : 'healthy';
    return { diagnostics: diags, overallHealth, hasIssues };
  }, [series]);

  useEffect(() => { if (hasIssues) onRepairNeeded(); }, [hasIssues]);

  const healthConfig = {
    healthy: { color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20', label: '健康' },
    warning: { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', label: '需关注' },
    critical: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', label: '需修复' },
  };
  const cfg = healthConfig[overallHealth];

  return (
    <div className={`${cfg.bg} border ${cfg.border} rounded-xl overflow-hidden transition-colors`}>
      <button onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors">
        <Activity className={`w-4 h-4 ${cfg.color} shrink-0`} />
        <span className={`text-sm font-medium ${cfg.color}`}>视频健康度</span>
        <div className="flex items-center gap-1.5 ml-1">
          {diagnostics.map((d, i) => (
            <div key={i} className={`w-2 h-2 rounded-full ${d.severity === 'ok' ? 'bg-green-400' : d.severity === 'warn' ? 'bg-amber-400' : 'bg-red-400'}`} title={d.label} />
          ))}
        </div>
        <span className={`text-xs ${cfg.color} opacity-70 ml-auto mr-2`}>{cfg.label}</span>
        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
      </button>
      <AnimatePresence>
        {isExpanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
              {diagnostics.map((d, i) => {
                const Icon = i === 0 ? Film : i === 1 ? FileVideo : CheckCircle2;
                const pct = d.total > 0 ? Math.round((d.count / d.total) * 100) : 0;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 shrink-0 ${d.severity === 'ok' ? 'text-green-400' : d.severity === 'warn' ? 'text-amber-400' : 'text-red-400'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-300">{d.label}</span>
                        <span className="text-xs text-gray-500">{d.count}/{d.total} {d.total > 0 ? `(${pct}%)` : ''}</span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${d.severity === 'ok' ? 'bg-green-400' : d.severity === 'warn' ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${d.total > 0 ? pct : 0}%` }} />
                      </div>
                      {d.details && <p className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{d.details}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SeriesFixTool (was inline in ChapterManager.tsx)
// ═══════════════════════════════════════════════════════════════════

interface DiagnosisResult {
  seriesId: string; title: string; status: string; totalEpisodes: number;
  dataIntegrity: {
    characters: { count: number; status: string };
    episodes: { count: number; expected: number; status: string };
    chapters: { count: number; status: string };
    storyboards: { count: number; status: string };
  };
  issues: string[]; fixable: boolean;
}

function DataIntegrityItem({ label, count, expected, status }: { label: string; count: number; expected?: number; status: string }) {
  const statusColor = status === 'OK' ? 'text-green-400' : status === 'MISSING' ? 'text-red-400' : status === 'INCOMPLETE' ? 'text-orange-400' : 'text-slate-400';
  const statusIcon = status === 'OK' ? <CheckCircle className="w-4 h-4" /> : status === 'MISSING' ? <XCircle className="w-4 h-4" /> : status === 'INCOMPLETE' ? <AlertTriangle className="w-4 h-4" /> : null;
  return (
    <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded">
      <span className="text-sm text-slate-300">{label}</span>
      <div className="flex items-center gap-2"><span className="text-sm text-white">{count}{expected !== undefined && ` / ${expected}`}</span><div className={`flex items-center gap-1 ${statusColor}`}>{statusIcon}<span className="text-xs">{status}</span></div></div>
    </div>
  );
}

export function SeriesFixTool({ seriesId, onFixed }: { seriesId: string; onFixed?: () => void }) {
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [showTool, setShowTool] = useState(false);

  const handleDiagnose = async () => {
    setIsDiagnosing(true); setDiagnosis(null);
    const result = await apiPost(`/series/${seriesId}/diagnose`);
    const diag = (result as Record<string, unknown>).diagnosis;
    if (result.success && diag) { setDiagnosis(diag); if (diag.issues.length === 0) toast.success('未检测到问题，数据完整！'); else toast.warning(`检测到 ${diag.issues.length} 个问题`); }
    else toast.error('诊断失败：' + (result.error || '未知错误'));
    setIsDiagnosing(false);
  };

  const handleFix = async () => {
    if (!diagnosis || !diagnosis.fixable) { toast.error('该作品无法自动修复'); return; }
    setIsFixing(true);
    const result = await apiPost(`/series/${seriesId}/fix-episodes`);
    if (result.success) { toast.success('修复任务已启动，请稍候刷新页面查看结果'); setTimeout(() => { onFixed?.(); }, 5000); }
    else toast.error('修复失败：' + (result.error || '未知错误'));
    setIsFixing(false);
  };

  if (!showTool) {
    return (<Button onClick={() => { setShowTool(true); handleDiagnose(); }} variant="outline" size="sm" className="gap-2 border-orange-500/30 text-orange-400 hover:bg-orange-500/10"><Wrench className="w-4 h-4" />数据诊断</Button>);
  }

  return (
    <Card className="p-6 bg-slate-800/50 border-orange-500/30">
      <div className="space-y-4">
        <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Wrench className="w-5 h-5 text-orange-400" /><h3 className="text-lg font-semibold text-white">数据诊断工具</h3></div><Button variant="ghost" size="sm" onClick={() => setShowTool(false)}>收起</Button></div>
        <div className="flex gap-2"><Button onClick={handleDiagnose} disabled={isDiagnosing} className="gap-2">{isDiagnosing ? <><Loader2 className="w-4 h-4 animate-spin" />诊断中...</> : <><RefreshCw className="w-4 h-4" />开始诊断</>}</Button></div>
        {diagnosis && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-white">数据完整性检查</h4>
              <DataIntegrityItem label="角色数据" count={diagnosis.dataIntegrity.characters.count} status={diagnosis.dataIntegrity.characters.status} />
              <DataIntegrityItem label="剧集数据" count={diagnosis.dataIntegrity.episodes.count} expected={diagnosis.dataIntegrity.episodes.expected} status={diagnosis.dataIntegrity.episodes.status} />
              <DataIntegrityItem label="章节数据" count={diagnosis.dataIntegrity.chapters.count} status={diagnosis.dataIntegrity.chapters.status} />
              <DataIntegrityItem label="分镜数据" count={diagnosis.dataIntegrity.storyboards.count} status={diagnosis.dataIntegrity.storyboards.status} />
            </div>
            {diagnosis.issues.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-white">检测到的问题</h4>
                <div className="space-y-1">{diagnosis.issues.map((issue, i) => (<div key={i} className="flex items-start gap-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-300"><XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /><span>{issue}</span></div>))}</div>
                {diagnosis.fixable && (<Button onClick={handleFix} disabled={isFixing} className="w-full gap-2 bg-gradient-to-r from-orange-500 to-red-500">{isFixing ? <><Loader2 className="w-4 h-4 animate-spin" />修复中...</> : <><Wrench className="w-4 h-4" />自动修复</>}</Button>)}
              </div>
            )}
            {diagnosis.issues.length === 0 && (<div className="flex items-center gap-2 p-4 bg-green-500/10 border border-green-500/20 rounded text-green-300"><CheckCircle className="w-5 h-5" /><span>数据完整，未检测到问题</span></div>)}
          </motion.div>
        )}
      </div>
    </Card>
  );
}