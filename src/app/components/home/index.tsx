/**
 * Consolidated home module (v6.0.67)
 * Merged from 4 files: FeatureCard, RecentSeriesCard, ReferenceImageInput, creationConstants
 * Reduces Rollup module count by 3.
 */

import { useRef, useCallback } from 'react';
import { motion } from 'motion/react';
import { Film, Star, Loader2, ImagePlus, X as XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { apiUpload } from '../../utils';
import type { Series } from '../../types';

// ═══════════════════════════════════════════════════════════════════
// [A] creationConstants (was: creationConstants.ts)
// ═══════════════════════════════════════════════════════════════════

export const QUICK_TEMPLATES = [
  { id: 'romance', label: '都市爱情', icon: '💕', prompt: '一段都市白领之间的浪漫爱情故事，咖啡馆偶遇，从误解到心动', genre: 'romance', matchStyle: 'realistic', gradient: 'from-pink-500/20 to-rose-500/20', border: 'border-pink-500/30' },
  { id: 'suspense', label: '悬疑推理', icon: '🔍', prompt: '一个扣人心弦的悬疑推理故事，密室谋杀，每个人都有秘密', genre: 'suspense', matchStyle: 'realistic', gradient: 'from-purple-500/20 to-indigo-500/20', border: 'border-purple-500/30' },
  { id: 'fantasy', label: '奇幻冒险', icon: '⚔️', prompt: '一段充满奇幻元素的冒险旅程，少年踏入未知大陆寻找传说中的遗迹', genre: 'fantasy', matchStyle: 'fantasy', gradient: 'from-cyan-500/20 to-blue-500/20', border: 'border-cyan-500/30' },
  { id: 'comedy', label: '校园喜剧', icon: '😄', prompt: '一个充满欢笑的校园生活喜剧，社团招新闹出的一系列乌龙事件', genre: 'comedy', matchStyle: 'anime', gradient: 'from-yellow-500/20 to-orange-500/20', border: 'border-yellow-500/30' },
  { id: 'scifi', label: '科幻未来', icon: '🚀', prompt: '发生在2150年的科幻故事，人类与AI共存的世界出现了意想不到的危机', genre: 'scifi', matchStyle: 'cyberpunk', gradient: 'from-blue-500/20 to-purple-500/20', border: 'border-blue-500/30' },
  { id: 'action', label: '热血动作', icon: '⚡', prompt: '充满热血打斗的动作冒险故事，地下格斗场的无名少年立志登顶', genre: 'action', matchStyle: 'anime', gradient: 'from-red-500/20 to-orange-500/20', border: 'border-red-500/30' },
] as const;

export const STYLE_CHIPS = [
  { id: 'realistic', label: '写实', icon: '🎬' },
  { id: 'anime', label: '日漫', icon: '🎌' },
  { id: 'cartoon', label: '卡通', icon: '🎨' },
  { id: 'cyberpunk', label: '赛博朋克', icon: '🌆' },
  { id: 'chinese', label: '国风', icon: '🏮' },
  { id: 'fantasy', label: '奇幻', icon: '✨' },
  { id: 'comic', label: '漫画', icon: '📖' },
  { id: 'pixel', label: '像素', icon: '👾' },
  { id: 'threed', label: '3D渲染', icon: '🧊' },
  { id: 'oil_painting', label: '油画', icon: '🖼️' },
  { id: 'watercolor', label: '水彩', icon: '🌊' },
  { id: 'noir', label: '黑白电影', icon: '🎞️' },
  { id: 'steampunk', label: '蒸汽朋克', icon: '⚙️' },
  { id: 'xianxia', label: '仙侠', icon: '🌙' },
  { id: 'ghibli', label: '吉卜力', icon: '🍃' },
  { id: 'ukiyoe', label: '浮世绘', icon: '🌊' },
] as const;

export const PRODUCTION_TYPES = [
  { id: 'comic_drama', label: '漫剧', icon: '📚', desc: 'AI漫画风格连续剧', gradient: 'from-purple-500 to-pink-500' },
  { id: 'short_drama', label: '短剧', icon: '📱', desc: '竖屏短剧/网剧', gradient: 'from-blue-500 to-cyan-500' },
  { id: 'micro_film', label: '微电影', icon: '🎥', desc: '5-30分钟精品短片', gradient: 'from-amber-500 to-orange-500' },
  { id: 'movie', label: '电影', icon: '🎬', desc: '院线电影级品质', gradient: 'from-red-600 to-rose-500' },
  { id: 'tv_series', label: '电视剧', icon: '📺', desc: '长篇电视连续剧', gradient: 'from-green-500 to-emerald-500' },
  { id: 'documentary', label: '纪录片', icon: '🌍', desc: '真实题材纪实影像', gradient: 'from-teal-500 to-cyan-600' },
  { id: 'music_video', label: 'MV', icon: '🎵', desc: '音乐影像作品', gradient: 'from-violet-500 to-fuchsia-500' },
  { id: 'advertisement', label: '广告片', icon: '📢', desc: '品牌/产品宣传片', gradient: 'from-yellow-500 to-amber-500' },
] as const;

export const EPISODE_PRESETS = [
  { count: 3, label: '3集·体验版', desc: '快速体验' },
  { count: 6, label: '6集·短剧', desc: '精品短剧' },
  { count: 10, label: '10集·标准', desc: '完整故事' },
] as const;

export const MAX_INPUT_LENGTH = 500;

// ═══════════════════════════════════════════════════════════════════
// [B] FeatureCard (was: FeatureCard.tsx)
// ═══════════════════════════════════════════════════════════════════

export function FeatureCard({ icon, title, desc, color, bg }: {
  icon: React.ReactNode; title: string; desc: string; color: string; bg: string;
}) {
  return (
    <div className={`bg-gradient-to-br ${bg} rounded-2xl p-4 border border-white/5`}>
      <div className={`${color} mb-2`}>{icon}</div>
      <h4 className="text-sm font-medium text-white mb-1">{title}</h4>
      <p className="text-xs text-gray-400">{desc}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// [C] RecentSeriesCard (was: RecentSeriesCard.tsx)
// ═══════════════════════════════════════════════════════════════════

const statusMap: Record<string, { label: string; color: string }> = {
  'draft': { label: '草稿', color: 'text-gray-400 bg-gray-500/10' },
  'generating': { label: '创作中', color: 'text-purple-400 bg-purple-500/10 animate-pulse' },
  'in-progress': { label: '进行中', color: 'text-blue-400 bg-blue-500/10' },
  'completed': { label: '已完成', color: 'text-green-400 bg-green-500/10' },
  'failed': { label: '失败', color: 'text-red-400 bg-red-500/10' },
};

export function RecentSeriesCard({ series, onEdit }: { series: Series; onEdit?: (s: Series) => void }) {
  const status = statusMap[series.status] || statusMap['draft'];
  return (
    <motion.button whileHover={{ scale: 1.01, y: -2 }} whileTap={{ scale: 0.99 }} onClick={() => onEdit?.(series)} className="bg-white/[0.03] backdrop-blur-xl rounded-2xl border border-white/10 p-4 text-left hover:border-purple-500/20 transition-all group">
      <div className="flex items-start justify-between mb-2">
        <h4 className="text-sm font-medium text-white truncate flex-1 group-hover:text-purple-300 transition-colors">{series.title || '未命名作品'}</h4>
        <span className={`text-[10px] px-2 py-0.5 rounded-full ml-2 whitespace-nowrap ${status.color}`}>{status.label}</span>
      </div>
      <p className="text-xs text-gray-500 line-clamp-1 mb-2">{series.description || '暂无简介'}</p>
      <div className="flex items-center gap-3 text-[10px] text-gray-600">
        <span className="flex items-center gap-1"><Film className="w-3 h-3" />{series.totalEpisodes || 0}集</span>
        <span className="flex items-center gap-1"><Star className="w-3 h-3" />{series.style || '默认'}</span>
      </div>
    </motion.button>
  );
}

// ═══════════════════════════════════════════════════════════════════
// [D] ReferenceImageInput (was: ReferenceImageInput.tsx)
// ═══════════════════════════════════════════════════════════════════

interface ReferenceImageInputProps {
  referenceImage: string | null; referenceImagePreview: string | null; isUploadingRef: boolean; isCreating: boolean; userPhone?: string;
  onReferenceImageChange: (url: string | null) => void; onReferenceImagePreviewChange: (preview: string | null) => void;
  onIsUploadingRefChange: (v: boolean) => void; onShowLogin: () => void;
}

export function ReferenceImageInput({
  referenceImage, referenceImagePreview, isUploadingRef, isCreating, userPhone,
  onReferenceImageChange, onReferenceImagePreviewChange, onIsUploadingRefChange, onShowLogin,
}: ReferenceImageInputProps) {
  const refImageInputRef = useRef<HTMLInputElement>(null);

  const handleRefImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!userPhone) { onShowLogin(); toast.info('请先登录后上传参考图'); if (refImageInputRef.current) refImageInputRef.current.value = ''; return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('参考图不能超过10MB'); return; }
    if (!file.type.startsWith('image/')) { toast.error('请上传图片文件'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => onReferenceImagePreviewChange(ev.target?.result as string);
    reader.readAsDataURL(file);
    onIsUploadingRefChange(true);
    try {
      const formData = new FormData(); formData.append('file', file); formData.append('purpose', 'reference');
      const result = await apiUpload('/upload-image', formData, { headers: userPhone ? { 'X-User-Phone': userPhone } : {} });
      if (result.success && result.data?.url) { onReferenceImageChange(result.data.url); toast.success('参考图上传成功'); }
      else { throw new Error(result.error || '上传失败'); }
    } catch (err: any) { console.error('[ReferenceImageInput] Upload failed:', err); toast.error('参考图上传失败: ' + err.message); onReferenceImagePreviewChange(null); }
    finally { onIsUploadingRefChange(false); if (refImageInputRef.current) refImageInputRef.current.value = ''; }
  }, [userPhone, onShowLogin, onReferenceImageChange, onReferenceImagePreviewChange, onIsUploadingRefChange]);

  const removeRefImage = useCallback(() => { onReferenceImageChange(null); onReferenceImagePreviewChange(null); }, [onReferenceImageChange, onReferenceImagePreviewChange]);

  return (
    <div className="flex items-center gap-2 mt-2">
      {referenceImagePreview ? (
        <div className="relative group">
          <img src={referenceImagePreview} alt="参考图" className="w-16 h-16 rounded-xl object-cover border border-white/20" />
          {isUploadingRef && (<div className="absolute inset-0 bg-black/60 rounded-xl flex items-center justify-center"><Loader2 className="w-5 h-5 text-white animate-spin" /></div>)}
          <button onClick={removeRefImage} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><XIcon className="w-3 h-3 text-white" /></button>
        </div>
      ) : (
        <button onClick={() => refImageInputRef.current?.click()} disabled={isCreating} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-white/15 text-gray-500 hover:text-purple-400 hover:border-purple-500/40 transition-all text-xs">
          <ImagePlus className="w-3.5 h-3.5" /><span>上传风格参考图</span>
        </button>
      )}
      <input ref={refImageInputRef} type="file" accept="image/*" onChange={handleRefImageUpload} className="hidden" />
      {referenceImagePreview && !isUploadingRef && (<span className="text-[10px] text-green-400">此图将作为全剧视觉基准，锚定所有场景的风格</span>)}
    </div>
  );
}
