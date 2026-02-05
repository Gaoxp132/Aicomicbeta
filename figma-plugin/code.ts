/**
 * 创建新漫剧系列
 */
async function handleCreateSeries(data: { title: string; description: string }) {
  try {
    const response = await fetch(`${EDGE_FUNCTION_URL}/figma/create-series`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        title: data.title,
        description: data.description,
        figmaFileKey: figma.fileKey || 'unknown',
        figmaFileName: figma.root.name,
        userId: figma.currentUser?.id || 'figma_user',
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();

    figma.ui.postMessage({
      type: 'series-created',
      data: result
    });

    figma.notify('🎉 漫剧创建成功！');
  } catch (error: any) {
    console.error('[Figma Plugin] Create series error:', error);
    figma.ui.postMessage({
      type: 'error',
      message: `创建失败: ${error.message}`
    });
    figma.notify('❌ 创建失败', { error: true });
  }
}