import { motion } from 'motion/react';
import { X, Sparkles, Wand2, Loader2, Zap } from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';

interface AIImageDialogProps {
  isOpen: boolean;
  onClose: () => void;
  imageType: 'first_frame' | 'last_frame' | 'reference';
  prompt: string;
  onPromptChange: (prompt: string) => void;
  onGenerate: () => void;
  onPolish: () => void;
  isGenerating: boolean;
  isPolishing: boolean;
  useTongyi: boolean;
  onToggleTongyi: (value: boolean) => void;
}

export function AIImageDialog({
  isOpen,
  onClose,
  imageType,
  prompt,
  onPromptChange,
  onGenerate,
  onPolish,
  isGenerating,
  isPolishing,
  useTongyi,
  onToggleTongyi
}: AIImageDialogProps) {
  if (!isOpen) return null;

  const addStyleTag = (tag: string) => {
    const currentText = prompt.trim();
    if (currentText) {
      onPromptChange(`${currentText}，${tag}`);
    } else {
      onPromptChange(tag);
    }
  };

  const imageTypeLabel = 
    imageType === 'first_frame' ? '首帧' : 
    imageType === 'last_frame' ? '尾帧' : '参考';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 w-full max-w-md border border-purple-500/30 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <h3 className="text-lg font-semibold text-white">
              AI生成{imageTypeLabel}图片
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="p-1 hover:bg-white/10 rounded-full transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* 当前使用的引擎提示 */}
        {useTongyi && (
          <div className="mb-3 px-3 py-2 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-lg">
            <p className="text-xs text-blue-300 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" />
              使用阿里云通义万相生成高质量图片
            </p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <Label className="text-sm text-gray-300 mb-2 block">
              请描述您想要的图片内容
            </Label>
            <Textarea
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder="例如：一个年轻的剑客站在古老的神庙门前，夕阳下的剪影，日系动漫风格"
              disabled={isGenerating || isPolishing}
              className="min-h-24 bg-white/5 border-white/10 text-white placeholder:text-gray-500 resize-none"
            />
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-gray-500">
                {prompt.length}/200
              </p>
              {prompt.trim() && !isGenerating && (
                <button
                  onClick={onPolish}
                  disabled={isPolishing}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded transition-colors disabled:opacity-50"
                >
                  {isPolishing ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      润色中...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-3 h-3" />
                      AI润色
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* 快速风格标签 */}
          <div>
            <Label className="text-xs text-gray-400 mb-2 block">快速添加风格</Label>
            <div className="flex flex-wrap gap-2">
              {[
                '日系动漫风格',
                '写实摄影风格',
                '赛博朋克风格',
                '奇幻魔法风格',
                '水彩画风格',
                '油画质感',
                '电影级光影',
                '黄金时刻',
              ].map((tag) => (
                <button
                  key={tag}
                  onClick={() => addStyleTag(tag)}
                  disabled={isGenerating || isPolishing}
                  className="px-2.5 py-1 text-xs bg-white/5 hover:bg-white/10 border border-white/10 hover:border-purple-500/30 text-gray-300 hover:text-purple-300 rounded-md transition-all disabled:opacity-50"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
            <p className="text-xs text-purple-300">
              💡 提示：详细描述画面的人物、场景、氛围和风格，AI将为您生成高质量的图片
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={onClose}
              disabled={isGenerating || isPolishing}
              variant="outline"
              className="flex-1 bg-white/5 border-white/20 text-white hover:bg-white/10"
            >
              取消
            </Button>
            <Button
              onClick={onGenerate}
              disabled={isGenerating || isPolishing || !prompt.trim()}
              className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  生成图片
                </>
              )}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}