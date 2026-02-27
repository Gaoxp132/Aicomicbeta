/**
 * Consolidated playlist module (v6.0.67)
 * Merged from 3 files: PlaylistControls, PlaylistErrorView, PlaylistOverlays
 * v6.0.68: Also includes VideoUrlDiagnostic + QuickVideoTest (both only consumed here)
 * Reduces Rollup module count by 4.
 */

import { RefObject, useRef, useState, useCallback } from 'react';
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, AlertCircle, Bug, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Button } from '../ui';
import { apiGet, apiPost } from '../../utils';

// ── Inline: VideoUrlDiagnostic (was ../VideoUrlDiagnostic.tsx) ───
function VideoUrlDiagnostic({ url, onClose }: { url: string; onClose?: () => void }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const runDiagnostic = async () => {
    setTesting(true); setResult(null);
    const res = await apiGet(`/diagnostic/video-url?url=${encodeURIComponent(url)}`);
    setResult(res.success ? res : { success: false, error: res.error || '诊断请求失败' });
    setTesting(false);
  };
  return (
    <div className="bg-gradient-to-br from-gray-900 to-black border border-purple-500/30 rounded-xl p-6 shadow-2xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2"><Bug className="w-5 h-5 text-purple-400" />视频URL诊断工具</h3>
        {onClose && <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">✕</button>}
      </div>
      <div className="mb-4"><label className="text-sm text-gray-400 mb-2 block">测试URL:</label><div className="bg-black/50 border border-gray-700 rounded-lg p-3 text-xs text-gray-300 break-all">{url}</div></div>
      <Button onClick={runDiagnostic} disabled={testing} className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 mb-4">
        {testing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />诊断中...</> : <><Bug className="w-4 h-4 mr-2" />开始诊断</>}
      </Button>
      {result && (
        <div className="space-y-3">
          <div className="bg-black/50 border border-gray-700 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-white mb-3">诊断结果</h4>
            {result.success ? (
              <div className="space-y-3">
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <h5 className="text-xs font-semibold text-gray-400 mb-2">总结</h5>
                  <div className="space-y-1 text-xs">
                    {['accessible','validVideoFile','supportsRangeRequests','hasCorsHeaders'].map(k => (
                      <div key={k} className="flex items-center justify-between">
                        <span className="text-gray-400">{k === 'accessible' ? '文件可访问' : k === 'validVideoFile' ? '有效视频文件' : k === 'supportsRangeRequests' ? '支持Range请求' : 'CORS配置'}:</span>
                        <span className={result.data.summary[k] ? 'text-green-400' : 'text-red-400'}>{result.data.summary[k] ? <CheckCircle className="w-4 h-4 inline" /> : <XCircle className="w-4 h-4 inline" />}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {result.data.recommendations?.length > 0 && (
                  <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-3">
                    <h5 className="text-xs font-semibold text-yellow-400 mb-2">建议</h5>
                    <ul className="text-xs text-yellow-300 space-y-1">{result.data.recommendations.map((rec: string, i: number) => <li key={i}>• {rec}</li>)}</ul>
                  </div>
                )}
              </div>
            ) : <div className="text-red-400 text-sm">诊断失败: {result.error || '未知错误'}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Inline: QuickVideoTest (was ../QuickVideoTest.tsx) ───────────
interface TestResult { url: string; status: 'pending' | 'success' | 'error'; httpStatus?: number; statusText?: string; contentType?: string; contentLength?: string; cors?: string; error?: string; canPlay?: boolean; videoTest?: 'success' | 'error' | 'pending'; }

function QuickVideoTest({ urls, onClose }: { urls: string[]; onClose?: () => void }) {
  const [results, setResults] = useState<TestResult[]>(urls.map(url => ({ url, status: 'pending' })));
  const [testing, setTesting] = useState(false);
  const testVideoElement = (url: string): Promise<boolean> => new Promise((resolve) => {
    const video = document.createElement('video'); video.preload = 'metadata';
    const timeout = setTimeout(() => { video.remove(); resolve(false); }, 10000);
    video.onloadedmetadata = () => { clearTimeout(timeout); video.remove(); resolve(true); };
    video.onerror = () => { clearTimeout(timeout); video.remove(); resolve(false); };
    video.src = url;
  });
  const testUrl = async (url: string, index: number) => {
    setResults(prev => { const u = [...prev]; u[index] = { ...u[index], status: 'pending' }; return u; });
    try {
      const headResponse = await fetch(url, { method: 'HEAD', mode: 'cors', cache: 'no-store' });
      const r: TestResult = { url, status: headResponse.ok ? 'success' : 'error', httpStatus: headResponse.status, statusText: headResponse.statusText,
        contentType: headResponse.headers.get('content-type') || undefined, contentLength: headResponse.headers.get('content-length') || undefined, cors: headResponse.headers.get('access-control-allow-origin') || undefined };
      if (headResponse.ok) { r.videoTest = 'pending'; setResults(prev => { const u = [...prev]; u[index] = r; return u; }); const canPlay = await testVideoElement(url); r.canPlay = canPlay; r.videoTest = canPlay ? 'success' : 'error'; if (!canPlay) { r.status = 'error'; r.error = '视频元素无法播放此文件'; } }
      else r.error = `HTTP ${headResponse.status}: ${headResponse.statusText}`;
      setResults(prev => { const u = [...prev]; u[index] = r; return u; });
    } catch (error: any) { setResults(prev => { const u = [...prev]; u[index] = { url, status: 'error', error: error.message || '网络错误' }; return u; }); }
  };
  const testAllUrls = async () => { setTesting(true); for (let i = 0; i < urls.length; i++) await testUrl(urls[i], i); setTesting(false); };
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-auto">
        <div className="sticky top-0 bg-gray-900 border-b border-gray-700 p-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white flex items-center gap-2"><Bug className="w-6 h-6" />视频URL诊断</h2>
          {onClose && <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>}
        </div>
        <div className="p-6">
          <div className="mb-6"><button onClick={testAllUrls} disabled={testing} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg font-medium text-white flex items-center gap-2"><Play className="w-5 h-5" />{testing ? '测试中...' : '开始测试'}</button></div>
          <div className="space-y-4">
            {results.map((r, i) => (
              <div key={i} className={`p-4 rounded-lg border ${r.status === 'success' ? 'bg-green-900/20 border-green-600' : r.status === 'error' ? 'bg-red-900/20 border-red-600' : 'bg-gray-800 border-gray-700'}`}>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">{r.status === 'success' ? <CheckCircle className="w-6 h-6 text-green-500" /> : r.status === 'error' ? <XCircle className="w-6 h-6 text-red-500" /> : <AlertCircle className="w-6 h-6 text-gray-500" />}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white mb-2">分镜 {i + 1}</div>
                    <div className="text-xs text-gray-400 break-all mb-3">{r.url}</div>
                    {r.httpStatus && (
                      <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                        <div><span className="text-gray-400">HTTP状态: </span><span className={r.httpStatus === 200 ? 'text-green-400' : 'text-red-400'}>{r.httpStatus} {r.statusText}</span></div>
                        {r.contentType && <div><span className="text-gray-400">类型: </span><span className={r.contentType.includes('video') ? 'text-green-400' : 'text-yellow-400'}>{r.contentType}</span></div>}
                        {r.contentLength && <div><span className="text-gray-400">大小: </span><span className="text-blue-400">{(parseInt(r.contentLength) / 1024 / 1024).toFixed(2)} MB</span></div>}
                        <div><span className="text-gray-400">CORS: </span><span className={r.cors ? 'text-green-400' : 'text-red-400'}>{r.cors || '未配置'}</span></div>
                      </div>
                    )}
                    {r.videoTest && <div className="text-xs mb-2"><span className="text-gray-400">视频播放测试: </span><span className={r.videoTest === 'success' ? 'text-green-400' : r.videoTest === 'error' ? 'text-red-400' : 'text-yellow-400'}>{r.videoTest === 'success' ? '可以播放' : r.videoTest === 'error' ? '无法播放' : '测试中...'}</span></div>}
                    {r.error && <div className="text-xs text-red-400 bg-red-900/30 px-2 py-1 rounded">{r.error}</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {!testing && results.some(r => r.status !== 'pending') && (
            <div className="mt-6 p-4 bg-blue-900/20 border border-blue-600 rounded-lg">
              <h3 className="font-semibold text-blue-300 mb-2">测试总结</h3>
              <div className="text-sm text-blue-200 space-y-1">
                <p>成功: {results.filter(r => r.status === 'success').length} / {results.length}</p>
                <p>失败: {results.filter(r => r.status === 'error').length} / {results.length}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
// ── End inline diagnostic tools ──────────────────────────────────

// Shared interface
interface PlaylistVideo { sceneNumber: number; url: string; duration: number; title?: string; thumbnail?: string | null; }
interface Playlist { type?: string; version?: string; episodeId: string; totalVideos: number; totalDuration: number; createdAt: string; videos: PlaylistVideo[]; }

// ═══════════════════════════════════════════════════════════════════
// [A] PlaylistControls (was: PlaylistControls.tsx)
// ═══════════════════════════════════════════════════════════════════

interface PlaylistControlsProps {
  playlist: Playlist; currentIndex: number; isPlaying: boolean; isMuted: boolean; progress: number;
  videoRef: RefObject<HTMLVideoElement | null>;
  onTogglePlay: () => void; onToggleMute: () => void; onNext: () => void; onPrevious: () => void;
  onSeekTo?: (targetIndex: number, seekTime: number) => void;
}

export function PlaylistControls({ playlist, currentIndex, isPlaying, isMuted, progress, videoRef, onTogglePlay, onToggleMute, onNext, onPrevious, onSeekTo }: PlaylistControlsProps) {
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState(0);

  const completedDuration = playlist.videos.slice(0, currentIndex).reduce((sum, v) => sum + v.duration, 0);
  const currentTime = videoRef.current?.currentTime || 0;
  const totalElapsed = completedDuration + currentTime;
  const displayProgress = isDragging ? dragProgress : progress;
  const minutes = Math.floor((isDragging ? (dragProgress / 100) * playlist.totalDuration : totalElapsed) / 60);
  const seconds = Math.floor((isDragging ? (dragProgress / 100) * playlist.totalDuration : totalElapsed) % 60);
  const totalMinutes = Math.floor(playlist.totalDuration / 60);
  const totalSeconds = Math.floor(playlist.totalDuration % 60);

  const resolveSeekPosition = useCallback((percent: number) => {
    const targetTime = (percent / 100) * playlist.totalDuration;
    let accumulated = 0;
    for (let i = 0; i < playlist.videos.length; i++) {
      const segDuration = playlist.videos[i].duration;
      if (accumulated + segDuration > targetTime) return { index: i, time: targetTime - accumulated };
      accumulated += segDuration;
    }
    const lastIdx = playlist.videos.length - 1;
    return { index: lastIdx, time: playlist.videos[lastIdx].duration };
  }, [playlist]);

  const getPercentFromEvent = useCallback((clientX: number) => {
    const bar = progressBarRef.current; if (!bar) return 0;
    const rect = bar.getBoundingClientRect();
    return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
  }, []);

  const performSeek = useCallback((percent: number) => {
    const { index, time } = resolveSeekPosition(percent);
    if (index === currentIndex) { if (videoRef.current) videoRef.current.currentTime = time; }
    else if (onSeekTo) { onSeekTo(index, time); }
  }, [currentIndex, videoRef, onSeekTo, resolveSeekPosition]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const percent = getPercentFromEvent(e.clientX); setIsDragging(true); setDragProgress(percent);
    const handleMouseMove = (ev: MouseEvent) => setDragProgress(getPercentFromEvent(ev.clientX));
    const handleMouseUp = (ev: MouseEvent) => { const p = getPercentFromEvent(ev.clientX); setIsDragging(false); performSeek(p); window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
    window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleMouseUp);
  }, [getPercentFromEvent, performSeek]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => { const p = getPercentFromEvent(e.touches[0].clientX); setIsDragging(true); setDragProgress(p); }, [getPercentFromEvent]);
  const handleTouchMove = useCallback((e: React.TouchEvent) => { if (!isDragging) return; setDragProgress(getPercentFromEvent(e.touches[0].clientX)); }, [isDragging, getPercentFromEvent]);
  const handleTouchEnd = useCallback(() => { if (!isDragging) return; setIsDragging(false); performSeek(dragProgress); }, [isDragging, dragProgress, performSeek]);

  const markers: number[] = [];
  let accTime = 0;
  for (let i = 0; i < playlist.videos.length - 1; i++) { accTime += playlist.videos[i].duration; markers.push((accTime / playlist.totalDuration) * 100); }

  return (
    <div className="absolute bottom-0 left-0 right-0 z-[2] bg-gradient-to-t from-black/80 to-transparent p-2 sm:p-4">
      <div className="flex items-center justify-between text-[10px] sm:text-xs text-gray-300 mb-1 sm:mb-2">
        <span>{minutes}:{seconds.toString().padStart(2, '0')}</span>
        <span className="text-gray-400">{totalMinutes}:{totalSeconds.toString().padStart(2, '0')}</span>
      </div>
      <div ref={progressBarRef} className="relative w-full h-4 sm:h-5 flex items-center cursor-pointer group mb-1.5 sm:mb-2 touch-none" onMouseDown={handleMouseDown} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
        <div className="absolute left-0 right-0 h-1 group-hover:h-1.5 bg-white/20 rounded-full transition-all">
          <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-[width] duration-100" style={{ width: `${displayProgress}%` }} />
          {markers.map((pos, i) => (<div key={i} className="absolute top-0 h-full w-0.5 bg-white/30" style={{ left: `${pos}%` }} />))}
        </div>
        <div className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 sm:w-3.5 sm:h-3.5 bg-white rounded-full shadow-md transition-opacity pointer-events-none ${isDragging ? 'opacity-100 scale-125' : 'opacity-0 group-hover:opacity-100 sm:opacity-0'}`} style={{ left: `calc(${displayProgress}% - 6px)` }} />
      </div>
      <div className="flex items-center justify-between text-white">
        <div className="flex items-center gap-1.5 sm:gap-3">
          <button onClick={onPrevious} disabled={currentIndex === 0} className="p-1 sm:p-2 hover:bg-white/20 rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-90" title="上一个"><SkipBack className="w-4 h-4 sm:w-5 sm:h-5" /></button>
          <button onClick={onTogglePlay} className="p-2 sm:p-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-full transition-colors shadow-lg active:scale-95" title={isPlaying ? '暂停' : '播放'}>{isPlaying ? <Pause className="w-4 h-4 sm:w-6 sm:h-6" /> : <Play className="w-4 h-4 sm:w-6 sm:h-6" />}</button>
          <button onClick={onNext} disabled={currentIndex === playlist.videos.length - 1} className="p-1 sm:p-2 hover:bg-white/20 rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-90" title="下一个"><SkipForward className="w-4 h-4 sm:w-5 sm:h-5" /></button>
        </div>
        <div className="flex-1 text-center text-xs sm:text-sm"><span className="text-gray-300">分镜</span> <span className="font-semibold">{currentIndex + 1}</span> <span className="text-gray-400">/</span> <span className="text-gray-300">{playlist.totalVideos}</span></div>
        <div className="flex items-center gap-2"><button onClick={onToggleMute} className="p-1 sm:p-2 hover:bg-white/20 rounded-full transition-colors active:scale-90" title={isMuted ? '取消静音' : '静音'}>{isMuted ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" /> : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />}</button></div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// [B] PlaylistErrorView (was: PlaylistErrorView.tsx)
// ═══════════════════════════════════════════════════════════════════

interface PlaylistErrorViewProps {
  error: string | null; playlist: Playlist | null; currentVideo: PlaylistVideo | undefined;
  className: string; onLoadingChange: (loading: boolean) => void;
}

export function PlaylistErrorView({ error, playlist, currentVideo, className, onLoadingChange }: PlaylistErrorViewProps) {
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<any>(null);
  const [fixResult, setFixResult] = useState<any>(null);

  const handleDiagnose = async () => {
    if (!playlist) return; onLoadingChange(true);
    const result = await apiGet(`/episodes/${playlist.episodeId}/diagnose-storyboards`);
    setDiagnosticResult(result); if (!result.success) alert(`诊断失败: ${result.error}`); onLoadingChange(false);
  };
  const handleSyncUrls = async () => {
    if (!playlist) return; onLoadingChange(true); setFixResult(null);
    const result = await apiPost(`/episodes/${playlist.episodeId}/sync-storyboard-urls`);
    setFixResult(result);
    if (result.success && result.data?.summary?.synced > 0) setTimeout(() => window.location.reload(), 3000);
    else if (!result.success) alert(`同步失败: ${result.error}`);
    onLoadingChange(false);
  };
  const handleDebugEpisode = async () => {
    if (!playlist) return; onLoadingChange(true);
    const result = await apiGet(`/debug/episode-data/${playlist.episodeId}`);
    if (result.success) {
      alert(`📊 剧集调试报告\n━━━━━━━━━━━━━━━━━━━━━━\n📄 ID: ${result.data.episode.id}\n标题: ${result.data.episode.title}\n集数: ${result.data.episode.episode_number}\n视频状态: ${result.data.episode.video_status}\nmerged_video_url长度: ${result.data.episode.merged_video_url_length}\n\n📊 统计\n总数: ${result.data.analysis.totalStoryboards}\n视频数: ${result.data.analysis.mergedVideoCount}\nURL匹配: ${result.data.analysis.allUrlsMatch ? '是' : '否'}\n不匹配: ${result.data.analysis.mismatches?.length || 0}`);
    } else { alert(`调试失败: ${result.error}`); }
    onLoadingChange(false);
  };

  return (
    <div className={`flex flex-col items-center justify-center bg-black ${className} p-8`}>
      <div className="text-white text-center max-w-2xl w-full">
        <div className="text-red-500 mb-4"><AlertCircle className="w-16 h-16 mx-auto mb-2" /><p className="text-xl font-semibold">{error || '播放列表为空'}</p></div>
        {currentVideo && currentVideo.url && (
          <div className="mt-6">
            {!showDiagnostic ? (
              <button onClick={() => setShowDiagnostic(true)} className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 rounded-lg font-medium text-white flex items-center gap-2 mx-auto"><Bug className="w-5 h-5" />诊断URL问题</button>
            ) : (<VideoUrlDiagnostic url={currentVideo.url} onClose={() => setShowDiagnostic(false)} />)}
          </div>
        )}
        {playlist && playlist.episodeId && (
          <div className="mt-6 p-6 bg-gradient-to-br from-blue-900/50 to-purple-900/50 border border-blue-600 rounded-lg text-left">
            <p className="font-semibold text-blue-300 mb-4 flex items-center gap-2"><Bug className="w-5 h-5" />🔧 智能诊断与修复</p>
            <p className="text-blue-200 text-sm mb-4">检测到播放错误。我们可以帮您诊断剧集的所有分镜，并尝试自动修复问题。</p>
            {diagnosticResult && (
              <div className="mb-4 p-4 bg-black/30 rounded-lg">
                <p className="text-green-400 font-semibold mb-2">📊 诊断结果：</p>
                <div className="text-sm text-blue-200 space-y-1">
                  <p>✅ 健康: {diagnosticResult.data?.summary?.healthyCount || 0} / {diagnosticResult.data?.summary?.totalStoryboards || 0}</p>
                  <p>⚠️ 问题: {diagnosticResult.data?.summary?.issuesCount || 0}</p>
                  <p>💡 警告: {diagnosticResult.data?.summary?.warningsCount || 0}</p>
                  {diagnosticResult.data?.summary?.shortUrls > 0 && (<p className="text-yellow-400">🚨 发现 {diagnosticResult.data.summary.shortUrls} 个URL过短（可能被截断）</p>)}
                </div>
                <button onClick={() => alert(JSON.stringify(diagnosticResult.data?.diagnostics, null, 2))} className="mt-2 px-3 py-1 bg-blue-700 hover:bg-blue-800 rounded text-xs">查看详细报告</button>
              </div>
            )}
            {fixResult && (
              <div className="mb-4 p-4 bg-black/30 rounded-lg">
                <p className="text-green-400 font-semibold mb-2">✅ 修复结果：</p>
                <div className="text-sm text-blue-200 space-y-1">
                  <p>🔧 已修复: {fixResult.data?.summary?.fixed || 0}</p>
                  <p>⏭️ 跳过: {fixResult.data?.summary?.skipped || 0}</p>
                  <p>❌ 失败: {fixResult.data?.summary?.failed || 0}</p>
                  <p className="text-yellow-400 mt-2">{fixResult.data?.message}</p>
                </div>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={handleDiagnose} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm font-medium">诊断分镜</button>
              <button onClick={handleSyncUrls} className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-white text-sm font-medium">同步URL</button>
              <button onClick={handleDebugEpisode} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white text-sm font-medium">🔍 查看数据库</button>
            </div>
          </div>
        )}
        {error && error.includes('Failed to load playlist') && (
          <div className="mt-6 p-4 bg-yellow-900/50 border border-yellow-600 rounded-lg text-left">
            <p className="font-semibold text-yellow-400 mb-2">⚠️ 可能的原因</p>
            <ul className="text-yellow-200 text-sm space-y-1 list-disc list-inside"><li>播放列表数据格式可能需要更新</li><li>旧版本的播放列表使用了不兼容的字段名</li></ul>
            <p className="mt-4 text-yellow-400 font-semibold">💡 解决方法：</p>
            <ol className="text-yellow-200 text-sm space-y-1 list-decimal list-inside mt-2"><li>返回分集管理页面</li><li>点击"合并视频"按钮</li><li>系统会自动重新生成所有视频</li></ol>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// [C] PlaylistOverlays (was: PlaylistOverlays.tsx)
// ═══════════════════════════════════════════════════════════════════

interface PlaylistOverlaysProps {
  playlist: Playlist; currentIndex: number; isPlaying: boolean; isVideoLoading: boolean; isBuffering: boolean;
  error: string | null; showQuickTest: boolean; onTogglePlay: () => void; onShowQuickTest: (show: boolean) => void;
}

export function PlaylistOverlays({ playlist, currentIndex, isPlaying, isVideoLoading, isBuffering, error, showQuickTest, onTogglePlay, onShowQuickTest }: PlaylistOverlaysProps) {
  return (
    <>
      {!isPlaying && !isVideoLoading && (
        <div className="absolute inset-0 z-[3] flex items-center justify-center bg-black/50 backdrop-blur-sm cursor-pointer hover:bg-black/60 transition-colors" onClick={onTogglePlay}>
          <div className="text-center text-white pointer-events-none">
            <div className="mb-2 sm:mb-4 transform hover:scale-110 transition-transform"><Play className="w-10 h-10 sm:w-16 sm:h-16 mx-auto" /></div>
            <div className="text-base sm:text-xl font-semibold mb-1 sm:mb-2">分镜 {currentIndex + 1}</div>
            <div className="text-xs sm:text-sm opacity-80">共 {playlist.totalVideos} 个分镜 · {Math.floor(playlist.totalDuration / 60)}分{Math.round(playlist.totalDuration % 60)}秒</div>
          </div>
        </div>
      )}
      {isVideoLoading && (
        <div className="absolute inset-0 z-[3] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="text-center text-white"><div className="w-12 h-12 border-3 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mx-auto mb-3"></div><div className="text-sm font-medium mb-1">加载视频中...</div><div className="text-xs opacity-60">分镜 {currentIndex + 1} / {playlist.totalVideos}</div></div>
        </div>
      )}
      {isBuffering && !isVideoLoading && (
        <div className="absolute inset-0 z-[3] flex items-center justify-center bg-black/50">
          <div className="text-center text-white"><div className="w-10 h-10 border-3 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mx-auto mb-2"></div><div className="text-xs opacity-80">缓冲中...</div></div>
        </div>
      )}
      {error && (
        <div className="absolute bottom-20 left-0 right-0 z-[4] flex justify-center">
          <button onClick={() => onShowQuickTest(true)} className="px-4 py-2 bg-red-500/80 hover:bg-red-500 rounded-lg text-sm text-white flex items-center gap-2 shadow-xl backdrop-blur-sm">诊断视频问题</button>
        </div>
      )}
      {showQuickTest && playlist && (<QuickVideoTest urls={playlist.videos.map(v => v.url)} onClose={() => onShowQuickTest(false)} />)}
    </>
  );
}
