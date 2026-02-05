/**
 * AI响应解析模块
 * 从 ai/script_generator.tsx 提取
 * 负责：解析AI返回的JSON数据
 */

import type { EpisodeOutline, CharacterInfo, GenerateEpisodesRequest } from './types.tsx';

/**
 * 解析AI返回的剧集大纲
 */
export function parseEpisodeOutlines(content: string, expectedCount: number): EpisodeOutline[] | null {
  try {
    // 尝试直接解析JSON
    let episodes: any[] = [];
    
    // 提取JSON数组（可能被包裹在markdown代码块中）
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      episodes = JSON.parse(jsonMatch[0]);
    } else {
      episodes = JSON.parse(content);
    }

    // 验证格式
    if (!Array.isArray(episodes)) {
      console.error('[ResponseParser] Content is not an array');
      return null;
    }

    // 标准化数据
    const normalized: EpisodeOutline[] = episodes.map((ep: any, index: number) => ({
      episodeNumber: ep.episodeNumber || (index + 1),
      title: ep.title || `第${index + 1}集`,
      synopsis: ep.synopsis || ep.summary || '',
      growthTheme: ep.growthTheme || ep.theme || '成长与探索',
      keyMoments: Array.isArray(ep.keyMoments) ? ep.keyMoments : [],
    }));

    // 确保返回预期数量的剧集
    if (normalized.length > expectedCount) {
      return normalized.slice(0, expectedCount);
    }

    return normalized;
  } catch (error) {
    console.error('[ResponseParser] Failed to parse episodes:', error);
    console.error('[ResponseParser] Content:', content);
    return null;
  }
}

/**
 * 解析包含角色的完整内容
 */
export function parseCompleteContent(content: string, expectedCount: number): {
  characters: CharacterInfo[];
  episodes: EpisodeOutline[];
} {
  try {
    // 提取JSON对象
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON object found');
    }
    
    const data = JSON.parse(jsonMatch[0]);
    
    // 解析角色
    const characters: CharacterInfo[] = (data.characters || []).map((char: any) => ({
      name: char.name || '未命名角色',
      description: char.description || '',
      appearance: char.appearance || '待定',
      personality: char.personality || '待定',
      role: char.role || 'supporting',
      growthArc: char.growthArc || '',
      coreValues: Array.isArray(char.coreValues) ? char.coreValues : [],
    }));
    
    // 解析剧集
    const episodes: EpisodeOutline[] = (data.episodes || []).map((ep: any, index: number) => ({
      episodeNumber: ep.episodeNumber || (index + 1),
      title: ep.title || `第${index + 1}集`,
      synopsis: ep.synopsis || ep.summary || '',
      growthTheme: ep.growthTheme || ep.theme || '成长与探索',
      keyMoments: Array.isArray(ep.keyMoments) ? ep.keyMoments : [],
    }));
    
    // 确保返回预期数量的剧集
    if (episodes.length > expectedCount) {
      return {
        characters,
        episodes: episodes.slice(0, expectedCount),
      };
    }
    
    return { characters, episodes };
  } catch (error) {
    console.error('[ResponseParser] Failed to parse complete content:', error);
    console.error('[ResponseParser] Content:', content);
    return {
      characters: [],
      episodes: [],
    };
  }
}

/**
 * 生成备用角色（当AI无法生成时）
 */
export function generateFallbackCharacters(request: GenerateEpisodesRequest): CharacterInfo[] {
  return [
    {
      name: '小明',
      description: `${request.seriesDescription}的主人公`,
      appearance: '充满活力的少年',
      personality: '勇敢、善良、富有好奇心',
      role: 'protagonist',
      growthArc: '从普通孩子成长为有担当的小英雄',
      coreValues: ['勇气', '责任', '友善'],
    },
    {
      name: '小红',
      description: '小明的好朋友',
      appearance: '聪明伶俐的女孩',
      personality: '聪明、细心、乐于助人',
      role: 'supporting',
      growthArc: '学会团队协作和信任他人',
      coreValues: ['智慧', '友谊', '诚信'],
    },
  ];
}
