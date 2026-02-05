/**
 * 🚀 完全自动化的漫剧生成（快速创作模式）
 */
export async function autoGenerateSeriesFromIdea(
  seriesId: string,
  options: GenerationOptions
): Promise<void> {
  console.log('[AutoGen] 🚀 Starting full auto-generation for series:', seriesId);
  console.log('[AutoGen] 📊 Generation options:', JSON.stringify(options, null, 2));
  
  try {
    const { userPhone, userInput, totalEpisodes, targetAudience, preferredThemes, scriptGenre, style, enableAudio } = options;
    
    // 📖 步骤1：AI生成完整故事大纲
    console.log('[AutoGen] 📖 Step 1/6: Generating story from idea...');
    await db.updateSeriesProgress(seriesId, 1, '分析创作灵感');
    
    const aiResult = await createCompleteSeriesFromIdea(userInput || '', {
      targetAudience: targetAudience || 'universal',
      preferredThemes: preferredThemes || ['SELF_GROWTH', 'FAMILY_BONDS'],
      totalEpisodes: totalEpisodes || 5,
      scriptGenre: scriptGenre || '现实生活',
    });
    
    // 更新漫剧基础信息
    await db.updateSeries(seriesId, {
      title: aiResult.title,
      description: aiResult.theme,
      theme: aiResult.theme,
      story_outline: aiResult.storyOutline,
      core_values: aiResult.coreValues,
      coherence_check: aiResult.coherenceCheck,
    });
    
    console.log('[AutoGen] ✅ Story generated:', aiResult.title);
    
    // 👥 步骤2：创建角色
    console.log('[AutoGen] 👥 Step 2/6: Creating characters...');
    await db.updateSeriesProgress(seriesId, 2, '生成角色');
    
    const charactersData = aiResult.characters.map((char: any) => ({
      series_id: seriesId,
      name: char.name,
      description: char.description,
      appearance: char.appearance,
      personality: char.personality,
      role: char.role,
      growth_arc: char.growthArc,
      core_values: char.coreValues,
    }));
    
    const characters = await db.createCharacters(charactersData);
    console.log('[AutoGen] ✅ Created', characters.length, 'characters');
    
    // 📚 步骤3：创建剧集（带分镜）
    console.log('[AutoGen] 📚 Step 3/6: Creating episodes with storyboards...');
    await db.updateSeriesProgress(seriesId, 3, '生成剧集');
    
    const episodes = await Promise.all(
      aiResult.episodes.map(async (ep: any, index: number) => {
        const episodeData = {
          series_id: seriesId,
          episode_number: ep.episodeNumber,
          title: ep.title,
          synopsis: ep.synopsis || '',  // 🔥 v4.2.67: 使用synopsis替代description
          growth_theme: ep.growthTheme || '',  // 🔥 v4.2.67: 使用growth_theme
          growth_insight: ep.growthInsight || '',  // 🔥 v4.2.67: 新增字段
          key_moment: ep.keyMoment || '',  // 🔥 v4.2.67: 新增字段
          total_duration: (ep.scenes || []).reduce((sum: number, s: any) => sum + (s.duration || 8), 0),  // 🔥 v4.2.67: 使用total_duration
          status: 'draft' as const,
        };
        
        const [episode] = await db.createEpisodes([episodeData]);
        
        // 创建分镜
        if (ep.scenes && ep.scenes.length > 0) {
          const storyboardsData = ep.scenes.map((scene: any, idx: number) => ({
            episode_id: episode.id,
            scene_number: scene.sceneNumber || (idx + 1),
            description: scene.description,
            dialogue: scene.dialogue,
            characters: scene.characters || [],
            location: scene.location,
            time_of_day: scene.timeOfDay,
            camera_angle: scene.cameraAngle,
            duration: scene.duration || 8,
            emotional_tone: scene.emotionalTone,
            growth_insight: scene.growthInsight,
            status: 'draft' as const,
          }));
          
          await db.createStoryboards(storyboardsData);
        }
        
        return episode;
      })
    );
    
    console.log('[AutoGen] ✅ Created', episodes.length, 'episodes with storyboards');
    
    // 🎬 步骤4-5：自动生成所有视频
    if (AUTO_GENERATION_CONFIG.VIDEO_GENERATION_ENABLED) {
      await autoGenerateAllVideos(
        seriesId, 
        style || 'realistic', 
        enableAudio || false,
        userPhone || 'system' // 🔧 关键修复：传递 userPhone 参数
      );
    }
    
    // 🎉 步骤6：完成
    console.log('[AutoGen] 🎉 Step 6/6: Finalizing...');
    await db.updateSeries(seriesId, {
      status: 'completed',
      generation_progress: {
        currentStep: 6,
        totalSteps: 6,
        stepName: '创作完成',
        completedAt: new Date().toISOString(),
      },
    });
    
    console.log('[AutoGen] 🎉 Series fully completed:', seriesId);
    
  } catch (error: any) {
    console.error('[AutoGen] ❌ Auto-generation failed:', error);
    
    // 🔧 如果Series已被删除，不要尝试更新状态
    if (error.message === 'Series not found') {
      console.warn('[AutoGen] ⚠️ Series was deleted, skipping status update');
      return;
    }
    
    try {
      await db.updateSeries(seriesId, {
        status: 'failed',
        generation_progress: {
          currentStep: 0,
          totalSteps: 6,
          stepName: '自动生成失败',
          error: error.message,
          failedAt: new Date().toISOString(),
        },
      });
    } catch (updateError: any) {
      console.error('[AutoGen] ❌ Failed to update series status:', updateError.message);
    }
    
    throw error;
  }
}