// Profile子组件 - 用户头像和昵称编辑
import { useState } from 'react';
import { motion } from 'motion/react';
import { User, Edit2, Check, X, Loader2, LogOut } from 'lucide-react';
import { Button } from '../ui/button';
import * as communityAPI from '../../services/community';

interface ProfileHeaderProps {
  userPhone: string;
  userNickname: string;
  onNicknameChange: (newNickname: string) => void;
  onLogout: () => void;
}

export function ProfileHeader({ userPhone, userNickname, onNicknameChange, onLogout }: ProfileHeaderProps) {
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [editNicknameValue, setEditNicknameValue] = useState('');
  const [isSavingNickname, setIsSavingNickname] = useState(false);

  const handleStartEdit = () => {
    setEditNicknameValue(userNickname);
    setIsEditingNickname(true);
  };

  const handleSaveNickname = async () => {
    if (!editNicknameValue.trim()) {
      return;
    }

    setIsSavingNickname(true);
    try {
      const result = await communityAPI.updateUserProfile(userPhone, {
        nickname: editNicknameValue.trim(),
      });

      if (result.success) {
        onNicknameChange(editNicknameValue.trim());
        setIsEditingNickname(false);
      }
    } catch (error) {
      console.error('[ProfileHeader] Failed to update nickname:', error);
    } finally {
      setIsSavingNickname(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingNickname(false);
    setEditNicknameValue('');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-2xl p-8 backdrop-blur-sm border border-white/10"
    >
      <div className="flex items-center gap-6">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200 }}
          className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg"
        >
          <User className="w-12 h-12 text-white" />
        </motion.div>

        <div className="flex-1">
          {isEditingNickname ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editNicknameValue}
                onChange={(e) => setEditNicknameValue(e.target.value)}
                className="px-3 py-2 bg-black/20 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-purple-500 flex-1"
                placeholder="输入昵称"
                maxLength={20}
                autoFocus
                disabled={isSavingNickname}
              />
              <Button
                onClick={handleSaveNickname}
                disabled={isSavingNickname || !editNicknameValue.trim()}
                size="sm"
                className="bg-purple-500 hover:bg-purple-600"
              >
                {isSavingNickname ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              </Button>
              <Button
                onClick={handleCancelEdit}
                disabled={isSavingNickname}
                size="sm"
                variant="ghost"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-bold text-white">{userNickname}</h2>
              <Button
                onClick={handleStartEdit}
                size="sm"
                variant="ghost"
                className="text-white/60 hover:text-white"
              >
                <Edit2 className="w-4 h-4" />
              </Button>
            </div>
          )}
          <p className="text-white/60 mt-1">手机号: {userPhone}</p>
        </div>

        <Button
          onClick={onLogout}
          variant="ghost"
          className="text-white/60 hover:text-white hover:bg-white/10"
        >
          <LogOut className="w-5 h-5 mr-2" />
          退出登录
        </Button>
      </div>
    </motion.div>
  );
}
