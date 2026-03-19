import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Edit2, Trash2, ChevronDown, ChevronRight, BookOpen, Film } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, Textarea, Badge, Card } from '../ui';
import type { Series, Chapter, Episode } from '../../types';
import { SeriesFixTool } from './HealthWidgets';
import { ConfirmDialog, useConfirm } from './ConfirmDialog';
import { getEffectiveEpisodeStatus } from '../../utils';

// ── SeriesFixTool extracted to HealthWidgets.tsx (v6.0.88) ────────

interface ChapterManagerProps {
  series: Series;
  onChaptersUpdate: (chapters: Chapter[]) => void;
  onEpisodeSelect: (episode: Episode) => void;
  onRefresh?: () => void;
}

export function ChapterManager({ series, onChaptersUpdate, onEpisodeSelect, onRefresh }: ChapterManagerProps) {
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const { confirm: confirmAction, dialogProps } = useConfirm();

  const chapters = series.chapters || [];
  const episodes = series.episodes || [];
  
  // 检测数据完整性问题
  const hasDataIssue = series.status === 'completed' && episodes.length === 0;

  // 智能建议：根据总集数自动建议章节划分
  const suggestedChapterCount = Math.ceil(series.totalEpisodes / 10);
  const episodesPerChapter = Math.ceil(series.totalEpisodes / suggestedChapterCount);

  // 切换章节展开/折叠
  const toggleChapter = (chapterId: string) => {
    setExpandedChapters(prev => {
      const newSet = new Set(prev);
      if (newSet.has(chapterId)) {
        newSet.delete(chapterId);
      } else {
        newSet.add(chapterId);
      }
      return newSet;
    });
  };

  // 自动生成章节（智能划分）
  const handleAutoGenerateChapters = useCallback(async () => {
    if (chapters.length > 0) {
      const confirmed = await confirmAction({
        title: '覆盖现有章节',
        description: '已存在章节，是否重新生成章节划分？这将覆盖现有章节。',
        confirmText: '重新生成',
        cancelText: '取消',
        variant: 'warning',
        icon: 'regenerate',
      });
      if (!confirmed) return;
    }

    const newChapters: Chapter[] = [];
    for (let i = 0; i < suggestedChapterCount; i++) {
      const start = i * episodesPerChapter + 1;
      const end = Math.min((i + 1) * episodesPerChapter, series.totalEpisodes);
      
      newChapters.push({
        id: `chapter_${Date.now()}_${i}`,
        seriesId: series.id,
        chapterNumber: i + 1,
        title: `第${i + 1}章`,
        description: `第${start}-${end}集的故事内容`,
        episodeRange: { start, end },
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    onChaptersUpdate(newChapters);
    toast.success(`已自动生成 ${newChapters.length} 个章节`);
  }, [chapters.length, suggestedChapterCount, episodesPerChapter, series.id, series.totalEpisodes, onChaptersUpdate]);

  // 创建新章节
  const handleCreateChapter = () => {
    const lastChapter = chapters[chapters.length - 1];
    const nextStart = lastChapter ? lastChapter.episodeRange.end + 1 : 1;
    const nextEnd = Math.min(nextStart + episodesPerChapter - 1, series.totalEpisodes);

    if (nextStart > series.totalEpisodes) {
      toast.error('所有集数已分配完成');
      return;
    }

    const newChapter: Chapter = {
      id: `chapter_${Date.now()}`,
      seriesId: series.id,
      chapterNumber: chapters.length + 1,
      title: `第${chapters.length + 1}章`,
      description: '',
      episodeRange: { start: nextStart, end: nextEnd },
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setEditingChapter(newChapter);
    setIsCreating(true);
  };

  // 保存章节
  const handleSaveChapter = (chapter: Chapter) => {
    if (!chapter.title.trim()) {
      toast.error('请输入章节标题');
      return;
    }

    if (isCreating) {
      onChaptersUpdate([...chapters, chapter]);
      toast.success('章节已创建');
    } else {
      onChaptersUpdate(chapters.map(c => c.id === chapter.id ? chapter : c));
      toast.success('章节已更新');
    }

    setEditingChapter(null);
    setIsCreating(false);
  };

  // 删除章节
  const handleDeleteChapter = async (chapterId: string) => {
    const confirmed = await confirmAction({
      title: '删除章节',
      description: '确定要删除这个章节吗？这不会删除其中的剧集。',
      confirmText: '确认删除',
      cancelText: '取消',
      variant: 'danger',
      icon: 'delete',
    });
    if (!confirmed) return;

    onChaptersUpdate(chapters.filter(c => c.id !== chapterId));
    toast.success('章节已删除');
  };

  // 获取章节内的剧集
  const getChapterEpisodes = (chapter: Chapter): Episode[] => {
    return episodes.filter(ep => 
      ep.episodeNumber >= chapter.episodeRange.start && 
      ep.episodeNumber <= chapter.episodeRange.end
    );
  };

  // 计算章节状态
  const getChapterStatus = (chapter: Chapter): Chapter['status'] => {
    const chapterEpisodes = getChapterEpisodes(chapter);
    if (chapterEpisodes.length === 0) return 'draft';
    
    const completedCount = chapterEpisodes.filter(ep => getEffectiveEpisodeStatus(ep) === 'completed').length;
    if (completedCount === chapterEpisodes.length) return 'completed';
    if (completedCount > 0) return 'in-progress';
    return 'draft';
  };

  return (
    <div className="space-y-4">
      {/* 头部工具栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-purple-400" />
          <h3 className="text-lg font-semibold text-white">章节管理</h3>
          <Badge variant="outline" className="ml-2">
            {chapters.length} 章 / {series.totalEpisodes} 集
          </Badge>
        </div>
        <div className="flex gap-2">
          {chapters.length === 0 && series.totalEpisodes > 15 && (
            <Button
              onClick={handleAutoGenerateChapters}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              智能划分章节
            </Button>
          )}
          <Button
            onClick={handleCreateChapter}
            size="sm"
            className="gap-2 bg-gradient-to-r from-purple-500 to-blue-500"
          >
            <Plus className="w-4 h-4" />
            新建章节
          </Button>
        </div>
      </div>

      {/* 建议提示 */}
      {chapters.length === 0 && series.totalEpisodes > 15 && (
        <Card className="p-4 bg-purple-500/10 border-purple-500/20">
          <p className="text-sm text-purple-200">
            💡 检测到您的作品有 {series.totalEpisodes} 集，建议划分为 {suggestedChapterCount} 个章节，
            每章约 {episodesPerChapter} 集。点击「智能划分章节」自动生成。
          </p>
        </Card>
      )}

      {/* 数据完整性提示 */}
      {hasDataIssue && (
        <Card className="p-4 bg-red-500/10 border-red-500/20">
          <p className="text-sm text-red-200 mb-3">
            ⚠️ 检测到您的作品状态为「已完成」，但没有剧集数据。请使用下方工具检查并修复数据完整性。
          </p>
          <SeriesFixTool seriesId={series.id} onFixed={onRefresh} />
        </Card>
      )}

      {/* 章节列表 */}
      <div className="space-y-2">
        <AnimatePresence>
          {chapters.map(chapter => {
            const chapterEpisodes = getChapterEpisodes(chapter);
            const currentStatus = getChapterStatus(chapter);
            const isExpanded = expandedChapters.has(chapter.id);
            const isEditing = editingChapter?.id === chapter.id;

            if (isEditing) {
              return (
                <ChapterEditor
                  key={chapter.id}
                  chapter={editingChapter}
                  onSave={handleSaveChapter}
                  onCancel={() => {
                    setEditingChapter(null);
                    setIsCreating(false);
                  }}
                />
              );
            }

            return (
              <motion.div
                key={chapter.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <Card className="overflow-hidden bg-slate-800/50 border-slate-700/50">
                  {/* 章节头部 */}
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-700/30 transition-colors"
                    onClick={() => toggleChapter(chapter.id)}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      {isExpanded ? (
                        <ChevronDown className="w-5 h-5 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-slate-400" />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-white">{chapter.title}</h4>
                          <Badge variant={
                            currentStatus === 'completed' ? 'default' :
                            currentStatus === 'in-progress' ? 'secondary' : 'outline'
                          }>
                            {currentStatus === 'completed' ? '已完成' :
                             currentStatus === 'in-progress' ? '进行中' : '草稿'}
                          </Badge>
                          <span className="text-sm text-slate-400">
                            第 {chapter.episodeRange.start}-{chapter.episodeRange.end} 集
                          </span>
                        </div>
                        {chapter.description && (
                          <p className="text-sm text-slate-400 mt-1">{chapter.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-400">
                          {chapterEpisodes.filter(ep => getEffectiveEpisodeStatus(ep) === 'completed').length} / {chapterEpisodes.length} 集已完成
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingChapter(chapter);
                            setIsCreating(false);
                          }}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteChapter(chapter.id);
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* 章节内容（展开时显示） */}
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: 'auto' }}
                      exit={{ height: 0 }}
                      className="border-t border-slate-700/50"
                    >
                      <div className="p-4 space-y-2">
                        {chapterEpisodes.length === 0 ? (
                          <p className="text-sm text-slate-400 text-center py-4">
                            此章节暂无剧集
                          </p>
                        ) : (
                          chapterEpisodes.map(episode => (
                            <div
                              key={episode.id}
                              className="flex items-center justify-between p-3 rounded-lg bg-slate-700/30 hover:bg-slate-700/50 cursor-pointer transition-colors"
                              onClick={() => onEpisodeSelect(episode)}
                            >
                              <div className="flex items-center gap-3">
                                <Film className="w-4 h-4 text-purple-400" />
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-white">
                                      第 {episode.episodeNumber} 集: {episode.title}
                                    </span>
                                    <Badge variant={
                                      getEffectiveEpisodeStatus(episode) === 'completed' ? 'default' :
                                      episode.status === 'generating' ? 'secondary' : 'outline'
                                    } className="text-xs">
                                      {getEffectiveEpisodeStatus(episode) === 'completed' ? '已完成' :
                                       episode.status === 'generating' ? '生成中' :
                                       episode.status === 'failed' ? '失败' : '草稿'}
                                    </Badge>
                                  </div>
                                  <p className="text-sm text-slate-400 mt-1">
                                    {episode.synopsis}
                                  </p>
                                </div>
                              </div>
                              <div className="text-sm text-slate-400">
                                {episode.storyboards?.length || 0} 个分镜
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </Card>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* 新建章节编辑器 */}
        {isCreating && editingChapter && (
          <ChapterEditor
            chapter={editingChapter}
            onSave={handleSaveChapter}
            onCancel={() => {
              setEditingChapter(null);
              setIsCreating(false);
            }}
          />
        )}
      </div>
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}

// 章节编辑器组件
interface ChapterEditorProps {
  chapter: Chapter;
  onSave: (chapter: Chapter) => void;
  onCancel: () => void;
}

function ChapterEditor({ chapter, onSave, onCancel }: ChapterEditorProps) {
  const [editedChapter, setEditedChapter] = useState(chapter);

  return (
    <Card className="p-4 bg-slate-800/50 border-purple-500/30">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            章节标题
          </label>
          <Input
            value={editedChapter.title}
            onChange={(e) => setEditedChapter({ ...editedChapter, title: e.target.value })}
            placeholder="例如：第一章 相遇"
            className="bg-slate-900/50 border-slate-700"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            章节描述
          </label>
          <Textarea
            value={editedChapter.description}
            onChange={(e) => setEditedChapter({ ...editedChapter, description: e.target.value })}
            placeholder="描述本章的主要内容和主题..."
            rows={3}
            className="bg-slate-900/50 border-slate-700"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            章节主题
          </label>
          <Input
            value={editedChapter.theme || ''}
            onChange={(e) => setEditedChapter({ ...editedChapter, theme: e.target.value })}
            placeholder="例如：成长、勇气、友谊"
            className="bg-slate-900/50 border-slate-700"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              起始集数
            </label>
            <Input
              type="number"
              value={editedChapter.episodeRange.start}
              onChange={(e) => setEditedChapter({
                ...editedChapter,
                episodeRange: { ...editedChapter.episodeRange, start: parseInt(e.target.value) }
              })}
              min={1}
              className="bg-slate-900/50 border-slate-700"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              结束集数
            </label>
            <Input
              type="number"
              value={editedChapter.episodeRange.end}
              onChange={(e) => setEditedChapter({
                ...editedChapter,
                episodeRange: { ...editedChapter.episodeRange, end: parseInt(e.target.value) }
              })}
              min={editedChapter.episodeRange.start}
              className="bg-slate-900/50 border-slate-700"
            />
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button
            onClick={() => onSave(editedChapter)}
            className="bg-gradient-to-r from-purple-500 to-blue-500"
          >
            保存
          </Button>
        </div>
      </div>
    </Card>
  );
}