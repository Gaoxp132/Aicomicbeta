import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Smartphone, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { SocialLoginButtons } from './SocialLoginButtons';
import * as communityAPI from '../services/community';

interface LoginDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (phoneNumber: string) => void;
}

export function LoginDialog({ isOpen, onClose, onLoginSuccess }: LoginDialogProps) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    // 验证手机号格式
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(phoneNumber)) {
      console.error('Invalid phone number format');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(
        'https://cjjbxfzwjhnuwkqsntop.supabase.co/functions/v1/make-server-fc31472c/user/login',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqamJ4Znp3amhudXdrcXNudG9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzU3MjMzMjYsImV4cCI6MjA1MTI5OTMyNn0.I6sOTXo_NLBCWWSu_Jy4rbvj7rz-7K-o7I7RWmQXg_I`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ phoneNumber }),
        }
      );

      const result = await response.json();
      
      localStorage.setItem('userPhone', phoneNumber);
      localStorage.setItem('loginTime', new Date().toISOString());
      
      onLoginSuccess(phoneNumber);
      onClose();
      setPhoneNumber('');
    } catch (error) {
      console.error('登录失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 11);
    setPhoneNumber(value);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* 登录对话框 */}
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-gradient-to-br from-gray-900 to-black border border-white/10 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl"
            >
              {/* 关闭按钮 */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>

              {/* 图标 */}
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                  <Smartphone className="w-8 h-8 text-white" />
                </div>
              </div>

              {/* 标题 */}
              <h2 className="text-2xl font-bold text-white text-center mb-2">
                欢迎来到AI漫剧创作
              </h2>
              <p className="text-gray-400 text-center mb-8 text-sm">
                输入手机号即可登录，开启你的创作之旅
              </p>

              {/* 手机号输入 */}
              <div className="mb-6">
                <label className="block text-sm text-gray-400 mb-2">手机号码</label>
                <div className="relative">
                  <Input
                    type="tel"
                    placeholder="请输入11位手机号"
                    value={phoneNumber}
                    onChange={handlePhoneChange}
                    maxLength={11}
                    className="w-full bg-white/5 border-white/10 text-white placeholder:text-gray-500 h-12 text-base"
                    disabled={isLoading}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isLoading) {
                        handleLogin();
                      }
                    }}
                  />
                  {phoneNumber.length === 11 && (
                    <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-400" />
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  * 首次登录将自动创建账号
                </p>
              </div>

              {/* 登录按钮 */}
              <Button
                onClick={handleLogin}
                disabled={phoneNumber.length !== 11 || isLoading}
                className="w-full h-12 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium text-base disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    登录中...
                  </>
                ) : (
                  '立即登录'
                )}
              </Button>

              {/* 社交登录按钮 */}
              <SocialLoginButtons />

              {/* 隐私提示 */}
              <p className="text-xs text-gray-500 text-center mt-6">
                登录即表示同意我们的服务条款和隐私政策
              </p>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}