/**
 * 漫剧详情页示例
 * 展示如何使用 PostgreSQL API 和新组件
 */

import React, { useEffect, useState } from 'react';
import { getSeriesDetails } from '@/app/services/seriesServicePG';
import SeriesGenerationProgress from './SeriesGenerationProgress';
import SeriesInteractions from './SeriesInteractions';

interface SeriesDetailPageProps {
  seriesId: string;
  userPhone: string;
}

export const SeriesDetailPage: React.FC<SeriesDetailPageProps> = ({
  seriesId,
  userPhone,
}) => {
  const [series, setSeries] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 加载漫剧详情
  const loadSeriesDetails = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await getSeriesDetails(seriesId, userPhone);

      if (result.success && result.data) {
        setSeries(result.data);
      } else {
        setError(result.error || '加载失败');
      }
    } catch (err: any) {
      setError(err.message || '加载失败');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSeriesDetails();
  }, [seriesId, userPhone]);

  // 加载中状态
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-600 text-5xl mb-4">⚠️</div>
          <p className="text-gray-800 text-lg">{error}</p>
          <button
            onClick={loadSeriesDetails}
            className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  // 无数据
  if (!series) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-600">漫剧不存在</p>
      </div>
    );
  }

  const isGenerating = series.status === 'generating' || series.status === 'in-progress';
  const isFailed = series.status === 'failed';
  const isCompleted = series.status === 'completed';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* 头部信息 */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {series.title}
              </h1>
              <p className="text-gray-600 mb-4">{series.description}</p>
              
              <div className="flex flex-wrap gap-3">
                <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                  {series.genre === 'growth' ? '成长' : series.genre}
                </span>
                <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm">
                  {series.style === 'realistic' ? '写实' : series.style}
                </span>
                <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                  共 {series.total_episodes} 集
                </span>
              </div>
            </div>

            {/* 封面图 */}
            {series.cover_image_url && (
              <div className="ml-6 flex-shrink-0">
                <img
                  src={series.cover_image_url}
                  alt={series.title}
                  className="w-48 h-48 object-cover rounded-lg"
                />
              </div>
            )}
          </div>
        </div>

        {/* 生成中状态 */}
        {isGenerating && (
          <div className="mb-6">
            <SeriesGenerationProgress
              seriesId={seriesId}
              userPhone={userPhone}
              onComplete={(updatedSeries) => {
                console.log('Generation completed:', updatedSeries);
                setSeries(updatedSeries);
              }}
              onError={(errorMsg) => {
                console.error('Generation failed:', errorMsg);
                setError(errorMsg);
              }}
            />
          </div>
        )}

        {/* 失败状态 */}
        {isFailed && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-6">
            <div className="flex items-center space-x-3 mb-3">
              <div className="text-red-600 text-3xl">❌</div>
              <h3 className="text-lg font-semibold text-red-900">生成失败</h3>
            </div>
            {series.generation_progress?.error && (
              <p className="text-red-800 mb-4">{series.generation_progress.error}</p>
            )}
            <button className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
              重新生成
            </button>
          </div>
        )}

        {/* 完成状态 - 显示角色和剧集 */}
        {isCompleted && (
          <>
            {/* 角色列表 */}
            {series.characters && series.characters.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">角色介绍</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {series.characters.map((character: any) => (
                    <div
                      key={character.id}
                      className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                      {character.avatar_url && (
                        <img
                          src={character.avatar_url}
                          alt={character.name}
                          className="w-full h-48 object-cover rounded-lg mb-3"
                        />
                      )}
                      <h3 className="font-semibold text-lg text-gray-900 mb-1">
                        {character.name}
                      </h3>
                      <p className="text-sm text-gray-600 mb-2">
                        {character.role === 'protagonist' ? '主角' :
                         character.role === 'supporting' ? '配角' :
                         character.role === 'antagonist' ? '反派' : '导师'}
                      </p>
                      <p className="text-sm text-gray-700 line-clamp-3">
                        {character.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 剧集列表 */}
            {series.episodes && series.episodes.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">剧集列表</h2>
                <div className="space-y-4">
                  {series.episodes.map((episode: any) => (
                    <div
                      key={episode.id}
                      className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <span className="px-3 py-1 bg-blue-600 text-white rounded-full text-sm font-semibold">
                              第 {episode.episode_number} 集
                            </span>
                            {episode.merged_video_url && (
                              <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                                ✓ 已生成视频
                              </span>
                            )}
                          </div>
                          <h3 className="font-semibold text-lg text-gray-900 mb-2">
                            {episode.title}
                          </h3>
                          <p className="text-gray-700 mb-2">{episode.synopsis}</p>
                          {episode.growth_theme && (
                            <p className="text-sm text-blue-600">
                              <strong>成长主题：</strong>{episode.growth_theme}
                            </p>
                          )}
                        </div>
                        
                        {episode.thumbnail_url && (
                          <img
                            src={episode.thumbnail_url}
                            alt={episode.title}
                            className="ml-4 w-32 h-20 object-cover rounded-lg"
                          />
                        )}
                      </div>

                      {/* 分镜信息 */}
                      {episode.storyboards && episode.storyboards.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <p className="text-sm text-gray-600">
                            共 {episode.storyboards.length} 个场景 • 
                            预计时长 {Math.round(episode.total_duration / 60)} 分钟
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 互动功能 */}
            {series.interactions && (
              <div className="mb-6">
                <SeriesInteractions
                  seriesId={seriesId}
                  userPhone={userPhone}
                  initialInteractions={series.interactions}
                  onInteractionChange={() => {
                    // 交互数据变化后重新加载
                    loadSeriesDetails();
                  }}
                />
              </div>
            )}
          </>
        )}

        {/* 故事大纲 */}
        {series.story_outline && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">故事大纲</h2>
            <p className="text-gray-700 whitespace-pre-wrap">{series.story_outline}</p>
          </div>
        )}

        {/* 价值观 */}
        {series.core_values && series.core_values.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">核心价值观</h2>
            <div className="flex flex-wrap gap-2">
              {series.core_values.map((value: string, index: number) => (
                <span
                  key={index}
                  className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-full text-sm font-medium"
                >
                  {value}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SeriesDetailPage;
