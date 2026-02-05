import { motion } from 'motion/react';
import { Play, Edit, Trash2, Loader2, Image as ImageIcon } from 'lucide-react';
import { Button } from '../ui/button';
import { VideoPlayer } from '../VideoPlayer';
import type { Storyboard, Character } from '../../types';

interface StoryboardCardProps {
  storyboard: Storyboard;
  index: number;
  characters: Character[];
  onEdit: (storyboard: Storyboard) => void;
  onDelete: (id: string) => void;
  onGenerate: (storyboard: Storyboard) => void;
}

const CAMERA_ANGLES = [
  { id: 'close-up', name: '特写', icon: '👁️' },
  { id: 'medium', name: '中景', icon: '👤' },
  { id: 'wide', name: '远景', icon: '🌄' },
  { id: 'overhead', name: '俯视', icon: '⬇️' },
  { id: 'low-angle', name: '仰视', icon: '⬆️' },
];

const TIME_OF_DAY = [
  { id: 'morning', name: '早晨', icon: '🌅' },
  { id: 'noon', name: '中午', icon: '☀️' },
  { id: 'afternoon', name: '下午', icon: '🌤️' },
  { id: 'evening', name: '傍晚', icon: '🌆' },
  { id: 'night', name: '夜晚', icon: '🌙' },
];

export function StoryboardCard({
  storyboard,
  index,
  characters,
  onEdit,
  onDelete,
  onGenerate,
}: StoryboardCardProps) {
  // ✅ 支持 snake_case 和 camelCase 字段名
  const videoUrl = storyboard.videoUrl || (storyboard as any).video_url;
  const thumbnailUrl = storyboard.thumbnailUrl || (storyboard as any).thumbnail_url;
  const hasVideo = !!videoUrl;

  // 🐛 调试日志 - 增强诊断信息
  console.log(`[StoryboardCard] 🎬 Rendering Storyboard ${index + 1}:`, {
    id: storyboard.id,
    sceneNumber: storyboard.sceneNumber,
    status: storyboard.status,
    videoUrl,
    video_url: (storyboard as any).video_url,
    hasVideo,
    videoUrlType: typeof videoUrl,
    videoUrlValue: videoUrl === null ? 'null' : videoUrl === undefined ? 'undefined' : 'has value',
    thumbnailUrl,
    urlLength: videoUrl?.length || 0,
    urlPreview: videoUrl ? videoUrl.substring(0, 100) + '...' : 'N/A',
    hasResponseType: videoUrl ? videoUrl.includes('response-content-type') : false,
    hasResponseDisposition: videoUrl ? videoUrl.includes('response-content-disposition') : false,
    urlIsValid: videoUrl ? (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) : false,
    urlIsOSS: videoUrl ? (videoUrl.includes('aliyuncs.com') || videoUrl.includes('oss-')) : false,
  });

  return (
    <motion.div
      key={storyboard.id}
      whileHover={{ y: -4 }}
      className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden group"
    >
      {/* 缩略图区域 */}
      <div className="relative aspect-video bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
        {storyboard.imageUrl ? (
          <img 
            src={storyboard.imageUrl} 
            alt={`Scene ${storyboard.sceneNumber}`} 
            className="w-full h-full object-cover" 
          />
        ) : hasVideo ? (
          // ✅ 使用 VideoPlayer 组件而不是原生 <video> 标签
          <div className="w-full h-full relative">
            <VideoPlayer
              src={videoUrl}
              className="w-full h-full object-cover"
              controls
              preload="metadata"
              onError={(err) => {
                console.error(`[StoryboardCard] ❌ Video error for scene ${storyboard.sceneNumber}:`, err);
              }}
              onLoadedMetadata={() => {
                console.log(`[StoryboardCard] ✅ Video loaded for scene ${storyboard.sceneNumber}`);
              }}
            />
          </div>
        ) : (
          <ImageIcon className="w-16 h-16 text-gray-600" />
        )}
        
        {/* 场景编号 */}
        <div className="absolute top-3 left-3 px-3 py-1 bg-black/60 backdrop-blur-xl rounded-lg">
          <span className="text-white font-bold text-sm">场景 {storyboard.sceneNumber}</span>
        </div>

        {/* 状态标签 */}
        <div className="absolute top-3 right-3">
          {storyboard.status === 'generating' && (
            <div className="px-3 py-1 bg-blue-500/20 backdrop-blur-xl border border-blue-500/30 rounded-lg flex items-center gap-2">
              <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
              <span className="text-blue-400 text-xs font-medium">生成中</span>
            </div>
          )}
          {/* ✅ 修复：有视频就显示已完成 */}
          {hasVideo && storyboard.status !== 'generating' && (
            <div className="px-3 py-1 bg-green-500/20 backdrop-blur-xl border border-green-500/30 rounded-lg">
              <span className="text-green-400 text-xs font-medium">✅ 已完成</span>
            </div>
          )}
        </div>

        {/* ✅ 修复：只在没有视频且不在生成中时显示生成按钮 */}
        {!hasVideo && storyboard.status !== 'generating' && (
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <Button
              onClick={() => onGenerate(storyboard)}
              size="sm"
              className="bg-purple-500/20 hover:bg-purple-500/30 backdrop-blur-xl border border-purple-500/30"
            >
              <Play className="w-4 h-4 mr-1" />
              生成视频
            </Button>
          </div>
        )}
        
        {/* 如果已有视频，显示播放提示 */}
        {hasVideo && storyboard.status !== 'generating' && (
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <div className="text-white text-sm font-medium flex items-center gap-2">
              <Play className="w-5 h-5" />
              点击播放
            </div>
          </div>
        )}
      </div>

      {/* 内容区域 */}
      <div className="p-4">
        <p className="text-white text-sm mb-3 line-clamp-2">
          {storyboard.description}
        </p>

        {storyboard.dialogue && (
          <div className="mb-3 p-2 bg-white/5 rounded-lg">
            <p className="text-xs text-gray-400 italic">"{storyboard.dialogue}"</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-3 text-xs">
          {storyboard.location && (
            <span className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded">
              📍 {storyboard.location}
            </span>
          )}
          {storyboard.timeOfDay && (
            <span className="px-2 py-1 bg-purple-500/10 text-purple-400 rounded">
              {TIME_OF_DAY.find(t => t.id === storyboard.timeOfDay)?.icon} {TIME_OF_DAY.find(t => t.id === storyboard.timeOfDay)?.name}
            </span>
          )}
          {storyboard.cameraAngle && (
            <span className="px-2 py-1 bg-pink-500/10 text-pink-400 rounded">
              {CAMERA_ANGLES.find(a => a.id === storyboard.cameraAngle)?.name}
            </span>
          )}
          <span className="px-2 py-1 bg-gray-500/10 text-gray-400 rounded">
            {storyboard.duration}秒
          </span>
        </div>

        {/* 角色标签 */}
        {storyboard.characters.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {storyboard.characters.map(charId => {
              const char = characters.find(c => c.id === charId);
              return char ? (
                <span key={charId} className="px-2 py-1 bg-white/5 text-gray-300 rounded text-xs">
                  {char.name}
                </span>
              ) : null;
            })}
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex gap-2">
          <Button
            onClick={() => onEdit(storyboard)}
            size="sm"
            variant="ghost"
            className="flex-1"
          >
            <Edit className="w-3 h-3 mr-1" />
            编辑
          </Button>
          <Button
            onClick={() => onDelete(storyboard.id)}
            size="sm"
            variant="ghost"
            className="text-red-400 hover:text-red-300"
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
