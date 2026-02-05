import { useState } from 'react';
import { Sparkles, Zap, Crown, Settings } from 'lucide-react';

interface ModelInfo {
  id: string;
  name: string;
  description: string;
  maxDuration: number;
  resolutions: string[];
  fps: number[];
  supportsAudio: boolean;
  quality: string;
  speed: string;
  icon: typeof Sparkles;
  badge?: string;
}

const MODELS: ModelInfo[] = [
  {
    id: 'WAN_2_1_14B',
    name: 'Wan2.1-14B',
    description: '最新旗舰模型，超高质量，支持2K分辨率和60fps',
    maxDuration: 20,
    resolutions: ['720p', '1080p', '2K'],
    fps: [24, 30, 60],
    supportsAudio: true,
    quality: 'ultra',
    speed: 'slow',
    icon: Crown,
    badge: '🆕 最新',
  },
  {
    id: 'HIGH_QUALITY',
    name: 'SeedAnce 1.5 Pro',
    description: '高质量专业版，支持音频生成和多图输入',
    maxDuration: 15,
    resolutions: ['720p', '1080p'],
    fps: [24, 30],
    supportsAudio: true,
    quality: 'high',
    speed: 'medium',
    icon: Sparkles,
    badge: '推荐',
  },
  {
    id: 'LEGACY_PRO',
    name: 'SeedAnce 1.0 Pro',
    description: '经典专业版，稳定可靠',
    maxDuration: 10,
    resolutions: ['720p', '1080p'],
    fps: [24, 30],
    supportsAudio: false,
    quality: 'high',
    speed: 'medium',
    icon: Settings,
  },
  {
    id: 'MULTI_IMAGE',
    name: 'SeedAnce 1.0 Lite I2V',
    description: '多图生视频专用，支持最多8张图片',
    maxDuration: 10,
    resolutions: ['720p'],
    fps: [24],
    supportsAudio: false,
    quality: 'medium',
    speed: 'fast',
    icon: Zap,
  },
];

interface ModelSelectorProps {
  selectedModel?: string;
  onModelChange?: (modelId: string) => void;
  duration?: number;
  resolution?: string;
  enableAudio?: boolean;
  imageCount?: number;
}

export function ModelSelector({
  selectedModel,
  onModelChange,
  duration = 5,
  resolution = '1080p',
  enableAudio = false,
  imageCount = 1,
}: ModelSelectorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');

  // 智能推荐模型
  const getRecommendedModel = (): string => {
    // 长视频或2K分辨率 -> Wan2.1-14B
    if (duration > 10 || resolution === '2K') {
      return 'WAN_2_1_14B';
    }
    
    // 需要音频 -> SeedAnce 1.5 Pro 或 Wan2.1-14B
    if (enableAudio) {
      return duration > 15 ? 'WAN_2_1_14B' : 'HIGH_QUALITY';
    }
    
    // 多图 -> MULTI_IMAGE
    if (imageCount > 4) {
      return 'MULTI_IMAGE';
    }
    
    // 默认推荐 1.5 Pro
    return 'HIGH_QUALITY';
  };

  const recommendedModelId = mode === 'auto' ? getRecommendedModel() : selectedModel || 'HIGH_QUALITY';
  const currentModel = MODELS.find(m => m.id === recommendedModelId) || MODELS[1];

  const handleModelSelect = (modelId: string) => {
    setMode('manual');
    onModelChange?.(modelId);
    setIsExpanded(false);
  };

  return (
    <div className="space-y-3">
      {/* 模式切换 */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setMode('auto')}
          className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
            mode === 'auto'
              ? 'bg-purple-500 text-white'
              : 'bg-white/5 text-gray-400 hover:bg-white/10'
          }`}
        >
          🤖 智能推荐
        </button>
        <button
          onClick={() => setMode('manual')}
          className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
            mode === 'manual'
              ? 'bg-purple-500 text-white'
              : 'bg-white/5 text-gray-400 hover:bg-white/10'
          }`}
        >
          ⚙️ 手动选择
        </button>
      </div>

      {/* 当前选中的模型 */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="bg-white/5 border border-white/10 rounded-xl p-4 cursor-pointer hover:bg-white/10 transition-colors"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <currentModel.icon className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-white font-semibold">{currentModel.name}</h3>
                {currentModel.badge && (
                  <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-xs rounded-full">
                    {currentModel.badge}
                  </span>
                )}
                {mode === 'auto' && (
                  <span className="px-2 py-0.5 bg-green-500/20 text-green-300 text-xs rounded-full">
                    AI推荐
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-400 mt-1">{currentModel.description}</p>
              
              {/* 模型能力标签 */}
              <div className="flex flex-wrap gap-2 mt-2">
                <span className="text-xs px-2 py-1 bg-blue-500/20 text-blue-300 rounded">
                  最长 {currentModel.maxDuration}秒
                </span>
                <span className="text-xs px-2 py-1 bg-green-500/20 text-green-300 rounded">
                  {currentModel.resolutions.join(' / ')}
                </span>
                <span className="text-xs px-2 py-1 bg-yellow-500/20 text-yellow-300 rounded">
                  {currentModel.fps.join(' / ')}fps
                </span>
                {currentModel.supportsAudio && (
                  <span className="text-xs px-2 py-1 bg-purple-500/20 text-purple-300 rounded">
                    🎵 支持音频
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${
              isExpanded ? 'rotate-180' : ''
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* 模型列表（展开时显示） */}
      {isExpanded && mode === 'manual' && (
        <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
          {MODELS.map((model) => (
            <div
              key={model.id}
              onClick={() => handleModelSelect(model.id)}
              className={`bg-white/5 border rounded-lg p-3 cursor-pointer transition-all hover:bg-white/10 ${
                model.id === selectedModel
                  ? 'border-purple-500 bg-purple-500/10'
                  : 'border-white/10'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                  <model.icon className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-white font-medium text-sm">{model.name}</h4>
                    {model.badge && (
                      <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-300 text-xs rounded">
                        {model.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{model.description}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded">
                      {model.maxDuration}s
                    </span>
                    <span className="text-xs px-1.5 py-0.5 bg-green-500/20 text-green-300 rounded">
                      {model.resolutions[model.resolutions.length - 1]}
                    </span>
                    {model.supportsAudio && (
                      <span className="text-xs px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded">
                        🎵
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* AI推荐说明 */}
      {mode === 'auto' && (
        <div className="text-xs text-gray-400 bg-white/5 rounded-lg p-3 border border-white/10">
          <div className="flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-gray-300 mb-1">智能推荐说明</p>
              <ul className="space-y-0.5 text-gray-400">
                <li>• 长视频(&gt;10秒)或2K分辨率 → Wan2.1-14B</li>
                <li>• 需要音频 → SeedAnce 1.5 Pro 或 Wan2.1-14B</li>
                <li>• 多图(&gt;4张) → SeedAnce Lite I2V</li>
                <li>• 默认 → SeedAnce 1.5 Pro</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
