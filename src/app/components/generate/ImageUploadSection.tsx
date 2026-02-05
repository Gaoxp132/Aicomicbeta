import { Upload, X, Sparkles, Frame } from 'lucide-react';
import { Label } from '../ui/label';
import { IMAGE_MODES } from '../../constants/videoGeneration';
import { motion } from 'motion/react';
import { type ImageMode } from '../../utils/modelSelection';

interface ImageUploadSectionProps {
  imageMode: ImageMode;
  onImageModeChange: (mode: ImageMode) => void;
  
  // 首帧模式
  firstFramePreview: string;
  firstFrameInputRef: React.RefObject<HTMLInputElement>;
  onFirstFrameSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onFirstFrameRemove: () => void;
  onFirstFrameAIGenerate: () => void;
  
  // 尾帧模式
  lastFramePreview: string;
  lastFrameInputRef: React.RefObject<HTMLInputElement>;
  onLastFrameSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onLastFrameRemove: () => void;
  onLastFrameAIGenerate: () => void;
  
  // 参考图模式
  referencePreviews: string[];
  referenceInputRef: React.RefObject<HTMLInputElement>;
  onReferenceSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onReferenceRemove: (index: number) => void;
  onReferenceAIGenerate: () => void;
}

export function ImageUploadSection({
  imageMode,
  onImageModeChange,
  firstFramePreview,
  firstFrameInputRef,
  onFirstFrameSelect,
  onFirstFrameRemove,
  onFirstFrameAIGenerate,
  lastFramePreview,
  lastFrameInputRef,
  onLastFrameSelect,
  onLastFrameRemove,
  onLastFrameAIGenerate,
  referencePreviews,
  referenceInputRef,
  onReferenceSelect,
  onReferenceRemove,
  onReferenceAIGenerate,
}: ImageUploadSectionProps) {
  return (
    <div className="space-y-4">
      {/* 图片模式选择 */}
      <div>
        <Label className="text-xs text-gray-400 mb-2 block">选择图片模式</Label>
        <div className="grid grid-cols-3 gap-2">
          {IMAGE_MODES.map((mode) => (
            <motion.button
              key={mode.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onImageModeChange(mode.id as ImageMode)}
              className={`p-2 sm:p-3 rounded-xl border-2 transition-all text-left ${
                imageMode === mode.id
                  ? 'border-purple-500 bg-purple-500/10'
                  : 'border-white/10 bg-white/5 hover:border-white/20'
              }`}
            >
              <div className="text-lg mb-1">{mode.icon}</div>
              <div className={`text-xs font-medium mb-0.5 ${imageMode === mode.id ? 'text-white' : 'text-gray-300'}`}>
                {mode.name}
              </div>
              <div className="text-xs text-gray-500">{mode.desc}</div>
            </motion.button>
          ))}
        </div>
      </div>

      {/* 首尾帧模式 */}
      {imageMode === 'first_last' && (
        <div className="space-y-3">
          {/* 首帧上传 */}
          <ImageUploadBox
            label="首帧图片"
            required
            preview={firstFramePreview}
            inputRef={firstFrameInputRef}
            onSelect={onFirstFrameSelect}
            onRemove={onFirstFrameRemove}
            onAIGenerate={onFirstFrameAIGenerate}
            badge="首帧"
          />

          {/* 尾帧上传 */}
          <ImageUploadBox
            label="尾帧图片"
            optional
            preview={lastFramePreview}
            inputRef={lastFrameInputRef}
            onSelect={onLastFrameSelect}
            onRemove={onLastFrameRemove}
            onAIGenerate={onLastFrameAIGenerate}
            badge="尾帧"
            optionalText="可选，不上传则使用首帧模式"
          />
        </div>
      )}

      {/* 首帧模式 */}
      {imageMode === 'first_frame' && (
        <ImageUploadBox
          label="首帧图片"
          preview={firstFramePreview}
          inputRef={firstFrameInputRef}
          onSelect={onFirstFrameSelect}
          onRemove={onFirstFrameRemove}
          onAIGenerate={onFirstFrameAIGenerate}
        />
      )}

      {/* 参考图模式 */}
      {imageMode === 'reference' && (
        <div className="space-y-3">
          {referencePreviews.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {referencePreviews.map((preview, index) => (
                <div key={index} className="relative aspect-video rounded-xl overflow-hidden bg-black/20">
                  <img src={preview} alt={`参考图 ${index + 1}`} className="w-full h-full object-cover" />
                  <button
                    onClick={() => onReferenceRemove(index)}
                    className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                  <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 rounded-md">
                    <span className="text-xs text-white">图片 {index + 1}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {referencePreviews.length < 4 && (
            <div className="space-y-2">
              <div
                onClick={() => referenceInputRef.current?.click()}
                className="border-2 border-dashed border-white/20 bg-white/5 hover:border-purple-400 hover:bg-purple-500/5 rounded-xl p-8 transition-all cursor-pointer"
              >
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
                    <Upload className="w-8 h-8 text-gray-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-white font-medium mb-1">
                      {referencePreviews.length > 0 ? '点击添加更多参考图' : '点击上传参考图片'}
                    </p>
                    <p className="text-xs text-gray-500">
                      支持 JPG、PNG 等格式，最大 30MB
                    </p>
                    <p className="text-xs text-purple-400 mt-1">
                      {referencePreviews.length > 0 
                        ? `还可以添加 ${4 - referencePreviews.length} 张图片`
                        : '最多可上传 4 张图片'
                      }
                    </p>
                  </div>
                </div>
                <input
                  type="file"
                  ref={referenceInputRef}
                  accept="image/*"
                  onChange={onReferenceSelect}
                  className="hidden"
                  multiple
                />
              </div>
              <button
                onClick={onReferenceAIGenerate}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-purple-500/20 to-pink-500/20 hover:from-purple-500/30 hover:to-pink-500/30 border border-purple-500/30 rounded-lg transition-all flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span className="text-sm text-purple-300 font-medium">AI生成参考图</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ImageUploadBoxProps {
  label: string;
  required?: boolean;
  optional?: boolean;
  preview: string;
  inputRef: React.RefObject<HTMLInputElement>;
  onSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
  onAIGenerate: () => void;
  badge?: string;
  optionalText?: string;
}

function ImageUploadBox({
  label,
  required,
  optional,
  preview,
  inputRef,
  onSelect,
  onRemove,
  onAIGenerate,
  badge,
  optionalText
}: ImageUploadBoxProps) {
  return (
    <div>
      <Label className="text-xs text-gray-400 mb-2 block flex items-center gap-1">
        <Frame className="w-3 h-3" />
        {label} {required && <span className="text-red-400">*</span>}
        {optional && <span className="text-gray-500">(可选)</span>}
      </Label>
      {preview ? (
        <div className="relative aspect-video rounded-xl overflow-hidden bg-black/20">
          <img src={preview} alt={label} className="w-full h-full object-cover" />
          <button
            onClick={onRemove}
            className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
          >
            <X className="w-4 h-4 text-white" />
          </button>
          {badge && (
            <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 rounded-md">
              <span className="text-xs text-white">{badge}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-white/20 bg-white/5 hover:border-purple-400 hover:bg-purple-500/5 rounded-xl p-6 transition-all cursor-pointer"
          >
            <div className="flex flex-col items-center gap-2">
              <Upload className="w-8 h-8 text-gray-400" />
              <p className="text-sm text-white">点击上传{label}</p>
              <p className="text-xs text-gray-500">
                {optionalText || '支持 JPG、PNG 等格式'}
              </p>
            </div>
            <input
              type="file"
              ref={inputRef}
              accept="image/*"
              onChange={onSelect}
              className="hidden"
            />
          </div>
          <button
            onClick={onAIGenerate}
            className="w-full py-2.5 px-4 bg-gradient-to-r from-purple-500/20 to-pink-500/20 hover:from-purple-500/30 hover:to-pink-500/30 border border-purple-500/30 rounded-lg transition-all flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="text-sm text-purple-300 font-medium">AI生成{label.replace('图片', '')}图</span>
          </button>
        </div>
      )}
    </div>
  );
}
