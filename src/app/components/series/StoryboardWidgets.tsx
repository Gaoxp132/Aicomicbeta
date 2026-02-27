/**
 * Storyboard widgets — merged to reduce module count
 * v6.0.68: Merged StoryboardCard.tsx + StoryboardForm.tsx
 * Both consumed only by StoryboardEditor.tsx.
 */

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Play, Edit, Trash2, Loader2, Image as ImageIcon, X, Check, RefreshCw, RotateCcw } from 'lucide-react';
import { Button, Label } from '../ui';
import { VideoPlayer } from '../VideoPlayer';
import type { Storyboard, Character } from '../../types';

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

// v6.0.80: 根据画面比例返回CSS aspect-ratio类名
// v6.0.83: 竖屏比例(9:16/3:4)添加max-h-80防止网格中卡片过高
function getAspectClass(ratio?: string): string {
  switch (ratio) {
    case '9:16': return 'aspect-[9/16] max-h-80';
    case '1:1':  return 'aspect-square';
    case '3:4':  return 'aspect-[3/4] max-h-80';
    case '4:3':  return 'aspect-[4/3]';
    default:     return 'aspect-video'; // 16:9
  }
}

// ═══════════════════════════════════════════════════════════════════
// [A] StoryboardCard (was StoryboardCard.tsx)
// ═══════════════════════════════════════════════════════════════════

interface StoryboardCardProps {
  storyboard: Storyboard;
  index: number;
  characters: Character[];
  aspectRatio?: string; // v6.0.80: 画面比例
  onEdit: (storyboard: Storyboard) => void;
  onDelete: (id: string) => void;
  onGenerate: (storyboard: Storyboard) => void;
  onRegenerate?: (storyboard: Storyboard) => void; // v6.0.87: 重新生成视频
  onResetStuck?: (storyboard: Storyboard) => void; // v6.0.112: 手动重置卡住的generating分镜
}

export function StoryboardCard({ storyboard, index, characters, aspectRatio, onEdit, onDelete, onGenerate, onRegenerate, onResetStuck }: StoryboardCardProps) {
  const [isVideoExpanded, setIsVideoExpanded] = useState(false);
  const videoUrl = storyboard.videoUrl || (storyboard as any).video_url;
  const thumbnailUrl = storyboard.thumbnailUrl || (storyboard as any).thumbnail_url;
  const hasVideo = !!videoUrl;

  return (
    <motion.div key={storyboard.id} whileHover={{ y: -4 }} className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden group">
      <div className={`relative ${getAspectClass(aspectRatio)} bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center`}>
        {hasVideo && isVideoExpanded ? (
          <div className="w-full h-full relative">
            <VideoPlayer src={videoUrl} className="w-full h-full object-cover" controls preload="metadata"
              onError={(err) => console.error(`[StoryboardCard] Video error for scene ${storyboard.sceneNumber}:`, err)} />
            <button onClick={(e) => { e.stopPropagation(); setIsVideoExpanded(false); }}
              className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white hover:bg-black/80 transition-all" title="收起视频">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : hasVideo ? (
          <div className="w-full h-full relative cursor-pointer" onClick={() => setIsVideoExpanded(true)}>
            {thumbnailUrl ? (
              <img src={thumbnailUrl} alt={`Scene ${storyboard.sceneNumber}`} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-purple-900/40 to-pink-900/40 flex items-center justify-center">
                <Play className="w-10 h-10 text-white/30" />
              </div>
            )}
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30">
                <Play className="w-6 h-6 text-white fill-white ml-0.5" />
              </div>
            </div>
          </div>
        ) : storyboard.imageUrl ? (
          <img src={storyboard.imageUrl} alt={`Scene ${storyboard.sceneNumber}`} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <ImageIcon className="w-16 h-16 text-gray-600" />
        )}
        <div className="absolute top-3 left-3 px-3 py-1 bg-black/60 backdrop-blur-xl rounded-lg">
          <span className="text-white font-bold text-sm">场景 {storyboard.sceneNumber}</span>
        </div>
        <div className="absolute top-3 right-3">
          {storyboard.status === 'generating' && (
            <div className="px-3 py-1 bg-blue-500/20 backdrop-blur-xl border border-blue-500/30 rounded-lg flex items-center gap-2">
              <Loader2 className="w-3 h-3 text-blue-400 animate-spin" /><span className="text-blue-400 text-xs font-medium">生成中</span>
            </div>
          )}
          {hasVideo && storyboard.status !== 'generating' && !isVideoExpanded && (
            <div className="px-3 py-1 bg-green-500/20 backdrop-blur-xl border border-green-500/30 rounded-lg">
              <span className="text-green-400 text-xs font-medium">已完成</span>
            </div>
          )}
        </div>
        {!hasVideo && storyboard.status !== 'generating' && (
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <Button onClick={() => onGenerate(storyboard)} size="sm" className="bg-purple-500/20 hover:bg-purple-500/30 backdrop-blur-xl border border-purple-500/30">
              <Play className="w-4 h-4 mr-1" />生成视频
            </Button>
          </div>
        )}
      </div>
      <div className="p-4">
        <p className="text-white text-sm mb-3 line-clamp-2">{storyboard.description}</p>
        {storyboard.dialogue && (<div className="mb-3 p-2 bg-white/5 rounded-lg"><p className="text-xs text-gray-400 italic">"{storyboard.dialogue}"</p></div>)}
        <div className="flex flex-wrap gap-2 mb-3 text-xs">
          {storyboard.location && <span className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded">{storyboard.location}</span>}
          {storyboard.timeOfDay && <span className="px-2 py-1 bg-purple-500/10 text-purple-400 rounded">{TIME_OF_DAY.find(t => t.id === storyboard.timeOfDay)?.icon} {TIME_OF_DAY.find(t => t.id === storyboard.timeOfDay)?.name}</span>}
          {storyboard.cameraAngle && <span className="px-2 py-1 bg-pink-500/10 text-pink-400 rounded">{CAMERA_ANGLES.find(a => a.id === storyboard.cameraAngle)?.name}</span>}
          <span className="px-2 py-1 bg-gray-500/10 text-gray-400 rounded">{storyboard.duration}秒</span>
        </div>
        {storyboard.characters.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {storyboard.characters.map(charId => { const char = characters.find(c => c.id === charId); return char ? <span key={charId} className="px-2 py-1 bg-white/5 text-gray-300 rounded text-xs">{char.name}</span> : null; })}
          </div>
        )}
        <div className="flex gap-2">
          <Button onClick={() => onEdit(storyboard)} size="sm" variant="ghost" className="flex-1"><Edit className="w-3 h-3 mr-1" />编辑</Button>
          {/* v6.0.87: 已完成的分镜显示重新生成按钮（用于分辨率不一致修复） */}
          {hasVideo && storyboard.status !== 'generating' && onRegenerate && (
            <Button onClick={() => onRegenerate(storyboard)} size="sm" variant="ghost" className="text-blue-400 hover:text-blue-300" title="重新生成视频（修复分辨率等问题）">
              <RefreshCw className="w-3 h-3" />
            </Button>
          )}
          {/* v6.0.112: 手动重置卡住的generating分镜 — 琥珀色 */}
          {storyboard.status === 'generating' && onResetStuck && (
            <Button onClick={() => onResetStuck(storyboard)} size="sm" variant="ghost" className="text-amber-400 hover:text-amber-300" title="重置卡住的生成状态">
              <RotateCcw className="w-3 h-3" />
            </Button>
          )}
          <Button onClick={() => onDelete(storyboard.id)} size="sm" variant="ghost" className="text-red-400 hover:text-red-300"><Trash2 className="w-3 h-3" /></Button>
        </div>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// [B] StoryboardForm (was StoryboardForm.tsx)
// ═══════════════════════════════════════════════════════════════════

interface StoryboardFormProps {
  editingStoryboard: Storyboard | null;
  characters: Character[];
  onSubmit: (data: Partial<Storyboard>) => void;
  onCancel: () => void;
}

export function StoryboardForm({ editingStoryboard, characters, onSubmit, onCancel }: StoryboardFormProps) {
  const [formData, setFormData] = useState<Partial<Storyboard>>({
    description: '', dialogue: '', characters: [], location: '', timeOfDay: 'morning', cameraAngle: 'medium', duration: 10,
  });

  useEffect(() => { if (editingStoryboard) setFormData(editingStoryboard); }, [editingStoryboard]);
  const isEditing = !!editingStoryboard;

  return (
    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
      <h3 className="text-lg font-semibold text-white mb-4">{isEditing ? '编辑分镜' : '新建分镜'}</h3>
      <div className="space-y-4">
        <div>
          <Label className="text-white mb-2 block">场景描述 *</Label>
          <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="详细描述这个场景中发生的事情、环境、氛围等" rows={3}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" />
        </div>
        <div>
          <Label className="text-white mb-2 block">对白（可选）</Label>
          <textarea value={formData.dialogue} onChange={(e) => setFormData({ ...formData, dialogue: e.target.value })}
            placeholder="角色台词或旁白" rows={2}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-white mb-2 block">场景位置</Label>
            <input type="text" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              placeholder="例如：咖啡厅、公园" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <div>
            <Label className="text-white mb-2 block">时长（秒）</Label>
            <input type="number" value={formData.duration} onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 10 })}
              min={5} max={12} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
        </div>
        <div>
          <Label className="text-white mb-2 block">时间段</Label>
          <div className="grid grid-cols-5 gap-2">
            {TIME_OF_DAY.map((time) => (
              <button key={time.id} onClick={() => setFormData({ ...formData, timeOfDay: time.id as Storyboard['timeOfDay'] })}
                className={`p-3 rounded-xl text-center transition-all ${formData.timeOfDay === time.id ? 'bg-purple-500/20 border-2 border-purple-500 text-white' : 'bg-white/5 border-2 border-white/10 text-gray-400 hover:border-white/20'}`}>
                <div className="text-xl mb-1">{time.icon}</div><div className="text-xs">{time.name}</div>
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-white mb-2 block">镜头角度</Label>
          <div className="grid grid-cols-5 gap-2">
            {CAMERA_ANGLES.map((angle) => (
              <button key={angle.id} onClick={() => setFormData({ ...formData, cameraAngle: angle.id as Storyboard['cameraAngle'] })}
                className={`p-3 rounded-xl text-center transition-all ${formData.cameraAngle === angle.id ? 'bg-purple-500/20 border-2 border-purple-500 text-white' : 'bg-white/5 border-2 border-white/10 text-gray-400 hover:border-white/20'}`}>
                <div className="text-xl mb-1">{angle.icon}</div><div className="text-xs">{angle.name}</div>
              </button>
            ))}
          </div>
        </div>
        {characters.length > 0 && (
          <div>
            <Label className="text-white mb-2 block">出场角色</Label>
            <div className="flex flex-wrap gap-2">
              {characters.map((character) => (
                <button key={character.id} onClick={() => {
                  const chars = formData.characters || [];
                  const exists = chars.includes(character.id);
                  setFormData({ ...formData, characters: exists ? chars.filter(id => id !== character.id) : [...chars, character.id] });
                }} className={`px-4 py-2 rounded-lg text-sm transition-all ${formData.characters?.includes(character.id) ? 'bg-purple-500/20 border-2 border-purple-500 text-white' : 'bg-white/5 border-2 border-white/10 text-gray-400 hover:border-white/20'}`}>
                  {character.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex justify-end gap-3 mt-6">
        <Button onClick={onCancel} variant="ghost"><X className="w-4 h-4 mr-2" />取消</Button>
        <Button onClick={() => onSubmit(formData)} disabled={!formData.description}
          className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50">
          <Check className="w-4 h-4 mr-2" />{isEditing ? '更新' : '添加'}
        </Button>
      </div>
    </motion.div>
  );
}