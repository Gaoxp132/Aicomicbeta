import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Sparkles, Loader2, BookOpen, Film, Palette, Globe, Lock, Monitor } from 'lucide-react';
import { Button, Label } from '../ui';
import { STYLES, GENRES, ASPECT_RATIOS, RESOLUTIONS } from '../../constants';
import { PRODUCTION_TYPES } from '../home';
import { useWizardAI } from './hooks';
import type { Series, SeriesFormData, ProductionType } from '../../types';

interface SeriesCreationWizardProps {
  onComplete: (series: Series) => void;
  onCancel: () => void;
  userPhone?: string;
}

export function SeriesCreationWizard({ onComplete, onCancel, userPhone }: SeriesCreationWizardProps) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<SeriesFormData>({
    title: '',
    description: '',
    genre: 'romance',
    style: 'realistic',
    episodeCount: 10,
    storyOutline: '',
    // isPublic 默认 undefined = true（发布到社区）
  });

  const {
    isAnalyzing,
    isGeneratingBasicInfo,
    isGeneratingOutline,
    handleAIGenerate,
    handleAIGenerateOutline,
    handleAnalyze,
  } = useWizardAI({ formData, setFormData, userPhone, onComplete });

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
              <h2 className="text-xl font-bold text-white">选择类型与风格</h2>
            </div>

            {/* v6.0.72: 作品类型选择（和创作模块一致） */}
            <div className="mb-8">
              <Label className="text-white mb-3 block">作品类型</Label>
              <div className="flex flex-wrap gap-2">
                {PRODUCTION_TYPES.map((pt) => (
                  <motion.button
                    key={pt.id}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setFormData({ ...formData, productionType: pt.id as ProductionType })}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all ${
                      formData.productionType === pt.id
                        ? 'border-purple-500 bg-gradient-to-br from-purple-500/20 to-pink-500/20 shadow-lg'
                        : !formData.productionType && pt.id === 'comic_drama'
                          ? 'border-purple-500/50 bg-purple-500/10'
                          : 'border-white/10 bg-white/5 hover:border-white/20'
                    }`}
                  >
                    <span className="text-lg">{pt.icon}</span>
                    <div className="text-left">
                      <div className={`text-sm font-medium ${
                        formData.productionType === pt.id || (!formData.productionType && pt.id === 'comic_drama') ? 'text-white' : 'text-gray-400'
                      }`}>
                        {pt.label}
                      </div>
                      <div className="text-[10px] text-gray-500 hidden sm:block">{pt.desc}</div>
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>

            {/* 题材类型 */}
            <div className="mb-8">
              <Label className="text-white mb-3 block">题材类型</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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

            {/* v6.0.79: 视频画面比例选择 */}
            <div className="mt-8 mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Monitor className="w-5 h-5 text-purple-400" />
                <Label className="text-white text-base">画面比例</Label>
              </div>
              <p className="text-xs text-gray-500 mb-4">同一部剧的所有视频将保持相同比例，创建后不可更改</p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {ASPECT_RATIOS.map((ar) => {
                  const isSelected = (formData.aspectRatio || '9:16') === ar.id;
                  return (
                    <motion.button
                      key={ar.id}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setFormData({ ...formData, aspectRatio: ar.id })}
                      className={`relative p-3 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${
                        isSelected
                          ? 'border-purple-500 bg-gradient-to-br from-purple-500/20 to-pink-500/20 shadow-lg shadow-purple-500/10'
                          : 'border-white/10 bg-white/5 hover:border-white/20'
                      }`}
                    >
                      {/* 比例预览框 */}
                      <div className="flex items-center justify-center h-14">
                        <div
                          className={`rounded-sm border-2 transition-colors ${
                            isSelected
                              ? `border-purple-400 bg-gradient-to-br ${ar.color} opacity-80`
                              : 'border-gray-600 bg-white/5'
                          }`}
                          style={{ width: ar.w, height: ar.h }}
                        />
                      </div>
                      <div className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-gray-400'}`}>
                        {ar.id}
                      </div>
                      <div className="text-[10px] text-gray-500 leading-tight text-center">
                        {ar.desc}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* v6.0.79: 视频分辨率选择 */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-3">
                <Label className="text-white text-sm">视频清晰度</Label>
              </div>
              <div className="flex gap-3">
                {RESOLUTIONS.map((res) => {
                  const isSelected = (formData.resolution || '720p') === res.id;
                  return (
                    <motion.button
                      key={res.id}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setFormData({ ...formData, resolution: res.id })}
                      className={`relative flex-1 py-3 px-4 rounded-xl border-2 transition-all ${
                        isSelected
                          ? 'border-purple-500 bg-purple-500/15'
                          : 'border-white/10 bg-white/5 hover:border-white/20'
                      }`}
                    >
                      {res.badge && (
                        <span className="absolute -top-2 right-2 px-1.5 py-0.5 text-[9px] font-bold bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full">
                          {res.badge}
                        </span>
                      )}
                      <div className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-gray-400'}`}>
                        {res.label}
                      </div>
                      <div className="text-[11px] text-gray-500">{res.desc}</div>
                    </motion.button>
                  );
                })}
              </div>
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
                  {formData.storyOutline ? '点击"AI扩展完善"可以让AI结合您已填写的内容进行深化和完善' : '点击"AI生成大纲"可以根据填写的标题、简介、类型、风格和集数自动生成详细大纲'}
                </p>
              </div>

              {/* v6.0.70: 社区发布开关 */}
              <div
                className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl cursor-pointer hover:bg-white/8 transition-colors"
                onClick={() => setFormData({ ...formData, isPublic: formData.isPublic === false ? true : false })}
              >
                <div className="flex items-center gap-3">
                  {formData.isPublic !== false ? (
                    <Globe className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <Lock className="w-5 h-5 text-gray-400" />
                  )}
                  <div>
                    <div className="text-white text-sm font-medium">
                      {formData.isPublic !== false ? '发布到社区' : '仅自己可见'}
                    </div>
                    <div className="text-gray-500 text-xs">
                      {formData.isPublic !== false ? '其他用户可在社区发现页浏览您的作品' : '作品不会出现在社区发现页'}
                    </div>
                  </div>
                </div>
                <div className={`relative w-11 h-6 rounded-full transition-colors ${formData.isPublic !== false ? 'bg-emerald-500' : 'bg-gray-600'}`}>
                  <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${formData.isPublic !== false ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                </div>
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