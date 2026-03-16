/**
 * 首页创作面板 — "一句话生成漫剧"
 * v6.0.2: 沉浸式创作进度 + 模板智能匹配 + 移动端优化
 * v6.0.0: 产品体验全面升级，AI-first 创作流程
 *
 * 设计理念：
 * 1. 用户只需一句话描述想法，AI完成全部创作
 * 2. 可选风格/类型标签让用户快速定制，而非必填
 * 3. 创作中展示沉浸式进度动画（v6.0.2 新增 CreationProgressOverlay）
 * 4. 底部展示用户已有作品，支持快速访问
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles, Wand2, Film, ChevronRight, Loader2,
  Play, Clock, Zap, ArrowRight, BookOpen, Palette,
  CornerDownLeft, Users, Grid3x3, CheckCircle2, X
} from 'lucide-react';
import { Button } from './ui';
import { toast } from 'sonner';
import * as seriesService from '../services';
import type { Series, SeriesFormData, ProductionType } from '../types';
import { RecentSeriesCard, FeatureCard, ReferenceImageInput, QUICK_TEMPLATES, STYLE_CHIPS, EPISODE_PRESETS, MAX_INPUT_LENGTH, PRODUCTION_TYPES } from './home';
import { CreationProgressOverlay } from './home/CreationProgressOverlay';
import { getErrorMessage } from '../utils';

interface HomeCreationPanelProps {
  userPhone?: string;
  onSeriesCreated: (series: Series) => void;
  onShowLogin: () => void;
  recentSeries?: Series[];
  onEditSeries?: (series: Series) => void;
}

export function HomeCreationPanel({
  userPhone,
  onSeriesCreated,
  onShowLogin,
  recentSeries = [],
  onEditSeries,
}: HomeCreationPanelProps) {
  const [userInput, setUserInput] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('realistic');
  const [selectedEpisodes, setSelectedEpisodes] = useState(3);
  const [selectedProductionType, setSelectedProductionType] = useState<ProductionType>('short_drama');
  const [isCreating, setIsCreating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [creationPhase, setCreationPhase] = useState('');
  const [showProgressOverlay, setShowProgressOverlay] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const styleScrollRef = useRef<HTMLDivElement>(null);
  // v6.0.16: 参考图上传
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [referenceImagePreview, setReferenceImagePreview] = useState<string | null>(null);
  const [isUploadingRef, setIsUploadingRef] = useState(false);

  // 自动调整 textarea 高度
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 160) + 'px';
    }
  }, [userInput]);

  // 选择模板 — v6.0.2: 同时匹配推荐风格
  const handleTemplateClick = useCallback((template: typeof QUICK_TEMPLATES[0]) => {
    setUserInput(template.prompt);
    if (template.matchStyle) {
      setSelectedStyle(template.matchStyle);
    }
    // 短暂延迟后聚焦，让用户看到模板已填充
    setTimeout(() => {
      textareaRef.current?.focus();
      // 将光标移到末尾
      if (textareaRef.current) {
        textareaRef.current.selectionStart = template.prompt.length;
        textareaRef.current.selectionEnd = template.prompt.length;
      }
    }, 100);
  }, []);

  // 一键创作
  const handleCreate = async () => {
    if (!userPhone) {
      onShowLogin();
      toast.info('请先登录，即可开始AI创作');
      return;
    }

    const finalInput = userInput.trim();
    if (!finalInput) {
      toast.error('请输入你想要的漫剧内容');
      textareaRef.current?.focus();
      return;
    }

    setIsCreating(true);
    setCreationPhase('正在构思创意...');
    setShowProgressOverlay(true);

    try {
      // 构建表单数据 — 让AI自动生成标题和描述
      const formData: SeriesFormData = {
        title: '', // AI自动生成
        description: '', // AI自动生成
        genre: '', // AI根据内容推断
        style: selectedStyle,
        episodeCount: selectedEpisodes,
        storyOutline: finalInput,
        referenceImageUrl: referenceImage || undefined,
        productionType: selectedProductionType,
      };

      setCreationPhase('AI正在创作剧本...');

      const result = await seriesService.createSeries(formData, userPhone);

      if (result.success && result.data) {
        setCreationPhase('创作启动成功！');
        // 短暂停留让用户看到成功状态
        await new Promise(r => setTimeout(r, 1200));
        setShowProgressOverlay(false);
        toast.success('AI创作已启动！剧本完成后将自动生成视频');
        setUserInput('');
        onSeriesCreated(result.data);
      } else {
        setShowProgressOverlay(false);
        toast.error('创作失败: ' + (result.error || '未知错误'));
      }
    } catch (error: unknown) {
      console.error('[HomeCreation] Error:', error);
      setShowProgressOverlay(false);
      toast.error('生成失败：' + getErrorMessage(error));
    } finally {
      setIsCreating(false);
      setCreationPhase('');
    }
  };

  // 取消创作
  const handleCancelCreation = useCallback(() => {
    // 不能真正取消后端请求，但关闭overlay
    setShowProgressOverlay(false);
  }, []);

  const inputLength = userInput.length;
  const isInputValid = userInput.trim().length > 0;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* === Hero 区域 === */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center pt-4 sm:pt-8"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 mb-6"
        >
          <Zap className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-xs text-purple-300 font-medium">AI驱动 · 一键生成</span>
        </motion.div>

        <h1 className="text-3xl sm:text-5xl font-bold text-white mb-3 leading-tight">
          用一句话
          <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400 bg-clip-text text-transparent">
            {' '}创作漫剧
          </span>
        </h1>
        <p className="text-gray-400 text-sm sm:text-base max-w-lg mx-auto">
          描述你想要的故事，AI将自动生成剧本、角色、分镜和视频
        </p>
      </motion.div>

      {/* === 核心创作输入区 === */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="relative"
      >
        <div className="bg-white/[0.03] backdrop-blur-2xl rounded-3xl border border-white/10 p-5 sm:p-6 shadow-2xl shadow-purple-500/5 hover:border-purple-500/20 transition-colors duration-300">
          {/* 输入框 */}
          <div className="relative mb-4">
            <textarea
              ref={textareaRef}
              value={userInput}
              onChange={(e) => {
                if (e.target.value.length <= MAX_INPUT_LENGTH) {
                  setUserInput(e.target.value);
                }
              }}
              placeholder={
                selectedProductionType === 'movie' ? '描述你想要的电影故事... 例如：一部关于末日生存者穿越废墟寻找希望之光的科幻史诗'
                : selectedProductionType === 'tv_series' ? '描述你想要的电视剧... 例如：都市职场中三位性格迥异的女性互相扶持成长的温暖故事'
                : selectedProductionType === 'micro_film' ? '描述你想要的微电影... 例如：一封寄不出去的信，连接了两个时空中的祖孙'
                : selectedProductionType === 'documentary' ? '描述你想要的纪录片... 例如：记录一位非遗传承人用一生守护即将消失的手艺'
                : selectedProductionType === 'comic_drama' ? '描述你想要的漫剧... 例如：热血少年在异世界觉醒超能力，守护伙伴的冒险之旅'
                : '描述你想要的故事... 例如：一个北漂程序员和咖啡店老板娘的治愈爱情故事'
              }
              rows={2}
              disabled={isCreating}
              className="w-full bg-transparent text-white placeholder:text-gray-500 text-base sm:text-lg resize-none focus:outline-none leading-relaxed pr-2"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !isCreating) {
                  e.preventDefault();
                  handleCreate();
                }
              }}
            />
            {/* v6.0.28: 参考图上传提取为独立组件 */}
            <ReferenceImageInput
              referenceImage={referenceImage}
              referenceImagePreview={referenceImagePreview}
              isUploadingRef={isUploadingRef}
              isCreating={isCreating}
              userPhone={userPhone}
              onReferenceImageChange={setReferenceImage}
              onReferenceImagePreviewChange={setReferenceImagePreview}
              onIsUploadingRefChange={setIsUploadingRef}
              onShowLogin={onShowLogin}
            />
            {/* 字符计数 + 键盘提示 */}
            <div className="flex items-center justify-between mt-1">
              <div className="flex items-center gap-1.5 text-[10px] text-gray-600">
                <CornerDownLeft className="w-3 h-3" />
                <span className="hidden sm:inline">Enter 发送 · Shift+Enter 换行</span>
                <span className="sm:hidden">Enter 发送</span>
              </div>
              <span className={`text-[10px] transition-colors ${
                inputLength > MAX_INPUT_LENGTH * 0.9 ? 'text-orange-400' : 'text-gray-600'
              }`}>
                {inputLength}/{MAX_INPUT_LENGTH}
              </span>
            </div>
          </div>

          {/* v6.0.36: 作品类型选择 */}
          <div
            className="flex flex-wrap gap-1.5 mb-3"
          >
            {PRODUCTION_TYPES.map((pt) => (
              <button
                key={pt.id}
                onClick={() => setSelectedProductionType(pt.id)}
                disabled={isCreating}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 ${
                  selectedProductionType === pt.id
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm shadow-blue-500/20'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-transparent'
                }`}
              >
                <span className="mr-1">{pt.icon}</span>
                {pt.label}
              </button>
            ))}
          </div>

          {/* 风格选择 — v6.0.37: 移动端/PC端统一wrap网格展示所有风格 */}
          <div
            ref={styleScrollRef}
            className="flex flex-wrap gap-1.5 mb-3"
          >
            {STYLE_CHIPS.map((style) => (
              <button
                key={style.id}
                onClick={() => setSelectedStyle(style.id)}
                disabled={isCreating}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 ${
                  selectedStyle === style.id
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm shadow-purple-500/20'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-transparent'
                }`}
              >
                <span className="mr-1">{style.icon}</span>
                {style.label}
              </button>
            ))}
          </div>

          {/* 操作行：集数 + 创作按钮 */}
          <div className="flex items-center justify-between gap-3">
            {/* 集数选择 */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="px-2.5 py-1 rounded-lg text-xs text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors border border-transparent flex items-center gap-1 flex-shrink-0"
            >
              <Film className="w-3 h-3" />
              {selectedEpisodes}集
              <ChevronRight className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} />
            </button>

            {/* 创作按钮 */}
            <Button
              onClick={handleCreate}
              disabled={isCreating || !isInputValid}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-lg shadow-purple-500/25 disabled:opacity-40 disabled:shadow-none transition-all hover:shadow-xl hover:shadow-purple-500/30 hover:scale-[1.02] active:scale-[0.98] flex-shrink-0"
            >
              {isCreating ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  创作中...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Wand2 className="w-4 h-4" />
                  开始创作
                </span>
              )}
            </Button>
          </div>

          {/* 展开的集数选择 */}
          <AnimatePresence>
            {showAdvanced && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="pt-4 mt-4 border-t border-white/5">
                  <div className="flex items-center gap-2 mb-3">
                    <Film className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-xs text-gray-400">集数设置</span>
                  </div>
                  <div className="flex gap-2">
                    {EPISODE_PRESETS.map((preset) => (
                      <button
                        key={preset.count}
                        onClick={() => { setSelectedEpisodes(preset.count); setShowAdvanced(false); }}
                        className={`flex-1 px-3 py-2.5 rounded-xl border transition-all text-center ${
                          selectedEpisodes === preset.count
                            ? 'border-purple-500/50 bg-purple-500/10 text-white'
                            : 'border-white/10 bg-white/[0.02] text-gray-400 hover:border-white/20 hover:text-gray-300'
                        }`}
                      >
                        <div className="text-sm font-medium">{preset.label}</div>
                        <div className="text-[10px] opacity-60 mt-0.5">{preset.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* === 灵感模板 === */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-medium text-gray-400">灵感模板 · 点击快速填充</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {QUICK_TEMPLATES.map((template, index) => (
            <motion.button
              key={template.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + index * 0.05 }}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleTemplateClick(template)}
              disabled={isCreating}
              className={`group p-3.5 rounded-2xl bg-gradient-to-br ${template.gradient} border ${template.border} text-left transition-all hover:shadow-lg disabled:opacity-50`}
            >
              <div className="text-xl mb-1.5">{template.icon}</div>
              <div className="text-sm font-medium text-white">{template.label}</div>
              <div className="text-[11px] text-gray-400 mt-0.5 line-clamp-2 group-hover:text-gray-300 transition-colors">
                {template.prompt}
              </div>
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* === 最近作品 === */}
      {recentSeries.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-medium text-gray-400">最近创作</h3>
            </div>
            {onEditSeries && (
              <button
                onClick={() => onEditSeries(recentSeries[0])}
                className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors"
              >
                查看全部 <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentSeries.slice(0, 3).map((s) => (
              <RecentSeriesCard key={s.id} series={s} onEdit={onEditSeries} />
            ))}
          </div>
        </motion.div>
      )}

      {/* === 能力展示 === */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="grid grid-cols-1 sm:grid-cols-3 gap-3 pb-8"
      >
        <FeatureCard
          icon={<BookOpen className="w-5 h-5" />}
          title="AI剧本创作"
          desc="自动生成角色、分集剧情、分镜脚本"
          color="text-blue-400"
          bg="from-blue-500/10 to-cyan-500/10"
        />
        <FeatureCard
          icon={<Palette className="w-5 h-5" />}
          title="多样视觉风格"
          desc="日漫、写实、赛博朋克等多种风格"
          color="text-purple-400"
          bg="from-purple-500/10 to-pink-500/10"
        />
        <FeatureCard
          icon={<Play className="w-5 h-5" />}
          title="自动视频生成"
          desc="AI将分镜自动转化为连续视频"
          color="text-pink-400"
          bg="from-pink-500/10 to-orange-500/10"
        />
      </motion.div>

      {/* === 创作进度覆盖层 === */}
      <CreationProgressOverlay
        isVisible={showProgressOverlay}
        phase={creationPhase}
        onCancel={handleCancelCreation}
      />
    </div>
  );
}