import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { PlaylistVideoPlayer } from './PlaylistVideoPlayer';

interface VideoPlayerProps {
  src: string;
  className?: string;
  controls?: boolean;
  preload?: string;
  style?: React.CSSProperties;
  onError?: (error: any) => void;
  onLoadedMetadata?: () => void;
}

export function VideoPlayer({
  src,
  className = '',
  controls = true,
  preload = 'metadata',
  style,
  onError,
  onLoadedMetadata,
}: VideoPlayerProps) {
  // 🆕 检测播放列表JSON格式
  if (src && src.trim().startsWith('{')) {
    try {
      const playlistData = JSON.parse(src);
      if (playlistData.type === 'playlist' && playlistData.videos) {
        console.log('[VideoPlayer] 🎬 Detected playlist JSON format, using PlaylistVideoPlayer');
        console.log('[VideoPlayer] Playlist:', playlistData.totalVideos, 'videos');
        
        return (
          <PlaylistVideoPlayer 
            videos={playlistData.videos.map((v: any) => ({
              url: v.url,
              title: v.title,
              duration: v.duration
            }))}
            className={className}
          />
        );
      }
    } catch (e) {
      console.warn('[VideoPlayer] Failed to parse as playlist JSON, falling back to normal video:', e);
    }
  }

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [videoSrc, setVideoSrc] = useState(src);
  const [isLoadingSignedUrl, setIsLoadingSignedUrl] = useState(false);
  const [useDirectMp4, setUseDirectMp4] = useState(false); // 🆕 直接使用MP4
  const hlsErrorCountRef = useRef(0); // 🆕 HLS错误计数
  const fallbackAttemptedRef = useRef(false); // 🆕 防止重复回退
  const errorHandlingDisabledRef = useRef(false); // 🆕 禁用error处理标志
  const [videoError, setVideoError] = useState<string | null>(null); // 🆕 视频错误信息

  // 🆕 尝试使用代理播放
  const tryProxyPlayback = async (originalUrl: string) => {
    try {
      console.log('[VideoPlayer] 🔄 Attempting proxy playback for:', originalUrl.substring(0, 100));
      
      // 构建代理URL
      const proxyUrl = `https://${projectId}.supabase.co/functions/v1/make-server-fc31472c/oss/proxy?url=${encodeURIComponent(originalUrl)}`;
      console.log('[VideoPlayer] Proxy URL:', proxyUrl.substring(0, 150) + '...');
      
      const video = videoRef.current;
      if (video) {
        // 禁用错误处理以避免循环
        errorHandlingDisabledRef.current = true;
        
        video.src = proxyUrl;
        video.load();
        
        // 重新启用错误处理
        setTimeout(() => {
          errorHandlingDisabledRef.current = false;
        }, 1000);
        
        video.addEventListener('loadeddata', () => {
          console.log('[VideoPlayer] ✅ Proxy playback successful!');
          setVideoError(null);
        }, { once: true });
        
        video.addEventListener('error', (e) => {
          console.error('[VideoPlayer] ❌ Proxy playback also failed:', video.error);
          setVideoError('视频无法播放，请稍后重试');
        }, { once: true });
      }
    } catch (error) {
      console.error('[VideoPlayer] ❌ Failed to setup proxy playback:', error);
      setVideoError('视频加载失败');
    }
  };

  // 🆕 从M3U8播放列表中提取MP4文件URL
  const extractMp4FromM3u8 = async (m3u8Url: string): Promise<string[]> => {
    try {
      console.log('[VideoPlayer] 📥 Fetching M3U8 playlist to extract MP4 URLs...');
      console.log('[VideoPlayer] M3U8 URL:', m3u8Url);
      
      // 🆕 添加超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
      
      try {
        const response = await fetch(m3u8Url, { 
          signal: controller.signal,
          mode: 'cors',
          cache: 'no-cache'
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          console.error('[VideoPlayer] ❌ Failed to fetch M3U8:', response.status, response.statusText);
          return [];
        }
        
        const playlistText = await response.text();
        console.log('[VideoPlayer] 📄 M3U8 content preview:', playlistText.substring(0, 500));
        
        // 解析M3U8播放列表，提取MP4 URL
        const mp4Urls: string[] = [];
        const lines = playlistText.split('\n');
        
        // 从M3U8 URL中提取基础路径
        const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);
        console.log('[VideoPlayer] Base URL:', baseUrl);
        
        for (const line of lines) {
          const trimmed = line.trim();
          // 跳过注释行、空行和标签
          if (!trimmed || trimmed.startsWith('#')) continue;
          
          // 检查是否是MP4文件（可能是完整URL或相对路径）
          if (trimmed.includes('.mp4')) {
            let mp4Url = trimmed;
            
            // 如果是相对路径，转换为绝对路径
            if (!mp4Url.startsWith('http')) {
              mp4Url = baseUrl + mp4Url;
            }
            
            console.log('[VideoPlayer] ✅ Found MP4:', mp4Url);
            mp4Urls.push(mp4Url);
          }
        }
        
        console.log(`[VideoPlayer] ✅ Total MP4 files found: ${mp4Urls.length}`);
        if (mp4Urls.length === 0) {
          console.error('[VideoPlayer] ❌ No MP4 URLs found in M3U8 playlist');
          console.error('[VideoPlayer] Playlist content:', playlistText);
        }
        
        return mp4Urls;
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          console.error('[VideoPlayer] ❌ M3U8 fetch timed out after 10 seconds');
          throw new Error('视频播放列表获取超时');
        }
        throw fetchError;
      }
    } catch (error: any) {
      console.error('[VideoPlayer] ❌ Failed to parse M3U8:', error.message || error);
      return [];
    }
  };

  // 🆕 切换到直接MP4播放（回退机制）
  const fallbackToDirectMp4 = async () => {
    if (fallbackAttemptedRef.current) {
      console.warn('[VideoPlayer] ⚠️ Fallback already attempted, cleaning up video source...');
      
      // 🆕 禁用error处理，避免清除video源后仍触发error事件
      errorHandlingDisabledRef.current = true;
      
      // 🆕 即使已尝试回退，也要确保清除video源，停止无限重试
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      
      const video = videoRef.current;
      if (video && video.src && video.src.includes('.m3u8')) {
        video.removeAttribute('src');
        video.load();
        console.log('[VideoPlayer] 🛑 Video source cleared on repeat fallback attempt');
      }
      
      setVideoError('视频文件不可用，请稍后重试');
      if (onError) {
        onError(new Error('视频文件无法播放'));
      }
      return;
    }
    
    fallbackAttemptedRef.current = true;
    console.log('[VideoPlayer] 🔄 HLS failed, attempting fallback to direct MP4 playback...');
    console.log('[VideoPlayer] Current video source:', videoSrc);
    
    try {
      // 从M3U8中提取MP4文件
      const mp4Urls = await extractMp4FromM3u8(videoSrc);
      
      if (mp4Urls.length > 0) {
        const firstMp4 = mp4Urls[0];
        console.log('[VideoPlayer] ✅ Falling back to first MP4:', firstMp4);
        
        // 销毁HLS实例
        if (hlsRef.current) {
          console.log('[VideoPlayer] 🗑️ Destroying HLS instance...');
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
        
        // 切换到直接MP4播放
        setUseDirectMp4(true);
        const video = videoRef.current;
        if (video) {
          console.log('[VideoPlayer] 🎬 Setting video source to MP4...');
          video.src = firstMp4;
          video.load();
          
          // 添加加载成功/失败监听
          video.addEventListener('loadeddata', () => {
            console.log('[VideoPlayer] ✅ MP4 loaded successfully!');
          }, { once: true });
          
          video.addEventListener('error', (e) => {
            console.error('[VideoPlayer] ❌ MP4 load failed:', {
              error: video.error,
              src: video.src,
              networkState: video.networkState,
              readyState: video.readyState
            });
          }, { once: true });
          
          // 尝试自动播放
          video.play().catch(e => {
            console.log('[VideoPlayer] ℹ️ Auto-play prevented:', e.message);
          });
        } else {
          console.error('[VideoPlayer] ❌ Video element not found');
        }
      } else {
        console.error('[VideoPlayer] ❌ No MP4 files found in M3U8 playlist, using HLS fallback');
        // 尝试使用HLS播放原始M3U8
        loadVideoWithHLS(videoSrc);
        
        // 🚫 禁用自动播放
        // if (autoPlay) {
        //   video.play().catch(e => {
        //     console.log('[VideoPlayer] ℹ️ Auto-play prevented:', e.message);
        //   });
        // }
      }
    } catch (error) {
      console.error('[VideoPlayer] ❌ Fallback failed with exception:', error);
      
      // 🆕 禁用error处理
      errorHandlingDisabledRef.current = true;
      
      // 🆕 清除失败的video源
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      
      const video = videoRef.current;
      if (video) {
        video.removeAttribute('src');
        video.load();
        console.log('[VideoPlayer] 🛑 Video source cleared after fallback exception');
      }
      
      setVideoError('视频加载失败');
      if (onError) {
        onError(error);
      }
    }
  };

  // 🆕 获取OSS签名URL
  const convertToSignedUrl = async (url: string): Promise<string> => {
    try {
      // ⚠️ 如果OSS Bucket是公开读权限，直接返回原URL，不需要签名
      // 💡 你可以通过设置环境变量来控制是否需要签名
      const needsSignature = false; // 🔧 改为true如果bucket是私有的
      
      // 🔧 移除URL中的query参数（可能导致CORS问题）
      if (url.includes('?')) {
        console.log('[VideoPlayer] 🔧 Detected query parameters in URL, removing them...');
        const cleanUrl = url.split('?')[0];
        console.log('[VideoPlayer] Original URL:', url.substring(0, 150) + '...');
        console.log('[VideoPlayer] Clean URL:', cleanUrl.substring(0, 150) + '...');
        url = cleanUrl;
      }
      
      // 只处理OSS URL且需要签名的情况
      if (!url.includes('aliyuncs.com') || !needsSignature) {
        console.log('[VideoPlayer] Using original URL (no signature needed):', url.substring(0, 100) + '...');
        return url;
      }

      console.log('[VideoPlayer] Converting OSS URL to signed URL:', url.substring(0, 100) + '...');
      setIsLoadingSignedUrl(true);

      // 🔧 使用OSS签名API替代代理URL
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc31472c/oss/sign-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        console.error('[VideoPlayer] Failed to sign URL:', response.status, await response.text());
        return url; // 返回原URL作为fallback
      }

      const result = await response.json();
      if (result.success && result.data?.signedUrl) {
        console.log('[VideoPlayer] ✅ Got signed URL');
        return result.data.signedUrl;
      }
      
      console.error('[VideoPlayer] Sign URL response invalid:', result);
      return url; // 返回原URL作为fallback
    } catch (error: any) {
      console.error('[VideoPlayer] Error creating signed URL:', error);
      return url; // 出错则返回原URL
    } finally {
      setIsLoadingSignedUrl(false);
    }
  };

  useEffect(() => {
    if (!videoSrc) {
      console.warn('[VideoPlayer] ⚠️ No video source provided');
      setVideoError('没有视频源');
      return;
    }

    console.log('[VideoPlayer] 🎬 Initializing video playback...');
    console.log('[VideoPlayer] Original src:', videoSrc);
    console.log('[VideoPlayer] Src length:', videoSrc.length);
    console.log('[VideoPlayer] Src preview:', videoSrc.substring(0, 200));
    console.log('[VideoPlayer] 🔧 crossOrigin: anonymous, playsInline: true'); // 🆕 添加日志确认
    
    // 🔧 检查URL有效性
    if (!videoSrc.startsWith('http://') && !videoSrc.startsWith('https://')) {
      console.error('[VideoPlayer] ❌ Invalid URL scheme:', videoSrc.substring(0, 50));
      setVideoError('无效的视频URL');
      return;
    }
    
    const initializeVideo = async () => {
      // 🔧 定义 video 元素引用
      const video = videoRef.current;
      if (!video) {
        console.error('[VideoPlayer] ❌ Video element not available');
        setVideoError('视频元素未就绪');
        return;
      }
      
      // 首先尝试获取签名URL
      const finalSrc = await convertToSignedUrl(src);
      setVideoSrc(finalSrc);

      // 🆕 添加详细的错误处理
      const handleVideoError = async (e: Event) => {
        // 🆕 如果error处理已禁用，直接返回
        if (errorHandlingDisabledRef.current) {
          console.log('[VideoPlayer] ⏭️ Error handling disabled, skipping error event');
          return;
        }
        
        console.error('[VideoPlayer] ❌ Video error event:', e);
        console.error('[VideoPlayer] Video error details:', {
          src: finalSrc.substring(0, 150) + '...',
          errorCode: video.error?.code,
          errorMessage: video.error?.message,
          networkState: video.networkState,
          readyState: video.readyState,
        });
        
        // 🔧 只在Error Code 4 (MEDIA_ERR_SRC_NOT_SUPPORTED) 时进行深度诊断
        if (video.error?.code === 4) {
          console.warn('[VideoPlayer] 🔍 Format error (code 4) - running diagnosis...');
          
          // 测试URL是否可访问
          try {
            console.log('[VideoPlayer] 🔍 Step 1: Testing URL accessibility...');
            
            // 🔧 使用no-cors模式避免CORS阻止诊断
            const testResponse = await fetch(finalSrc, { 
              method: 'HEAD',
              mode: 'no-cors' // 改为no-cors以绕过CORS限制
            }).catch(async (corsError) => {
              console.warn('[VideoPlayer] ⚠️ CORS blocked HEAD request, trying GET with no-cors...');
              // HEAD请求失败，尝试GET
              return await fetch(finalSrc, {
                method: 'GET',
                mode: 'no-cors',
                headers: { 'Range': 'bytes=0-8191' }
              });
            });
            
            console.log('[VideoPlayer] 📊 URL test response:', {
              type: testResponse.type,
              status: testResponse.status,
              ok: testResponse.ok,
            });
            
            // 🔧 如果是opaque响应（no-cors的结果），说明CORS有问题
            if (testResponse.type === 'opaque') {
              console.error('[VideoPlayer] ❌ CORS policy blocking video access!');
              console.error('[VideoPlayer] 📋 This indicates OSS CORS rules may not be properly configured.');
              setVideoError('CORS配置异常，正在尝试代理模式...');
              
              // 立即尝试代理模式
              await tryProxyPlayback(finalSrc);
              return;
            }
            
            // 正常响应，继续诊断
            if (testResponse.ok || testResponse.status === 206) {
              console.log('[VideoPlayer] ✅ URL is accessible');
              
              const contentType = testResponse.headers.get('Content-Type');
              const contentLength = testResponse.headers.get('Content-Length');
              const corsHeader = testResponse.headers.get('Access-Control-Allow-Origin');
              
              console.log('[VideoPlayer] 📊 Response headers:', {
                contentType,
                contentLength,
                accessControlAllowOrigin: corsHeader,
              });
              
              // 检查CORS头
              if (!corsHeader || (corsHeader !== '*' && corsHeader !== window.location.origin)) {
                console.error('[VideoPlayer] ❌ CORS header missing or invalid:', corsHeader);
                console.error('[VideoPlayer] Expected: "*" or', window.location.origin);
                setVideoError('CORS配置异常，正在尝试代理模式...');
                
                // 尝试代理播放
                await tryProxyPlayback(finalSrc);
                return;
              }
              
              // CORS正常，可能是编码问题
              console.log('[VideoPlayer] 🔍 Step 2: Downloading video sample to check format...');
              
              // 下载前几KB检查文件格式
              const sampleResponse = await fetch(finalSrc, {
                headers: { 'Range': 'bytes=0-8191' } // 前8KB
              });
              
              if (sampleResponse.ok || sampleResponse.status === 206) {
                const blob = await sampleResponse.blob();
                console.log('[VideoPlayer] 📊 Video file info:', {
                  mimeType: blob.type,
                  size: blob.size,
                  reportedContentType: contentType,
                });
                
                // 读取文件头来识别真实格式
                const arrayBuffer = await blob.arrayBuffer();
                const bytes = new Uint8Array(arrayBuffer);
                const signature = Array.from(bytes.slice(0, 12))
                  .map(b => b.toString(16).padStart(2, '0'))
                  .join(' ');
                
                console.log('[VideoPlayer] 📊 File signature (hex):', signature);
                
                // 检测文件格式
                let detectedFormat = 'Unknown';
                if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x00 && 
                    (bytes[3] === 0x18 || bytes[3] === 0x20) && bytes[4] === 0x66 && 
                    bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
                  detectedFormat = 'MP4';
                } else if (bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) {
                  detectedFormat = 'WebM/Matroska';
                } else if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x00 && 
                          bytes[3] === 0x14 && bytes[8] === 0x66 && bytes[9] === 0x74 && 
                          bytes[10] === 0x79 && bytes[11] === 0x70) {
                  detectedFormat = 'MP4';
                } else if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
                  detectedFormat = 'AVI/RIFF';
                }
                
                console.log('[VideoPlayer] 🔍 Detected format:', detectedFormat);
                
                if (detectedFormat === 'Unknown') {
                  console.error('[VideoPlayer] ❌ Unrecognized video format! File may be corrupted or in unsupported format.');
                  setVideoError('视频格式不支持或文件损坏');
                } else if (detectedFormat === 'WebM/Matroska') {
                  console.warn('[VideoPlayer] ⚠️ WebM format detected - checking browser support...');
                  const testVideo = document.createElement('video');
                  const webmSupport = testVideo.canPlayType('video/webm; codecs="vp8, vorbis"');
                  const webmVP9Support = testVideo.canPlayType('video/webm; codecs="vp9, opus"');
                  console.log('[VideoPlayer] WebM support:', { vp8: webmSupport, vp9: webmVP9Support });
                  
                  if (!webmSupport && !webmVP9Support) {
                    console.error('[VideoPlayer] ❌ Browser does not support WebM format!');
                    setVideoError('当前浏览器不支持WebM格式，请使用Chrome或Firefox');
                  } else {
                    console.error('[VideoPlayer] ⚠️ WebM is supported but still failed - may be codec issue');
                    setVideoError('视频编码不兼容，可能需要重新生成');
                  }
                } else if (detectedFormat === 'MP4') {
                  console.error('[VideoPlayer] ⚠️ MP4 format detected but playback failed - likely codec incompatibility');
                  setVideoError('MP4编码不兼容，建议重新生成视频');
                }
              } else {
                console.error('[VideoPlayer] ❌ Failed to download video sample:', sampleResponse.status);
                setVideoError('无法下载视频样本进行分析');
              }
            } else {
              console.error('[VideoPlayer] ❌ URL not accessible:', testResponse.status, testResponse.statusText);
              setVideoError(`视频文件不可访问 (${testResponse.status})`);
            }
            
          } catch (fetchError: any) {
            console.error('[VideoPlayer] ❌ Failed during diagnosis:', fetchError);
            console.error('[VideoPlayer] Error details:', {
              name: fetchError.name,
              message: fetchError.message,
            });
            
            // 诊断失败，可能是网络或CORS问题，尝试代理
            setVideoError('视频访问受限，正在尝试代理模式...');
            await tryProxyPlayback(finalSrc);
            return;
          }
        }

        if (onError) {
          onError(e);
        }
      };

      // 检查是否是M3U8文件
      const isM3U8 = finalSrc.endsWith('.m3u8') || finalSrc.includes('.m3u8?');

      // 如果已经在使用直接MP4，不要再次初始化HLS
      if (useDirectMp4) {
        console.log('[VideoPlayer] 📹 Using direct MP4 playback');
        video.src = finalSrc;
        video.addEventListener('loadedmetadata', () => {
          console.log('[VideoPlayer] Video loaded (direct MP4)');
          if (onLoadedMetadata) {
            onLoadedMetadata();
          }
        });
        video.addEventListener('error', handleVideoError);
        return;
      }

      if (isM3U8 && Hls.isSupported()) {
        // 使用HLS.js播放M3U8
        console.log('[VideoPlayer] 📺 Initializing HLS playback...');
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
        });
        
        hlsRef.current = hls;
        
        hls.loadSource(finalSrc);
        hls.attachMedia(video);
        
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          console.log('[VideoPlayer] ✅ M3U8 manifest parsed successfully');
          if (onLoadedMetadata) {
            onLoadedMetadata();
          }
        });
        
        hls.on(Hls.Events.ERROR, (event, data) => {
          hlsErrorCountRef.current++;
          
          // 🆕 特殊处理：fragParsingError 错误
          if (data.details === 'fragParsingError') {
            console.error(`[VideoPlayer] ⚠️  Fragment parsing error (#${hlsErrorCountRef.current}):`, data.reason || 'Unknown');
            
            // 如果是致命错误，或者连续错误超过3次，触发回退
            if (data.fatal || hlsErrorCountRef.current >= 3) {
              console.error('[VideoPlayer] 🚨 Too many fragment errors or fatal error, falling back to MP4...');
              fallbackToDirectMp4();
              return;
            }
            
            // 非致命错误，继续播放
            return;
          }
          
          // 🆕 其他HLS错误处理
          if (data.fatal) {
            console.error('[VideoPlayer] 🚨 Fatal HLS error:', data.type, data.details);
            
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.error('[VideoPlayer] Fatal network error, attempting recovery...');
                hls.startLoad();
                break;
                
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.error('[VideoPlayer] Fatal media error, attempting recovery...');
                try {
                  hls.recoverMediaError();
                } catch (recoverError) {
                  console.error('[VideoPlayer] Recovery failed, falling back to MP4...');
                  fallbackToDirectMp4();
                }
                break;
                
              default:
                console.error('[VideoPlayer] Unrecoverable fatal error, falling back to MP4...');
                fallbackToDirectMp4();
                break;
            }
            
            if (onError) {
              onError(data);
            }
          } else {
            // 非致命错误
            console.warn('[VideoPlayer] ⚠️  Non-fatal HLS error:', data.type, data.details);
          }
        });
      } else if (isM3U8 && video.canPlayType('application/vnd.apple.mpegurl')) {
        // iOS/Safari原生支持HLS
        console.log('[VideoPlayer] 🍎 Using native HLS playback (iOS/Safari)');
        video.src = finalSrc;
        video.addEventListener('loadedmetadata', () => {
          console.log('[VideoPlayer] Native HLS loaded');
          if (onLoadedMetadata) {
            onLoadedMetadata();
          }
        });
        video.addEventListener('error', handleVideoError);
      } else {
        // 普通MP4或其他格式
        console.log('[VideoPlayer] 📹 Using standard video playback');
        video.src = finalSrc;
        video.addEventListener('loadedmetadata', () => {
          console.log('[VideoPlayer] Video loaded:', finalSrc.substring(0, 150) + '...');
          if (onLoadedMetadata) {
            onLoadedMetadata();
          }
        });
        video.addEventListener('error', handleVideoError);
      }
    };

    initializeVideo();

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src, useDirectMp4, onError, onLoadedMetadata]);

  if (isLoadingSignedUrl) {
    return (
      <div className={`${className} flex items-center justify-center bg-black/50 rounded-lg`}>
        <div className="text-white text-sm">正在加载视频...</div>
      </div>
    );
  }

  return (
    <>
      {useDirectMp4 && (
        <div className="absolute top-2 left-2 bg-yellow-500/90 text-black px-2 py-1 rounded text-xs z-10">
          🔄 使用备用播放模式
        </div>
      )}
      <video
        ref={videoRef}
        className={className}
        controls={controls}
        preload={preload}
        crossOrigin="anonymous"
        playsInline
        style={style}
      >
        您的浏览器不支持视频播放。
      </video>
      {videoError && (
        <div className="absolute bottom-2 left-2 bg-red-500/90 text-white px-2 py-1 rounded text-xs z-10">
          {videoError}
        </div>
      )}
    </>
  );
}