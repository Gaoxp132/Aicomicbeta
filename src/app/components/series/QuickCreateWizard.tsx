/**
 * 零基础创作向导 - AI驱动的智能创作（专业版）
 * 核心理念：引导用户生命价值成长与导航
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Sparkles, Loader2, Heart, Users, Target, Lightbulb, Star, Zap, BookOpen, TrendingUp, Baby, Briefcase, GraduationCap, Home } from 'lucide-react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import * as seriesService from '../../services/seriesService';
import * as batchVideoService from '../../services/batchVideoGeneration';
import type { Series } from '../../types';

interface QuickCreateWizardProps {
  userPhone?: string;
  onComplete: (series: Series) => void;
  onCancel: () => void;
}

// 成长主题库（优化版）
const GROWTH_THEMES = [
  {
    key: 'SELF_GROWTH',
    name: '个人成长',
    icon: Target,
    description: '突破自我，发现潜能',
    color: 'from-purple-500 to-pink-500',
    examples: '创业奋斗、职业转型、自我突破',
  },
  {
    key: 'FAMILY_BONDS',
    name: '家庭亲情',
    icon: Heart,
    description: '珍惜家人，学会感恩',
    color: 'from-red-500 to-orange-500',
    examples: '家庭和睦、代际沟通、亲子关系',
  },
  {
    key: 'CAREER_DEVELOPMENT',
    name: '职业发展',
    icon: Briefcase,
    description: '提升技能，实现价值',
    color: 'from-green-500 to-emerald-500',
    examples: '职场励志、团队协作、工匠精神',
  },
  {
    key: 'RELATIONSHIPS',
    name: '人际关系',
    icon: Users,
    description: '真诚待人，建立信任',
    color: 'from-blue-500 to-cyan-500',
    examples: '友情岁月、邻里和睦、社交沟通',
  },
  {
    key: 'PATRIOTISM',
    name: '爱国情怀',
    icon: Star,
    description: '文化自信，使命担当',
    color: 'from-yellow-500 to-orange-500',
    examples: '历史传承、国家建设、民族自豪',
  },
  {
    key: 'CULTURAL_HERITAGE',
    name: '文化传承',
    icon: BookOpen,
    description: '弘扬传统，守正创新',
    color: 'from-indigo-500 to-purple-500',
    examples: '传统技艺、非遗保护、国学经典',
  },
  {
    key: 'SOCIAL_RESPONSIBILITY',
    name: '社会责任',
    icon: TrendingUp,
    description: '奉献社会，回馈他人',
    color: 'from-pink-500 to-rose-500',
    examples: '志愿服务、公益事业、乡村振兴',
  },
  {
    key: 'RESILIENCE',
    name: '逆境成长',
    icon: Zap,
    description: '化危为机，永不放弃',
    color: 'from-orange-500 to-red-500',
    examples: '面对挫折、东山再起、心理韧性',
  },
];

// 受众群体（优化版）
const AUDIENCE_OPTIONS = [
  {
    code: 'toddler',
    label: '幼儿',
    age: '0-5岁',
    icon: Baby,
    desc: '早期启蒙',
    color: 'from-sky-400 to-blue-400',
  },
  {
    code: 'children',
    label: '儿童',
    age: '6-12岁',
    icon: Baby,
    desc: '启蒙教育',
    color: 'from-pink-500 to-rose-500',
  },
  {
    code: 'teenager',
    label: '青少年',
    age: '13-18岁',
    icon: GraduationCap,
    desc: '价值塑造',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    code: 'youth',
    label: '青年',
    age: '19-35岁',
    icon: Briefcase,
    desc: '奋斗拼搏',
    color: 'from-purple-500 to-pink-500',
  },
  {
    code: 'middle_aged',
    label: '中年',
    age: '36-55岁',
    icon: Users,
    desc: '价值创造',
    color: 'from-green-500 to-emerald-500',
  },
  {
    code: 'senior',
    label: '老年',
    age: '56岁+',
    icon: Heart,
    desc: '智慧传承',
    color: 'from-orange-500 to-yellow-500',
  },
  {
    code: 'family',
    label: '全家',
    age: '老少皆宜',
    icon: Home,
    desc: '合家欢乐',
    color: 'from-indigo-500 to-purple-500',
  },
  {
    code: 'universal',
    label: '全民',
    age: '所有人',
    icon: Star,
    desc: '适合所有人',
    color: 'from-yellow-500 to-orange-500',
  },
];

// 剧本类型
const SCRIPT_GENRES = [
  { value: '现实生活', label: '现实生活', desc: '反映真实生活' },
  { value: '历史传', label: '历史传记', desc: '铭记历史' },
  { value: '励志成长', label: '励志成长', desc: '激励人心' },
  { value: '情感关系', label: '情感关系', desc: '传递真情' },
  { value: '悬疑推理', label: '悬疑推理', desc: '弘扬正义' },
  { value: '文化传承', label: '文化传承', desc: '文化自信' },
  { value: '科技创新', label: '科技创新', desc: '科技强国' },
  { value: '乡村振兴', label: '乡村振兴', desc: '扎根农村' },
  { value: '军旅警察', label: '军旅警察', desc: '保家卫国' },
  { value: '医疗健康', label: '医疗健康', desc: '医者仁心' },
  { value: '教育启蒙', label: '教育启蒙', desc: '教育兴国' },
  { value: '奇幻探险', label: '奇幻探险', desc: '正义冒险' },
];

// 创作灵感示例
const INSPIRATION_EXAMPLES = [
  '一个乡村教师用爱心改变留守儿童命运的感人故事',
  '年轻人返乡创业，带领村民共同致富',
  '三代人在改革开放浪潮中的奋斗与成长',
  '医生在抗疫一线的感人事迹',
  '传统手工艺人守护非遗文化的坚守',
  '职场新人如何突破自我，实现梦想',
  '军人在边防线上的无私奉献',
  '一个家庭如何在逆境中相互扶持、共渡难关',
];

export function QuickCreateWizard({ userPhone, onComplete, onCancel }: QuickCreateWizardProps) {
  const [step, setStep] = useState(1);
  const [userInput, setUserInput] = useState('');
  const [targetAudience, setTargetAudience] = useState<'youth' | 'adult' | 'family'>('adult');
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);
  const [totalEpisodes, setTotalEpisodes] = useState(5);
  const [isCreating, setIsCreating] = useState(false);
  const [scriptGenre, setScriptGenre] = useState('现实生活');

  const handleThemeToggle = (themeKey: string) => {
    if (selectedThemes.includes(themeKey)) {
      setSelectedThemes(selectedThemes.filter(t => t !== themeKey));
    } else if (selectedThemes.length < 3) {
      setSelectedThemes([...selectedThemes, themeKey]);
    }
  };

  const handleSubmit = async () => {
    if (isCreating) return;

    setIsCreating(true);

    try {
      console.log('[QuickCreate] 🚀 Sending request with params:', {
        userInput,
        userPhone,
        targetAudience,
        selectedThemes,
        totalEpisodes,
        scriptGenre,
      });

      const result = await seriesService.createSeriesFromIdea(userInput, userPhone, {
        targetAudience,
        preferredThemes: selectedThemes.length > 0 ? selectedThemes : undefined,
        totalEpisodes,
        scriptGenre,
      });

      console.log('[QuickCreate] 📥 Received result:', JSON.stringify(result, null, 2));

      if (result.success && result.data) {
        // 🎯 处理双层嵌套：apiClient包装了一层，服务端也返回了标准格式
        const actualData = result.data.data || result.data;
        
        console.log('[QuickCreate] 🎉 Series creation started:', actualData);
        
        // 🚀 构建返回的series对象，确保status正确设置为'generating'
        const returnSeries: Series = {
          ...actualData,
          status: 'generating', // ✅ 确保状态为generating，这样SeriesCreationPanel会留在列表页
          id: result.seriesId || actualData.id,
        };
        
        // 🚀 立即返回，不等待AI生成完成
        // 用户会在列表页看到"AI创作中"的状态
        alert('✨ AI创作已开始！\n\n创作需要30-60秒，请在列表中查看进度。\n完成后会自动更新。');
        
        onComplete(returnSeries);
        setIsCreating(false);
        
      } else {
        alert('创作失败：' + result.error);
        setIsCreating(false);
      }
    } catch (error: any) {
      alert('创作失败：' + error.message);
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 p-6">
      <div className="max-w-4xl mx-auto">
        {/* 头部 */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={onCancel}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            disabled={isCreating}
          >
            <ArrowLeft className="w-6 h-6 text-white" />
          </button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-white mb-2">
              ✨ AI智能创作
            </h1>
            <p className="text-gray-400">
              简单描述你的想法，AI为你生成完整的成长故事
            </p>
          </div>
        </div>

        {/* 进度指示器 */}
        <div className="flex justify-center gap-2 mb-12">
          {[1, 2, 3].map((num) => (
            <div
              key={num}
              className={`h-1 rounded-full transition-all ${
                num === step
                  ? 'w-12 bg-gradient-to-r from-purple-500 to-pink-500'
                  : num < step
                  ? 'w-8 bg-green-500'
                  : 'w-8 bg-white/20'
              }`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* 第1步：输入创意 */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg rounded-3xl p-8 border border-white/10">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-white mb-2">
                    💡 说说你的想法
                  </h2>
                  <p className="text-gray-400">
                    可以是一个简单的想法、一句话、甚至几个关键词
                  </p>
                </div>

                <div className="space-y-4">
                  <Label className="text-white text-lg">你的创作灵感</Label>
                  <textarea
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    placeholder="例如：
• 讲一个关于勇气的故事
• 一个年轻人在大城市追梦
• 职场新人如何成长
• 学会与家人沟通
• 克服恐惧，突破自我

✨ AI会根据你的想法，自动生成完整的故事大纲、角色和剧集！"
                    className="w-full h-64 bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none"
                  />

                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                    <p className="text-sm text-blue-300">
                      💡 <strong>提示</strong>：不用担心想法不够完整！AI会帮你完善故事，
                      确保内容积极向上、富有成长价值。
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => setStep(2)}
                  disabled={userInput.trim().length < 5}
                  className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50"
                >
                  下一步：选择题
                </Button>
              </div>
            </motion.div>
          )}

          {/* 第2步：选择成长主题 */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg rounded-3xl p-8 border border-white/10">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-white mb-2">
                    🎯 选择成长主题
                  </h2>
                  <p className="text-gray-400">
                    选择1-3个主题，AI会自然融入故事中（可选）
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                  {GROWTH_THEMES.map((theme) => {
                    const Icon = theme.icon;
                    const isSelected = selectedThemes.includes(theme.key);

                    return (
                      <motion.button
                        key={theme.key}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleThemeToggle(theme.key)}
                        disabled={!isSelected && selectedThemes.length >= 3}
                        className={`p-6 rounded-2xl border-2 transition-all text-left ${
                          isSelected
                            ? `bg-gradient-to-r ${theme.color} border-white/30`
                            : 'bg-white/5 border-white/10 hover:border-white/20'
                        } ${
                          !isSelected && selectedThemes.length >= 3
                            ? 'opacity-50 cursor-not-allowed'
                            : ''
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <div
                            className={`p-3 rounded-xl ${
                              isSelected ? 'bg-white/20' : 'bg-white/10'
                            }`}
                          >
                            <Icon className="w-6 h-6 text-white" />
                          </div>
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold text-white mb-1">
                              {theme.name}
                            </h3>
                            <p className="text-sm text-gray-300">
                              {theme.description}
                            </p>
                          </div>
                          {isSelected && (
                            <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center">
                              <span className="text-purple-600 text-sm">✓</span>
                            </div>
                          )}
                        </div>
                      </motion.button>
                    );
                  })}
                </div>

                <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4">
                  <p className="text-sm text-purple-300">
                    ✨ <strong>智能推荐</strong>：如果不选择主题，AI会根据你的想法自动选择最合适的成长主题
                  </p>
                </div>
              </div>

              <div className="flex justify-between">
                <Button
                  onClick={() => setStep(1)}
                  variant="ghost"
                  className="text-white"
                >
                  上一步
                </Button>
                <Button
                  onClick={() => setStep(3)}
                  className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                >
                  下一步：设置参数
                </Button>
              </div>
            </motion.div>
          )}

          {/* 第3步：设置参数 */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg rounded-3xl p-8 border border-white/10">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-white mb-2">
                    ⚙️ 创作参数
                  </h2>
                  <p className="text-gray-400">
                    最后一步，设置你的漫剧参数
                  </p>
                </div>

                <div className="space-y-8">
                  {/* 目标受众 */}
                  <div>
                    <Label className="text-white text-lg mb-4 block">目标观众</Label>
                    <div className="grid grid-cols-3 gap-4">
                      {AUDIENCE_OPTIONS.map((option) => (
                        <button
                          key={option.code}
                          onClick={() => setTargetAudience(option.code as any)}
                          className={`p-4 rounded-xl border-2 transition-all ${
                            targetAudience === option.code
                              ? 'bg-gradient-to-r from-purple-500 to-pink-500 border-white/30'
                              : 'bg-white/5 border-white/10 hover:border-white/20'
                          }`}
                        >
                          <div className="text-white font-semibold mb-1">
                            {option.label}
                          </div>
                          <div className="text-sm text-gray-300">
                            {option.desc}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 剧集数量 */}
                  <div>
                    <Label className="text-white text-lg mb-4 block">
                      剧集数量：{totalEpisodes} 集
                    </Label>
                    <input
                      type="range"
                      min="3"
                      max="12"
                      value={totalEpisodes}
                      onChange={(e) => setTotalEpisodes(parseInt(e.target.value))}
                      className="w-full accent-purple-500"
                    />
                    <div className="flex justify-between text-sm text-gray-400 mt-2">
                      <span>3集（精简）</span>
                      <span>12集（完整）</span>
                    </div>
                  </div>

                  {/* 剧本类型 */}
                  <div>
                    <Label className="text-white text-lg mb-4 block">剧本类型</Label>
                    <div className="grid grid-cols-3 gap-4">
                      {SCRIPT_GENRES.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => setScriptGenre(option.value)}
                          className={`p-4 rounded-xl border-2 transition-all ${
                            scriptGenre === option.value
                              ? 'bg-gradient-to-r from-purple-500 to-pink-500 border-white/30'
                              : 'bg-white/5 border-white/10 hover:border-white/20'
                          }`}
                        >
                          <div className="text-white font-semibold mb-1">
                            {option.label}
                          </div>
                          <div className="text-sm text-gray-300">
                            {option.desc}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 预览信息 */}
                  <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl p-6">
                    <h3 className="text-white font-semibold mb-4">📋 创作预览</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-400">创作灵感：</span>
                        <p className="text-white mt-1 line-clamp-2">{userInput}</p>
                      </div>
                      <div>
                        <span className="text-gray-400">成长主题：</span>
                        <p className="text-white mt-1">
                          {selectedThemes.length > 0
                            ? GROWTH_THEMES.filter(t => selectedThemes.includes(t.key))
                                .map(t => t.name)
                                .join('、')
                            : 'AI自动选择'}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-400">目标观众：</span>
                        <p className="text-white mt-1">
                          {targetAudience === 'youth' ? '青少年' : targetAudience === 'family' ? '全家' : '成年人'}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-400">剧集数量：</span>
                        <p className="text-white mt-1">{totalEpisodes} 集</p>
                      </div>
                      <div>
                        <span className="text-gray-400">剧本类型：</span>
                        <p className="text-white mt-1">{scriptGenre}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-between">
                <Button
                  onClick={() => setStep(2)}
                  variant="ghost"
                  className="text-white"
                  disabled={isCreating}
                >
                  上一步
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isCreating}
                  className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      AI创作中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      开始创作
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 创作中状态 - 移到AnimatePresence外部 */}
        {isCreating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          >
            <div className="bg-gradient-to-br from-gray-900 to-purple-900 rounded-3xl p-12 border border-white/10 max-w-md text-center">
              <div className="w-20 h-20 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
                <Sparkles className="w-10 h-10 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">
                AI正在创作...
              </h3>
              <div className="space-y-3 text-gray-300">
                <p>✨ 分析你的创作灵感</p>
                <p>🎭 提取角色和性格</p>
                <p>📖 生成完整剧本</p>
                <p>🎬 创建分镜脚本</p>
                <p>💎 植入成长价值</p>
              </div>
              <p className="text-sm text-gray-400 mt-6">
                预计需要30-60秒，请耐心等待...
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}