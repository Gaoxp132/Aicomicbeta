import { motion } from 'motion/react';
import { Clock, MonitorPlay, Volume2, Cpu, Sparkles } from 'lucide-react';
import { Label } from '../ui/label';
import { ALL_DURATIONS, RESOLUTIONS, MODEL_CAPABILITIES } from '../../constants/videoGeneration';

interface VideoSettingsProps {
  // 时长
  selectedDuration: string;
  onDurationChange: (duration: string) => void;
  isDurationSupported: (duration: string) => boolean;
  
  // 分辨率
  selectedResolution: string;
  onResolutionChange: (resolution: string) => void;
  
  // 音频
  enableAudio: boolean;
  onAudioChange: (enabled: boolean) => void;
  isAudioSupported: boolean;
  
  // 通义开关
  useTongyi: boolean;
  onToggleTongyi: (value: boolean) => void;
  
  // 模型信息
  currentModel: string;
  imageUrlsCount: number;
  imageMode: string;
}

export function VideoSettings({
  selectedDuration,
  onDurationChange,
  isDurationSupported,
  selectedResolution,
  onResolutionChange,
  enableAudio,
  onAudioChange,
  isAudioSupported,
  useTongyi,
  onToggleTongyi,
  currentModel,
  imageUrlsCount,
  imageMode
}: VideoSettingsProps) {
  const modelCapability = MODEL_CAPABILITIES[currentModel as keyof typeof MODEL_CAPABILITIES];

  return (
    <>
      {/* 通义开关 - 放在最前面 */}
      <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 backdrop-blur-xl rounded-3xl p-4 sm:p-6 border border-blue-500/20">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
            <div>
              <Label className="text-sm sm:text-base text-white block">AI智能引擎</Label>
              <p className="text-xs text-gray-400 mt-0.5">
                {useTongyi ? '阿里云通义系列 - 超高质量' : '豆包系列 - 均衡性能'}
              </p>
            </div>
          </div>
          <button
            onClick={() => onToggleTongyi(!useTongyi)}
            className={`relative inline-flex h-8 w-14 items-center rounded-full transition-all duration-300 ${
              useTongyi ? 'bg-gradient-to-r from-blue-500 to-purple-500 shadow-lg shadow-blue-500/30' : 'bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-300 shadow-md ${
                useTongyi ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        
        {/* 引擎详细说明 */}
        {useTongyi ? (
          <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <p className="text-xs text-blue-300 leading-relaxed">
              🌟 <strong>通义增强已开启</strong>
              <br />
              • 图片生成：使用阿里云通义万相，质量更高
              <br />
              • 视频生成：使用Wan2.1-14B模型，支持20秒时长、2K分辨率、60fps
            </p>
          </div>
        ) : (
          <div className="mt-3 p-3 bg-gray-500/10 border border-gray-500/20 rounded-xl">
            <p className="text-xs text-gray-400 leading-relaxed">
              使用火山引擎豆包系列，性能均衡，响应快速
            </p>
          </div>
        )}
      </div>

      {/* 时长选择 */}
      <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-4 sm:p-6 border border-white/10">
        <div className="flex items-center gap-2 mb-3 sm:mb-4">
          <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400" />
          <Label className="text-sm sm:text-base text-white">视频时长</Label>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {ALL_DURATIONS.filter(d => isDurationSupported(d.id)).map((duration) => {
            const isBlockedByAudio = enableAudio && parseInt(duration.id) > 12;
            
            return (
              <motion.button
                key={duration.id}
                whileHover={!isBlockedByAudio ? { scale: 1.05 } : {}}
                whileTap={!isBlockedByAudio ? { scale: 0.95 } : {}}
                onClick={() => !isBlockedByAudio && onDurationChange(duration.id)}
                disabled={isBlockedByAudio}
                className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl border-2 transition-all text-left ${
                  selectedDuration === duration.id && !isBlockedByAudio
                    ? 'border-purple-500 bg-gradient-to-br from-purple-500/20 to-pink-500/20 shadow-lg'
                    : !isBlockedByAudio
                      ? 'border-white/10 bg-white/5 hover:border-white/20'
                      : 'border-white/5 bg-white/5 opacity-40 cursor-not-allowed'
                }`}
              >
                <div className={`text-sm sm:text-base font-medium mb-0.5 sm:mb-1 ${
                  selectedDuration === duration.id && !isBlockedByAudio 
                    ? 'text-white' 
                    : !isBlockedByAudio
                      ? 'text-gray-300' 
                      : 'text-gray-600'
                }`}>
                  {duration.name}
                </div>
                <div className={`text-xs ${
                  !isBlockedByAudio ? 'text-gray-500' : 'text-gray-700'
                }`}>
                  {isBlockedByAudio ? '音频不支持' : duration.desc}
                </div>
              </motion.button>
            );
          })}
        </div>
        {enableAudio && (
          <div className="mt-2 sm:mt-3 p-2 sm:p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <p className="text-xs text-yellow-300">
              ℹ️ 音频功能最长支持 12 秒时长
            </p>
          </div>
        )}
      </div>

      {/* 分辨率选择 */}
      <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-4 sm:p-6 border border-white/10">
        <div className="flex items-center gap-2 mb-3 sm:mb-4">
          <MonitorPlay className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400" />
          <Label className="text-sm sm:text-base text-white">视频分辨率</Label>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {RESOLUTIONS.map((resolution) => {
            const isSupported = modelCapability.resolutions.includes(resolution.id);
            const isBlockedByAudio = enableAudio && (resolution.id === '1080p' || resolution.id === '2k');
            
            return (
              <motion.button
                key={resolution.id}
                whileHover={isSupported && !isBlockedByAudio ? { scale: 1.05 } : {}}
                whileTap={isSupported && !isBlockedByAudio ? { scale: 0.95 } : {}}
                onClick={() => isSupported && !isBlockedByAudio && onResolutionChange(resolution.id)}
                disabled={!isSupported || isBlockedByAudio}
                className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl border-2 transition-all text-left ${
                  selectedResolution === resolution.id && isSupported
                    ? 'border-purple-500 bg-gradient-to-br from-purple-500/20 to-pink-500/20 shadow-lg'
                    : isSupported && !isBlockedByAudio
                      ? 'border-white/10 bg-white/5 hover:border-white/20'
                      : 'border-white/5 bg-white/5 opacity-40 cursor-not-allowed'
                }`}
              >
                <div className={`text-sm sm:text-base font-medium mb-0.5 sm:mb-1 ${
                  selectedResolution === resolution.id && isSupported 
                    ? 'text-white' 
                    : isSupported && !isBlockedByAudio
                      ? 'text-gray-300' 
                      : 'text-gray-600'
                }`}>
                  {resolution.name}
                </div>
                <div className={`text-xs ${
                  isSupported && !isBlockedByAudio ? 'text-gray-500' : 'text-gray-700'
                }`}>
                  {isBlockedByAudio ? '音频不支持' : resolution.desc}
                </div>
              </motion.button>
            );
          })}
        </div>
        {enableAudio && (
          <div className="mt-2 sm:mt-3 p-2 sm:p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <p className="text-xs text-yellow-300">
              ℹ️ 音频功能仅支持 480p 和 720p 分辨率
            </p>
          </div>
        )}
      </div>

      {/* 音频选择 */}
      <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-4 sm:p-6 border border-white/10">
        <div className="flex items-center gap-2 mb-3 sm:mb-4">
          <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400" />
          <Label className="text-sm sm:text-base text-white">添加音频</Label>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <motion.button
            whileHover={isAudioSupported && !useTongyi ? { scale: 1.05 } : {}}
            whileTap={isAudioSupported && !useTongyi ? { scale: 0.95 } : {}}
            onClick={() => isAudioSupported && !useTongyi && onAudioChange(true)}
            disabled={!isAudioSupported || useTongyi}
            className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl border-2 transition-all text-left ${
              enableAudio && isAudioSupported && !useTongyi
                ? 'border-purple-500 bg-gradient-to-br from-purple-500/20 to-pink-500/20 shadow-lg'
                : isAudioSupported && !useTongyi
                  ? 'border-white/10 bg-white/5 hover:border-white/20'
                  : 'border-white/5 bg-white/5 opacity-40 cursor-not-allowed'
            }`}
          >
            <div className={`text-sm sm:text-base font-medium mb-0.5 sm:mb-1 ${
              enableAudio && isAudioSupported && !useTongyi ? 'text-white' : isAudioSupported && !useTongyi ? 'text-gray-300' : 'text-gray-600'
            }`}>
              开启
            </div>
            <div className={`text-xs ${isAudioSupported && !useTongyi ? 'text-gray-500' : 'text-gray-700'}`}>
              {useTongyi ? '通义不支持' : !isAudioSupported ? '当前配置不支持' : '添加背景音乐'}
            </div>
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onAudioChange(false)}
            className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl border-2 transition-all text-left ${
              !enableAudio
                ? 'border-purple-500 bg-gradient-to-br from-purple-500/20 to-pink-500/20 shadow-lg'
                : 'border-white/10 bg-white/5 hover:border-white/20'
            }`}
          >
            <div className={`text-sm sm:text-base font-medium mb-0.5 sm:mb-1 ${!enableAudio ? 'text-white' : 'text-gray-300'}`}>
              关闭
            </div>
            <div className="text-xs text-gray-500">不添加音频</div>
          </motion.button>
        </div>
        {enableAudio && isAudioSupported && !useTongyi && (
          <div className="mt-2 sm:mt-3 p-2 sm:p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
            <p className="text-xs text-purple-300">
              🎵 音画同生功能将自动使用 1.5 专业版模型
            </p>
          </div>
        )}
        {useTongyi && (
          <div className="mt-2 sm:mt-3 p-2 sm:p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <p className="text-xs text-blue-300">
              ℹ️ 通义Wan2.1-14B模型不支持音频功能，如需音频请使用豆包系列
            </p>
          </div>
        )}
      </div>

      {/* 智能模型匹配提示 */}
      <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-2xl p-3 sm:p-4">
        <div className="flex items-start gap-2">
          <Cpu className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs sm:text-sm text-cyan-300 font-medium mb-0.5 sm:mb-1">
              智能匹配模型：{modelCapability.name}
            </p>
            <p className="text-xs text-gray-400">
              {modelCapability.desc} • 根据您的配置自动选择最优模型
            </p>
            {enableAudio && (
              <p className="text-xs text-cyan-400 mt-1.5 flex items-center gap-1">
                🎵 <span className="font-medium">音频已开启</span> - 已自动使用音频专用模型（支持480p/720p）
              </p>
            )}
            {imageUrlsCount > 0 && (
              <p className="text-xs text-cyan-400 mt-1">
                📷 {imageMode === 'first_last' 
                  ? imageUrlsCount === 2 
                    ? '首尾帧模式(2张)' 
                    : '首帧模式(1张)'
                  : imageMode === 'reference'
                    ? `参考图模式(${imageUrlsCount}张)`
                    : '首帧模式(1张)'}
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}