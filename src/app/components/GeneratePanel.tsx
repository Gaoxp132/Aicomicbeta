import { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Wand2, Image as ImageIcon } from 'lucide-react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { getOptimalModel, getImageModeDescription, type ImageMode } from '../utils/modelSelection';
import { processImageFile } from '../utils/imageProcessing';
import { generateStoryWithAI as generateStoryAPI, generateImageWithAI as generateImageAPI, polishImagePrompt as polishPromptAPI } from '../services/aiGeneration';
import { MODEL_CAPABILITIES, STYLE_STORIES } from '../constants/videoGeneration';
import type { Comic } from '../types/index';

// 导入拆分的子组件
import { StorySection } from './generate/StorySection';
import { ImageUploadSection } from './generate/ImageUploadSection';
import { StyleSelector } from './generate/StyleSelector';
import { VideoSettings } from './generate/VideoSettings';
import { AIImageDialog } from './generate/AIImageDialog';

interface GeneratePanelProps {
  onGenerate: (data: { 
    prompt: string; 
    style: string; 
    duration: string; 
    imageUrls?: string[];
    resolution?: string;
    fps?: number;
    enableAudio?: boolean;
    model?: string;
  }) => void;
  activeTasks: Comic[];
}

export function GeneratePanel({ onGenerate, activeTasks }: GeneratePanelProps) {
  // 基本状态
  const [prompt, setPrompt] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('realistic');
  const [selectedDuration, setSelectedDuration] = useState('8s');
  const [selectedResolution, setSelectedResolution] = useState('720p');
  const [selectedFPS] = useState(24);
  const [enableAudio, setEnableAudio] = useState(true); // 默认开启语音
  const [imageMode, setImageMode] = useState<ImageMode>('first_frame');
  const [useTongyi, setUseTongyi] = useState(false); // 🆕 是否使用通义系列（万相生图 + Wan2.1-14B生视频）
  
  // 图片状态
  const [firstFrameUrl, setFirstFrameUrl] = useState<string>('');
  const [lastFrameUrl, setLastFrameUrl] = useState<string>('');
  const [firstFramePreview, setFirstFramePreview] = useState<string>('');
  const [lastFramePreview, setLastFramePreview] = useState<string>('');
  const [referenceUrls, setReferenceUrls] = useState<string[]>([]);
  const [referencePreviews, setReferencePreviews] = useState<string[]>([]);
  
  // 生成状态
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);
  const [showAiImageDialog, setShowAiImageDialog] = useState(false);
  const [aiImagePrompt, setAiImagePrompt] = useState('');
  const [aiImageType, setAiImageType] = useState<'first_frame' | 'last_frame' | 'reference'>('first_frame');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isPolishingPrompt, setIsPolishingPrompt] = useState(false);
  
  // Refs
  const firstFrameInputRef = useRef<HTMLInputElement>(null);
  const lastFrameInputRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  
  // 持久化AI生成状态的ref - 即使组件卸载也会保持
  const storyGenerationRef = useRef<{
    isGenerating: boolean;
    promise: Promise<string> | null;
  }>({
    isGenerating: false,
    promise: null,
  });

  // 获取当前所有图片URLs
  const getAllImageUrls = (): string[] => {
    if (imageMode === 'first_last') {
      const urls = [];
      if (firstFrameUrl) urls.push(firstFrameUrl);
      if (lastFrameUrl) urls.push(lastFrameUrl);
      return urls;
    } else if (imageMode === 'reference') {
      return referenceUrls;
    } else if (imageMode === 'first_frame') {
      return firstFrameUrl ? [firstFrameUrl] : [];
    }
    return [];
  };

  // 获取当前模型
  const currentModel = getOptimalModel(
    getAllImageUrls(),
    imageMode,
    selectedResolution,
    selectedDuration,
    enableAudio,
    useTongyi
  );
  const modelCapability = MODEL_CAPABILITIES[currentModel as keyof typeof MODEL_CAPABILITIES];

  // 检查配置项是否被当前模型支持
  const isResolutionSupported = (resolution: string) => {
    return modelCapability.resolutions.includes(resolution);
  };

  const isDurationSupported = (duration: string) => {
    return modelCapability.durations.includes(duration);
  };

  // ✨ 音支持检测：判断是否有任何模型支持音频（而不是当前模型）
  // 这样避免了当用户关闭音频后，无法再重新开启的问题
  const isAudioSupported = () => {
    // 音频模型 doubao-seedance-1-5-pro-251215 始终可用
    // 只要分辨率不是1080p，就可以开启音频
    return selectedResolution !== '1080p';
  };

  // 自动修正不兼容的配置
  useEffect(() => {
    // ✨ 重要：如果开启音频且使用参考图模式，自动切换到首帧模式
    // 音频模型不支持参考图模式（reference），只支持首帧和首尾帧
    if (enableAudio && imageMode === 'reference') {
      console.log('[GeneratePanel] 🎵 Audio enabled but reference mode not supported, switching to first_frame mode');
      setImageMode('first_frame');
      // 清除多余的参考图，只保留第一张
      if (referenceUrls.length > 1) {
        setReferenceUrls([referenceUrls[0]]);
        setReferencePreviews([referencePreviews[0]]);
      }
      // 将第一张参考图设置为首帧
      if (referenceUrls.length > 0) {
        setFirstFrameUrl(referenceUrls[0]);
        setFirstFramePreview(referencePreviews[0]);
        setReferenceUrls([]);
        setReferencePreviews([]);
      }
    }
    
    // ✨ 重要：如果开启音频，自动限制最大时长为12秒
    // 音频模型最长支持12秒
    if (enableAudio) {
      const durationNum = parseInt(selectedDuration);
      if (durationNum > 12) {
        console.log('[GeneratePanel] 🎵 Audio enabled, auto-limiting duration from', selectedDuration, 'to 12s');
        setSelectedDuration('12s');
      }
    }
    
    // ✨ 重要：如果开启音频，自动调整分辨率（音频模型只支持480p/720p）
    if (enableAudio && (selectedResolution === '1080p' || selectedResolution === '2k')) {
      console.log('[GeneratePanel] 🎵 Audio enabled, auto-downgrading resolution from', selectedResolution, 'to 720p');
      setSelectedResolution('720p');
    }
    
    // ✨ 重要：如果选择1080p或2k，自动关闭音频（音频模型不支持高分辨率）
    if ((selectedResolution === '1080p' || selectedResolution === '2k') && enableAudio) {
      console.log('[GeneratePanel] 📺 High resolution selected, auto-disabling audio');
      setEnableAudio(false);
    }
    
    if (!isResolutionSupported(selectedResolution)) {
      const supportedRes = modelCapability.resolutions.includes('720p') 
        ? '720p' 
        : modelCapability.resolutions[0];
      console.log('[GeneratePanel] ⚙️ Auto-adjusting resolution to:', supportedRes);
      setSelectedResolution(supportedRes);
    }

    if (!isDurationSupported(selectedDuration)) {
      const durationNum = parseInt(selectedDuration);
      const supportedDur = modelCapability.durations.find(d => parseInt(d) >= durationNum) || 
                          modelCapability.durations[modelCapability.durations.length - 1];
      console.log('[GeneratePanel] ⏱️ Auto-adjusting duration to:', supportedDur);
      setSelectedDuration(supportedDur);
    }

    if (enableAudio && !isAudioSupported()) {
      console.warn('[GeneratePanel] ⚠️ Audio not supported by current model, disabling');
      setEnableAudio(false);
    }
  }, [currentModel, enableAudio, selectedResolution, selectedDuration, imageMode]);

  // 🆕 当通义开关切换时，强制禁用音频（通义模型不支持音频）
  // 这个useEffect必须优先执行，确保通义模式下音频被立即关闭
  useEffect(() => {
    if (useTongyi && enableAudio) {
      console.log('[GeneratePanel] 🌟 Tongyi enabled, force-disabling audio (not supported by aliyun-wan-2.1-14b)');
      setEnableAudio(false);
    }
  }, [useTongyi, enableAudio]);

  // 组件挂载时检查是否有正在进行的AI生成任务
  useEffect(() => {
    // 如果有正在进行的生成任务，恢复状态并等待完成
    if (storyGenerationRef.current.isGenerating && storyGenerationRef.current.promise) {
      console.log('[GeneratePanel] 🔄 Detected ongoing story generation, restoring state...');
      setIsGeneratingStory(true);
      
      // 继续等待已有的Promise完成
      storyGenerationRef.current.promise
        .then((story) => {
          console.log('[GeneratePanel] ✅ Story generation completed after navigation');
          setPrompt(story);
        })
        .catch((error: any) => {
          console.error('[GeneratePanel] ❌ Story generation failed after navigation:', error);
          
          const hasFallback = error.fallbackStory && typeof error.fallbackStory === 'string';
          const isTimeout = error.isTimeout || 
                           error.name === 'AbortError' || 
                           error.message?.includes('timeout') || 
                           error.message?.includes('timed out');
          
          let fallbackStory = '';
          if (hasFallback) {
            fallbackStory = error.fallbackStory;
          } else {
            const currentStyleStories = STYLE_STORIES[selectedStyle] || STYLE_STORIES.anime;
            fallbackStory = currentStyleStories[Math.floor(Math.random() * currentStyleStories.length)];
          }
          
          if (prompt.trim()) {
            console.log('[GeneratePanel] Preserving user text after navigation');
          } else {
            console.log('[GeneratePanel] Using fallback story after navigation');
            setPrompt(fallbackStory);
          }
        })
        .finally(() => {
          setIsGeneratingStory(false);
          storyGenerationRef.current.isGenerating = false;
          storyGenerationRef.current.promise = null;
        });
    }
  }, []); // 仅在组件挂载时执行一次

  // 生成处理
  const handleGenerate = () => {
    if (!prompt.trim()) {
      console.error('Please enter story description');
      return;
    }

    const modelCapability = MODEL_CAPABILITIES[currentModel as keyof typeof MODEL_CAPABILITIES];
    const imageUrls = getAllImageUrls();
    const imageCount = imageUrls.length;
    
    if (imageCount > modelCapability.maxImages) {
      console.error(`Model supports maximum ${modelCapability.maxImages} images`);
      return;
    }
    
    if (imageCount > 0 && imageCount < modelCapability.minImages) {
      console.error(`Model requires minimum ${modelCapability.minImages} images`);
      return;
    }

    onGenerate({
      prompt,
      style: selectedStyle,
      duration: selectedDuration,
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      resolution: selectedResolution,
      fps: selectedFPS,
      enableAudio,
      model: currentModel,
    });
  };

  // AI自动生成故事
  const generateStoryWithAI = async () => {
    const imageUrls = getAllImageUrls();
    const existingText = prompt.trim();
    
    setIsGeneratingStory(true);
    storyGenerationRef.current.isGenerating = true;
    storyGenerationRef.current.promise = generateStoryAPI(
      imageUrls,
      existingText,
      selectedStyle,
      selectedDuration,
      selectedResolution,
      enableAudio,
      imageMode
    );
    
    try {
      const story = await storyGenerationRef.current.promise;
      
      setPrompt(story);
      
      if (imageUrls.length > 0 && existingText) {
        console.log(`AI generated story from ${imageUrls.length} images and text`);
      } else if (imageUrls.length > 0) {
        console.log(`AI generated story from ${imageUrls.length} images`);
      } else if (existingText) {
        console.log('AI improved story description');
      } else {
        console.log('AI generated new story');
      }
    } catch (error: any) {
      console.error('[GeneratePanel] AI故事生成失败:', error);
      
      // 检查是否有fallbackStory
      const hasFallback = error.fallbackStory && typeof error.fallbackStory === 'string';
      const isTimeout = error.isTimeout || 
                       error.name === 'AbortError' || 
                       error.message?.includes('timeout') || 
                       error.message?.includes('timed out');
      
      // 确定要使用的降级故事
      let fallbackStory = '';
      if (hasFallback) {
        fallbackStory = error.fallbackStory;
        console.log('[GeneratePanel] Using fallback story from error');
      } else {
        // 如果错误中没有降级故事，使用本地模板
        const currentStyleStories = STYLE_STORIES[selectedStyle] || STYLE_STORIES.anime;
        fallbackStory = currentStyleStories[Math.floor(Math.random() * currentStyleStories.length)];
        console.log('[GeneratePanel] Using local template story');
      }
      
      // 显示友好的错误提示
      if (isTimeout) {
        console.log('[GeneratePanel] Timeout - using fallback story');
      } else {
        console.log('[GeneratePanel] Error - using fallback story');
      }
      
      // 决定使用哪个故事
      if (existingText && existingText.trim()) {
        // 如果用户已经输入了文字，保留用户输入
        console.log('[GeneratePanel] Preserving user text');
        setPrompt(existingText);
      } else {
        // 否则使用降级故事
        console.log('[GeneratePanel] Using fallback story:', fallbackStory.substring(0, 50) + '...');
        setPrompt(fallbackStory);
      }
    } finally {
      setIsGeneratingStory(false);
      storyGenerationRef.current.isGenerating = false;
      storyGenerationRef.current.promise = null;
    }
  };

  // 图片上传处理
  const handleFirstFrameSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processImageFile(file, (base64) => {
        setFirstFrameUrl(base64);
        setFirstFramePreview(base64);
      });
    }
  };

  const handleLastFrameSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processImageFile(file, (base64) => {
        setLastFrameUrl(base64);
        setLastFramePreview(base64);
      });
    }
  };

  const handleReferenceSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const remainingSlots = 4 - referenceUrls.length;
      
      if (remainingSlots <= 0) {
        console.error('Maximum 4 reference images');
        return;
      }
      
      const filesToProcess = Array.from(files).slice(0, remainingSlots);
      filesToProcess.forEach(file => {
        processImageFile(file, (base64) => {
          setReferenceUrls(prev => [...prev, base64]);
          setReferencePreviews(prev => [...prev, base64]);
        });
      });
    }
  };

  const handleImageModeChange = (mode: ImageMode) => {
    setImageMode(mode);
    setFirstFrameUrl('');
    setLastFrameUrl('');
    setFirstFramePreview('');
    setLastFramePreview('');
    setReferenceUrls([]);
    setReferencePreviews([]);
  };

  // AI生成图片
  const generateImageWithAI = async () => {
    if (!aiImagePrompt.trim()) {
      console.error('Please enter image description');
      return;
    }

    setIsGeneratingImage(true);

    try {
      const imageUrl = await generateImageAPI(aiImagePrompt.trim(), aiImageType, useTongyi);

      if (aiImageType === 'first_frame') {
        setFirstFrameUrl(imageUrl);
        setFirstFramePreview(imageUrl);
      } else if (aiImageType === 'last_frame') {
        setLastFrameUrl(imageUrl);
        setLastFramePreview(imageUrl);
      } else if (aiImageType === 'reference') {
        if (referenceUrls.length < 4) {
          setReferenceUrls(prev => [...prev, imageUrl]);
          setReferencePreviews(prev => [...prev, imageUrl]);
        } else {
          console.error('Maximum 4 reference images');
        }
      }
      
      setShowAiImageDialog(false);
      setAiImagePrompt('');
      
      console.log('[GeneratePanel] ✅ AI图片生成成功，使用的引擎:', useTongyi ? '通义系列' : '豆包');
    } catch (error: any) {
      console.error('AI图片生成失败:', error);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // AI润色图片提示词
  const polishImagePrompt = async () => {
    if (!aiImagePrompt.trim()) {
      console.error('Please enter description first');
      return;
    }

    setIsPolishingPrompt(true);

    try {
      const polishedPrompt = await polishPromptAPI(aiImagePrompt.trim(), aiImageType);
      setAiImagePrompt(polishedPrompt);
    } catch (error: any) {
      console.error('AI润色失败:', error);
    } finally {
      setIsPolishingPrompt(false);
    }
  };

  const openAiImageDialog = (type: 'first_frame' | 'last_frame' | 'reference') => {
    setAiImageType(type);
    setShowAiImageDialog(true);
    setAiImagePrompt('');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* 故事述 */}
      <StorySection
        prompt={prompt}
        onPromptChange={setPrompt}
        onGenerateStory={generateStoryWithAI}
        isGeneratingStory={isGeneratingStory}
      />

      {/* 图像输入 */}
      <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-4 sm:p-6 border border-white/10">
        <div className="flex items-center gap-2 mb-3 sm:mb-4">
          <ImageIcon className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400" />
          <Label className="text-sm sm:text-base text-white">参考图片（可选）</Label>
        </div>
        
        <ImageUploadSection
          imageMode={imageMode}
          onImageModeChange={handleImageModeChange}
          firstFramePreview={firstFramePreview}
          firstFrameInputRef={firstFrameInputRef}
          onFirstFrameSelect={handleFirstFrameSelect}
          onFirstFrameRemove={() => {
            setFirstFrameUrl('');
            setFirstFramePreview('');
            if (firstFrameInputRef.current) firstFrameInputRef.current.value = '';
          }}
          onFirstFrameAIGenerate={() => openAiImageDialog('first_frame')}
          lastFramePreview={lastFramePreview}
          lastFrameInputRef={lastFrameInputRef}
          onLastFrameSelect={handleLastFrameSelect}
          onLastFrameRemove={() => {
            setLastFrameUrl('');
            setLastFramePreview('');
            if (lastFrameInputRef.current) lastFrameInputRef.current.value = '';
          }}
          onLastFrameAIGenerate={() => openAiImageDialog('last_frame')}
          referencePreviews={referencePreviews}
          referenceInputRef={referenceInputRef}
          onReferenceSelect={handleReferenceSelect}
          onReferenceRemove={(index) => {
            setReferenceUrls(prev => prev.filter((_, i) => i !== index));
            setReferencePreviews(prev => prev.filter((_, i) => i !== index));
          }}
          onReferenceAIGenerate={() => openAiImageDialog('reference')}
        />
        
        <p className="text-xs text-gray-500 mt-4">
          💡 {getImageModeDescription(imageMode, getAllImageUrls().length)}
        </p>
        
        {getAllImageUrls().length === 0 && (
          <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <p className="text-xs text-blue-300 flex items-center gap-2">
              <Wand2 className="w-3.5 h-3.5" />
              <span>💬 无需上传图片，只需输入文字描述即可生成视频！当然您也可以上传图片来增强效果。</span>
            </p>
          </div>
        )}
      </div>

      {/* 风格选择 */}
      <StyleSelector
        selectedStyle={selectedStyle}
        onStyleChange={setSelectedStyle}
      />

      {/* 视频设置（时长、分辨率、音频、模型提示） */}
      <VideoSettings
        selectedDuration={selectedDuration}
        onDurationChange={setSelectedDuration}
        isDurationSupported={isDurationSupported}
        selectedResolution={selectedResolution}
        onResolutionChange={setSelectedResolution}
        enableAudio={enableAudio}
        onAudioChange={setEnableAudio}
        isAudioSupported={isAudioSupported()}
        useTongyi={useTongyi}
        onToggleTongyi={setUseTongyi}
        currentModel={currentModel}
        imageUrlsCount={getAllImageUrls().length}
        imageMode={imageMode}
      />

      {/* 生成按钮 */}
      <Button
        onClick={handleGenerate}
        disabled={activeTasks.length >= 3}
        className="w-full py-5 sm:py-6 text-base sm:text-lg bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-xl sm:rounded-2xl shadow-lg shadow-purple-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Wand2 className={`w-4 h-4 sm:w-5 sm:h-5 mr-2 ${activeTasks.length > 0 ? 'animate-spin' : ''}`} />
        {activeTasks.length >= 3 
          ? `已达上限 (${activeTasks.length}/3)` 
          : activeTasks.length > 0 
            ? `开始生成 (${activeTasks.length}/3)` 
            : '开始生成'}
      </Button>

      {/* 提示 */}
      <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl sm:rounded-2xl p-3 sm:p-4">
        <p className="text-xs text-purple-300 leading-relaxed">
          💡 提示：详细描述人物、场景和情节，AI将为您生成精彩的漫剧内容。生成时间约1-3分钟。
          {activeTasks.length > 0 && (
            <>
              <br />
              <strong>当前有 {activeTasks.length} 个任务正在生成，您还可以提交 {3 - activeTasks.length} 个任务。</strong>
            </>
          )}
        </p>
      </div>
      
      {/* ✨ 任务提交成功提示 */}
      {activeTasks.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-green-500/10 border border-green-500/20 rounded-xl sm:rounded-2xl p-3 sm:p-4"
        >
          <p className="text-xs text-green-300 leading-relaxed">
            ✅ <strong>任务已提交成功！</strong>视频正在后台生成中，您可以：
          </p>
          <ul className="mt-2 ml-4 text-xs text-green-300 space-y-1">
            <li>• 安全关闭此页面或浏览器，生成不会中断</li>
            <li>• 切换到其他标签页继续浏览</li>
            <li>• 稍后在「个人中心」查看生成进度</li>
            <li>• 生成完成后会自动发布到社区</li>
            <li>• 您还可以继续提交新的生成任务（最多 3 个并发）</li>
          </ul>
        </motion.div>
      )}

      {/* AI图片生成对话框 */}
      <AIImageDialog
        isOpen={showAiImageDialog}
        onClose={() => setShowAiImageDialog(false)}
        imageType={aiImageType}
        prompt={aiImagePrompt}
        onPromptChange={setAiImagePrompt}
        onGenerate={generateImageWithAI}
        onPolish={polishImagePrompt}
        isGenerating={isGeneratingImage}
        isPolishing={isPolishingPrompt}
        useTongyi={useTongyi}
        onToggleTongyi={setUseTongyi}
      />
    </motion.div>
  );
}