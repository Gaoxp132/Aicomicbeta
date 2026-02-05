import { useState } from 'react';
import { Loader2, Download, Film } from 'lucide-react';
import { Button } from '../ui/button';
import { VideoPlayer } from '../VideoPlayer';
import { PlaylistVideoPlayer } from '../PlaylistVideoPlayer';
import { toast } from 'sonner';
import { mergeEpisodeVideos } from '@/app/services/videoMerger';
import type { Episode, Storyboard } from '../../types';

interface StoryboardVideoMergerProps {
  episode: Episode;
  storyboards: Storyboard[];
  seriesId: string;
  userPhone: string;
  onMergeComplete?: (videoUrl: string) => void;
}

export function StoryboardVideoMerger({
  episode,
  storyboards,
  seriesId,
  userPhone,
  onMergeComplete,
}: StoryboardVideoMergerProps) {
  const [isMergingEpisode, setIsMergingEpisode] = useState(false);
  const [mergedVideoUrl, setMergedVideoUrl] = useState<string | null>(episode.mergedVideoUrl || null);

  // ✅ 检查是否有已生成的视频可以合并
  // 修改逻辑：同时检查 camelCase 和 snake_case 字段
  const hasVideosToMerge = storyboards.some(sb => sb.videoUrl || (sb as any).video_url);

  // 🆕 合并视频为整集
  const handleMergeEpisodeVideos = async () => {
    if (!hasVideosToMerge) {
      toast.error('没有可合并的视频！请先生成分镜视频。');
      return;
    }

    setIsMergingEpisode(true);
    
    try {
      console.log('[StoryboardVideoMerger] 🔗 Merging episode videos...');
      toast.info('正在合并分镜视频...');
      
      const result = await mergeEpisodeVideos(seriesId, episode.id, userPhone);
      
      if (result.success && result.videoUrl) {
        toast.success(`✅ 分集视频合并成功！\n\n视频地址：${result.videoUrl}`);
        console.log('[StoryboardVideoMerger] ✅ Episode merged:', result.videoUrl);
        setMergedVideoUrl(result.videoUrl);
        onMergeComplete?.(result.videoUrl);
      } else {
        toast.error('视频合并失败：' + (result.error || '未知错误'));
      }
    } catch (error: any) {
      console.error('[StoryboardVideoMerger] ❌ Failed to merge episode:', error);
      toast.error('视频合并失败：' + error.message);
    } finally {
      setIsMergingEpisode(false);
    }
  };

  return (
    <>
      {/* 合并按钮 */}
      {hasVideosToMerge && !mergedVideoUrl && (
        <Button
          onClick={handleMergeEpisodeVideos}
          disabled={isMergingEpisode}
          className="bg-gradient-to-r from-green-500 to-lime-500 hover:from-green-600 hover:to-lime-600 disabled:opacity-50"
        >
          {isMergingEpisode ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              合并中...
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" />
              合并分镜为分集
            </>
          )}
        </Button>
      )}

      {/* 🆕 合并后的完整剧集视频展示 - 直接显示视频播放器 */}
      {mergedVideoUrl && typeof mergedVideoUrl === 'string' && mergedVideoUrl.trim() && (() => {
        // 🔥 判断是JSON字符串还是URL
        const isJsonString = mergedVideoUrl.trim().startsWith('{');
        const isJsonUrl = mergedVideoUrl.trim().endsWith('.json');
        const isPlaylist = isJsonString || isJsonUrl;
        
        return (
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10 mb-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Film className="w-5 h-5 text-purple-400" />
              完整剧集视频
            </h3>
            {isPlaylist ? (
              // 播放列表格式（虚拟合并）- JSON字符串或JSON URL
              <PlaylistVideoPlayer
                playlistUrl={mergedVideoUrl}
                className="w-full rounded-lg"
                style={{ aspectRatio: '16/9' }}
              />
            ) : (
              // 单一视频文件或M3U8
              <VideoPlayer
                src={mergedVideoUrl}
                className="w-full rounded-lg bg-black"
                controls
                preload="metadata"
                style={{ aspectRatio: '16/9' }}
              />
            )}
          </div>
        );
      })()}
    </>
  );
}
