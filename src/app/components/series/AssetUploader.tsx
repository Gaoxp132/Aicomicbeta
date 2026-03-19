/**
 * v6.0.192: Multi-asset uploader for smart creation
 * Supports images and videos, with tag assignment (logo/product/scene/general)
 */
import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { ImagePlus, Video, X, Loader2 } from 'lucide-react';
import { apiUpload, getErrorMessage } from '../../utils';
import type { ReferenceAsset } from '../../types';

const ASSET_TAGS = [
  { id: 'logo', label: 'Logo', color: 'text-amber-400 bg-amber-500/15 border-amber-500/30' },
  { id: 'product', label: '产品', color: 'text-blue-400 bg-blue-500/15 border-blue-500/30' },
  { id: 'scene', label: '场景', color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' },
  { id: 'general', label: '通用', color: 'text-gray-400 bg-white/5 border-white/15' },
] as const;

const MAX_ASSETS = 10;

interface AssetUploaderProps {
  assets: ReferenceAsset[];
  onAssetsChange: (assets: ReferenceAsset[]) => void;
  userPhone?: string;
  disabled?: boolean;
}

export function AssetUploader({ assets, onAssetsChange, userPhone, disabled }: AssetUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [editingTagIdx, setEditingTagIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (!userPhone) { toast.info('请先登录后上传素材'); return; }
    if (assets.length + files.length > MAX_ASSETS) {
      toast.error(`最多上传${MAX_ASSETS}个素材`);
      return;
    }

    setUploading(true);
    const newAssets: ReferenceAsset[] = [];

    for (const file of Array.from(files)) {
      const isVideo = file.type.startsWith('video/');
      const isImage = file.type.startsWith('image/');
      if (!isImage && !isVideo) { toast.error(`${file.name} 不是图片或视频文件`); continue; }
      const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
      if (file.size > maxSize) { toast.error(`${file.name} 超过${isVideo ? '50' : '10'}MB限制`); continue; }

      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('tag', 'general');
        const result = await apiUpload('/upload-asset', fd, {
          headers: { 'X-User-Phone': userPhone },
        });
        if (result.success && result.data?.url) {
          newAssets.push({
            url: String(result.data.url),
            type: isVideo ? 'video' : 'image',
            name: file.name,
            size: file.size,
            tag: 'general',
          });
        } else {
          toast.error(`${file.name} 上传失败: ${result.error || '未知错误'}`);
        }
      } catch (err: unknown) {
        toast.error(`${file.name} 上传失败: ${getErrorMessage(err)}`);
      }
    }

    if (newAssets.length > 0) {
      onAssetsChange([...assets, ...newAssets]);
      toast.success(`已上传${newAssets.length}个素材`);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [assets, onAssetsChange, userPhone]);

  const removeAsset = useCallback((idx: number) => {
    onAssetsChange(assets.filter((_, i) => i !== idx));
  }, [assets, onAssetsChange]);

  const updateTag = useCallback((idx: number, tag: ReferenceAsset['tag']) => {
    const updated = [...assets];
    updated[idx] = { ...updated[idx], tag };
    onAssetsChange(updated);
    setEditingTagIdx(null);
  }, [assets, onAssetsChange]);

  if (assets.length === 0 && !uploading) {
    return (
      <div className="mt-3">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-white/15 text-gray-500 hover:text-purple-400 hover:border-purple-500/40 transition-all text-xs w-full justify-center"
        >
          <ImagePlus className="w-3.5 h-3.5" />
          <span>上传参考素材</span>
          <span className="text-gray-600">(图片/视频, Logo/产品/场景)</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={handleUpload}
          className="hidden"
        />
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-500">{assets.length}/{MAX_ASSETS} 个素材</span>
        {assets.length < MAX_ASSETS && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || uploading}
            className="flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
          >
            <ImagePlus className="w-3 h-3" />
            继续添加
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {assets.map((asset, idx) => (
          <div key={`${asset.url}-${idx}`} className="relative group">
            <div className="w-16 h-16 rounded-xl overflow-hidden border border-white/15 bg-white/5">
              {asset.type === 'image' ? (
                <img src={asset.url} alt={asset.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Video className="w-5 h-5 text-gray-400" />
                </div>
              )}
            </div>
            {/* Tag badge */}
            <button
              onClick={() => setEditingTagIdx(editingTagIdx === idx ? null : idx)}
              className={`absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[8px] font-medium border ${
                ASSET_TAGS.find(t => t.id === (asset.tag || 'general'))?.color || 'text-gray-400 bg-white/5 border-white/15'
              }`}
            >
              {ASSET_TAGS.find(t => t.id === (asset.tag || 'general'))?.label || '通用'}
            </button>
            {/* Remove button */}
            <button
              onClick={() => removeAsset(idx)}
              className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500/90 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-2.5 h-2.5 text-white" />
            </button>
            {/* Tag dropdown */}
            {editingTagIdx === idx && (
              <div className="absolute top-full left-0 mt-2 z-10 bg-gray-900 border border-white/15 rounded-lg shadow-xl p-1 min-w-[80px]">
                {ASSET_TAGS.map(tag => (
                  <button
                    key={tag.id}
                    onClick={() => updateTag(idx, tag.id as ReferenceAsset['tag'])}
                    className={`w-full px-2 py-1 text-left text-[10px] rounded hover:bg-white/10 transition-colors ${
                      asset.tag === tag.id ? 'text-purple-300' : 'text-gray-400'
                    }`}
                  >
                    {tag.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {uploading && (
          <div className="w-16 h-16 rounded-xl border border-dashed border-purple-500/30 flex items-center justify-center bg-purple-500/5">
            <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
          </div>
        )}
      </div>
      <p className="text-[9px] text-gray-600">点击标签可切换类型: Logo(保持原形象) / 产品 / 场景 / 通用(AI可创意扩展)</p>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={handleUpload}
        className="hidden"
      />
    </div>
  );
}