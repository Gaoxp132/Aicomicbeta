import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Sparkles, Loader2, BookOpen, Film, Palette } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { STYLES } from '../../constants/videoGeneration';
import * as seriesService from '../../services/seriesService';
import { generateEpisodeOutlines } from '../../services/aiEpisodeGenerator';
import type { Series, SeriesFormData, AIAnalysisResult } from '../../types';
import { projectId, publicAnonKey } from '/utils/supabase/info';

interface SeriesCreationWizardProps {
  onComplete: (series: Series) => void;
  onCancel: () => void;
  userPhone?: string;
}

const GENRES = [
  { id: 'romance', name: '爱情', icon: '💕', color: 'from-pink-500 to-rose-500' },
  { id: 'suspense', name: '悬疑', icon: '🔍', color: 'from-purple-500 to-indigo-500' },
  { id: 'comedy', name: '喜剧', icon: '😄', color: 'from-yellow-500 to-orange-500' },
  { id: 'action', name: '动作', icon: '⚡', color: 'from-red-500 to-orange-500' },
  { id: 'fantasy', name: '奇幻', icon: '✨', color: 'from-cyan-500 to-blue-500' },
  { id: 'horror', name: '恐怖', icon: '👻', color: 'from-gray-700 to-gray-900' },
  { id: 'scifi', name: '科幻', icon: '🚀', color: 'from-blue-500 to-purple-500' },
  { id: 'drama', name: '剧情', icon: '🎭', color: 'from-teal-500 to-green-500' },
];

export function SeriesCreationWizard({ onComplete, onCancel, userPhone }: SeriesCreationWizardProps) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<SeriesFormData>({
    title: '',
    description: '',
    genre: 'romance',
    style: 'realistic',
    episodeCount: 10,
    storyOutline: '',
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingBasicInfo, setIsGeneratingBasicInfo] = useState(false);
  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);

  // ✨ AI生成基本信息
  const handleAIGenerate = async () => {
    setIsGeneratingBasicInfo(true);
    
    try {
      console.log('[SeriesCreationWizard] 🤖 Calling AI to generate basic info...');
      console.log('[SeriesCreationWizard] 📍 Project ID:', projectId);
      console.log('[SeriesCreationWizard] 📍 Public Key exists:', !!publicAnonKey);
      
      const apiUrl = `https://${projectId}.supabase.co/functions/v1/make-server-fc31472c/series/generate-basic-info`;
      console.log('[SeriesCreationWizard] 📍 API URL:', apiUrl);
      
      // 🚀 使用AbortController实现180秒超时 - v4.2.48: 增加至180秒以匹配服务器配置
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000); // 180秒超时（3分钟）
      
      try {
        // 调用后端API生成基本信息
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            userInput: formData.title || formData.description || '', // 有内容则结合生成，无内容则随机生成
          }),
          signal: controller.signal, // 添加超时信号
        });

        clearTimeout(timeoutId);

        console.log('[SeriesCreationWizard] 📍 Response status:', response.status);
        console.log('[SeriesCreationWizard] 📍 Response ok:', response.ok);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[SeriesCreationWizard] ❌ Response error:', errorText);
          throw new Error(`API请求失败: ${response.status} - ${errorText.substring(0, 200)}`);
        }

        const result = await response.json();
        console.log('[SeriesCreationWizard] ✅ AI response received:', result);

        // 🔧 修复：后端返回的是 { success: true, data: { title, description } }
        const aiData = result.data || result;
        
        console.log('[SeriesCreationWizard] 📦 Extracted data:', aiData);

        // 填充表单
        if (aiData.title) {
          console.log('[SeriesCreationWizard] 📝 Setting title:', aiData.title);
          setFormData(prev => ({ ...prev, title: aiData.title }));
        }
        if (aiData.description) {
          console.log('[SeriesCreationWizard] 📝 Setting description:', aiData.description);
          setFormData(prev => ({ ...prev, description: aiData.description }));
        }

        // 🎉 成功提示
        if (aiData.title && aiData.description) {
          const isFallback = result.fallback ? ' (使用默认方案)' : '';
          alert(`✅ AI生成成功！${isFallback}\n\n标题：${aiData.title}\n\n已自动填充表单，请检查并继续下一步。`);
        } else {
          alert('⚠️ AI生成部分成功，请检查并手动补充缺失的字段。');
        }
        
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        
        if (fetchError.name === 'AbortError') {
          console.error('[SeriesCreationWizard] ⏱️ Request timeout after 180s');
          alert('⏱️ AI生成超时（3分钟）\n\n可能原因：\n1. 网络连接慢\n2. AI服务繁忙\n3. API配置问题\n\n建议：\n- 检查网络连接\n- 稍后重试\n- 或手动填写表单');
        } else {
          throw fetchError;
        }
      }
    } catch (error: any) {
      console.error('[SeriesCreationWizard] ❌ AI generation failed:', error);
      console.error('[SeriesCreationWizard] ❌ Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack?.substring(0, 200),
      });
      
      // 🔧 提供详细的错误信息和建议
      let errorMessage = 'AI生成失败：' + error.message;
      if (error.message.includes('500')) {
        errorMessage += '\n\n可能原因：服务器内部错误或AI服务配置问题';
      } else if (error.message.includes('404')) {
        errorMessage += '\n\n可能原因：API路由不存在';
      } else if (error.message.includes('401') || error.message.includes('403')) {
        errorMessage += '\n\n可能原因：权限不足或API密钥无效';
      }
      
      alert(errorMessage + '\n\n建议：请手动填写表单或联系技术支持');
    } finally {
      setIsGeneratingBasicInfo(false);
    }
  };

  // ✨ AI生成故事大纲
  const handleAIGenerateOutline = async () => {
    // ✅ 验证必填字段
    if (!formData.title || !formData.description) {
      alert('⚠️ 请先填写标题和简介后再生成大纲');
      return;
    }
    
    setIsGeneratingOutline(true);
    
    try {
      console.log('[SeriesCreationWizard] 🤖 Calling AI to generate story outline...');
      
      // 查找当前选择的类型和风格的名称
      const genreName = GENRES.find(g => g.id === formData.genre)?.name || formData.genre;
      const styleName = STYLES.find(s => s.id === formData.style)?.name || formData.style;
      
      const apiUrl = `https://${projectId}.supabase.co/functions/v1/make-server-fc31472c/series/generate-outline`;
      console.log('[SeriesCreationWizard] 📍 API URL:', apiUrl);
      console.log('[SeriesCreationWizard] 📍 Context:', {
        title: formData.title,
        description: formData.description,
        genre: genreName,
        style: styleName,
        episodeCount: formData.episodeCount,
        existingOutline: formData.storyOutline ? '已有内容' : '无',
      });
      
      // 🚀 使用AbortController实现200秒超时 - v4.2.47: 延长以匹配服务器180秒超时
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 200000); // 200秒超时（3分20秒，给服务器足够时间）
      
      // 🎯 添加进度提示
      let progressInterval: NodeJS.Timeout | null = null;
      let elapsedSeconds = 0;
      
      progressInterval = setInterval(() => {
        elapsedSeconds += 5;
        console.log(`[SeriesCreationWizard] ⏳ AI生成进行中... 已用时${elapsedSeconds}秒`);
        
        // 每15秒给用户一个提示
        if (elapsedSeconds % 15 === 0) {
          const hints = [
            '🎨 AI正在构思故事结构...',
            '📝 AI正在设计角色成长线...',
            '🌟 AI正在规划剧集主题...',
            '💡 AI正在优化故事节奏...',
          ];
          const hintIndex = Math.floor(elapsedSeconds / 15) % hints.length;
          console.log(`[SeriesCreationWizard] ${hints[hintIndex]}`);
        }
      }, 5000);
      
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            title: formData.title,
            description: formData.description,
            genre: genreName,
            style: styleName,
            episodeCount: formData.episodeCount,
            existingOutline: formData.storyOutline || '', // 如果用户已填入，AI会结合这些内容
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        if (progressInterval) clearInterval(progressInterval);

        console.log('[SeriesCreationWizard] 📍 Outline response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[SeriesCreationWizard] ❌ Outline response error:', errorText);
          throw new Error(`API请求失败: ${response.status}`);
        }

        const result = await response.json();
        console.log('[SeriesCreationWizard] ✅ AI outline response received:', {
          hasData: !!result.data,
          hasOutline: !!(result.data?.outline || result.outline),
          hasMainPlot: !!(result.data?.mainPlot || result.mainPlot),
          hasEpisodes: !!(result.data?.episodes || result.episodes),
          isFallback: result.fallback,
        });

        const aiData = result.data || result;
        
        // 🔄 支持两种格式：
        // 1. 旧格式：{ outline: "字符串" }
        // 2. 新格式：{ mainPlot, growthTheme, outline, episodes }
        if (aiData.outline) {
          // 旧格式或新格式都有outline字段
          console.log('[SeriesCreationWizard] 📝 Setting story outline, length:', aiData.outline.length);
          setFormData(prev => ({ ...prev, storyOutline: aiData.outline }));
          
          // 🎉 成功提示
          const mode = formData.storyOutline ? '扩展完善' : '生';
          const fallbackNote = result.fallback ? '\n\n(使用默认模板)' : '';
          alert(`✅ AI${mode}大纲成功！${fallbackNote}\n\n已自动填充故事大纲，请检查并修改后继续。`);
        } else if (aiData.mainPlot && aiData.episodes) {
          // 新格式：构建outline字符串
          console.log('[SeriesCreationWizard] 📝 Building outline from mainPlot and episodes');
          const outlineText = `【故事主线】\n${aiData.mainPlot}\n\n${aiData.growthTheme ? `【成长主题】\n${aiData.growthTheme}\n\n` : ''}【分集大纲】\n${aiData.episodes.map((ep: any) => `第${ep.episodeNumber}集 - ${ep.title}\n${ep.synopsis}\n主题：${ep.theme || '未指定'}`).join('\n\n')}`;
          
          setFormData(prev => ({ ...prev, storyOutline: outlineText }));
          
          const mode = formData.storyOutline ? '扩展完善' : '生成';
          const fallbackNote = result.fallback ? '\n\n(使用默认模板)' : '';
          alert(`✅ AI${mode}大纲成功！${fallbackNote}\n\n已自动填充故事大纲（${aiData.episodes.length}集），请检查并修改后继续。`);
        } else {
          console.error('[SeriesCreationWizard] ❌ No outline in response:', aiData);
          alert('⚠️ AI生成的内容格式异常，请重试或手动输入。');
        }
        
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (progressInterval) clearInterval(progressInterval);
        
        if (fetchError.name === 'AbortError') {
          console.error('[SeriesCreationWizard] ⏱️ Outline request timeout after 200s');
          alert('⏱️ AI生成超时（3分钟+）\n\n可能原因：\n1. 大纲内容复杂，生成时间较长\n2. AI服务繁忙\n3. 网络连接不稳定\n\n建议：\n- 减少剧集数量后重试\n- 简化故事描述\n- 稍后再试');
        } else {
          throw fetchError;
        }
      }
    } catch (error: any) {
      console.error('[SeriesCreationWizard] ❌ AI outline generation failed:', error);
      console.error('[SeriesCreationWizard] ❌ Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack?.substring(0, 200),
      });
      alert('AI生成大纲失败：' + error.message + '\n\n请手动输入或重试。');
    } finally {
      setIsGeneratingOutline(false);
    }
  };

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    } else {
      onCancel();
    }
  };

  const handleAnalyze = async () => {
    if (!userPhone) {
      toast.error('请先登录');
      return;
    }
    
    setIsAnalyzing(true);
    
    try {
      console.log('[SeriesCreationWizard] Creating series with background AI generation...');
      
      // 步骤1：创建漫剧基础信息
      const createResult = await seriesService.createSeries(formData, userPhone);
      
      if (!createResult.success || !createResult.data) {
        throw new Error(createResult.error || '创建漫剧失败');
      }
      
      const newSeries = createResult.data;
      console.log('[SeriesCreationWizard] Series created:', newSeries.id);
      
      // ✅ 立即关闭加载状态，让UI可以正常跳转
      setIsAnalyzing(false);
      
      // ✅ 立即返回并跳转到剧集管理页面
      toast.success('✅ 漫剧创建成功！AI正在后台生成剧集大纲...');
      
      // 先返回漫剧，让用户立即进入管理页面
      onComplete(newSeries);
      
      // 🚀 在后台异步生成剧集大纲（不等待完成）
      generateEpisodeOutlines({
        seriesTitle: formData.title,
        seriesDescription: formData.description,
        totalEpisodes: formData.episodeCount,
        genre: formData.genre,
        theme: formData.theme,
        targetAudience: formData.targetAudience,
      }).then(episodesResult => {
        console.log('[SeriesCreationWizard] 🎉 Background AI generation completed');
        
        if (episodesResult.success && episodesResult.episodes) {
          console.log(`[SeriesCreationWizard] ✅ Generated ${episodesResult.episodes.length} episodes in background`);
          // 注意：由于已经跳转，这里的更新需要由父组件轮询或WebSocket来获取
          toast.success('🎉 AI剧集大纲生成完成！请刷新页面查看。');
        } else {
          console.warn('[SeriesCreationWizard] ⚠️ Background AI generation failed:', episodesResult.error);
        }
      }).catch(error => {
        console.error('[SeriesCreationWizard] ❌ Background AI generation error:', error);
      });
      
    } catch (error: any) {
      console.error('[SeriesCreationWizard] Series creation failed:', error);
      
      // 提供更详细的错误信息
      let errorMessage = '创作失败';
      if (error.message) {
        if (error.message.includes('404')) {
          errorMessage = 'AI服暂时不可用（错误代码：404）。请稍后重试或联系技术支持。';
        } else if (error.message.includes('timeout') || error.message.includes('超时')) {
          errorMessage = '请求超时，服务器响应时间过长。请检查网络连接后重试。';
        } else if (error.message.includes('Network') || error.message.includes('网络')) {
          errorMessage = '网络连接失败，请检查您的网络设置。';
        } else {
          errorMessage = `创作失败：${error.message}`;
        }
      }
      
      toast.error(errorMessage);
    } finally {
      // 只在发生错误的情况下才需要重置状态（成功时已经在上面重置了）
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* 头部 */}
      <div className="mb-8">
        <Button
          onClick={handleBack}
          variant="ghost"
          className="mb-4 text-gray-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          返回
        </Button>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-2xl border border-purple-500/30">
            <Sparkles className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">创建漫剧</h1>
            <p className="text-sm text-gray-400 mt-1">第 {step} 步，共 3 步</p>
          </div>
        </div>

        {/* 进度条 */}
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-2 flex-1 rounded-full transition-all ${
                i <= step ? 'bg-gradient-to-r from-purple-500 to-pink-500' : 'bg-white/10'
              }`}
            />
          ))}
        </div>
      </div>

      {/* 步骤内容 */}
      <motion.div
        key={step}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.3 }}
      >
        {step === 1 && (
          <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-6 sm:p-8 border border-white/10">
            <div className="flex items-center gap-2 mb-6">
              <BookOpen className="w-5 h-5 text-purple-400" />
              <h2 className="text-xl font-bold text-white">基本信息</h2>
            </div>

            <div className="space-y-6">
              {/* 标题 */}
              <div>
                <Label className="text-white mb-2 block">漫剧标题 *</Label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="例如：都市爱情故事"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* 简介 */}
              <div>
                <Label className="text-white mb-2 block">剧集简介 *</Label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="简单描述您的漫剧内容"
                  rows={3}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                />
              </div>

              {/* 剧集数量 */}
              <div>
                <Label className="text-white mb-2 block">计划集数</Label>
                <div className="grid grid-cols-5 gap-3 mb-4">
                  {[10, 20, 30, 40, 50].map((count) => (
                    <button
                      key={count}
                      onClick={() => setFormData({ ...formData, episodeCount: count })}
                      className={`p-3 rounded-xl border-2 transition-all ${
                        formData.episodeCount === count
                          ? 'border-purple-500 bg-purple-500/20 text-white'
                          : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/20'
                      }`}
                    >
                      <div className="text-lg font-bold">{count}</div>
                      <div className="text-xs">集</div>
                    </button>
                  ))}
                </div>
                
                {/* 自定义集数 */}
                <div className="mt-4">
                  <Label className="text-gray-400 text-sm mb-2 block">
                    或自定义集数 (3-80集)
                  </Label>
                  <input
                    type="number"
                    min="3"
                    max="80"
                    value={formData.episodeCount}
                    onChange={(e) => {
                      const value = Math.max(3, Math.min(80, parseInt(e.target.value) || 3));
                      setFormData({ ...formData, episodeCount: value });
                    }}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                    placeholder="输入集数..."
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8">
              <Button
                onClick={handleAIGenerate}
                disabled={isGeneratingBasicInfo}
                variant="outline"
                className="border-purple-500/30 text-purple-300 hover:bg-purple-500/10"
              >
                {isGeneratingBasicInfo ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    AI生成中...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    AI智能生成
                  </>
                )}
              </Button>
              <Button
                onClick={handleNext}
                disabled={!formData.title || !formData.description}
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50"
              >
                下一步
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-6 sm:p-8 border border-white/10">
            <div className="flex items-center gap-2 mb-6">
              <Film className="w-5 h-5 text-purple-400" />
              <h2 className="text-xl font-bold text-white">选择类型</h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              {GENRES.map((genre) => (
                <motion.button
                  key={genre.id}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setFormData({ ...formData, genre: genre.id })}
                  className={`p-4 rounded-2xl border-2 transition-all ${
                    formData.genre === genre.id
                      ? 'border-purple-500 bg-gradient-to-br from-purple-500/20 to-pink-500/20 shadow-lg'
                      : 'border-white/10 bg-white/5 hover:border-white/20'
                  }`}
                >
                  <div className="text-3xl mb-2">{genre.icon}</div>
                  <div className={`text-sm font-medium ${
                    formData.genre === genre.id ? 'text-white' : 'text-gray-400'
                  }`}>
                    {genre.name}
                  </div>
                </motion.button>
              ))}
            </div>

            <div className="flex items-center gap-2 mb-4">
              <Palette className="w-5 h-5 text-purple-400" />
              <Label className="text-white">视觉风格</Label>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {STYLES.map((style) => (
                <motion.button
                  key={style.id}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setFormData({ ...formData, style: style.id })}
                  className={`p-4 rounded-2xl border-2 transition-all ${
                    formData.style === style.id
                      ? 'border-purple-500 bg-gradient-to-br from-purple-500/20 to-pink-500/20 shadow-lg'
                      : 'border-white/10 bg-white/5 hover:border-white/20'
                  }`}
                >
                  <div className="text-2xl mb-2">{style.icon}</div>
                  <div className={`text-sm font-medium ${
                    formData.style === style.id ? 'text-white' : 'text-gray-400'
                  }`}>
                    {style.name}
                  </div>
                </motion.button>
              ))}
            </div>

            <div className="flex justify-between gap-3 mt-8">
              <Button onClick={handleBack} variant="ghost">
                上一步
              </Button>
              <Button
                onClick={handleNext}
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
              >
                下一步
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-6 sm:p-8 border border-white/10">
            <div className="flex items-center gap-2 mb-6">
              <Sparkles className="w-5 h-5 text-purple-400" />
              <h2 className="text-xl font-bold text-white">故事大纲</h2>
            </div>

            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-white">
                    请描述您的故事大纲 *
                  </Label>
                  <Button
                    onClick={handleAIGenerateOutline}
                    disabled={isGeneratingOutline}
                    variant="outline"
                    size="sm"
                    className="border-purple-500/30 text-purple-300 hover:bg-purple-500/10"
                  >
                    {isGeneratingOutline ? (
                      <>
                        <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                        AI生中...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3 mr-1.5" />
                        {formData.storyOutline ? 'AI扩展完善' : 'AI生成大纲'}
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-sm text-gray-400 mb-3">
                  AI将根据您的描述自动提取角色、生成分集大纲和分镜脚本
                </p>
                <textarea
                  value={formData.storyOutline}
                  onChange={(e) => setFormData({ ...formData, storyOutline: e.target.value })}
                  placeholder="例如：讲述一个年轻程序员在大城市打拼，意外遇到心仪的女孩，两人从相识到相知的温馨爱情故事。主要角色包括男主角李明（程序员，性格内向但温暖）和女主角王小雨（设计师，活泼开朗）..."
                  rows={12}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                />
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                <p className="text-sm text-blue-300">
                  💡 提示：{formData.storyOutline ? '点击"AI扩展完善"可以让AI结合您已填写的内容进行深化和完善' : '点击"AI生成大纲"可以根据面填写的标题、简介、类型、风格和集数自动生成详细大纲'}
                </p>
              </div>
            </div>

            <div className="flex justify-between gap-3 mt-8">
              <Button onClick={handleBack} variant="ghost">
                上一步
              </Button>
              <Button
                onClick={handleAnalyze}
                disabled={!formData.storyOutline || isAnalyzing}
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    AI分析中...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    开始创作
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}