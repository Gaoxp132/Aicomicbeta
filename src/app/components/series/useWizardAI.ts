/**
 * useWizardAI — AI-powered series creation wizard hooks
 * Extracted from hooks.ts for maintainability
 */

import { useState } from 'react';
import { toast } from 'sonner';
import type { Series, SeriesFormData } from '../../types';
import * as services from '../../services';
import { apiPost, getErrorMessage } from '../../utils';
import { STYLES, GENRES } from '../../constants';

interface UseWizardAIOptions {
  formData: SeriesFormData;
  setFormData: React.Dispatch<React.SetStateAction<SeriesFormData>>;
  userPhone?: string;
  onComplete: (series: Series) => void;
}

export function useWizardAI({ formData, setFormData, userPhone, onComplete }: UseWizardAIOptions) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingBasicInfo, setIsGeneratingBasicInfo] = useState(false);
  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);

  const handleAIGenerate = async () => {
    setIsGeneratingBasicInfo(true);

    const result = await apiPost('/series/generate-basic-info', {
      userInput: formData.title || formData.description || '',
    }, {
      timeout: 180000,
      headers: userPhone ? { 'X-User-Phone': userPhone } : {},
    });

    if (result.success) {
      const aiData = result.data || result;

      if (aiData.title) {
        setFormData(prev => ({ ...prev, title: String(aiData.title) }));
      }
      if (aiData.description) {
        setFormData(prev => ({ ...prev, description: String(aiData.description) }));
      }

      if (aiData.title && aiData.description) {
        const isFallback = result.fallback ? ' (使用默认方案)' : '';
        toast.success(`AI生成成功！${isFallback}已自动填充标题和简介。`);
      } else {
        toast.warning('AI生成部分成功，请检查并手动补充缺失的字段。');
      }
    } else {
      const errorMsg = result.error || '未知错误';
      let errorMessage = 'AI生成失败：' + errorMsg;

      if (errorMsg.includes('timeout') || errorMsg.includes('超时')) {
        errorMessage = 'AI生成超时（3分钟），请稍后重试或手动填写。';
      } else if (errorMsg.includes('500')) {
        errorMessage += ' 服务器内部错误或AI服务配置问题。';
      } else if (errorMsg.includes('404')) {
        errorMessage += ' API路由不存在请检查部署。';
      } else if (errorMsg.includes('401') || errorMsg.includes('403')) {
        errorMessage += ' 权限不足或API密钥无效。';
      }

      console.error('[WizardAI] AI generation failed:', errorMsg);
      toast.error(errorMessage);
    }

    setIsGeneratingBasicInfo(false);
  };

  const handleAIGenerateOutline = async () => {
    if (!formData.title || !formData.description) {
      toast.warning('请先填写标题和简介后再生成大纲');
      return;
    }

    setIsGeneratingOutline(true);

    const genreName = GENRES.find(g => g.id === formData.genre)?.name || formData.genre;
    const styleName = STYLES.find(s => s.id === formData.style)?.name || formData.style;

    const result = await apiPost('/series/generate-outline', {
      title: formData.title,
      description: formData.description,
      genre: genreName,
      style: styleName,
      episodeCount: formData.episodeCount,
      existingOutline: formData.storyOutline || '',
    }, {
      timeout: 200000,
      headers: userPhone ? { 'X-User-Phone': userPhone } : {},
    });

    if (result.success) {
      const aiData = result.data || result;

      if (aiData.outline) {
        setFormData(prev => ({ ...prev, storyOutline: String(aiData.outline) }));

        const mode = formData.storyOutline ? '扩展完善' : '生成';
        const fallbackNote = result.fallback ? ' (使用默认模板)' : '';
        toast.success(`AI${mode}大纲成功！${fallbackNote}已自动填充，请检查后继续。`);
      } else if (aiData.mainPlot && aiData.episodes) {
        const episodes = aiData.episodes as Array<{ episodeNumber: number; title: string; synopsis: string; theme?: string }>;
        const outlineText = `【故事主线】\n${String(aiData.mainPlot)}\n\n${aiData.growthTheme ? `【成长主题】\n${String(aiData.growthTheme)}\n\n` : ''}【分集大纲】\n${episodes.map((ep) => `第${ep.episodeNumber}集 - ${ep.title}\n${ep.synopsis}\n主题：${ep.theme || '未指定'}`).join('\n\n')}`;

        setFormData(prev => ({ ...prev, storyOutline: outlineText }));

        const mode = formData.storyOutline ? '扩展完善' : '生成';
        const fallbackNote = result.fallback ? ' (使用默认模板)' : '';
        toast.success(`AI${mode}大纲成功！${fallbackNote}已填充${episodes.length}集大纲，请检查后继续。`);
      } else {
        console.error('[WizardAI] No outline in response:', aiData);
        toast.error('AI生成的内容格式异常，请重试或手动输入。');
      }
    } else {
      const errorMsg = result.error || '未知错误';
      if (errorMsg.includes('timeout') || errorMsg.includes('超时')) {
        toast.error('AI大纲生成超时，建议减少集数或简化描述后重试。');
      } else {
        toast.error('AI生成大纲失败：' + errorMsg);
      }
      console.error('[WizardAI] AI outline generation failed:', errorMsg);
    }

    setIsGeneratingOutline(false);
  };

  const handleAnalyze = async () => {
    if (!userPhone) {
      toast.error('请先登录');
      return;
    }

    setIsAnalyzing(true);

    try {
      const createResult = await services.createSeries(formData, userPhone);

      if (!createResult.success || !createResult.data) {
        const errMsg = createResult.error || '创建作品失败';
        if (errMsg.includes('Edge Function') || errMsg.includes('Failed to fetch') || errMsg.includes('未连接')) {
          toast.error('服务器暂时不可用，请稍后重试。如持续出现，请检查网络连接。');
        } else {
          toast.error(`创作失败：${errMsg}`);
        }
        setIsAnalyzing(false);
        return;
      }

      const newSeries = createResult.data;

      setIsAnalyzing(false);

      toast.success('作品创建成功！AI正在后台生成剧集和分镜，页面会自动更新。');

      onComplete(newSeries);
    } catch (error: unknown) {
      const errMsg = getErrorMessage(error);
      console.error('[WizardAI] Series creation failed:', error);

      let errorMessage = '创作失败';
      if (errMsg) {
        if (errMsg.includes('404')) {
          errorMessage = 'AI服务暂时不可用（错误代码：404）。请稍后重试或联系技术支持。';
        } else if (errMsg.includes('timeout') || errMsg.includes('超时')) {
          errorMessage = '请求超时，服务器响应时间过长。请检查网络连接后重试。';
        } else if (errMsg.includes('Network') || errMsg.includes('网络')) {
          errorMessage = '网络连接失败，请检查您的网络设置。';
        } else {
          errorMessage = `创作失败：${errMsg}`;
        }
      }

      toast.error(errorMessage);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return {
    isAnalyzing,
    isGeneratingBasicInfo,
    isGeneratingOutline,
    handleAIGenerate,
    handleAIGenerateOutline,
    handleAnalyze,
  };
}