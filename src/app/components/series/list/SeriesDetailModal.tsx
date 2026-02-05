import { motion } from 'motion/react';
import { Edit2, Play } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import type { Series } from '@/app/types';
import { useState } from 'react';
import { EpisodePlayer } from '@/app/components/EpisodePlayer';

interface SeriesDetailModalProps {
  series: Series;
  onClose: () => void;
  onEdit: (series: Series) => void;
}

export function SeriesDetailModal({ series, onClose, onEdit }: SeriesDetailModalProps) {
  const [playingEpisode, setPlayingEpisode] = useState<any>(null);

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-gradient-to-br from-gray-900 to-purple-900 rounded-3xl border border-white/10 max-w-4xl max-h-[80vh] overflow-hidden flex flex-col"
        >
          {/* 头部 */}
          <div className="p-6 border-b border-white/10">
            <h2 className="text-2xl font-bold text-white mb-2">{series.title}</h2>
            <p className="text-gray-400">{series.description}</p>
          </div>

          {/* 内容 */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* 基本信息 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 p-4 rounded-xl">
                <div className="text-gray-400 text-sm mb-1">类型</div>
                <div className="text-white font-medium">{series.genre}</div>
              </div>
              <div className="bg-white/5 p-4 rounded-xl">
                <div className="text-gray-400 text-sm mb-1">风格</div>
                <div className="text-white font-medium">{series.style}</div>
              </div>
              <div className="bg-white/5 p-4 rounded-xl">
                <div className="text-gray-400 text-sm mb-1">状态</div>
                <div className="text-white font-medium">
                  {series.status === 'completed' ? '已完成' : series.status === 'in-progress' ? '创作中' : '草稿'}
                </div>
              </div>
              <div className="bg-white/5 p-4 rounded-xl">
                <div className="text-gray-400 text-sm mb-1">集数</div>
                <div className="text-white font-medium">
                  {series.episodes?.length || 0}/{series.totalEpisodes} 集
                </div>
              </div>
            </div>

            {/* 核心价值观 */}
            {series.coreValues && series.coreValues.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-white mb-3">核心价值观</h3>
                <div className="flex flex-wrap gap-2">
                  {series.coreValues.map((value: string, idx: number) => (
                    <span key={idx} className="px-3 py-1 bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 rounded-lg text-sm border border-purple-500/30">
                      {value}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 故事大纲 */}
            {series.storyOutline && (
              <div>
                <h3 className="text-lg font-semibold text-white mb-3">故事大纲</h3>
                <div className="bg-white/5 p-4 rounded-xl text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
                  {series.storyOutline}
                </div>
              </div>
            )}

            {/* 角色列表 */}
            {series.characters && series.characters.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-white mb-3">角色列表</h3>
                <div className="space-y-3">
                  {series.characters.map((char: any, idx: number) => (
                    <div key={idx} className="bg-white/5 p-4 rounded-xl">
                      <div className="font-semibold text-white mb-2">{char.name}</div>
                      <div className="text-gray-400 text-sm">{char.description}</div>
                      {char.growthArc && (
                        <div className="mt-2 text-purple-300 text-sm">
                          成长轨迹：{char.growthArc}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 剧集列表 */}
            {series.episodes && series.episodes.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-white mb-3">剧集列表</h3>
                <div className="space-y-3">
                  {series.episodes.map((ep: any) => (
                    <div key={ep.id} className="bg-white/5 p-4 rounded-xl">
                      <div className="font-semibold text-white mb-2">
                        第{ep.episodeNumber}集：{ep.title}
                      </div>
                      <div className="text-gray-400 text-sm mb-2">{ep.synopsis}</div>
                      {ep.growthTheme && (
                        <div className="text-purple-300 text-sm">
                          成长主题：{ep.growthTheme}
                        </div>
                      )}
                      {ep.storyboards && (
                        <div className="mt-2 text-gray-500 text-xs">
                          {ep.storyboards.length} 个分镜场景
                        </div>
                      )}
                      <Button
                        onClick={() => setPlayingEpisode(ep)}
                        className="mt-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
                      >
                        <Play className="w-4 h-4 mr-2" />
                        播放剧集
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 底部操作 */}
          <div className="p-6 border-t border-white/10 flex justify-end gap-3">
            <Button
              onClick={onClose}
              variant="ghost"
              className="text-white"
            >
              关闭
            </Button>
            <Button
              onClick={() => {
                onEdit(series);
                onClose();
              }}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              <Edit2 className="w-4 h-4 mr-2" />
              编辑
            </Button>
          </div>
        </motion.div>
      </div>
      {playingEpisode && (
        <EpisodePlayer
          episodeId={playingEpisode.id}
          episodeTitle={playingEpisode.title}
          seriesTitle={series.title}
          onClose={() => setPlayingEpisode(null)}
        />
      )}
    </>
  );
}