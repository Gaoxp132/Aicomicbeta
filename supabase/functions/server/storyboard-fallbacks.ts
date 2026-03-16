/**
 * Storyboard fallback templates - clean module
 * v6.0.175: Extracted from app.tsx to resolve U+FFFD encoding corruption
 * that caused syntax errors in the inline tpls array definition.
 */

export interface StoryboardTemplate {
  desc: string;
  cam: string;
  tone: string;
}

/**
 * Returns the default fallback storyboard templates.
 * Used when AI storyboard generation fails and sbOutlines is empty.
 */
export function getDefaultStoryboardTemplates(): StoryboardTemplate[] {
  return [
    { desc: '开场画面，建立场景氛围', cam: '远景', tone: '期待' },
    { desc: '角色登场，展现人物状态', cam: '中景', tone: '自然' },
    { desc: '关键对话，推动剧情', cam: '中近景', tone: '认真' },
    { desc: '冲突或转折发生', cam: '特写', tone: '紧张' },
    { desc: '展现人物状态', cam: '中景', tone: '自然' },
    { desc: '关键对话，推动剧情', cam: '中近景', tone: '认真' },
    { desc: '冲突或转折发生', cam: '特写', tone: '紧张' },
    { desc: '角色做出选择', cam: '中景', tone: '坚定' },
    { desc: '行动场景', cam: '中景', tone: '激动' },
    { desc: '高潮时刻', cam: '特写', tone: '震撼' },
    { desc: '本集结尾', cam: '远景', tone: '余韵' },
  ];
}
