import { useState } from 'react';
import { motion } from 'motion/react';
import { 
  ArrowLeft, Plus, Wand2, Image as ImageIcon, 
  Check, X 
} from 'lucide-react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { toast } from 'sonner';
import { StoryboardCard } from './StoryboardCard';
import { StoryboardVideoMerger } from './StoryboardVideoMerger';
import type { Episode, Character, Storyboard } from '../../types';
import * as seriesVideoService from '@/app/services/seriesVideoService';
import * as aiGenerationService from '@/app/services/aiGenerationService';

interface StoryboardEditorProps {
  episode: Episode;
  characters: Character[];
  style: string;
  seriesId: string;
  userPhone: string;
  onBack: () => void;
  onUpdate: (storyboards: Storyboard[]) => void;
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

export function StoryboardEditor({ 
  episode, 
  characters, 
  style, 
  seriesId, 
  userPhone, 
  onBack, 
  onUpdate 
}: StoryboardEditorProps) {
  const [storyboards, setStoryboards] = useState<Storyboard[]>(episode.storyboards || []); // 🔥 FIX: 添加默认空数组
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState<Partial<Storyboard>>({
    description: '',
    dialogue: '',
    characters: [],
    location: '',
    timeOfDay: 'morning',
    cameraAngle: 'medium',
    duration: 8,
  });

  // 🔍 调试：输出episode和storyboards的详细信息
  console.log('[StoryboardEditor] 🔍 Component initialized with:');
  console.log('  - Episode ID:', episode.id);
  console.log('  - Episode Number:', episode.episodeNumber);
  console.log('  - Episode Title:', episode.title);
  console.log('  - Storyboards count:', episode.storyboards?.length || 0);
  console.log('  - Merged Video URL:', episode.mergedVideoUrl);
  console.log('  - Full episode object:', episode);
  
  // 详细检查每个storyboard - 🔥 FIX: 添加安全检查
  if (episode.storyboards && Array.isArray(episode.storyboards)) {
    episode.storyboards.forEach((sb, idx) => {
      const videoUrl = sb.videoUrl || (sb as any).video_url;
      const thumbnailUrl = sb.thumbnailUrl || (sb as any).thumbnail_url;
      
      console.log(`[StoryboardEditor] 📹 Storyboard ${idx + 1} Initial Data:`, {
        id: sb.id,
        sceneNumber: sb.sceneNumber,
        status: sb.status,
        videoUrl: videoUrl,
        videoUrlFull: videoUrl ? videoUrl : 'NO VIDEO URL',
        videoUrlType: typeof videoUrl,
        videoUrlLength: videoUrl?.length,
        urlStartsWith: videoUrl ? videoUrl.substring(0, 50) : 'N/A',
        thumbnailUrl: thumbnailUrl,
        hasVideoUrl: !!videoUrl,
      });
    });
  } else {
    console.warn('[StoryboardEditor] ⚠️ No storyboards found in episode');
  }

  const handleAdd = () => {
    if (!formData.description) return;

    const newStoryboard: Storyboard = {
      id: `sb-${Date.now()}`,
      episodeId: episode.id,
      sceneNumber: storyboards.length + 1,
      description: formData.description,
      dialogue: formData.dialogue,
      characters: formData.characters || [],
      location: formData.location || '',
      timeOfDay: formData.timeOfDay as Storyboard['timeOfDay'],
      cameraAngle: formData.cameraAngle as Storyboard['cameraAngle'],
      duration: formData.duration || 8,
      status: 'draft',
    };

    const updated = [...storyboards, newStoryboard];
    setStoryboards(updated);
    onUpdate(updated);
    handleCancel();
  };

  const handleEdit = (storyboard: Storyboard) => {
    setEditingId(storyboard.id);
    setFormData(storyboard);
  };

  const handleUpdate = () => {
    if (!editingId || !formData.description) return;

    const updated = storyboards.map(sb =>
      sb.id === editingId ? { ...sb, ...formData } as Storyboard : sb
    );
    setStoryboards(updated);
    onUpdate(updated);
    handleCancel();
  };

  const handleDelete = (id: string) => {
    if (confirm('确定要删除这个分镜吗？')) {
      const updated = storyboards
        .filter(sb => sb.id !== id)
        .map((sb, index) => ({ ...sb, sceneNumber: index + 1 }));
      setStoryboards(updated);
      onUpdate(updated);
    }
  };

  const handleGenerate = async (storyboard: Storyboard) => {
    console.log('[StoryboardEditor] 🎬 Starting video generation for:', storyboard.id);
    
    // 立即更新UI状态为"生成中"
    const updatedGenerating = storyboards.map(sb =>
      sb.id === storyboard.id ? { ...sb, status: 'generating' as const } : sb
    );
    setStoryboards(updatedGenerating);
    onUpdate(updatedGenerating);

    // 调用视频生成服务
    try {
      const videoUrl = await seriesVideoService.generateStoryboardVideo(seriesId, userPhone, storyboard);
      console.log('[StoryboardEditor] ✅ Video generated:', videoUrl);
      
      // ✅ 更新状态为已完成，并设置videoUrl
      const updatedCompleted = storyboards.map(sb =>
        sb.id === storyboard.id 
          ? { ...sb, status: 'completed' as const, videoUrl: videoUrl } 
          : sb
      );
      setStoryboards(updatedCompleted);
      onUpdate(updatedCompleted);
      
      toast.success('✅ 视频生成成功！');
    } catch (error: any) {
      console.error('[StoryboardEditor] ❌ Failed to generate video:', error);
      
      // 恢复为draft状态
      const failedUpdated = storyboards.map(sb =>
        sb.id === storyboard.id 
          ? { ...sb, status: 'draft' as const, error: error.message } 
          : sb
      );
      setStoryboards(failedUpdated);
      onUpdate(failedUpdated);
      
      toast.error('视频生成失败：' + error.message);
    }
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setFormData({
      description: '',
      dialogue: '',
      characters: [],
      location: '',
      timeOfDay: 'morning',
      cameraAngle: 'medium',
      duration: 8,
    });
  };

  const handleGenerateAIScript = async () => {
    try {
      toast.info('正在使用AI生成分镜...');
      console.log('[StoryboardEditor] 🎬 Starting AI storyboard generation for episode:', episode.id);
      
      // 调用AI生成分镜API
      const result = await aiGenerationService.generateStoryboardsAI(episode.id, 10);
      
      if (result.success && result.data) {
        console.log('[StoryboardEditor] ✅ AI generated storyboards:', result.data);
        
        // 将生成的分镜添加到列表中
        const newStoryboards = result.data.storyboards || [];
        const updated = [...storyboards, ...newStoryboards];
        setStoryboards(updated);
        onUpdate(updated);
        
        toast.success(`✅ AI成功生成 ${newStoryboards.length} 个分镜！`);
      } else {
        toast.error('AI生成分镜失败：' + (result.error || '未知错误'));
      }
    } catch (error: any) {
      console.error('[StoryboardEditor] ❌ AI generation error:', error);
      toast.error('AI生成分镜失败：' + error.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            onClick={onBack}
            variant="ghost"
            size="sm"
            className="text-gray-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h2 className="text-xl font-bold text-white mb-1">
              第 {episode.episodeNumber} 集 - 分镜编辑
            </h2>
            <p className="text-sm text-gray-400">{storyboards.length} 个分镜</p>
          </div>
        </div>
        <div className="flex gap-2">
          {storyboards.length === 0 && (
            <Button
              onClick={handleGenerateAIScript}
              className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
            >
              <Wand2 className="w-4 h-4 mr-2" />
              AI生成分镜
            </Button>
          )}
          {!isAdding && !editingId && (
            <>
              <Button
                onClick={() => setIsAdding(true)}
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
              >
                <Plus className="w-4 h-4 mr-2" />
                添加分镜
              </Button>
              {/* 视频合并组件 */}
              <StoryboardVideoMerger
                episode={episode}
                storyboards={storyboards}
                seriesId={seriesId}
                userPhone={userPhone}
              />
            </>
          )}
        </div>
      </div>

      {/* 添加/编辑表单 */}
      {(isAdding || editingId) && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10"
        >
          <h3 className="text-lg font-semibold text-white mb-4">
            {editingId ? '编辑分镜' : '新建分镜'}
          </h3>

          <div className="space-y-4">
            {/* 场景描述 */}
            <div>
              <Label className="text-white mb-2 block">场景描述 *</Label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="详细描述这个场景中发生的事情、环境、氛围等"
                rows={3}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              />
            </div>

            {/* 对白 */}
            <div>
              <Label className="text-white mb-2 block">对白（可选）</Label>
              <textarea
                value={formData.dialogue}
                onChange={(e) => setFormData({ ...formData, dialogue: e.target.value })}
                placeholder="角色台词或旁白"
                rows={2}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 场景位置 */}
              <div>
                <Label className="text-white mb-2 block">场景位置</Label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="例如：咖啡厅、公园"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* 时长 */}
              <div>
                <Label className="text-white mb-2 block">时长（秒）</Label>
                <input
                  type="number"
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 8 })}
                  min={5}
                  max={20}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>

            {/* 时间段 */}
            <div>
              <Label className="text-white mb-2 block">时间段</Label>
              <div className="grid grid-cols-5 gap-2">
                {TIME_OF_DAY.map((time) => (
                  <button
                    key={time.id}
                    onClick={() => setFormData({ ...formData, timeOfDay: time.id as Storyboard['timeOfDay'] })}
                    className={`p-3 rounded-xl text-center transition-all ${
                      formData.timeOfDay === time.id
                        ? 'bg-purple-500/20 border-2 border-purple-500 text-white'
                        : 'bg-white/5 border-2 border-white/10 text-gray-400 hover:border-white/20'
                    }`}
                  >
                    <div className="text-xl mb-1">{time.icon}</div>
                    <div className="text-xs">{time.name}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 镜头角度 */}
            <div>
              <Label className="text-white mb-2 block">镜头角度</Label>
              <div className="grid grid-cols-5 gap-2">
                {CAMERA_ANGLES.map((angle) => (
                  <button
                    key={angle.id}
                    onClick={() => setFormData({ ...formData, cameraAngle: angle.id as Storyboard['cameraAngle'] })}
                    className={`p-3 rounded-xl text-center transition-all ${
                      formData.cameraAngle === angle.id
                        ? 'bg-purple-500/20 border-2 border-purple-500 text-white'
                        : 'bg-white/5 border-2 border-white/10 text-gray-400 hover:border-white/20'
                    }`}
                  >
                    <div className="text-xl mb-1">{angle.icon}</div>
                    <div className="text-xs">{angle.name}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 角色选择 */}
            {characters.length > 0 && (
              <div>
                <Label className="text-white mb-2 block">出场角色</Label>
                <div className="flex flex-wrap gap-2">
                  {characters.map((character) => (
                    <button
                      key={character.id}
                      onClick={() => {
                        const chars = formData.characters || [];
                        const exists = chars.includes(character.id);
                        setFormData({
                          ...formData,
                          characters: exists
                            ? chars.filter(id => id !== character.id)
                            : [...chars, character.id]
                        });
                      }}
                      className={`px-4 py-2 rounded-lg text-sm transition-all ${
                        formData.characters?.includes(character.id)
                          ? 'bg-purple-500/20 border-2 border-purple-500 text-white'
                          : 'bg-white/5 border-2 border-white/10 text-gray-400 hover:border-white/20'
                      }`}
                    >
                      {character.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <Button onClick={handleCancel} variant="ghost">
              <X className="w-4 h-4 mr-2" />
              取消
            </Button>
            <Button
              onClick={editingId ? handleUpdate : handleAdd}
              disabled={!formData.description}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50"
            >
              <Check className="w-4 h-4 mr-2" />
              {editingId ? '更新' : '添加'}
            </Button>
          </div>
        </motion.div>
      )}

      {/* 分镜列表 */}
      {storyboards.length === 0 ? (
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-12 border border-white/10 text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <ImageIcon className="w-10 h-10 text-purple-400" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">开始创建分镜</h3>
          <p className="text-gray-400 mb-6">
            可以使用AI自动生成分镜脚本，或手动添加
          </p>
          <div className="flex justify-center gap-3">
            <Button
              onClick={handleGenerateAIScript}
              className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
            >
              <Wand2 className="w-4 h-4 mr-2" />
              AI生成分镜
            </Button>
            <Button
              onClick={() => setIsAdding(true)}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              <Plus className="w-4 h-4 mr-2" />
              手动添加
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* 合并后的完整剧集视频展示 */}
          <StoryboardVideoMerger
            episode={episode}
            storyboards={storyboards}
            seriesId={seriesId}
            userPhone={userPhone}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {storyboards.map((storyboard, index) => (
              <StoryboardCard
                key={storyboard.id}
                storyboard={storyboard}
                index={index}
                characters={characters}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onGenerate={handleGenerate}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}