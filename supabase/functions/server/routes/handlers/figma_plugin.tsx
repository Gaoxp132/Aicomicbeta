/**
 * 从 Figma 创建新漫剧系列
 * POST /make-server-fc31472c/figma/create-series
 * 无需用户登录
 */
export async function createSeriesFromFigma(c: Context) {
  try {
    const { title, description, figmaFileKey, figmaFileName, userId } = await c.req.json();
    
    console.log('[Figma Plugin] Creating series:', title);

    // 简单验证
    const authHeader = c.req.header('Authorization') || c.req.header('apikey');
    if (!authHeader) {
      return c.json({ error: 'Missing API key' }, 401);
    }

    // 使用固定的用户标识创建 series
    const userIdentifier = userId || 'figma_plugin_user';

    // 创建 series
    const seriesData = {
      user_phone: userIdentifier, // 使用 Figma 用户 ID 作为标识
      title,
      description,
      genre: '原创',
      style: 'realistic',
      theme: description,
      story_outline: description,
      core_values: [],
      total_episodes: 10,
      status: 'draft' as const,
    };

    const series = await db.createSeries(seriesData);

    console.log('[Figma Plugin] Series created:', series.id);

    return c.json({
      success: true,
      seriesId: series.id,
      title: series.title,
      message: '漫剧创建成功',
    });

  } catch (error: any) {
    console.error('[Figma Plugin] Create series error:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to create series'
    }, 500);
  }
}