import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, Sparkles, Loader2, BookOpen, Film, Palette, Globe, Lock, X, Wand2, CheckCircle2, ChevronDown, ChevronUp, Zap, CornerDownLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { Button, Label } from '../ui';
import { useWizardAI } from './hooks';
import { apiPost, getErrorMessage, getAutoDefaults, isPromoType } from '../../utils';
import type { Series, SeriesFormData, ProductionType, ReferenceAsset } from '../../types';
import { AssetUploader } from './AssetUploader';
import { PRODUCTION_TYPES, STYLE_CHIPS } from '../home';

// ═══════════════════════════════════════════════════════════════════
// 宣传片调性选项
// ═══════════════════════════════════════════════════════════════════
const PROMO_TONES = [
  { id: 'luxury', label: '高端奢华', icon: '💎' },
  { id: 'tech', label: '科技前沿', icon: '🚀' },
  { id: 'warm', label: '温暖人文', icon: '🌅' },
  { id: 'energetic', label: '活力动感', icon: '⚡' },
  { id: 'minimal', label: '极简高级', icon: '◻️' },
  { id: 'cinematic', label: '电影质感', icon: '🎬' },
  { id: 'documentary', label: '纪实叙述', icon: '📷' },
  { id: 'playful', label: '趣味创意', icon: '🎨' },
] as const;

// ═══════════════════════════════════════════════════════════════════
// 风格/题材/比例/分辨率常量
// ═══════════════════════════════════════════════════════════════════
const STYLES = [
  { id: 'realistic', name: '写实', icon: '🎬' },
  { id: 'anime', name: '日漫', icon: '🎌' },
  { id: 'cartoon', name: '卡通', icon: '🎨' },
  { id: 'cyberpunk', name: '赛博朋克', icon: '🌆' },
  { id: 'chinese', name: '国风', icon: '🏮' },
  { id: 'fantasy', name: '奇幻', icon: '✨' },
  { id: 'comic', name: '漫画', icon: '📖' },
  { id: 'pixel', name: '像素', icon: '👾' },
  { id: 'threed', name: '3D渲染', icon: '🧊' },
  { id: 'oil_painting', name: '油画', icon: '🖼️' },
  { id: 'watercolor', name: '水彩', icon: '🌊' },
  { id: 'noir', name: '黑白电影', icon: '🎞️' },
  { id: 'steampunk', name: '蒸汽朋克', icon: '⚙️' },
  { id: 'xianxia', name: '仙侠', icon: '🌙' },
  { id: 'ghibli', name: '吉卜力', icon: '🍃' },
  { id: 'ukiyoe', name: '浮世绘', icon: '🌊' },
] as const;

const GENRES = [
  { id: 'romance', name: '爱情', icon: '💕' },
  { id: 'suspense', name: '悬疑', icon: '🔍' },
  { id: 'fantasy', name: '奇幻', icon: '⚔️' },
  { id: 'comedy', name: '喜剧', icon: '😄' },
  { id: 'scifi', name: '科幻', icon: '🚀' },
  { id: 'action', name: '动作', icon: '⚡' },
  { id: 'drama', name: '剧情', icon: '🎭' },
  { id: 'horror', name: '恐怖', icon: '👻' },
  { id: 'history', name: '历史', icon: '📜' },
  { id: 'documentary', name: '纪实', icon: '🌍' },
] as const;

const ASPECT_RATIOS = [
  { id: '9:16', w: 18, h: 32 },
  { id: '16:9', w: 32, h: 18 },
  { id: '1:1', w: 24, h: 24 },
  { id: '4:3', w: 28, h: 21 },
  { id: '3:4', w: 21, h: 28 },
] as const;

const RESOLUTIONS = [
  { id: '480p', label: '480P', desc: '流畅', badge: null },
  { id: '720p', label: '720P', desc: '高清', badge: null },
  { id: '1080p', label: '1080P', desc: '全高清', badge: '推荐' },
] as const;

// ═══════════════════════════════════════════════════════════════════
// AI解析结果类型
// ═══════════════════════════════════════════════════════════════════
interface AIParsedResult {
  title: string;
  description: string;
  genre: string;
  style: string;
  productionType: string;
  episodeCount: number;
  storyOutline: string;
  promoTone?: string | null;
  slogan?: string | null;
  targetAudience?: string | null;
  sellingPoints?: string[];
  reasoning?: string | null;
}

interface SeriesCreationWizardProps {
  onComplete: (series: Series) => void;
  onCancel: () => void;
  userPhone?: string;
}

const DRAFT_STORAGE_KEY = 'series_creation_draft';
const DRAFT_SAVE_DEBOUNCE_MS = 800;

interface DraftData {
  mode: 'input' | 'review' | 'manual';
  rawContent: string;
  formData: SeriesFormData;
  parsedResult: AIParsedResult | null;
  savedAt: number;
}

function saveDraft(draft: DraftData): void {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // localStorage 写满或不可用时静默忽略
  }
}

function loadDraft(): DraftData | null {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as DraftData;
    // 超过 7 天的草稿自动丢弃
    if (Date.now() - draft.savedAt > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      return null;
    }
    return draft;
  } catch {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    return null;
  }
}

function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // 静默忽略
  }
}

export function SeriesCreationWizard({ onComplete, onCancel, userPhone }: SeriesCreationWizardProps) {
  // ─── 模式：smart（AI拆解）或 manual（手动向导）───
  const [mode, setMode] = useState<'input' | 'review' | 'manual'>('input');
  const [rawContent, setRawContent] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parsedResult, setParsedResult] = useState<AIParsedResult | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  // v6.0.192: 多素材上传
  const [referenceAssets, setReferenceAssets] = useState<ReferenceAsset[]>([]);

  const [formData, setFormData] = useState<SeriesFormData>({
    title: '',
    description: '',
    genre: 'romance',
    style: 'realistic',
    episodeCount: 10,
    storyOutline: '',
  });

  // ─── 创作成功后清除草稿（包装 onComplete） ───
  const handleCompleteWithDraftClear = useCallback((series: Series) => {
    clearDraft();
    onComplete(series);
  }, [onComplete]);

  const {
    isAnalyzing,
    handleAnalyze,
  } = useWizardAI({ formData, setFormData, userPhone, onComplete: handleCompleteWithDraftClear });

  // ─── 草稿恢复（组件挂载时） ───
  const draftRestoredRef = useRef(false);
  useEffect(() => {
    if (draftRestoredRef.current) return;
    draftRestoredRef.current = true;
    const draft = loadDraft();
    if (!draft) return;
    // 只有当草稿包含有意义的内容时才恢复
    const hasContent = draft.rawContent.trim().length > 0
      || draft.formData.title.trim().length > 0
      || draft.formData.storyOutline.trim().length > 0;
    if (!hasContent) return;
    setMode(draft.mode);
    setRawContent(draft.rawContent);
    setFormData(draft.formData);
    if (draft.parsedResult) setParsedResult(draft.parsedResult);
    toast.info('已恢复上次未完成的创作草稿', { duration: 3000 });
  }, []);

  // ─── 草稿自动保存（防抖） ───
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveDraft({ mode, rawContent, formData, parsedResult, savedAt: Date.now() });
    }, DRAFT_SAVE_DEBOUNCE_MS);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [mode, rawContent, formData, parsedResult]);

  // ─── AI智能拆解 ───
  const handleAIParse = useCallback(async () => {
    const content = rawContent.trim();
    if (!content) {
      toast.error('请先输入内容');
      return;
    }
    if (content.length < 5) {
      toast.error('内容太短，请提供更多信息以便AI分析');
      return;
    }

    setIsParsing(true);
    try {
      const result = await apiPost('/series/ai-parse-content', {
        content,
        // v6.0.188: 传递已上传的参考素材URL，让AI在拆解时也能"看到"图片
        referenceImageUrls: referenceAssets
          .filter(a => a.type === 'image')
          .map(a => a.url)
          .slice(0, 5),
      }, {
        timeout: 130000,
        headers: userPhone ? { 'X-User-Phone': userPhone } : {},
      });

      if (result.success && result.data) {
        const data = result.data as AIParsedResult;
        setParsedResult(data);

        // 同步到formData，自动推断画面比例和分辨率
        const defaults = getAutoDefaults(data.productionType);
        setFormData({
          title: data.title || '',
          description: data.description || '',
          genre: data.genre || 'drama',
          style: data.style || 'realistic',
          episodeCount: data.episodeCount || defaults.episodeCount,
          storyOutline: data.storyOutline || content,
          productionType: (data.productionType || 'short_drama') as ProductionType,
          promoTone: data.promoTone || undefined,
          slogan: data.slogan || undefined,
          targetAudience: data.targetAudience || undefined,
          sellingPoints: data.sellingPoints || [],
          aspectRatio: defaults.aspectRatio,
          resolution: defaults.resolution,
          referenceAssets: referenceAssets.length > 0 ? referenceAssets : undefined,
        });

        setMode('review');
        if (result.fallback) {
          toast.info('AI服务暂不可用，已使用智能规则生成方案，您可以手动调整');
        } else {
          toast.success('AI拆解完成！请检查并确认创作方案');
        }
      } else {
        toast.error('AI拆解失败: ' + (result.error || '未知错误'));
      }
    } catch (error: unknown) {
      console.error('[SmartWizard] AI parse error:', error);
      toast.error('AI分析失败: ' + getErrorMessage(error));
    } finally {
      setIsParsing(false);
    }
  }, [rawContent, userPhone, referenceAssets]);

  // ─── 切换展开/折叠 ───
  const toggleSection = useCallback((section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }, []);

  // ─── 提交创建 ───
  const handleSubmitCreate = useCallback(() => {
    if (!formData.title) {
      toast.error('请填写作品标题');
      return;
    }
    handleAnalyze();
  }, [formData.title, handleAnalyze]);

  // 查找显示标签
  const productionTypeLabel = PRODUCTION_TYPES.find(p => p.id === formData.productionType)?.label || '短剧';
  const productionTypeIcon = PRODUCTION_TYPES.find(p => p.id === formData.productionType)?.icon || '📱';
  const styleLabel = STYLE_CHIPS.find(s => s.id === formData.style)?.label || STYLES.find(s => s.id === formData.style)?.name || formData.style;
  const genreLabel = GENRES.find(g => g.id === formData.genre)?.name || formData.genre;

  return (
    <div className="max-w-4xl mx-auto">
      {/* 头部 */}
      <div className="mb-6">
        <Button
          onClick={() => {
            if (mode === 'review') { setMode('input'); return; }
            onCancel();
          }}
          variant="ghost"
          className="mb-4 text-gray-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {mode === 'review' ? '返回修改' : '返回'}
        </Button>

        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-2xl border border-purple-500/30">
            <Sparkles className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">
              {mode === 'input' ? '智能创作' : mode === 'review' ? '确认方案' : '手动创建'}
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              {mode === 'input' ? '粘贴任意内容，AI自动拆解为完整创作方案' : mode === 'review' ? '检查AI生成的方案，可调整后一键创作' : ''}
            </p>
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* ══════════════════════════════════════════════════ */}
        {/* 智能输入模式 */}
        {/* ═══════════════════════════════════════════════════ */}
        {mode === 'input' && (
          <motion.div
            key="input"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            <div className="bg-white/[0.03] backdrop-blur-2xl rounded-3xl border border-white/10 p-5 sm:p-8 shadow-2xl shadow-purple-500/5">
              {/* AI拆解提 */}
              <div className="flex items-center gap-3 mb-6">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-purple-500/15 to-pink-500/15 border border-purple-500/25">
                  <Wand2 className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-xs text-purple-300 font-medium">AI智能拆解</span>
                </div>
                <span className="text-xs text-gray-500">支持粘贴故事、剧本、产品介绍、品牌描述等任意内容</span>
              </div>

              {/* 大输入框 */}
              <textarea
                value={rawContent}
                onChange={(e) => setRawContent(e.target.value)}
                placeholder={"把你的想法丢进来...\n\n可以是：\n• 一句创意：\"一个北漂程序员遇到咖啡店老板娘的爱情故事\"\n• 完整剧本/小说片段\n• 产品介绍：\"华为Mate 70，搭载麒麟9100芯片，卫星通话+AI影像...\"\n• 品牌故事：\"成立于1984年的海尔，从一家濒临倒闭的冰箱厂...\"\n• 或者任何你想变成视频的内容\n\nAI会自动判断类型、风格、集数，并生成完整创作方案"}
                rows={12}
                disabled={isParsing}
                className="w-full bg-white/[0.02] border border-white/10 rounded-2xl text-white placeholder:text-gray-600 text-base leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500/30 p-5 transition-all"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !isParsing) {
                    e.preventDefault();
                    handleAIParse();
                  }
                }}
              />

              {/* v6.0.192: 多素材上传区 */}
              <AssetUploader
                assets={referenceAssets}
                onAssetsChange={(newAssets) => {
                  setReferenceAssets(newAssets);
                  setFormData(prev => ({ ...prev, referenceAssets: newAssets }));
                }}
                userPhone={userPhone}
                disabled={isParsing}
              />

              {/* 底部操作栏 */}
              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] transition-colors ${rawContent.length > 8000 ? 'text-orange-400' : 'text-gray-600'}`}>
                    {rawContent.length} 字
                  </span>
                  <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-gray-600">
                    <CornerDownLeft className="w-3 h-3" />
                    <span>Ctrl+Enter 拆解</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      setMode('manual');
                      // Reset to manual wizard mode
                      setFormData({
                        title: '', description: '', genre: 'romance', style: 'realistic',
                        episodeCount: 10, storyOutline: '',
                      });
                    }}
                    className="text-xs text-gray-500 hover:text-gray-300 transition-colors underline underline-offset-2"
                  >
                    手动填写
                  </button>
                  <Button
                    onClick={handleAIParse}
                    disabled={isParsing || rawContent.trim().length < 2}
                    className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium shadow-lg shadow-purple-500/25 disabled:opacity-40 disabled:shadow-none transition-all"
                  >
                    {isParsing ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        AI分析中...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Zap className="w-4 h-4" />
                        AI拆解
                      </span>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {/* 示例提示 */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { icon: '📱', label: '故事/剧本', example: '一段都市白领的浪漫爱情...', content: '一段都市白领之间的浪漫爱情故事。女主是一名建筑设计师，男主是咖啡馆老板。他们在一次暴雨中偶遇，因为一把伞结缘。从最初的误解和碰撞，到渐渐发现彼此的闪光点，最终在城市的繁华与孤独中找到了真正的归属。' },
                { icon: '🏢', label: '品牌宣传', example: '百年传承的茶企品牌...', content: '武夷山脉深处，一家始于1920年的百年茶企——岩韵堂。四代人坚守古法制茶工艺，从祖辈手中的炭焙技法到如今融合AI智能发酵控温技术，每一片茶叶都承载着匠心与创新。品牌使命：让世界品味中国茶的灵魂。目标受众为25-55岁高端消费者和茶文化爱好者。' },
                { icon: '🎯', label: '产品推广', example: '革命性智能穿戴设备...', content: 'AuraRing——全球首款隐形智能戒指。仅重3.8克，钛合金机身搭载微型生物传感器阵列。核心卖点：1. 24h连续血氧/心率/体温监测 2. 非接触支付 3. 30天超长续航 4. IP68防水 5. 与所有主流健康平台无缝同步。预售价格2999元，目标用户：注重健康的都市精英。' },
              ].map((example) => (
                <button
                  key={example.label}
                  onClick={() => setRawContent(example.content)}
                  className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/8 hover:border-purple-500/25 hover:bg-white/[0.04] transition-all text-left group"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-lg">{example.icon}</span>
                    <span className="text-xs font-medium text-gray-400 group-hover:text-purple-300 transition-colors">{example.label}</span>
                  </div>
                  <p className="text-[11px] text-gray-600 line-clamp-2">{example.example}</p>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════ */}
        {/* AI拆解结果确认 */}
        {/* ═══════════════════════════════════════════════════ */}
        {mode === 'review' && parsedResult && (
          <motion.div
            key="review"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            {/* AI推理说明 */}
            {parsedResult.reasoning && (
              <div className="flex items-start gap-2.5 px-4 py-3 bg-purple-500/8 border border-purple-500/15 rounded-2xl">
                <Sparkles className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-purple-300">{parsedResult.reasoning}</p>
              </div>
            )}

            {/* ─── 核心信息卡片 ─── */}
            <div className="bg-white/[0.03] backdrop-blur-xl rounded-3xl border border-white/10 p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <h3 className="text-sm font-medium text-white">基本信息</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{productionTypeIcon}</span>
                  <span className="text-xs px-2 py-0.5 rounded-lg bg-white/10 text-gray-300">{productionTypeLabel}</span>
                </div>
              </div>

              <div className="space-y-4">
                {/* 标题 */}
                <div>
                  <Label className="text-gray-400 text-xs mb-1.5 block">标题</Label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-lg font-medium placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                  />
                </div>

                {/* 简介 */}
                <div>
                  <Label className="text-gray-400 text-xs mb-1.5 block">简介</Label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/40 resize-none text-sm leading-relaxed"
                  />
                </div>

                {/* AI自动匹配的参数（只读标签展示） */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-gray-500 mr-1">AI已匹配:</span>
                  <span className="px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[11px]">
                    {productionTypeIcon} {productionTypeLabel}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[11px]">
                    {styleLabel}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px]">
                    {genreLabel}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px]">
                    {formData.episodeCount}集
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-[11px]">
                    {formData.aspectRatio || '9:16'}
                  </span>
                </div>
              </div>
            </div>

            {/* ─── 故事大纲/脚本（可折叠） ─── */}
            <div className="bg-white/[0.03] backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden">
              <button
                onClick={() => toggleSection('outline')}
                className="w-full flex items-center justify-between p-5 hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-purple-400" />
                  <h3 className="text-sm font-medium text-white">故事大纲 / 脚本</h3>
                  <span className="text-[10px] text-gray-500">{formData.storyOutline.length} 字</span>
                </div>
                {expandedSections.has('outline') ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
              </button>
              <AnimatePresence>
                {expandedSections.has('outline') && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-5">
                      <textarea
                        value={formData.storyOutline}
                        onChange={(e) => setFormData({ ...formData, storyOutline: e.target.value })}
                        rows={10}
                        className="w-full px-4 py-3 bg-white/[0.03] border border-white/8 rounded-xl text-white text-sm leading-relaxed placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30 resize-none"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ─── 高级设置（可折叠） ─── */}
            <div className="bg-white/[0.03] backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden">
              <button
                onClick={() => toggleSection('advanced')}
                className="w-full flex items-center justify-between p-5 hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Palette className="w-4 h-4 text-gray-400" />
                  <h3 className="text-sm font-medium text-white">高级设置</h3>
                  <span className="text-[10px] text-gray-500">画面比例、分辨率、社区发布等</span>
                </div>
                {expandedSections.has('advanced') ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
              </button>
              <AnimatePresence>
                {expandedSections.has('advanced') && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-5 space-y-5">
                      {/* 重置为AI推荐按钮 */}
                      {parsedResult && (
                        <button
                          onClick={() => {
                            const defaults = getAutoDefaults(parsedResult.productionType);
                            setFormData({
                              title: parsedResult.title || '',
                              description: parsedResult.description || '',
                              genre: parsedResult.genre || 'drama',
                              style: parsedResult.style || 'realistic',
                              episodeCount: parsedResult.episodeCount || defaults.episodeCount,
                              storyOutline: parsedResult.storyOutline || rawContent,
                              productionType: (parsedResult.productionType || 'short_drama') as ProductionType,
                              promoTone: parsedResult.promoTone || undefined,
                              slogan: parsedResult.slogan || undefined,
                              targetAudience: parsedResult.targetAudience || undefined,
                              sellingPoints: parsedResult.sellingPoints || [],
                              aspectRatio: defaults.aspectRatio,
                              resolution: defaults.resolution,
                            });
                            toast.success('已重置为AI推荐方案');
                          }}
                          className="w-full py-2 px-3 rounded-xl bg-purple-500/8 border border-purple-500/20 text-purple-300 text-xs hover:bg-purple-500/15 transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Wand2 className="w-3.5 h-3.5" />
                          重置为AI推荐值
                        </button>
                      )}

                      {/* 作品类型/风格/题材/集数微调 */}
                      <div>
                        <Label className="text-gray-400 text-xs mb-2 block">作品类型 / 风格 / 题材 / 集数</Label>
                        <div className="flex flex-wrap gap-2">
                          <div className="relative">
                            <select
                              value={formData.productionType || 'short_drama'}
                              onChange={(e) => {
                                const pt = e.target.value as ProductionType;
                                const defaults = getAutoDefaults(pt);
                                setFormData({ ...formData, productionType: pt, aspectRatio: defaults.aspectRatio, resolution: defaults.resolution, episodeCount: defaults.episodeCount });
                              }}
                              className="appearance-none pl-3 pr-7 py-1.5 bg-blue-500/10 border border-blue-500/25 rounded-lg text-blue-300 text-xs font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                            >
                              {PRODUCTION_TYPES.map(pt => (
                                <option key={pt.id} value={pt.id}>{pt.icon} {pt.label}</option>
                              ))}
                            </select>
                            <ChevronDown className="w-3 h-3 text-blue-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                          <div className="relative">
                            <select
                              value={formData.style}
                              onChange={(e) => setFormData({ ...formData, style: e.target.value })}
                              className="appearance-none pl-3 pr-7 py-1.5 bg-purple-500/10 border border-purple-500/25 rounded-lg text-purple-300 text-xs font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-purple-500/40"
                            >
                              {STYLES.map(s => (
                                <option key={s.id} value={s.id}>{s.icon} {s.name}</option>
                              ))}
                            </select>
                            <ChevronDown className="w-3 h-3 text-purple-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                          <div className="relative">
                            <select
                              value={formData.genre}
                              onChange={(e) => setFormData({ ...formData, genre: e.target.value })}
                              className="appearance-none pl-3 pr-7 py-1.5 bg-emerald-500/10 border border-emerald-500/25 rounded-lg text-emerald-300 text-xs font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                            >
                              {GENRES.map(g => (
                                <option key={g.id} value={g.id}>{g.icon} {g.name}</option>
                              ))}
                            </select>
                            <ChevronDown className="w-3 h-3 text-emerald-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/25 rounded-lg">
                            <Film className="w-3 h-3 text-amber-400" />
                            <input
                              type="number"
                              min={1}
                              max={80}
                              value={formData.episodeCount}
                              onChange={(e) => setFormData({ ...formData, episodeCount: Math.max(1, Math.min(80, parseInt(e.target.value) || 1)) })}
                              className="w-8 bg-transparent text-amber-300 text-xs font-medium text-center
                              [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <span className="text-amber-400 text-xs">集</span>
                          </div>
                        </div>
                      </div>

                      {/* 宣传片专属字段 */}
                      {isPromoType(formData.productionType) && (
                        <div className="space-y-4">
                          {/* 宣传调性 */}
                          <div>
                            <Label className="text-gray-400 text-xs mb-2 block">宣传调性</Label>
                            <div className="flex flex-wrap gap-1.5">
                              {PROMO_TONES.map(tone => (
                                <button
                                  key={tone.id}
                                  onClick={() => setFormData({ ...formData, promoTone: tone.id })}
                                  className={`px-2.5 py-1 rounded-lg text-xs transition-all ${
                                    formData.promoTone === tone.id
                                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                      : 'text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-transparent'
                                  }`}
                                >
                                  {tone.icon} {tone.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* 广告语 */}
                          {formData.slogan !== undefined && (
                            <div>
                              <Label className="text-gray-400 text-xs mb-1.5 block">广告语 / Slogan</Label>
                              <input
                                type="text"
                                value={formData.slogan || ''}
                                onChange={(e) => setFormData({ ...formData, slogan: e.target.value })}
                                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                              />
                            </div>
                          )}

                          {/* 卖点 */}
                          {formData.sellingPoints && formData.sellingPoints.length > 0 && (
                            <div>
                              <Label className="text-gray-400 text-xs mb-1.5 block">核心卖点</Label>
                              <div className="flex flex-wrap gap-1.5">
                                {formData.sellingPoints.map((pt, idx) => (
                                  <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-500/10 text-purple-300 rounded-lg text-xs border border-purple-500/15">
                                    {pt}
                                    <button onClick={() => setFormData({ ...formData, sellingPoints: formData.sellingPoints?.filter((_, i) => i !== idx) })} className="hover:text-red-400"><X className="w-3 h-3" /></button>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 目标受众 */}
                          {formData.targetAudience && (
                            <div>
                              <Label className="text-gray-400 text-xs mb-1.5 block">目标受众</Label>
                              <input
                                type="text"
                                value={formData.targetAudience || ''}
                                onChange={(e) => setFormData({ ...formData, targetAudience: e.target.value })}
                                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {/* 画面比例 */}
                      <div>
                        <Label className="text-gray-400 text-xs mb-2 block">画面比例</Label>
                        <div className="grid grid-cols-5 gap-2">
                          {ASPECT_RATIOS.map((ar) => {
                            const isSelected = (formData.aspectRatio || '9:16') === ar.id;
                            return (
                              <button
                                key={ar.id}
                                onClick={() => setFormData({ ...formData, aspectRatio: ar.id })}
                                className={`p-2 rounded-xl border transition-all flex flex-col items-center gap-1 ${
                                  isSelected
                                    ? 'border-purple-500 bg-purple-500/15'
                                    : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                                }`}
                              >
                                <div className="flex items-center justify-center h-8">
                                  <div
                                    className={`rounded-sm border ${isSelected ? 'border-purple-400 bg-purple-500/20' : 'border-gray-600 bg-white/5'}`}
                                    style={{ width: ar.w * 0.7, height: ar.h * 0.7 }}
                                  />
                                </div>
                                <span className={`text-[10px] font-bold ${isSelected ? 'text-white' : 'text-gray-500'}`}>{ar.id}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 分辨率 */}
                      <div>
                        <Label className="text-gray-400 text-xs mb-2 block">视频清晰度</Label>
                        <div className="flex gap-2">
                          {RESOLUTIONS.map((res) => {
                            const isSelected = (formData.resolution || '720p') === res.id;
                            return (
                              <button
                                key={res.id}
                                onClick={() => setFormData({ ...formData, resolution: res.id })}
                                className={`relative flex-1 py-2 px-3 rounded-xl border transition-all ${
                                  isSelected
                                    ? 'border-purple-500 bg-purple-500/15'
                                    : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                                }`}
                              >
                                {res.badge && (
                                  <span className="absolute -top-1.5 right-1.5 px-1 py-0.5 text-[8px] font-bold bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full">{res.badge}</span>
                                )}
                                <div className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-gray-400'}`}>{res.label}</div>
                                <div className="text-[10px] text-gray-500">{res.desc}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 社区发布 */}
                      <div
                        className="flex items-center justify-between p-3 bg-white/[0.03] border border-white/8 rounded-xl cursor-pointer hover:bg-white/[0.05] transition-colors"
                        onClick={() => setFormData({ ...formData, isPublic: formData.isPublic === false ? true : false })}
                      >
                        <div className="flex items-center gap-2.5">
                          {formData.isPublic !== false ? <Globe className="w-4 h-4 text-emerald-400" /> : <Lock className="w-4 h-4 text-gray-400" />}
                          <div>
                            <div className="text-white text-xs font-medium">{formData.isPublic !== false ? '发布到社区' : '仅自己可见'}</div>
                            <div className="text-gray-500 text-[10px]">{formData.isPublic !== false ? '作品可在社区发现页浏览' : '作品不会出现在社区'}</div>
                          </div>
                        </div>
                        <div className={`relative w-9 h-5 rounded-full transition-colors ${formData.isPublic !== false ? 'bg-emerald-500' : 'bg-gray-600'}`}>
                          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${formData.isPublic !== false ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ─── 创作按钮 ─── */}
            <div className="flex items-center justify-between pt-2">
              <Button
                onClick={() => setMode('input')}
                variant="ghost"
                className="text-gray-400"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                重新输入
              </Button>
              <Button
                onClick={handleSubmitCreate}
                disabled={isAnalyzing || !formData.title}
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 px-8 py-3 rounded-xl text-base font-medium shadow-lg shadow-purple-500/25"
              >
                {isAnalyzing ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    AI创作中...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    开始创作
                  </span>
                )}
              </Button>
            </div>
          </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════ */}
        {/* 手动模式（极简模式：标题 + 内容，其余全部自动） */}
        {/* ═══════════════════════════════════════════════════ */}
        {mode === 'manual' && (
          <ManualWizard
            formData={formData}
            setFormData={setFormData}
            isAnalyzing={isAnalyzing}
            onAnalyze={handleAnalyze}
            onBack={() => setMode('input')}
            userPhone={userPhone}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 手动精简向导（极简模式：标题 + 内容，其余全部自动）
// ═══════════════════════════════════════════════════════════════════

function ManualWizard({ formData, setFormData, isAnalyzing, onAnalyze, onBack }: {
  formData: SeriesFormData;
  setFormData: React.Dispatch<React.SetStateAction<SeriesFormData>>;
  isAnalyzing: boolean;
  onAnalyze: () => void;
  onBack: () => void;
  userPhone?: string;
}) {
  return (
    <motion.div
      key="manual"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      <div className="bg-white/[0.03] backdrop-blur-xl rounded-3xl border border-white/10 p-5 sm:p-6 space-y-4">
        {/* 提示 */}
        <div className="flex items-start gap-2.5 px-3 py-2.5 bg-purple-500/8 border border-purple-500/15 rounded-xl">
          <Sparkles className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
          <p className="text-xs text-purple-300 leading-relaxed">
            只需填写标题和内容描述，AI会自动判断视频类型、风格、集数、画面比例等所有参数。
          </p>
        </div>

        {/* 标题 */}
        <div>
          <Label className="text-gray-400 text-xs mb-1.5 block">标题 *</Label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="例如：都市爱情故事、华为品牌宣传片、新品发布视频..."
            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
          />
        </div>

        {/* 内容描述 */}
        <div>
          <Label className="text-gray-400 text-xs mb-1.5 block">内容描述 *</Label>
          <textarea
            value={formData.storyOutline}
            onChange={(e) => setFormData({ ...formData, storyOutline: e.target.value })}
            placeholder={"描述你想创作的视频内容...\n\n例如：\n• 一个程序员和咖啡店老板娘的爱情故事，从偶遇到相知相爱\n• 百年茶企从武夷山走向世界的品牌故事，传承与创新交融\n• 新款智能手表的产品亮点：健康监测、超长续航、时尚设计"}
            rows={10}
            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/40 resize-none text-sm leading-relaxed"
          />
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center justify-between pt-2">
        <Button onClick={onBack} variant="ghost" className="text-gray-400">
          <ArrowLeft className="w-4 h-4 mr-2" />
          返回
        </Button>
        <Button
          onClick={onAnalyze}
          disabled={isAnalyzing || !formData.title || !formData.storyOutline}
          className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 px-6 py-2.5 rounded-xl"
        >
          {isAnalyzing ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              AI创作中...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              开始创作
            </span>
          )}
        </Button>
      </div>
    </motion.div>
  );
}