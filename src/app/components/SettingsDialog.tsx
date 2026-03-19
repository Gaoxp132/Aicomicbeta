import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, User, LogOut, Shield, Bell, Palette, Globe, Smartphone, Database,
  AlertTriangle, CheckCircle, Trash2, RefreshCw, Loader2, ChevronDown, ChevronUp, FileText, Wrench
} from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input } from './ui';
import { APP_VERSION } from '../version';
import { STORAGE_KEYS, VALIDATION } from '../constants';
import { apiRequest } from '../utils';
import { getErrorMessage } from '../utils';
import { ConfirmDialog, useConfirm } from './series/ConfirmDialog';

// ── Inline: DataCleanupPanel (was DataCleanupPanel.tsx) ──────────
function StatCard({ label, value, subValue, variant }: { label: string; value: number; subValue?: string; variant: 'info' | 'success' | 'warning' | 'danger' }) {
  const colors = { info: 'bg-blue-500/10 border-blue-500/20 text-blue-400', success: 'bg-green-500/10 border-green-500/20 text-green-400', warning: 'bg-amber-500/10 border-amber-500/20 text-amber-400', danger: 'bg-red-500/10 border-red-500/20 text-red-400' };
  return (<div className={`rounded-lg p-3 border ${colors[variant]}`}><div className="text-2xl font-bold">{value}</div><div className="text-xs text-gray-400 mt-0.5">{label}</div>{subValue && <div className="text-[10px] opacity-70 mt-0.5">{subValue}</div>}</div>);
}
function FormatBadge({ label, count, variant }: { label: string; count: number; variant: 'gray' | 'green' | 'yellow' | 'red' }) {
  const colors = { gray: 'bg-gray-700/50 text-gray-400', green: 'bg-green-500/10 text-green-400', yellow: 'bg-amber-500/10 text-amber-400', red: 'bg-red-500/10 text-red-400' };
  return (<div className={`rounded px-2 py-1.5 text-center ${colors[variant]}`}><div className="font-bold text-sm">{count}</div><div className="text-[10px] opacity-70">{label}</div></div>);
}
interface DataHealthReport { summary: { totalEpisodes: number; uniqueEpisodeSlots: number; duplicateGroups: number; duplicateRows: number; sbTotalRows: number; sbDuplicateGroups: number; sbDuplicateRows: number; orphanedSeriesCount: number; orphanedEpisodeCount: number }; mergedVideoUrlFormats: Record<string, number>; duplicateEpisodes: { key: string; count: number; episodes: { title?: string; status?: string }[] }[]; orphanedEpisodes: { id: string; title?: string }[] }
interface CleanupResult { summary: { dryRun: boolean; deletedEpisodes: number; deletedStoryboards: number; fixedMergedUrls: number; deletedOrphans: number; wouldDeleteEpisodes: number; wouldDeleteStoryboards: number; totalActions: number }; actions: { type: string; detail?: string }[] }
interface RebuildResult { rebuilt: number; skipped: number; failed: number }

function DataCleanupPanel() {
  const [isLoading, setIsLoading] = useState(false);
  const [healthReport, setHealthReport] = useState<DataHealthReport | null>(null);
  const [cleanupResult, setCleanupResult] = useState<CleanupResult | null>(null);
  const [rebuildResult, setRebuildResult] = useState<RebuildResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  // v6.0.178: 二次确认弹窗替代原生 confirm()
  const { confirm: confirmAction, dialogProps } = useConfirm();

  const runDiagnostics = async () => {
    setIsLoading(true); setActiveAction('diagnose'); setHealthReport(null); setCleanupResult(null); setRebuildResult(null);
    try { const result = await apiRequest('/admin/data-health', { method: 'GET', timeout: 30000 }); if (result.success && result.data) { setHealthReport(result.data); const s = result.data.summary; if (s.duplicateRows === 0 && s.sbDuplicateRows === 0 && s.orphanedEpisodeCount === 0) toast.success('数据健康，无重复或孤儿数据'); else toast.warning(`发现 ${s.duplicateRows} 条重复剧集 + ${s.sbDuplicateRows} 条重复分镜`); } else toast.error('诊断失败: ' + (result.error || '未知错误')); }
    catch (error: unknown) { toast.error('诊断请求失败: ' + getErrorMessage(error)); }
    finally { setIsLoading(false); setActiveAction(null); }
  };
  const previewCleanup = async () => {
    setIsLoading(true); setActiveAction('preview'); setCleanupResult(null);
    try { const result = await apiRequest('/admin/cleanup-duplicates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dryRun: true, fixMergedUrls: false, cleanOrphans: false }), timeout: 60000 }); if (result.success && result.data) { setCleanupResult(result.data); toast.info(`预览: 将删除 ${result.data.summary.wouldDeleteEpisodes} 条重复剧集, ${result.data.summary.wouldDeleteStoryboards} 条重复分镜`); } else toast.error('预览失败: ' + (result.error || '未知错误')); }
    catch (error: unknown) { toast.error('预览请求失败: ' + getErrorMessage(error)); }
    finally { setIsLoading(false); setActiveAction(null); }
  };
  const executeCleanup = async (options: { fixMergedUrls: boolean; cleanOrphans: boolean }) => {
    const confirmed = await confirmAction({
      title: options.cleanOrphans ? '确认清理孤儿数据' : '确认清理重复数据',
      description: options.cleanOrphans
        ? '这将删除所有重复数据和孤儿数据，此操作不可撤销！'
        : '这将删除所有重复数据，此操作不可撤销！',
      confirmText: '确认执行',
      cancelText: '取消',
      variant: 'danger',
      icon: 'delete',
    });
    if (!confirmed) return;
    setIsLoading(true); setActiveAction('execute');
    try { const result = await apiRequest('/admin/cleanup-duplicates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dryRun: false, fixMergedUrls: options.fixMergedUrls, cleanOrphans: options.cleanOrphans }), timeout: 120000 }); if (result.success && result.data) { setCleanupResult(result.data); const s = result.data.summary; toast.success(`清理完成: 删除 ${s.deletedEpisodes} 条重复剧集, ${s.deletedStoryboards} 条重复镜, 修复 ${s.fixedMergedUrls} 条URL`); setTimeout(runDiagnostics, 1000); } else toast.error('清理失败: ' + (result.error || '未知错误')); }
    catch (error: unknown) { toast.error('清理请求失败: ' + getErrorMessage(error)); }
    finally { setIsLoading(false); setActiveAction(null); }
  };
  const rebuildMergedUrls = async (forceRebuild: boolean = false) => {
    if (forceRebuild) {
      const confirmed = await confirmAction({
        title: '确认强制重建',
        description: '确定要强制重建所有剧集的播放列表URL？这将覆盖已有的URL。',
        confirmText: '强制重建',
        cancelText: '取消',
        variant: 'warning',
        icon: 'regenerate',
      });
      if (!confirmed) return;
    }
    setIsLoading(true); setActiveAction('rebuild'); setRebuildResult(null);
    try { const result = await apiRequest('/admin/rebuild-merged-urls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ forceRebuild }), timeout: 120000 }); if (result.success && result.data) { setRebuildResult(result.data); toast.success(`重建完成: ${result.data.rebuilt} 个剧集的播放列表已更新`); } else toast.error('重建失败: ' + (result.error || '未知错误')); }
    catch (error: unknown) { toast.error('重建请求失败: ' + getErrorMessage(error)); }
    finally { setIsLoading(false); setActiveAction(null); }
  };

  const hasDuplicates = healthReport && (healthReport.summary.duplicateRows > 0 || healthReport.summary.sbDuplicateRows > 0);
  const hasOrphans = healthReport && healthReport.summary.orphanedEpisodeCount > 0;
  const hasInlineJson = healthReport && (healthReport.mergedVideoUrlFormats['inline_json'] || 0) > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2"><Database className="w-5 h-5 text-purple-400" /><h3 className="text-lg font-semibold text-white">数据管理</h3></div>
      <div className="flex flex-wrap gap-2"><Button onClick={runDiagnostics} disabled={isLoading} size="sm" className="bg-blue-600 hover:bg-blue-700">{activeAction === 'diagnose' ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Shield className="w-4 h-4 mr-1.5" />}数据诊断</Button></div>
      <AnimatePresence>
        {healthReport && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="bg-gray-800/50 rounded-xl p-4 space-y-4 border border-gray-700">
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="总剧集行数" value={healthReport.summary.totalEpisodes} subValue={`${healthReport.summary.uniqueEpisodeSlots} 个唯一位置`} variant="info" />
                <StatCard label="重复剧集" value={healthReport.summary.duplicateRows} subValue={`${healthReport.summary.duplicateGroups} 组`} variant={healthReport.summary.duplicateRows > 0 ? 'danger' : 'success'} />
                <StatCard label="重复分镜" value={healthReport.summary.sbDuplicateRows} subValue={`${healthReport.summary.sbDuplicateGroups} 组`} variant={healthReport.summary.sbDuplicateRows > 0 ? 'danger' : 'success'} />
                <StatCard label="孤儿剧集" value={healthReport.summary.orphanedEpisodeCount} subValue={`${healthReport.summary.orphanedSeriesCount} 个失效系列`} variant={healthReport.summary.orphanedEpisodeCount > 0 ? 'warning' : 'success'} />
              </div>
              <div className="bg-gray-900/50 rounded-lg p-3"><div className="flex items-center gap-2 mb-2"><FileText className="w-4 h-4 text-gray-400" /><span className="text-sm font-medium text-gray-300">merged_video_url 格式</span></div><div className="grid grid-cols-4 gap-2 text-xs"><FormatBadge label="空值" count={healthReport.mergedVideoUrlFormats['null']} variant="gray" /><FormatBadge label="内联JSON" count={healthReport.mergedVideoUrlFormats['inline_json']} variant={healthReport.mergedVideoUrlFormats['inline_json'] > 0 ? 'yellow' : 'gray'} /><FormatBadge label="OSS链接" count={healthReport.mergedVideoUrlFormats['oss_url']} variant="green" /><FormatBadge label="其他" count={healthReport.mergedVideoUrlFormats['other']} variant={healthReport.mergedVideoUrlFormats['other'] > 0 ? 'red' : 'gray'} /></div></div>
              {(hasDuplicates || hasOrphans || hasInlineJson) && (
                <div className="space-y-2">
                  <p className="text-sm text-amber-400 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />发现数据问题，可执行以下操作：</p>
                  <div className="flex flex-wrap gap-2">
                    {hasDuplicates && <><Button onClick={previewCleanup} disabled={isLoading} size="sm" variant="outline" className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10">{activeAction === 'preview' ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}预览清理</Button><Button onClick={() => executeCleanup({ fixMergedUrls: !!hasInlineJson, cleanOrphans: false })} disabled={isLoading} size="sm" className="bg-red-600 hover:bg-red-700">{activeAction === 'execute' ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}清理重复数据</Button></>}
                    {hasOrphans && <Button onClick={() => executeCleanup({ fixMergedUrls: false, cleanOrphans: true })} disabled={isLoading} size="sm" className="bg-orange-600 hover:bg-orange-700">{activeAction === 'execute' ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}清理孤儿数据</Button>}
                    {hasInlineJson && <Button onClick={() => rebuildMergedUrls(false)} disabled={isLoading} size="sm" className="bg-purple-600 hover:bg-purple-700">{activeAction === 'rebuild' ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5 mr-1.5" />}统一URL格式</Button>}
                  </div>
                  {(healthReport.mergedVideoUrlFormats['null'] || 0) > 0 && <div className="flex gap-2 pt-1"><Button onClick={() => rebuildMergedUrls(false)} disabled={isLoading} size="sm" variant="outline" className="border-green-500/30 text-green-400 hover:bg-green-500/10"><Wrench className="w-3.5 h-3.5 mr-1.5" />为空值重建播放列表</Button><Button onClick={() => rebuildMergedUrls(true)} disabled={isLoading} size="sm" variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10"><RefreshCw className="w-3.5 h-3.5 mr-1.5" />强制全部重建</Button></div>}
                </div>
              )}
              {!hasDuplicates && !hasOrphans && !hasInlineJson && <div className="flex items-center gap-2 text-green-400 text-sm"><CheckCircle className="w-4 h-4" /><span>数据状态良好，无需清理</span></div>}
              {healthReport.duplicateEpisodes.length > 0 && (
                <div>
                  <button onClick={() => setShowDetails(!showDetails)} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-300 transition-colors">{showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}{showDetails ? '收起' : '展开'}重复详情 ({healthReport.duplicateEpisodes.length} 组)</button>
                  <AnimatePresence>{showDetails && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-2 space-y-2 max-h-60 overflow-y-auto">{healthReport.duplicateEpisodes.slice(0, 20).map((group, i) => <div key={i} className="bg-gray-900/50 rounded-lg p-2.5 text-xs"><div className="flex items-center justify-between mb-1.5"><span className="text-gray-300 font-mono">{group.key}</span><span className="text-red-400 font-medium">{group.count} 条重复</span></div><div className="space-y-1">{group.episodes.map((ep: { title?: string; status?: string }, j: number) => <div key={j} className={`flex items-center justify-between px-2 py-1 rounded ${j === 0 ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/5'}`}><span className="text-gray-400 truncate max-w-[140px]">{ep.title || '无标题'}</span><div className="flex items-center gap-2"><span className={`px-1.5 py-0.5 rounded text-[10px] ${ep.status === 'completed' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>{ep.status}</span>{j === 0 && <span className="text-green-400 text-[10px]">保留</span>}{j > 0 && <span className="text-red-400 text-[10px]">删除</span>}</div></div>)}</div></div>)}</motion.div>}</AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>{cleanupResult && <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className={`rounded-lg p-3 text-sm ${cleanupResult.summary.dryRun ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-green-500/10 border border-green-500/20'}`}><div className="flex items-center gap-2 mb-2">{cleanupResult.summary.dryRun ? <AlertTriangle className="w-4 h-4 text-amber-400" /> : <CheckCircle className="w-4 h-4 text-green-400" />}<span className={`font-medium ${cleanupResult.summary.dryRun ? 'text-amber-400' : 'text-green-400'}`}>{cleanupResult.summary.dryRun ? '预览结果（未执行）' : '清理完成'}</span></div><div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs"><span className="text-gray-400">重复剧集:</span><span className="text-white">{cleanupResult.summary.dryRun ? cleanupResult.summary.wouldDeleteEpisodes : cleanupResult.summary.deletedEpisodes} 条</span><span className="text-gray-400">重复分镜:</span><span className="text-white">{cleanupResult.summary.dryRun ? cleanupResult.summary.wouldDeleteStoryboards : cleanupResult.summary.deletedStoryboards} 条</span>{cleanupResult.summary.fixedMergedUrls > 0 && <><span className="text-gray-400">修复URL:</span><span className="text-white">{cleanupResult.summary.fixedMergedUrls} 条</span></>}{cleanupResult.summary.deletedOrphans > 0 && <><span className="text-gray-400">清理孤儿:</span><span className="text-white">{cleanupResult.summary.deletedOrphans} 条</span></>}</div></motion.div>}</AnimatePresence>
      <AnimatePresence>{rebuildResult && <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 text-sm"><div className="flex items-center gap-2 mb-2"><CheckCircle className="w-4 h-4 text-purple-400" /><span className="font-medium text-purple-400">播放列表重建完成</span></div><div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs"><span className="text-gray-400">已重建:</span><span className="text-white">{rebuildResult.rebuilt} 个剧集</span><span className="text-gray-400">跳过(无视频):</span><span className="text-white">{rebuildResult.skipped} 个</span>{rebuildResult.failed > 0 && <><span className="text-gray-400">失败:</span><span className="text-red-400">{rebuildResult.failed} 个</span></>}</div></motion.div>}</AnimatePresence>
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
// ── End inline DataCleanupPanel ──────────────────────────────────

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  userPhone?: string;
  onLogout: () => void;
}

export function SettingsDialog({ isOpen, onClose, userPhone, onLogout }: SettingsDialogProps) {
  const [showPhoneCorrection, setShowPhoneCorrection] = useState(false);
  const [showDataManagement, setShowDataManagement] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  // v6.0.178: 二次确认弹窗
  const { confirm: confirmAction, dialogProps: settingsDialogProps } = useConfirm();

  const handleLogout = () => {
    onLogout();
    onClose();
  };

  const handlePhoneCorrection = async () => {
    if (!VALIDATION.PHONE_REGEX.test(newPhone)) {
      toast.error('请输入正确的11位手机号');
      return;
    }

    const confirmed = await confirmAction({
      title: '确认切换手机号',
      description: `确认要切换到手机号 ${newPhone} 吗？这将显示该手机号下的所有作品。`,
      confirmText: '确认切换',
      cancelText: '取消',
      variant: 'warning',
      icon: 'question',
    });
    if (!confirmed) return;

    localStorage.setItem(STORAGE_KEYS.USER_PHONE, newPhone);
    localStorage.setItem(STORAGE_KEYS.LOGIN_TIME, new Date().toISOString());
    toast.success('手机号已更新！页面将刷新以加载新数据。');
    window.location.reload();
  };

  return (
    <>
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* 对话框 */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-700 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 头部 */}
              <div className="flex items-center justify-between p-6 border-b border-gray-700">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  <Shield className="w-6 h-6 text-purple-400" />
                  设置中心
                </h2>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-700 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 内容 */}
              <div className="p-6 space-y-6">
                {/* 用户信息 */}
                <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-xl p-4 border border-purple-500/20">
                  <div className="flex items-center gap-3 mb-3">
                    <User className="w-5 h-5 text-purple-400" />
                    <h3 className="text-lg font-semibold text-white">用户信息</h3>
                  </div>
                  {userPhone ? (
                    <div className="space-y-2">
                      <p className="text-sm text-gray-300">
                        <span className="text-gray-400">手机号：</span>
                        <span className="font-mono">{userPhone}</span>
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowPhoneCorrection(!showPhoneCorrection)}
                        className="mt-2"
                      >
                        <Smartphone className="w-4 h-4 mr-2" />
                        切换手机号
                      </Button>
                      {showPhoneCorrection && (
                        <div className="mt-3 space-y-2">
                          <Input
                            type="tel"
                            placeholder="请输入新的手机号"
                            value={newPhone}
                            onChange={(e) => setNewPhone(e.target.value)}
                            maxLength={11}
                            className="bg-gray-800 border-gray-600 text-white"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={handlePhoneCorrection}
                              disabled={!newPhone}
                            >
                              确认切换
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setShowPhoneCorrection(false);
                                setNewPhone('');
                              }}
                            >
                              取消
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">未登录</p>
                  )}
                </div>

                {/* 其他设置选项 */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-xl hover:bg-gray-800 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                      <Bell className="w-5 h-5 text-blue-400" />
                      <span className="text-white">通知设置</span>
                    </div>
                    <span className="text-sm text-gray-400">敬请期待</span>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-xl hover:bg-gray-800 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                      <Palette className="w-5 h-5 text-green-400" />
                      <span className="text-white">主题设置</span>
                    </div>
                    <span className="text-sm text-gray-400">敬请期待</span>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-xl hover:bg-gray-800 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                      <Globe className="w-5 h-5 text-yellow-400" />
                      <span className="text-white">语言设置</span>
                    </div>
                    <span className="text-sm text-gray-400">简体中文</span>
                  </div>

                  {/* 视频编码设置 v6.0.77: 自动H265+降级，无需用户选择 */}
                  <div className="p-4 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-xl">
                    <div className="flex items-center gap-3">
                      <Shield className="w-5 h-5 text-cyan-400" />
                      <div>
                        <span className="text-white font-medium">视频编码格式</span>
                        <p className="text-xs text-gray-400 mt-0.5">自动使用 H.265 高画质编码，失败时自动降级为 H.264</p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-cyan-400/80">
                      <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>默认 H.265（更高画质 / 更小体积），API异常时自动切换 H.264 重试</span>
                    </div>
                  </div>

                  {/* 数据管理 */}
                  {userPhone && (
                    <div
                      onClick={() => setShowDataManagement(!showDataManagement)}
                      className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-xl hover:bg-purple-500/15 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <Database className="w-5 h-5 text-purple-400" />
                        <div>
                          <span className="text-white font-medium">数据管理</span>
                          <p className="text-xs text-gray-400 mt-0.5">诊断重复数据、统一URL格式</p>
                        </div>
                      </div>
                      <span className="text-sm text-purple-400">
                        {showDataManagement ? '收起' : '展开'}
                      </span>
                    </div>
                  )}
                </div>

                {/* 数据管理面板 */}
                <AnimatePresence>
                  {showDataManagement && userPhone && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <DataCleanupPanel />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* 退出登录 */}
                {userPhone && (
                  <Button
                    variant="outline"
                    onClick={handleLogout}
                    className="w-full border-red-500/50 text-red-400 hover:bg-red-500/10"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    退出登录
                  </Button>
                )}

                {/* 版本信息 */}
                <div className="pt-4 border-t border-gray-700">
                  <p className="text-center text-xs text-gray-500">
                    AI影视创作 v{APP_VERSION}
                  </p>
                  <p className="text-center text-xs text-gray-600 mt-1">
                    &copy; 2026 All rights reserved
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
    <ConfirmDialog {...settingsDialogProps} />
    </>
  );
}