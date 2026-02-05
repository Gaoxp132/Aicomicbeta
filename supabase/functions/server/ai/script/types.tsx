/**
 * 剧本生成类型定义
 * 从 ai/script_generator.tsx 提取
 */

export interface EpisodeOutline {
  episodeNumber: number;
  title: string;
  synopsis: string;
  growthTheme: string;
  keyMoments: string[];
}

export interface CharacterInfo {
  name: string;
  description: string;
  appearance: string;
  personality: string;
  role: string;
  growthArc: string;
  coreValues: string[];
}

export interface GenerateEpisodesRequest {
  seriesTitle: string;
  seriesDescription: string;
  totalEpisodes: number;
  genre: string;
  theme?: string;
  targetAudience?: string;
}
