/**
 * 播放列表视频播放器
 * 支持连续播放多个视频（虚拟合并方案）
 * 
 * v4.2.4_FIX: 支持直接解析 JSON 字符串（不只是 URL）
 */

import { useState, useRef, useEffect } from 'react';
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, AlertCircle, Bug } from 'lucide-react';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { VideoUrlDiagnostic } from './VideoUrlDiagnostic';
import { QuickVideoTest } from './QuickVideoTest';

interface Video {
  sceneNumber: number;
  url: string; // 🔥 FIX: 改为 'url' 匹配后端
  duration: number;
  title?: string; // 🔥 FIX: 添加 title 字段
  thumbnail?: string | null;
}

interface Playlist {
  type?: string; // 🔥 FIX: 添加 type 字段
  version?: string; // 🔥 FIX: 添加 version 字段
  episodeId: string;
  totalVideos: number;
  totalDuration: number;
  createdAt: string;
  videos: Video[];
}

interface PlaylistVideoPlayerProps {
  playlistUrl: string;
  className?: string;
  autoPlay?: boolean;
  onPlay?: () => void; // 🎯 新增：播放事件回调
  onPause?: () => void; // 🎯 新增：暂停事件回调
}

export function PlaylistVideoPlayer({ playlistUrl, className = '', autoPlay = false, onPlay, onPause }: PlaylistVideoPlayerProps) {
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isVideoLoading, setIsVideoLoading] = useState(false); // 🔥 新增：视频加载状态
  const [isBuffering, setIsBuffering] = useState(false); // 🔥 新增：缓冲状态
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [retryCount, setRetryCount] = useState<Map<number, number>>(new Map()); // 🆕 每个视频的重试次数
  const [diagnosticResult, setDiagnosticResult] = useState<any>(null); // 🆕 诊断结果
  const [fixResult, setFixResult] = useState<any>(null); // 🆕 修复结果
  const [showQuickTest, setShowQuickTest] = useState(false); // 🆕 快速测试工具
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const playPromiseRef = useRef<Promise<void> | null>(null); // 🔥 FIX: 跟踪 play() promise
  const MAX_RETRIES = 2; // 🆕 最多重试2次

  // 加载播放列表
  useEffect(() => {
    const loadPlaylist = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        console.log('[PlaylistPlayer] 🔍 Loading playlist:', playlistUrl);
        
        // 🔥 FIX: 检查 playlistUrl 是否有效
        if (!playlistUrl || typeof playlistUrl !== 'string') {
          throw new Error('Invalid playlist URL');
        }
        
        // 🔥 FIX: 检测 playlistUrl 是 JSON 字符串还是实际的 URL
        let data: Playlist;
        
        if (playlistUrl.trim().startsWith('{')) {
          // playlistUrl 实际上是 JSON 字符串
          console.log('[PlaylistPlayer] 📄 Detected inline JSON data, parsing directly...');
          data = JSON.parse(playlistUrl);
          console.log('[PlaylistPlayer] ✅ Parsed JSON successfully');
        } else {
          // playlistUrl 是实际的 URL，需要 fetch
          console.log('[PlaylistPlayer] 🌐 Detected URL, fetching...');
          
          // 🔥 v4.2.66: 添加fetch超时控制（10秒）
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          
          try {
            const response = await fetch(playlistUrl, {
              signal: controller.signal,
            });
            clearTimeout(timeoutId);
            
            if (!response.ok) {
              throw new Error(`Failed to load playlist: HTTP ${response.status}`);
            }
            data = await response.json();
            console.log('[PlaylistPlayer] ✅ Fetched JSON successfully');
          } catch (fetchError: any) {
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError') {
              throw new Error('加载超时，请检查网络连接');
            }
            throw fetchError;
          }
        }
        
        // 验证数据结构
        if (!data.videos || !Array.isArray(data.videos) || data.videos.length === 0) {
          throw new Error('Playlist has no videos');
        }
        
        console.log('[PlaylistPlayer] ✅ Playlist loaded with', data.videos.length, 'videos');
        
        // 🔥 优化：批量处理OSS URL签名（并行请求，更快）
        const ossUrls = data.videos
          .filter(v => v.url && (v.url.includes('aliyuncs.com') || v.url.includes('oss-')))
          .map(v => v.url);
        
        if (ossUrls.length > 0) {
          console.log('[PlaylistPlayer] 🔑 Found', ossUrls.length, 'OSS URLs, getting signed URLs...');
          
          try {
            // 🔥 优化：添加超时和重试机制
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
            
            const signResponse = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc31472c/oss/sign-urls`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${publicAnonKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                urls: ossUrls,
                expiresIn: 7200, // 2小时过期
              }),
              signal: controller.signal,
            });
            
            clearTimeout(timeoutId);
            
            if (signResponse.ok) {
              const signResult = await signResponse.json();
              console.log('[PlaylistPlayer] ✅ Got signed URLs:', signResult.data.successCount, '/', ossUrls.length);
              
              // 替换为签名URL
              const urlMap = new Map<string, string>();
              signResult.data.results.forEach((result: any) => {
                if (result.success && result.signedUrl) {
                  urlMap.set(result.originalUrl, result.signedUrl);
                }
              });
              
              data.videos = data.videos.map(video => {
                if (urlMap.has(video.url)) {
                  return { ...video, url: urlMap.get(video.url)! };
                }
                return video;
              });
            } else {
              console.warn('[PlaylistPlayer] ⚠️ Sign URLs failed, trying to clean URLs...');
              // 清理URL（移除过期的签名参数）
              data.videos = data.videos.map(video => {
                try {
                  const urlObj = new URL(video.url);
                  ['OSSAccessKeyId', 'Expires', 'Signature', 'security-token'].forEach(param => {
                    urlObj.searchParams.delete(param);
                  });
                  return { ...video, url: urlObj.toString() };
                } catch (e) {
                  return video;
                }
              });
            }
          } catch (signError: any) {
            console.error('[PlaylistPlayer] ❌ Error signing URLs:', signError.message);
            // 继续使用原始URL
          }
        }
        
        // 验证每个视频URL
        data.videos.forEach((video, index) => {
          console.log(`[PlaylistPlayer] 📹 Video ${index + 1}:`, {
            sceneNumber: video.sceneNumber,
            title: video.title,
            duration: video.duration,
            url: video.url?.substring(0, 100) + '...',
            fullUrl: video.url, // 🔥 新增：输出完整URL用于调试
            hasUrl: !!video.url,
            urlType: typeof video.url,
            urlLength: video.url?.length,
          });
          
          if (!video.url) {
            console.warn(`[PlaylistPlayer] ⚠️ Video ${index + 1} has no URL!`);
          } else if (video.url.length < 50) {
            // 🚨 检测URL是否太短（可能被截断）
            console.error(`[PlaylistPlayer] 🚨🚨🚨 Video ${index + 1} URL IS TOO SHORT - LIKELY TRUNCATED!`);
            console.error(`[PlaylistPlayer] 🚨 URL length: ${video.url.length} chars`);
            console.error(`[PlaylistPlayer] 🚨 URL: "${video.url}"`);
          }
          // 🔥 FIX: 禁用 URL 测试，因为某些 OSS 配置不允 HEAD 请求
          // 实际播放时会使用 GET 请求，那时才是真正的测试
          // else {
          //   testVideoUrl(video.url, index + 1);
          // }
        });
        
        // 🆕 输出完整的播放列表JSON用于调试
        console.log('[PlaylistPlayer] 📄 Complete playlist JSON:');
        console.log(JSON.stringify(data, null, 2));
        
        // 🔥 新增：检查是否只有一个分镜
        if (data.videos.length === 1) {
          console.warn('[PlaylistPlayer] ⚠️ WARNING: Playlist has only 1 video!');
          console.warn('[PlaylistPlayer] This might indicate incomplete data or generation issue');
          console.warn('[PlaylistPlayer] Episode ID:', data.episodeId);
          console.warn('[PlaylistPlayer] Total videos expected:', data.totalVideos);
          console.warn('[PlaylistPlayer] Total duration:', data.totalDuration);
        }
        
        setPlaylist(data);
        setCurrentIndex(0);
      } catch (err: any) {
        console.error('[PlaylistPlayer] ❌ Failed to load playlist:', err);
        console.error('[PlaylistPlayer] ❌ Error stack:', err.stack);
        setError(err.message || 'Failed to load playlist');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadPlaylist();
  }, [playlistUrl]);

  // 当前视频
  const currentVideo = playlist?.videos[currentIndex];

  // 播放/暂停
  const togglePlay = () => {
    console.log('[PlaylistPlayer] 🎯 togglePlay clicked');
    console.log('[PlaylistPlayer] 📊 Current state:', {
      isPlaying,
      hasVideoRef: !!videoRef.current,
      videoSrc: videoRef.current?.src?.substring(0, 100),
      videoReadyState: videoRef.current?.readyState,
      videoPaused: videoRef.current?.paused,
    });
    
    if (!videoRef.current) {
      console.error('[PlaylistPlayer] ❌ Video ref is null!');
      return;
    }
    
    if (isPlaying) {
      console.log('[PlaylistPlayer] ⏸️ Pausing video...');
      videoRef.current.pause();
      setIsPlaying(false);
      onPause?.(); // 🎯 触发暂停事件回调
    } else {
      console.log('[PlaylistPlayer] ▶️ Playing video...');
      const playPromise = videoRef.current.play();
      
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log('[PlaylistPlayer] ✅ Video started playing');
            setIsPlaying(true);
            onPlay?.(); // 🎯 触发播放事件回调
          })
          .catch(err => {
            console.error('[PlaylistPlayer] ❌ Play failed:', err);
            setIsPlaying(false);
          });
      } else {
        setIsPlaying(true);
        onPlay?.(); // 🎯 触发播放事件回调
      }
    }
  };

  // 切换静音
  const toggleMute = () => {
    if (!videoRef.current) return;
    
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  // 下一个视频
  const nextVideo = () => {
    if (!playlist) return;
    
    if (currentIndex < playlist.videos.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setProgress(0);
    } else {
      // 播放完毕
      setIsPlaying(false);
      setCurrentIndex(0);
      setProgress(0);
    }
  };

  // 上一个视频
  const previousVideo = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setProgress(0);
    }
  };

  // ��频结束时自动播放下一个
  const handleVideoEnded = () => {
    console.log('[PlaylistPlayer] ✅ Video ended, auto-playing next...');
    console.log('[PlaylistPlayer] Current index:', currentIndex);
    console.log('[PlaylistPlayer] Total videos:', playlist?.videos.length);
    
    if (!playlist) return;
    
    if (currentIndex < playlist.videos.length - 1) {
      // 还有下一个视频，自动播放
      console.log('[PlaylistPlayer] ▶️ Playing next video:', currentIndex + 1);
      setCurrentIndex(currentIndex + 1);
      setProgress(0);
      setIsPlaying(true); // 🔥 确保继续播放状态
    } else {
      // 播放完所有视频，循环播放
      console.log('[PlaylistPlayer] 🔄 All videos finished, looping back to first video');
      setCurrentIndex(0);
      setProgress(0);
      setIsPlaying(true); // 🔥 继续播放，从头开始
    }
  };

  // 更新进度
  const handleTimeUpdate = () => {
    if (!videoRef.current || !playlist) return;
    
    const current = videoRef.current.currentTime;
    const duration = videoRef.current.duration;
    
    if (duration > 0) {
      // 🆕 计算总体进度（所有视频的度）
      // 1. 计算已播放完的视频总时长
      const completedDuration = playlist.videos
        .slice(0, currentIndex)
        .reduce((sum, v) => sum + v.duration, 0);
      
      // 2. 加上当前视频的播放进度
      const totalElapsed = completedDuration + current;
      
      // 3. 计算总进度百分比
      const totalProgress = (totalElapsed / playlist.totalDuration) * 100;
      
      setProgress(totalProgress);
      
      // 🔍 调试日志（每10秒输出一次）
      if (Math.floor(current) % 10 === 0) {
        console.log('[PlaylistPlayer] 📊 Progress update:', {
          currentVideo: currentIndex + 1,
          currentTime: current.toFixed(1),
          completedDuration: completedDuration.toFixed(1),
          totalElapsed: totalElapsed.toFixed(1),
          totalDuration: playlist.totalDuration,
          totalProgress: totalProgress.toFixed(2) + '%',
        });
      }
    }
  };

  // 当切换视频时，自动播放
  useEffect(() => {
    if (!videoRef.current || !currentVideo) return;
    
    console.log(`[PlaylistPlayer] 🎬 Switching to video ${currentIndex + 1}:`, {
      sceneNumber: currentVideo.sceneNumber,
      title: currentVideo.title,
      url: currentVideo.url?.substring(0, 100),
      urlLength: currentVideo.url?.length,
      hasUrl: !!currentVideo.url,
    });
    
    // 🔥 检查URL有效性
    if (!currentVideo.url || typeof currentVideo.url !== 'string') {
      console.error('[PlaylistPlayer] ❌ Invalid video URL:', currentVideo.url);
      setError(`视频${currentIndex + 1} URL无效`);
      return;
    }
    
    // 🔥 检查URL格式
    if (!currentVideo.url.startsWith('http://') && !currentVideo.url.startsWith('https://')) {
      console.error('[PlaylistPlayer] ❌ Invalid URL scheme:', currentVideo.url.substring(0, 50));
      setError(`视频${currentIndex + 1} URL格式错误`);
      return;
    }
    
    // 清除之前的错误
    setError(null);
    
    // 🔥 FIX: 记录是否应该自动播放（在effect开始时捕获）
    const shouldAutoPlay = isPlaying || autoPlay;
    const video = videoRef.current;
    
    // 🔥 FIX: 在切换视频前，暂停当前播放并等待 play() promise 完成
    console.log('[PlaylistPlayer] 🛑 Pausing current video before switching...');
    
    // 如果有正在进行的 play() promise，等待它完成
    if (playPromiseRef.current) {
      playPromiseRef.current.catch(() => {
        // 忽略错误，因为我们要切换视频了
        console.log('[PlaylistPlayer] 💡 Previous play promise rejected (expected during switch)');
      }).finally(() => {
        playPromiseRef.current = null;
      });
    }
    
    // 暂停视频
    video.pause();
    
    // 🔥 FIX: 延迟一小段时间确保 pause 生效，避免竞态条件
    const loadTimeout = setTimeout(() => {
      if (!videoRef.current) return;
      
      console.log('[PlaylistPlayer] 🔄 Loading new video source...');
      videoRef.current.load();
      
      // 🔥 FIX: 如果需要自动播放，等待canplay事件
      if (shouldAutoPlay) {
        const handleCanPlay = () => {
          console.log('[PlaylistPlayer] ▶️ Attempting auto-play...');
          
          if (!videoRef.current) return;
          
          const playPromise = videoRef.current.play();
          playPromiseRef.current = playPromise; // 🔥 FIX: 保存 promise 引用
          
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                console.log('[PlaylistPlayer] ✅ Auto-play successful');
                setIsPlaying(true);
                playPromiseRef.current = null; // 清除引用
              })
              .catch(err => {
                // 🔥 FIX: 检查是否是 AbortError（切换视频导致的中断）
                if (err.name === 'AbortError') {
                  console.log('[PlaylistPlayer] 💡 Play aborted (video switched), this is expected');
                } else {
                  console.error('[PlaylistPlayer] ❌ Auto-play failed:', err);
                }
                setIsPlaying(false);
                playPromiseRef.current = null; // 清除引用
              });
          }
        };
        
        // 监听canplay事件（一次性）
        videoRef.current.addEventListener('canplay', handleCanPlay, { once: true });
      }
    }, 50); // 🔥 FIX: 50ms 延迟确保 pause 生效
    
    // 清理函数
    return () => {
      clearTimeout(loadTimeout);
      if (videoRef.current) {
        // 移除可能存在的事件监听器
        videoRef.current.pause();
      }
    };
  }, [currentIndex, currentVideo]); // 🔥 FIX: 只依赖currentIndex和currentVideo，避免无限循环

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center bg-black ${className}`}>
        <div className="text-white">加载播放列表...</div>
      </div>
    );
  }

  if (error || !playlist || !currentVideo) {
    return (
      <div className={`flex flex-col items-center justify-center bg-black ${className} p-8`}>
        <div className="text-white text-center max-w-2xl w-full">
          <div className="text-red-500 mb-4">
            <AlertCircle className="w-16 h-16 mx-auto mb-2" />
            <p className="text-xl font-semibold">{error || '播放列表为空'}</p>
          </div>
          
          {/* 🆕 视频URL诊断工具 */}
          {currentVideo && currentVideo.url && (
            <div className="mt-6">
              {!showDiagnostic ? (
                <button
                  onClick={() => setShowDiagnostic(true)}
                  className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 rounded-lg font-medium text-white flex items-center gap-2 mx-auto"
                >
                  <Bug className="w-5 h-5" />
                  诊断URL问题
                </button>
              ) : (
                <VideoUrlDiagnostic
                  url={currentVideo.url}
                  onClose={() => setShowDiagnostic(false)}
                />
              )}
            </div>
          )}
          
          {/* 🆕 智能诊断和修复工具 */}
          {playlist && playlist.episodeId && (
            <div className="mt-6 p-6 bg-gradient-to-br from-blue-900/50 to-purple-900/50 border border-blue-600 rounded-lg text-left">
              <p className="font-semibold text-blue-300 mb-4 flex items-center gap-2">
                <Bug className="w-5 h-5" />
                🔧 智能诊断与修复
              </p>
              <p className="text-blue-200 text-sm mb-4">
                检测到播放错误。我们可以帮您诊断剧集的所有分镜，并尝试自动修复问题。
              </p>
              
              {/* 诊断结果显示 */}
              {diagnosticResult && (
                <div className="mb-4 p-4 bg-black/30 rounded-lg">
                  <p className="text-green-400 font-semibold mb-2">📊 诊断结果：</p>
                  <div className="text-sm text-blue-200 space-y-1">
                    <p>✅ 健康: {diagnosticResult.data?.summary?.healthyCount || 0} / {diagnosticResult.data?.summary?.totalStoryboards || 0}</p>
                    <p>⚠️ 问题: {diagnosticResult.data?.summary?.issuesCount || 0}</p>
                    <p>💡 警告: {diagnosticResult.data?.summary?.warningsCount || 0}</p>
                    {diagnosticResult.data?.summary?.shortUrls > 0 && (
                      <p className="text-yellow-400">🚨 发现 {diagnosticResult.data.summary.shortUrls} 个URL过短（可能被截断）</p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      console.log('[Diagnostic] Full result:', diagnosticResult);
                      alert(JSON.stringify(diagnosticResult.data?.diagnostics, null, 2));
                    }}
                    className="mt-2 px-3 py-1 bg-blue-700 hover:bg-blue-800 rounded text-xs"
                  >
                    查看详细报告
                  </button>
                </div>
              )}
              
              {/* 修复结果显示 */}
              {fixResult && (
                <div className="mb-4 p-4 bg-black/30 rounded-lg">
                  <p className="text-green-400 font-semibold mb-2">✅ 修复结果：</p>
                  <div className="text-sm text-blue-200 space-y-1">
                    <p>🔧 已修复: {fixResult.data?.summary?.fixed || 0}</p>
                    <p>⏭️ 跳过: {fixResult.data?.summary?.skipped || 0}</p>
                    <p>❌ 失败: {fixResult.data?.summary?.failed || 0}</p>
                    <p className="text-yellow-400 mt-2">{fixResult.data?.message}</p>
                  </div>
                  <button
                    onClick={() => {
                      console.log('[Fix] Full result:', fixResult);
                      const details = fixResult.data?.results?.map((r: any) => 
                        `Scene ${r.sceneNumber}: ${r.status}\n  ${r.actions?.join('\n  ') || ''}`
                      ).join('\n\n');
                      alert(details || '无详细信息');
                    }}
                    className="mt-2 px-3 py-1 bg-green-700 hover:bg-green-800 rounded text-xs"
                  >
                    查看修复详情
                  </button>
                </div>
              )}
              
              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    try {
                      setIsLoading(true);
                      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc31472c/episodes/${playlist.episodeId}/diagnose-storyboards`, {
                        method: 'GET',
                        headers: {
                          'Authorization': `Bearer ${publicAnonKey}`,
                        },
                      });
                      const result = await response.json();
                      console.log('[Diagnose] Result:', result);
                      setDiagnosticResult(result);
                      
                      if (!result.success) {
                        alert(`诊断失败: ${result.error}`);
                      }
                    } catch (err) {
                      console.error('[Diagnose] Error:', err);
                      alert('诊断失败，请查看控制台');
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm font-medium"
                >
                  诊断分镜
                </button>
                <button
                  onClick={async () => {
                    try {
                      setIsLoading(true);
                      setFixResult(null);
                      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc31472c/episodes/${playlist.episodeId}/sync-storyboard-urls`, {
                        method: 'POST',
                        headers: {
                          'Authorization': `Bearer ${publicAnonKey}`,
                        },
                      });
                      const result = await response.json();
                      console.log('[Sync] Result:', result);
                      setFixResult(result);
                      
                      if (result.success && result.data?.summary?.synced > 0) {
                        // 如果同步了URL，延迟3秒后刷新
                        setTimeout(() => {
                          console.log('[Sync] Reloading page after successful sync...');
                          window.location.reload();
                        }, 3000);
                      } else if (!result.success) {
                        alert(`同步失败: ${result.error}`);
                      }
                    } catch (err) {
                      console.error('[Sync] Error:', err);
                      alert('同步失败，请查看控制台');
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-white text-sm font-medium"
                >
                  同步URL
                </button>
                <button
                  onClick={async () => {
                    try {
                      setIsLoading(true);
                      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc31472c/debug/episode-data/${playlist.episodeId}`, {
                        method: 'GET',
                        headers: {
                          'Authorization': `Bearer ${publicAnonKey}`,
                        },
                      });
                      const result = await response.json();
                      console.log('[Debug Episode] 📊 Full result:', result);
                      
                      if (result.success) {
                        // 显示详细的调试信息
                        console.log('[Debug Episode] 📄 Episode:', result.data.episode);
                        console.log('[Debug Episode] 🎬 Merged video data:', result.data.mergedVideoData);
                        console.log('[Debug Episode] 📹 Storyboards:', result.data.storyboards);
                        console.log('[Debug Episode] 🔍 Comparison:', result.data.comparison);
                        console.log('[Debug Episode] 📊 Analysis:', result.data.analysis);
                        
                        // 成可读的报告
                        const report = `
📊 剧集调试报告
━━━━━━━━━━━━━━━━━━━━━━

📄 剧集信息
  - ID: ${result.data.episode.id}
  - 标题: ${result.data.episode.title}
  - 集数: ${result.data.episode.episode_number}
  - 视频状态: ${result.data.episode.video_status}
  - merged_video_url长度: ${result.data.episode.merged_video_url_length} 字符
  - merged_video_url类型: ${result.data.episode.merged_video_url_type}

📊 统计分析
  - 数据库分总数: ${result.data.analysis.totalStoryboards}
  - merged_video中视频数: ${result.data.analysis.mergedVideoCount}
  - 所有URL匹配: ${result.data.analysis.allUrlsMatch ? '✅ 是' : '❌ 否'}
  - URL不匹配数: ${result.data.analysis.mismatches?.length || 0}
  - 异常短URL数: ${result.data.analysis.shortUrls?.length || 0}

${result.data.analysis.mismatches && result.data.analysis.mismatches.length > 0 ? `
⚠️ URL不匹配详情:
${result.data.analysis.mismatches.map((m: any) => `  - 分镜${m.sceneNumber}: 数据不一致`).join('\n')}
` : ''}

${result.data.analysis.shortUrls && result.data.analysis.shortUrls.length > 0 ? `
🚨 异常短URL详情:
${result.data.analysis.shortUrls.map((s: any) => `  - 分镜${s.sceneNumber}: URL长度仅${s.mergedVideoUrlLength}字符`).join('\n')}
` : ''}

📹 分镜详情:
${result.data.comparison?.map((c: any) => `
  分镜 ${c.sceneNumber}:
    - merged_video URL: ${c.mergedVideoUrl?.substring(0, 80)}...
    - 数据库 URL: ${c.storyboardVideoUrl?.substring(0, 80)}...
    - URL匹配: ${c.urlsMatch ? '✅' : '❌'}
    - 视频状态: ${c.storyboardStatus}
`).join('\n')}
                        `;
                        
                        alert(report);
                      } else {
                        alert(`调试失败: ${result.error}`);
                      }
                    } catch (err) {
                      console.error('[Debug Episode] Error:', err);
                      alert('调试失败，请查看控制台');
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white text-sm font-medium"
                >
                  🔍 查看数据库
                </button>
              </div>
            </div>
          )}
          
          {/* 🆕 如果URL被截断，显示修复提示 */}
          {error && error.includes('Failed to load playlist') && (
            <div className="mt-6 p-4 bg-yellow-900/50 border border-yellow-600 rounded-lg text-left">
              <p className="font-semibold text-yellow-400 mb-2">⚠️ 可能的原因</p>
              <ul className="text-yellow-200 text-sm space-y-1 list-disc list-inside">
                <li>播放列表数据格式可能需要更新</li>
                <li>旧版本的播放列表使用了不兼容的字段名</li>
              </ul>
              <p className="mt-4 text-yellow-400 font-semibold">💡 解决方法：</p>
              <ol className="text-yellow-200 text-sm space-y-1 list-decimal list-inside mt-2">
                <li>返回分集管理页面</li>
                <li>点击"合并视频"按钮</li>
                <li>系统会自动重新生成所有视频</li>
              </ol>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`relative bg-black ${className}`}>
      {/* 视频播放器 */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        src={currentVideo.url}
        playsInline
        preload="auto"
        onEnded={handleVideoEnded}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => {
          console.log('[PlaylistPlayer] ▶️ Video playing');
          setIsPlaying(true);
          onPlay?.(); // 🎯 触发播放事件回调
        }}
        onPause={() => {
          console.log('[PlaylistPlayer] ⏸️ Video paused');
          setIsPlaying(false);
          onPause?.(); // 🎯 触发暂停事件回调
        }}
        onLoadStart={() => {
          console.log('[PlaylistPlayer] 🔄 Video load started:', currentVideo.url.substring(0, 150));
          setIsVideoLoading(true); // 🔥 设置视频加载状态
        }}
        onLoadedMetadata={() => {
          console.log('[PlaylistPlayer] ✅ Video metadata loaded:', {
            duration: videoRef.current?.duration,
            videoWidth: videoRef.current?.videoWidth,
            videoHeight: videoRef.current?.videoHeight,
          });
          setIsVideoLoading(false); // 🔥 清除视频加载状态
        }}
        onCanPlay={() => {
          console.log('[PlaylistPlayer] ✅ Video can play');
        }}
        onWaiting={() => {
          console.log('[PlaylistPlayer] ⏳ Video is buffering...');
          setIsBuffering(true);
        }}
        onPlaying={() => {
          console.log('[PlaylistPlayer] ▶️ Video is playing, buffering ended');
          setIsBuffering(false);
        }}
        onError={async (e) => {
          const video = e.currentTarget;
          const errorCode = video.error?.code;
          const errorMessage = video.error?.message;
          
          console.error('[PlaylistPlayer] ❌ Video error:', {
            code: errorCode,
            message: errorMessage,
            url: currentVideo.url,
            networkState: video.networkState,
            readyState: video.readyState,
            sceneNumber: currentVideo.sceneNumber,
            videoIndex: currentIndex + 1,
            totalVideos: playlist?.videos.length,
          });
          
          // 🔥 错误代码解释
          let errorExplanation = '';
          switch (errorCode) {
            case 1: // MEDIA_ERR_ABORTED
              errorExplanation = '视频加载中止';
              break;
            case 2: // MEDIA_ERR_NETWORK
              errorExplanation = '网络错误，请检查网络连接';
              break;
            case 3: // MEDIA_ERR_DECODE
              errorExplanation = '视频解码失败，可能文件已损坏';
              break;
            case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
              errorExplanation = '视频格式不支持或URL无效';
              break;
            default:
              errorExplanation = '未知错误';
          }
          
          console.error('[PlaylistPlayer] Error explanation:', errorExplanation);
          console.error('[PlaylistPlayer] 🔍 Diagnostic info:', {
            videoSrc: video.src,
            videoCurrentSrc: video.currentSrc,
            canPlayType_mp4: video.canPlayType('video/mp4'),
            canPlayType_webm: video.canPlayType('video/webm'),
          });
          
          // 🔥 FIX: 如果是格式错误(code 4)，很可能是CORS问题，尝试移除crossOrigin重试
          const currentRetries = retryCount.get(currentIndex) || 0;
          
          if (errorCode === 4 && currentRetries === 0) {
            console.warn('[PlaylistPlayer] 🔧 Strategy 1: Removing crossOrigin and retrying...');
            console.warn('[PlaylistPlayer] This may be a CORS issue with the OSS bucket');
            
            // 更新重试次数
            const newRetryCount = new Map(retryCount);
            newRetryCount.set(currentIndex, 1);
            setRetryCount(newRetryCount);
            
            // 移除 crossOrigin 属性并重试
            video.removeAttribute('crossOrigin');
            video.load();
            
            // 尝试播放
            if (isPlaying || autoPlay) {
              setTimeout(() => {
                video.play().catch(err => {
                  console.error('[PlaylistPlayer] ❌ Failed to play after removing crossOrigin:', err);
                });
              }, 500);
            }
            
            return; // 跳过其他处理
          }
          
          // 🆕 额外的URL验证 - 尝试fetch检查文件是否存在
          if (errorCode === 4) {
            console.log('[PlaylistPlayer] 🔍 Testing if file exists with fetch...');
            try {
              const testResponse = await fetch(currentVideo.url, {
                method: 'HEAD',
                mode: 'no-cors', // 🔥 FIX: 使用 no-cors 模式避免CORS阻塞
                cache: 'no-store',
              });
              
              console.log('[PlaylistPlayer] 📊 Fetch test result:', {
                status: testResponse.status,
                type: testResponse.type,
                ok: testResponse.ok,
              });
              
              if (testResponse.status === 403) {
                console.error('[PlaylistPlayer] 🚫 403 Forbidden - Bucket权限问题！请联系管理员检查OSS配置');
                setError(`分镜 ${currentIndex + 1} 访问被拒绝（403）- 请检查存储权限`);
                return;
              } else if (testResponse.status === 404) {
                console.error('[PlaylistPlayer] 🚫 404 Not Found - 视频文件不存在！');
                setError(`分镜 ${currentIndex + 1} 文件不存在（404）`);
                // 自动跳到下一个
                setTimeout(() => nextVideo(), 2000);
                return;
              } else if (testResponse.ok) {
                console.warn('[PlaylistPlayer] ⚠️ Fetch成功但video标签播放失败 - 可能是CORS或格式问题');
                
                // 检查Content-Type
                const contentType = testResponse.headers.get('content-type');
                if (!contentType || !contentType.includes('video')) {
                  console.error('[PlaylistPlayer] 🚫 错误的Content-Type:', contentType);
                  setError(`分镜 ${currentIndex + 1} 文件类型错误: ${contentType}`);
                  setTimeout(() => nextVideo(), 2000);
                  return;
                }
                
                // 检查CORS
                const cors = testResponse.headers.get('access-control-allow-origin');
                if (!cors && currentVideo.url.includes('aliyuncs.com')) {
                  console.error('[PlaylistPlayer] 🚫 缺少CORS头 - 请检查OSS CORS配置');
                  setError(`分镜 ${currentIndex + 1} CORS未配置 - 请检查存储配置`);
                  return;
                }
              }
            } catch (fetchError: any) {
              console.error('[PlaylistPlayer] ❌ Fetch test failed:', fetchError);
            }
          }
          
          // 🆕 获取当前视频的重试次数
          const retries = retryCount.get(currentIndex) || 0;
          
          // 🆕 如果是 OSS URL 格式错误且还未达到最大重试次数
          if (errorCode === 4 && currentVideo.url.includes('aliyuncs.com') && retries < MAX_RETRIES) {
            console.warn(`[PlaylistPlayer] 🔧 Attempting to fix OSS URL and retry... (${retries + 1}/${MAX_RETRIES})`);
            
            // 更新重试次数
            const newRetryCount = new Map(retryCount);
            newRetryCount.set(currentIndex, retries + 1);
            setRetryCount(newRetryCount);
            
            try {
              // 🆕 策略1: 调用签名API获取正确的签名URL
              if (retries === 0) {
                console.log('[PlaylistPlayer] 🔑 Strategy 1: Getting signed URL from API...');
                
                try {
                  const signResponse = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc31472c/oss/sign-urls`, {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${publicAnonKey}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      urls: [currentVideo.url],
                      expiresIn: 7200,
                    }),
                  });
                  
                  if (signResponse.ok) {
                    const signResult = await signResponse.json();
                    console.log('[PlaylistPlayer] ✅ Got signed URL response:', signResult);
                    
                    if (signResult.data.results && signResult.data.results.length > 0) {
                      const result = signResult.data.results[0];
                      if (result.success && result.signedUrl) {
                        const newUrl = result.signedUrl;
                        console.log('[PlaylistPlayer] 🆕 Using signed URL:', newUrl.substring(0, 100) + '...');
                        
                        // 更新 playlist 中的 URL
                        if (playlist) {
                          const updatedVideos = [...playlist.videos];
                          updatedVideos[currentIndex] = { ...currentVideo, url: newUrl };
                          setPlaylist({ ...playlist, videos: updatedVideos });
                        }
                        
                        // 直接更新 video src 并重新加载
                        video.src = newUrl;
                        video.load();
                        
                        // 尝试播放
                        if (isPlaying || autoPlay) {
                          setTimeout(() => {
                            video.play().catch(err => {
                              console.error('[PlaylistPlayer] ❌ Failed to play after retry:', err);
                            });
                          }, 500);
                        }
                        
                        return; // 跳过自动跳转
                      }
                    }
                  }
                  
                  console.warn('[PlaylistPlayer] ⚠️ Failed to get signed URL, trying next strategy...');
                } catch (signError) {
                  console.error('[PlaylistPlayer] ❌ Sign API error:', signError);
                }
              }
              
              // 🆕 策略2: 清理URL参数，尝试直接访问（bucket可能是公开的）
              if (retries === 1) {
                console.log('[PlaylistPlayer] 🧹 Strategy 2: Cleaning URL and retry...');
                
                const urlObj = new URL(currentVideo.url);
                
                // 移除所有签名和响应参数
                ['OSSAccessKeyId', 'Expires', 'Signature', 'security-token', 
                 'response-content-type', 'response-content-disposition',
                 'x-oss-process'].forEach(param => {
                  urlObj.searchParams.delete(param);
                });
                
                const cleanUrl = urlObj.toString();
                
                if (cleanUrl !== currentVideo.url) {
                  console.log('[PlaylistPlayer] 🆕 Retrying with clean URL:', cleanUrl.substring(0, 100) + '...');
                  
                  // 更新 playlist 中的 URL
                  if (playlist) {
                    const updatedVideos = [...playlist.videos];
                    updatedVideos[currentIndex] = { ...currentVideo, url: cleanUrl };
                    setPlaylist({ ...playlist, videos: updatedVideos });
                  }
                  
                  // 直接更新 video src 并重新加载
                  video.src = cleanUrl;
                  video.load();
                  
                  // 尝试播放
                  if (isPlaying || autoPlay) {
                    setTimeout(() => {
                      video.play().catch(err => {
                        console.error('[PlaylistPlayer] ❌ Failed to play after retry:', err);
                      });
                    }, 500);
                  }
                  
                  return; // 跳过自动跳转
                } else {
                  console.log('[PlaylistPlayer] ℹ️ URL is already clean, no changes made');
                }
              }
            } catch (urlError) {
              console.error('[PlaylistPlayer] ❌ Failed to fix URL:', urlError);
            }
          }
          
          // 🔥 如果已达到最大重试次数，或不是可重试的错误，跳到下一个视频
          if ((errorCode === 4 || errorCode === 2) && currentIndex < playlist!.videos.length - 1) {
            const retriesText = retries >= MAX_RETRIES ? ` (已重试${retries}次)` : '';
            console.warn(`[PlaylistPlayer] ⏭️ Skipping to next video due to error${retriesText}...`);
            setError(`分镜 ${currentIndex + 1} ${errorExplanation}${retriesText}，自动跳到下一个`);
            
            // 延迟2秒后自动跳到下一个
            setTimeout(() => {
              console.log('[PlaylistPlayer] Auto-skipping to next video...');
              nextVideo();
              setError(null); // 清除错误
            }, 2000);
          } else {
            // 显示错误信息
            const retriesText = retries > 0 ? ` (已重试${retries}次)` : '';
            setError(`分镜 ${currentIndex + 1} 播放失败: ${errorExplanation}${retriesText}`);
          }
        }}
        muted={isMuted}
        webkit-playsinline="true"
        x5-playsinline="true"
        controlsList="nodownload"
      />

      {/* 控制栏 */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
        {/* 🆕 时间显示 - 显示总体进度 */}
        <div className="flex items-center justify-between text-xs text-gray-300 mb-2">
          <span>
            {(() => {
              // 计算已播放时长
              const completedDuration = playlist.videos
                .slice(0, currentIndex)
                .reduce((sum, v) => sum + v.duration, 0);
              const currentTime = videoRef.current?.currentTime || 0;
              const totalElapsed = completedDuration + currentTime;
              
              const minutes = Math.floor(totalElapsed / 60);
              const seconds = Math.floor(totalElapsed % 60);
              return `${minutes}:${seconds.toString().padStart(2, '0')}`;
            })()}
          </span>
          <span className="text-gray-400">
            {Math.floor(playlist.totalDuration / 60)}:{(playlist.totalDuration % 60).toString().padStart(2, '0')}
          </span>
        </div>
        
        {/* 进度条 */}
        <div className="w-full h-1 bg-white/30 rounded-full mb-3">
          <div 
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-white">
          {/* 左侧：播放控制 */}
          <div className="flex items-center gap-3">
            <button
              onClick={previousVideo}
              disabled={currentIndex === 0}
              className="p-2 hover:bg-white/20 rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="上一个"
            >
              <SkipBack className="w-5 h-5" />
            </button>

            <button
              onClick={togglePlay}
              className="p-3 bg-blue-600 hover:bg-blue-700 rounded-full transition-colors"
              title={isPlaying ? '暂停' : '播放'}
            >
              {isPlaying ? (
                <Pause className="w-6 h-6" />
              ) : (
                <Play className="w-6 h-6" />
              )}
            </button>

            <button
              onClick={nextVideo}
              disabled={currentIndex === playlist.videos.length - 1}
              className="p-2 hover:bg-white/20 rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="下一个"
            >
              <SkipForward className="w-5 h-5" />
            </button>
          </div>

          {/* 中间：分镜信息（更简洁） */}
          <div className="flex-1 text-center text-sm">
            <span className="text-gray-300">分镜</span> <span className="font-semibold">{currentIndex + 1}</span> <span className="text-gray-400">/</span> <span className="text-gray-300">{playlist.totalVideos}</span>
          </div>

          {/* 右侧：音量控制 */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMute}
              className="p-2 hover:bg-white/20 rounded-full transition-colors"
              title={isMuted ? '取消静音' : '静音'}
            >
              {isMuted ? (
                <VolumeX className="w-5 h-5" />
              ) : (
                <Volume2 className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 视频信息叠加层 */}
      {!isPlaying && !isVideoLoading && (
        <div 
          className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm cursor-pointer hover:bg-black/60 transition-colors"
          onClick={togglePlay}
        >
          <div className="text-center text-white pointer-events-none">
            <div className="text-6xl mb-4 transform hover:scale-110 transition-transform">
              <Play className="w-16 h-16 mx-auto" />
            </div>
            <div className="text-xl font-semibold mb-2">
              分镜 {currentIndex + 1}
            </div>
            <div className="text-sm opacity-80">
              共 {playlist.totalVideos} 个分镜 · 总时长 {Math.floor(playlist.totalDuration / 60)}分{playlist.totalDuration % 60}秒
            </div>
          </div>
        </div>
      )}
      
      {/* 🔥 视频加载状态叠加层 */}
      {isVideoLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="text-center text-white">
            <div className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
            <div className="text-lg font-semibold mb-2">
              正在加载视频...
            </div>
            <div className="text-sm opacity-80">
              分镜 {currentIndex + 1} / {playlist.totalVideos}
            </div>
          </div>
        </div>
      )}
      
      {/* 🔥 视频缓冲状态叠加层 */}
      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="text-center text-white">
            <div className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
            <div className="text-lg font-semibold mb-2">
              正在缓冲频...
            </div>
            <div className="text-sm opacity-80">
              分镜 {currentIndex + 1} / {playlist.totalVideos}
            </div>
          </div>
        </div>
      )}
      
      {/* 🆕 快速视频测试工具 */}
      {error && (
        <div className="absolute bottom-20 left-0 right-0 flex justify-center">
          <button
            onClick={() => setShowQuickTest(true)}
            className="px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 rounded-lg font-medium text-white flex items-center gap-2 shadow-2xl"
          >
            <Bug className="w-5 h-5" />
            快速测试所有视频
          </button>
        </div>
      )}
      
      {/* 🆕 即使没有error也可以点击测试 - 添加到右上角 */}
      {playlist && (
        <div className="absolute top-4 right-4 z-10">
          <button
            onClick={() => setShowQuickTest(true)}
            className="px-4 py-2 bg-black/60 hover:bg-black/80 backdrop-blur-sm rounded-lg text-white text-sm flex items-center gap-2 border border-white/20"
            title="测试所有视频URL"
          >
            <Bug className="w-4 h-4" />
            测试URL
          </button>
        </div>
      )}
      
      {/* 🆕 快速测试弹窗 */}
      {showQuickTest && playlist && (
        <QuickVideoTest
          urls={playlist.videos.map(v => v.url)}
          onClose={() => setShowQuickTest(false)}
        />
      )}
    </div>
  );
}

// 测试视频URL可访问性
function testVideoUrl(url: string, index: number) {
  // 使用HEAD请求测试URL可访问性（不下载完整视频）
  fetch(url, { 
    method: 'HEAD',
    mode: 'cors',
  })
    .then(response => {
      if (response.ok) {
        console.log(`[PlaylistPlayer] ✅ Video ${index} URL is accessible (${response.status})`, {
          contentType: response.headers.get('content-type'),
          contentLength: response.headers.get('content-length'),
          url: url.substring(0, 100),
        });
      } else {
        console.error(`[PlaylistPlayer] ❌ Video ${index} URL returned ${response.status}`, url);
      }
    })
    .catch(error => {
      console.error(`[PlaylistPlayer] ❌ Video ${index} URL test failed:`, {
        error: error.message,
        url: url.substring(0, 100),
        errorType: error.name,
      });
      
      // 可能是CORS问题，尝试用GET请求小范围测试
      fetch(url, { 
        method: 'GET',
        mode: 'cors',
        headers: {
          'Range': 'bytes=0-1024' // 只请求前1KB
        }
      })
        .then(response => {
          console.log(`[PlaylistPlayer] 🔄 Video ${index} GET test result: ${response.status}`);
        })
        .catch(err => {
          console.error(`[PlaylistPlayer] ❌ Video ${index} GET test also failed:`, err.message);
        });
    });
}