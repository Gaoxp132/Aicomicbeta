import { useState } from 'react';
import { motion } from 'motion/react';
import { Plus, Edit, Trash2, User, Sparkles, Loader2 } from 'lucide-react';
import { Button, Label } from '../ui';
import { toast } from 'sonner';
import { apiPost, apiDelete, apiRequest, isPromoType } from '../../utils';
import type { Character } from '../../types';
import { ConfirmDialog, useConfirm } from './ConfirmDialog';

interface CharacterManagerProps {
  characters: Character[];
  seriesId: string;
  userPhone?: string;
  onUpdate: (characters: Character[]) => void;
  seriesStatus?: string; // 作品当前状态
  productionType?: string; // 作品类型（宣传片时适配文案）
}

const ROLE_TYPES = [
  { id: 'protagonist', name: '主角', color: 'from-purple-500 to-pink-500' },
  { id: 'supporting', name: '配角', color: 'from-blue-500 to-cyan-500' },
  { id: 'antagonist', name: '反派', color: 'from-red-500 to-orange-500' },
  { id: 'extra', name: '群演', color: 'from-gray-500 to-gray-600' },
];

export function CharacterManager({ characters, seriesId, userPhone, onUpdate, seriesStatus, productionType }: CharacterManagerProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAIGenerating, setIsAIGenerating] = useState(false);
  const { confirm: confirmAction, dialogProps } = useConfirm();
  const [formData, setFormData] = useState<Partial<Character>>({
    name: '',
    description: '',
    appearance: '',
    personality: '',
    role: 'protagonist',
  });

  // ✅ 确保characters数组始终存在
  const safeCharacters = characters || [];

  const handleAdd = async () => {
    if (!formData.name) return;

    const result = await apiPost(`/series/${seriesId}/characters`, {
      name: formData.name,
      role: formData.role || 'protagonist',
      description: formData.description || '',
      appearance: formData.appearance || '',
      personality: formData.personality || '',
    });

    if (result.success && result.data) {
      onUpdate([...safeCharacters, result.data]);
      toast.success(`角色"${formData.name}"创建成功`);
    } else {
      // 回退到本地创建
      const newCharacter: Character = {
        id: `char-${Date.now()}`,
        name: formData.name!,
        description: formData.description || '',
        appearance: formData.appearance || '',
        personality: formData.personality || '',
        role: (formData.role as Character['role']) || 'protagonist',
      };
      onUpdate([...safeCharacters, newCharacter]);
      console.warn('[CharacterManager] API failed, used local fallback:', result.error);
    }

    setFormData({
      name: '',
      description: '',
      appearance: '',
      personality: '',
      role: 'protagonist',
    });
    setIsAdding(false);
  };

  const handleEdit = (character: Character) => {
    setEditingId(character.id);
    setFormData(character);
  };

  const handleUpdate = async () => {
    if (!editingId || !formData.name) return;

    const result = await apiRequest(`/series/${seriesId}/characters/${editingId}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: formData.name,
        role: formData.role,
        description: formData.description,
        appearance: formData.appearance,
        personality: formData.personality,
      }),
    });

    if (result.success && result.data) {
      const updated = safeCharacters.map(char =>
        char.id === editingId ? result.data : char
      );
      onUpdate(updated);
      toast.success(`角色"${formData.name}"已更新`);
    } else {
      // 回退到本地更新
      const updated = safeCharacters.map(char =>
        char.id === editingId ? { ...char, ...formData } as Character : char
      );
      onUpdate(updated);
    }

    setEditingId(null);
    setFormData({
      name: '',
      description: '',
      appearance: '',
      personality: '',
      role: 'protagonist',
    });
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirmAction({
      title: '删除角色',
      description: '确定要删除这个角色吗？',
      confirmText: '确认删除',
      cancelText: '取消',
      variant: 'danger',
      icon: 'delete',
    });
    if (!confirmed) return;

    const result = await apiDelete(`/series/${seriesId}/characters/${id}`);
    if (!result.success) {
      console.warn('[CharacterManager] Delete API error:', result.error);
    }

    // 无论API是否成功，都从本地列表移除
    onUpdate(safeCharacters.filter(char => char.id !== id));
    toast.success('角色已删除');
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setFormData({
      name: '',
      description: '',
      appearance: '',
      personality: '',
      role: 'protagonist',
    });
  };

  // ✅ v5.5.0: AI 一键生成角色
  const handleAIGenerate = async () => {
    if (isAIGenerating) return;
    setIsAIGenerating(true);
    toast.info('AI正在生成角色，请稍候...');

    const result = await apiPost(`/series/${seriesId}/ai-generate-characters`);

    if (result.success && result.data) {
      onUpdate(result.data);
      const count = Array.isArray(result.data) ? result.data.length : 0;
      toast.success(`AI成功生成了 ${count} 个角色！`);
    } else {
      toast.error('AI生成失败：' + (result.error || '未知错误'));
    }

    setIsAIGenerating(false);
  };

  const isPromo = isPromoType(productionType);
  const characterLabel = isPromo ? '出镜元素' : '角色';
  const aiButtonLabel = isPromo ? 'AI生成出镜元素' : 'AI生成角色';

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white mb-1">{isPromo ? '出镜元素管理' : '角色管理'}</h2>
          <p className="text-sm text-gray-400">{isPromo ? '管理宣传片中的出镜人物和元素' : '管理剧集中的所有角色'}</p>
        </div>
        {!isAdding && !editingId && (
          <div className="flex gap-2">
            <Button
              onClick={handleAIGenerate}
              disabled={isAIGenerating}
              className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
            >
              {isAIGenerating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              {isAIGenerating ? 'AI生成中...' : aiButtonLabel}
            </Button>
            <Button
              onClick={() => setIsAdding(true)}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              <Plus className="w-4 h-4 mr-2" />
              手动添加
            </Button>
          </div>
        )}
      </div>

      {/* 添加/编辑表单 */}
      {(isAdding || editingId) && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10"
        >
          <h3 className="text-lg font-semibold text-white mb-4">
            {editingId ? '编辑角色' : '新建角色'}
          </h3>
          
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 角色名称 */}
              <div>
                <Label className="text-white mb-2 block">角色名称 *</Label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例如：李明"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* 角色类型 */}
              <div>
                <Label className="text-white mb-2 block">角色类型</Label>
                <div className="grid grid-cols-4 gap-2">
                  {ROLE_TYPES.map((type) => (
                    <button
                      key={type.id}
                      onClick={() => setFormData({ ...formData, role: type.id as Character['role'] })}
                      className={`p-2 rounded-lg text-xs font-medium transition-all ${
                        formData.role === type.id
                          ? `bg-gradient-to-r ${type.color} text-white`
                          : 'bg-white/5 text-gray-400 hover:bg-white/10'
                      }`}
                    >
                      {type.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 角色描述 */}
            <div>
              <Label className="text-white mb-2 block">角色描述</Label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="简单描述角色的背景和特点"
                rows={2}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              />
            </div>

            {/* 外貌描述 */}
            <div>
              <Label className="text-white mb-2 block">外貌描述（用于AI生成）</Label>
              <textarea
                value={formData.appearance}
                onChange={(e) => setFormData({ ...formData, appearance: e.target.value })}
                placeholder="例如：25岁左右的年轻男性，黑色短发，戴眼镜，穿白色衬衫"
                rows={2}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              />
            </div>

            {/* 性格特征 */}
            <div>
              <Label className="text-white mb-2 block">性格特征</Label>
              <input
                type="text"
                value={formData.personality}
                onChange={(e) => setFormData({ ...formData, personality: e.target.value })}
                placeholder="例如：内向、温暖、善良"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <Button onClick={handleCancel} variant="ghost">
              取消
            </Button>
            <Button
              onClick={editingId ? handleUpdate : handleAdd}
              disabled={!formData.name}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50"
            >
              {editingId ? '更新' : '添加'}
            </Button>
          </div>
        </motion.div>
      )}

      {/* 角色列表 */}
      {safeCharacters.length === 0 ? (
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-12 border border-white/10 text-center">
          {seriesStatus === 'generating' ? (
            <>
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">AI正在创建{characterLabel}</h3>
              <p className="text-gray-400">{characterLabel}信息将在AI创作完成后自动显示，请稍候...</p>
            </>
          ) : (
            <>
              <User className="w-16 h-16 text-gray-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">还没有{characterLabel}</h3>
              <p className="text-gray-400 mb-6">
                {isPromo
                  ? `宣传片的出镜元素为可选项，AI会根据内容自动判断。点击"${aiButtonLabel}"让AI决定，或手动添加。`
                  : `点击"${aiButtonLabel}"快速创建，或手动添加`}
              </p>
              {!isAdding && (
                <div className="flex gap-3 justify-center">
                  <Button
                    onClick={handleAIGenerate}
                    disabled={isAIGenerating}
                    className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
                  >
                    {isAIGenerating ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4 mr-2" />
                    )}
                    {isAIGenerating ? 'AI生成中...' : aiButtonLabel}
                  </Button>
                  <Button
                    onClick={() => setIsAdding(true)}
                    variant="outline"
                    className="border-white/20 text-white hover:bg-white/10"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    手动添加
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {safeCharacters.map((character) => {
            const roleType = ROLE_TYPES.find(t => t.id === character.role);
            
            return (
              <motion.div
                key={character.id}
                whileHover={{ y: -4 }}
                className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10 group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-white mb-1">{character.name}</h3>
                    {roleType && (
                      <span className={`inline-block px-2 py-1 rounded-lg text-xs font-medium bg-gradient-to-r ${roleType.color} text-white`}>
                        {roleType.name}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleEdit(character)}
                      className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                    >
                      <Edit className="w-4 h-4 text-white" />
                    </button>
                    <button
                      onClick={() => handleDelete(character.id)}
                      className="p-2 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </div>

                {character.description && (
                  <p className="text-sm text-gray-400 mb-3 line-clamp-2">
                    {character.description}
                  </p>
                )}

                {character.appearance && (
                  <div className="mb-2">
                    <div className="text-xs text-gray-500 mb-1">外貌：</div>
                    <div className="text-sm text-gray-300 line-clamp-2">{character.appearance}</div>
                  </div>
                )}

                {character.personality && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1">性格：</div>
                    <div className="text-sm text-gray-300">{character.personality}</div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* AI提示 */}
      {safeCharacters.length > 0 && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-blue-300 font-medium mb-1">
                AI智能提示
              </p>
              <p className="text-xs text-blue-300/80">
                外貌描述越详细，AI生成的角色形象越准确。建议包含年龄、发型、服装、配饰等具体特征。
              </p>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}