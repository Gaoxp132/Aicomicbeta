/**
 * AI剧集生成服务
 */

import { projectId, publicAnonKey } from '/utils/supabase/info';

interface EpisodeOutline {
  episodeNumber: number;
  title: string;
  synopsis: string;
  growthTheme: string;
  keyMoments: string[];
}

interface GenerateEpisodesRequest {
  seriesTitle: string;
  seriesDescription: string;
  totalEpisodes: number;
  genre?: string;
  theme?: string;
  targetAudience?: string;
}

export async function generateEpisodeOutlines(
  request: GenerateEpisodesRequest
): Promise<{ success: boolean; episodes?: EpisodeOutline[]; error?: string }> {
  try {
    console.log('[AIEpisodeGenerator] Generating episodes:', request);

    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-fc31472c/ai/generate-episodes`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify(request),
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      console.error('[AIEpisodeGenerator] Error:', result);
      return {
        success: false,
        error: result.error || '生成失败',
      };
    }

    console.log(`[AIEpisodeGenerator] ✅ Generated ${result.episodes?.length} episodes`);

    return {
      success: true,
      episodes: result.episodes,
    };
  } catch (error: any) {
    console.error('[AIEpisodeGenerator] Exception:', error);
    return {
      success: false,
      error: error.message || '网络错误',
    };
  }
}
