/**
 * Storyboard widgets — merged to reduce module count
 * v6.0.68: Merged StoryboardCard.tsx + StoryboardForm.tsx
 * v6.0.164: DraggableStoryboardWrapper — drag-and-drop reordering via thin wrapper
 * v6.0.165: Selection mode — checkbox overlay for batch operations
 * v6.0.166: 缩略图点击进入预览模式, 选择模式下禁用拖拽
 * v6.0.170: 复制分镜按钮
 * v6.0.171: AI润色描述+对白
 * Both consumed only by StoryboardEditor.tsx.
 */

import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Play, Edit, Trash2, Loader2, Image as ImageIcon, X, Check, RefreshCw, RotateCcw, GripVertical, Square, CheckSquare, Eye, Copy, Sparkles } from 'lucide-react';
import { Button, Label } from '../ui';
import { useDrag, useDrop } from 'react-dnd';
import { toast } from 'sonner';
import { VideoPlayer } from '../VideoPlayer';
import { apiRequest } from '../../utils';
import { sbVideoUrl, sbThumbnailUrl } from '../../utils';
import type { Storyboard, Character } from '../../types';
import { getErrorMessage } from '../../utils';

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

// v6.0.163: 格式化生成耗时
function formatElapsed(startTime?: number): string | null {
  if (!startTime) return null;
  const seconds = Math.floor((Date.now() - startTime) / 1000);
  if (seconds < 10) return null; // 前10秒不显示
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m${secs < 10 ? '0' : ''}${secs}s`;
}

// ═══════════════════════════════════════════════════════════════════
// [A] StoryboardCard (was StoryboardCard.tsx)
// ═══════════════════════════════════════════════════════════════════

interface StoryboardCardProps {
  storyboard: Storyboard;
  index: number;
  characters: Character[];
  aspectRatio?: string; // v6.0.80: 画面比例
  generatingStartTime?: number; // v6.0.163: 生成开始时间（用于显示耗时）
  isSelectionMode?: boolean; // v6.0.165: 是否处于选择模式
  isSelected?: boolean; // v6.0.165: 是否被选中
  onToggleSelect?: (id: string) => void; // v6.0.165: 切换选中状态
  onPreview?: (index: number) => void; // v6.0.166: 点击缩略图进入预览
  onEdit: (storyboard: Storyboard) => void;
  onDelete: (id: string) => void;
  onGenerate: (storyboard: Storyboard) => void;
  onRegenerate?: (storyboard: Storyboard) => void; // v6.0.87: 重新生成视频
  onResetStuck?: (storyboard: Storyboard) => void; // v6.0.112: 手动重置卡住的generating分镜
  onCopy?: (storyboard: Storyboard) => void; // v6.0.170: 复制分镜
  onPolish?: (storyboard: Storyboard) => void; // v6.0.171: AI润色
  isPolishingId?: string | null; // v6.0.171: 正在润色的分镜ID
}

export function StoryboardCard({ storyboard, index, characters, aspectRatio, generatingStartTime, isSelectionMode, isSelected, onToggleSelect, onPreview, onEdit, onDelete, onGenerate, onRegenerate, onResetStuck, onCopy, onPolish, isPolishingId }: StoryboardCardProps) {
  const [isVideoExpanded, setIsVideoExpanded] = useState(false);
  // v6.0.163: 动态更新生成耗时显示
  const [, setTick] = useState(0);
  useEffect(() => {
    if (storyboard.status !== 'generating') return;
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, [storyboard.status]);
  const elapsed = storyboard.status === 'generating' ? formatElapsed(generatingStartTime) : null;
  const videoUrl = sbVideoUrl(storyboard);
  const thumbnailUrl = sbThumbnailUrl(storyboard);
  const hasVideo = !!videoUrl;

  return (
    <motion.div key={storyboard.id} whileHover={{ y: -4 }} className={`relative bg-white/5 backdrop-blur-xl rounded-2xl border overflow-hidden group ${isSelectionMode && isSelected ? 'border-blue-500/50 ring-1 ring-blue-500/30' : 'border-white/10'}`}>
      {/* v6.0.165: 选择模式下的复选框 — 左上角覆盖场景编号 */}
      {isSelectionMode && (
        <div
          className="absolute top-3 left-3 z-30 cursor-pointer"
          onClick={(e) => { e.stopPropagation(); onToggleSelect?.(storyboard.id); }}
        >
          {isSelected
            ? <CheckSquare className="w-5 h-5 text-blue-400 drop-shadow-lg" />
            : <Square className="w-5 h-5 text-white/60 drop-shadow-lg" />
          }
        </div>
      )}
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
              {elapsed && <span className="text-blue-400 text-xs font-medium">({elapsed})</span>}
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
          {/* v6.0.166: 预览按钮——直接打开预览模式定位到当前分镜 */}
          {onPreview && !isSelectionMode && (
            <Button onClick={() => onPreview(index)} size="sm" variant="ghost" className="text-purple-400 hover:text-purple-300" title="预览此分镜">
              <Eye className="w-3 h-3" />
            </Button>
          )}
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
          {/* v6.0.170: 复制分镜按钮 */}
          {onCopy && (
            <Button onClick={() => onCopy(storyboard)} size="sm" variant="ghost" className="text-green-400 hover:text-green-300" title="复制此分镜">
              <Copy className="w-3 h-3" />
            </Button>
          )}
          {/* v6.0.171: AI润色按钮 */}
          {onPolish && storyboard.status !== 'generating' && (
            <Button
              onClick={() => onPolish(storyboard)}
              disabled={isPolishingId === storyboard.id}
              size="sm" variant="ghost"
              className={isPolishingId === storyboard.id ? 'text-blue-400' : 'text-violet-400 hover:text-violet-300'}
              title="AI润色描述+对白"
            >
              {isPolishingId === storyboard.id
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Sparkles className="w-3 h-3" />}
            </Button>
          )}
          <Button onClick={() => onDelete(storyboard.id)} size="sm" variant="ghost" className="text-red-400 hover:text-red-300"><Trash2 className="w-3 h-3" /></Button>
        </div>
      </div>
    </motion.div>
  );
}

// v6.0.164: DraggableStoryboardWrapper — drag-and-drop reordering via thin wrapper
const STORYBOARD_DND_TYPE = 'STORYBOARD_CARD';

interface DraggableStoryboardCardProps extends StoryboardCardProps {
  onMoveCard: (dragIndex: number, hoverIndex: number) => void;
}

export function DraggableStoryboardCard({ onMoveCard, ...cardProps }: DraggableStoryboardCardProps) {
  const { index, storyboard } = cardProps;
  const ref = useRef<HTMLDivElement>(null);
  const isSelectionMode = !!cardProps.isSelectionMode; // v6.0.166: 选择模式下禁用拖拽

  const [{ isDragging }, drag, dragPreview] = useDrag({
    type: STORYBOARD_DND_TYPE,
    item: () => ({ id: storyboard.id, index }),
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    canDrag: () => !isSelectionMode, // v6.0.166: 选择模式下禁止拖拽
  });

  const [{ isOver }, drop] = useDrop({
    accept: STORYBOARD_DND_TYPE,
    collect: (monitor) => ({ isOver: monitor.isOver() }),
    canDrop: () => !isSelectionMode, // v6.0.166: 选择模式下禁止drop
    hover(item: { id: string; index: number }, monitor) {
      if (!ref.current) return;
      const dragIndex = item.index;
      const hoverIndex = index;
      if (dragIndex === hoverIndex) return;
      const hoverBoundingRect = ref.current.getBoundingClientRect();
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) return;
      const hoverClientY = clientOffset.y - hoverBoundingRect.top;
      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) return;
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) return;
      onMoveCard(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
  });

  dragPreview(drop(ref));

  return (
    <div
      ref={ref}
      className={`relative transition-opacity ${isDragging ? 'opacity-30' : ''} ${isOver ? 'ring-2 ring-purple-500/50 rounded-2xl' : ''}`}
    >
      {/* v6.0.164: 拖拽手柄 — v6.0.166: 选择模式下隐藏 */}
      {!isSelectionMode && (
        <div
          ref={drag as unknown as React.Ref<HTMLDivElement>}
          className="absolute top-3 left-12 z-20 cursor-grab active:cursor-grabbing p-1 rounded bg-black/40 backdrop-blur-sm opacity-0 group-hover:opacity-100 hover:!opacity-100 transition-opacity"
          title="拖拽排序"
        >
          <GripVertical className="w-3.5 h-3.5 text-white/70" />
        </div>
      )}
      <StoryboardCard {...cardProps} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// [B] StoryboardForm (was StoryboardForm.tsx)
// ═══════════════════════════════════════════════════════════════════

interface StoryboardFormProps {
  editingStoryboard: Storyboard | null;
  characters: Character[];
  seriesId?: string;       // v6.0.171: AI润色需要
  seriesTitle?: string;    // v6.0.171: AI润色上下文
  seriesStyle?: string;    // v6.0.171: AI润色上下文
  onSubmit: (data: Partial<Storyboard>) => void;
  onCancel: () => void;
}

export function StoryboardForm({ editingStoryboard, characters, seriesId, seriesTitle, seriesStyle, onSubmit, onCancel }: StoryboardFormProps) {
  const [formData, setFormData] = useState<Partial<Storyboard>>({
    description: '', dialogue: '', characters: [], location: '', timeOfDay: 'morning', cameraAngle: 'medium', duration: 10,
  });
  // v6.0.171: AI润色状态
  const [isPolishing, setIsPolishing] = useState(false);
  const [polishTarget, setPolishTarget] = useState<string | null>(null);

  useEffect(() => { if (editingStoryboard) setFormData(editingStoryboard); }, [editingStoryboard]);
  const isEditing = !!editingStoryboard;

  // v6.0.171: AI润色处理函数
  const handlePolish = async (mode: 'full' | 'description_only' | 'dialogue_only') => {
    if (!formData.description || formData.description.trim().length < 5) {
      toast.error('场景描述过短，至少需要5个字');
      return;
    }
    if (!seriesId) { toast.error('缺少系列信息'); return; }
    setIsPolishing(true);
    setPolishTarget(mode);
    try {
      const charNames = (formData.characters || [])
        .map(cid => characters.find(c => c.id === cid)?.name)
        .filter(Boolean);
      const result = await apiRequest(`/series/${seriesId}/storyboards/polish`, {
        method: 'POST',
        body: JSON.stringify({
          description: formData.description,
          dialogue: formData.dialogue,
          characters: charNames,
          location: formData.location,
          timeOfDay: formData.timeOfDay,
          cameraAngle: formData.cameraAngle,
          seriesTitle, seriesStyle, mode,
        }),
        timeout: 35000,
      });
      if (result.success && result.data) {
        const updates: Partial<Storyboard> = {};
        if (result.data.description) updates.description = result.data.description;
        if (result.data.dialogue) updates.dialogue = result.data.dialogue;
        setFormData(prev => ({ ...prev, ...updates }));
        toast.success('AI润色完成');
      } else {
        toast.error('润色失败：' + (result.error || '未知错误'));
      }
    } catch (err: unknown) {
      console.error('[StoryboardForm] Polish error:', err);
      toast.error('润色失败: ' + getErrorMessage(err));
    } finally {
      setIsPolishing(false);
      setPolishTarget(null);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
      <h3 className="text-lg font-semibold text-white mb-4">{isEditing ? '编辑分镜' : '新建分镜'}</h3>
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-white">场景描述 *</Label>
            {seriesId && formData.description && formData.description.trim().length >= 5 && (
              <button
                onClick={() => handlePolish(formData.dialogue ? 'full' : 'description_only')}
                disabled={isPolishing}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-gradient-to-r from-violet-500/15 to-fuchsia-500/15 border border-violet-500/25 text-violet-300 hover:from-violet-500/25 hover:to-fuchsia-500/25 transition-all disabled:opacity-50"
                title={formData.dialogue ? 'AI同时润色描述和对白' : 'AI润色场景描述'}
              >
                {isPolishing && (polishTarget === 'full' || polishTarget === 'description_only')
                  ? <><Loader2 className="w-3 h-3 animate-spin" />润色中...</>
                  : <><Sparkles className="w-3 h-3" />AI润色{formData.dialogue ? '(描述+对白)' : ''}</>}
              </button>
            )}
          </div>
          <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="详细描述这个场景中发生的事情、环境、氛围等" rows={3}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" />
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-white">对白（可选）</Label>
            {seriesId && formData.dialogue && formData.dialogue.trim().length > 0 && (
              <button
                onClick={() => handlePolish('dialogue_only')}
                disabled={isPolishing}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-gradient-to-r from-cyan-500/15 to-blue-500/15 border border-cyan-500/25 text-cyan-300 hover:from-cyan-500/25 hover:to-blue-500/25 transition-all disabled:opacity-50"
                title="AI润色对白台词"
              >
                {isPolishing && polishTarget === 'dialogue_only'
                  ? <><Loader2 className="w-3 h-3 animate-spin" />润色中...</>
                  : <><Sparkles className="w-3 h-3" />AI润色对白</>}
              </button>
            )}
          </div>
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