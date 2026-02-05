import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, User, LogOut, Shield, Bell, Palette, Globe, Smartphone, AlertCircle, Database } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Input } from './ui/input';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  userPhone?: string;
  onLogout: () => void;
}

export function SettingsDialog({ isOpen, onClose, userPhone, onLogout }: SettingsDialogProps) {
  const [showPhoneCorrection, setShowPhoneCorrection] = useState(false);
  const [showDataDiagnostics, setShowDataDiagnostics] = useState(false);
  const [newPhone, setNewPhone] = useState('');

  const handleLogout = () => {
    onLogout();
    onClose();
  };

  const handlePhoneCorrection = () => {
    // 验证手机号格式
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(newPhone)) {
      toast.error('请输入正确的11位手机号');
      return;
    }

    // 确认更换
    if (confirm(`确认要切换到手机号 ${newPhone} 吗？\n\n注意：这将显示该手机号下的所有作品。`)) {
      localStorage.setItem('userPhone', newPhone);
      toast.success('手机号已更新！页面将刷新以加载新数据。');
      window.location.reload();
    }
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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* 对话框 */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl shadow-2xl w-full max-w-md border border-gray-700 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 头部 */}
              <div className="flex items-center justify-between p-6 border-b border-gray-700">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  <Shield className="w-6 h-6 text-purple-400" />
                  设置中心
                </h2>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-700 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 内容 */}
              <div className="p-6 space-y-6">
                {/* 用户信息 */}
                <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-xl p-4 border border-purple-500/20">
                  <div className="flex items-center gap-3 mb-3">
                    <User className="w-5 h-5 text-purple-400" />
                    <h3 className="text-lg font-semibold text-white">用户信息</h3>
                  </div>
                  {userPhone ? (
                    <div className="space-y-2">
                      <p className="text-sm text-gray-300">
                        <span className="text-gray-400">手机号：</span>
                        <span className="font-mono">{userPhone}</span>
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowPhoneCorrection(!showPhoneCorrection)}
                        className="mt-2"
                      >
                        <Smartphone className="w-4 h-4 mr-2" />
                        切换手机号
                      </Button>
                      {showPhoneCorrection && (
                        <div className="mt-3 space-y-2">
                          <Input
                            type="tel"
                            placeholder="请输入新的手机号"
                            value={newPhone}
                            onChange={(e) => setNewPhone(e.target.value)}
                            maxLength={11}
                            className="bg-gray-800 border-gray-600 text-white"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={handlePhoneCorrection}
                              disabled={!newPhone}
                            >
                              确认切换
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setShowPhoneCorrection(false);
                                setNewPhone('');
                              }}
                            >
                              取消
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">未登录</p>
                  )}
                </div>

                {/* 其他设置选项 */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-xl hover:bg-gray-800 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                      <Bell className="w-5 h-5 text-blue-400" />
                      <span className="text-white">通知设置</span>
                    </div>
                    <span className="text-sm text-gray-400">敬请期待</span>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-xl hover:bg-gray-800 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                      <Palette className="w-5 h-5 text-green-400" />
                      <span className="text-white">主题设置</span>
                    </div>
                    <span className="text-sm text-gray-400">敬请期待</span>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-xl hover:bg-gray-800 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                      <Globe className="w-5 h-5 text-yellow-400" />
                      <span className="text-white">语言设置</span>
                    </div>
                    <span className="text-sm text-gray-400">简体中文</span>
                  </div>

                  {userPhone && (
                    <div
                      onClick={() => setShowDataDiagnostics(!showDataDiagnostics)}
                      className="flex items-center justify-between p-4 bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/20 rounded-xl hover:bg-red-500/20 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <Database className="w-5 h-5 text-red-400" />
                        <span className="text-white font-medium">数据诊断</span>
                      </div>
                      <span className="text-sm text-red-400">
                        {showDataDiagnostics ? '关闭' : '点击查看'}
                      </span>
                    </div>
                  )}
                </div>

                {/* 退出登录 */}
                {userPhone && (
                  <Button
                    variant="outline"
                    onClick={handleLogout}
                    className="w-full border-red-500/50 text-red-400 hover:bg-red-500/10"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    退出登录
                  </Button>
                )}

                {/* 版本信息 */}
                <div className="pt-4 border-t border-gray-700">
                  <p className="text-center text-xs text-gray-500">
                    AI漫剧创作 v3.24.9
                  </p>
                  <p className="text-center text-xs text-gray-600 mt-1">
                    © 2026 All rights reserved
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}