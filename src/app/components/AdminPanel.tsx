/**
 * AdminPanel - User management panel for admin (18565821136)
 * v6.0.102: defaultTab prop + 付款通知权限 UI（设置 tab）
 * v6.0.100: 管理员账号显示修复
 */
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  Users, CreditCard, RefreshCw, Save, X, ChevronDown, ChevronUp,
  ArrowLeft, AlertCircle, CheckCircle2, Search, Settings, QrCode, Bell, BellOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPost } from '../utils';

interface UserRecord {
  id: string;
  phone: string;
  nickname: string;
  createdAt: string;
  updatedAt: string; // last login
  usedToday: number;
  freeLimit: number;  // -1 = 无限制（管理员）
  paidCredits: number;
  isAdmin?: boolean;  // v6.0.100: 管理员标记
  totalGenerated?: number;
}

interface PaymentRecord {
  id: string;
  phone: string;
  amount: number;
  credits: number;
  status: 'pending' | 'approved' | 'rejected';
  note: string;
  createdAt: string;
}

interface AdminPanelProps {
  adminPhone: string;
  onClose: () => void;
  /** v6.0.102: 打开时直接跳到指定 tab（如通知点击时跳付款记录） */
  defaultTab?: 'users' | 'payments' | 'settings';
  /** v6.0.102: 通知权限请求函数（由外部 useAdminPaymentPoller 提供） */
  onRequestNotifPermission?: () => Promise<string>;
  /** v6.0.102: 当前通知权限状态 */
  notifPermission?: string;
}

export function AdminPanel({ adminPhone, onClose, defaultTab, onRequestNotifPermission, notifPermission }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<'users' | 'payments' | 'settings'>(defaultTab || 'users');
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isLoadingPayments, setIsLoadingPayments] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ freeLimit: string; addCredits: string }>({ freeLimit: '5', addCredits: '0' });
  const [searchText, setSearchText] = useState('');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  // Settings tab
  const [qrUrl, setQrUrl] = useState('');
  const [qrInput, setQrInput] = useState('');
  const [isSavingQr, setIsSavingQr] = useState(false);
  const [isRequestingNotif, setIsRequestingNotif] = useState(false);

  const loadUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    try {
      const result = await apiGet(`/admin/users?adminPhone=${adminPhone}`);
      if (result.success && result.data) {
        setUsers((result.data as any).users || []);
      } else {
        toast.error(result.error || '加载用户列表失败');
      }
    } catch (err: any) {
      toast.error('网络错误：' + err.message);
    } finally {
      setIsLoadingUsers(false);
    }
  }, [adminPhone]);

  const loadPayments = useCallback(async () => {
    setIsLoadingPayments(true);
    try {
      const result = await apiGet(`/admin/payments?adminPhone=${adminPhone}`);
      if (result.success && result.data) {
        setPayments((result.data as any).payments || []);
      } else {
        toast.error(result.error || '加载付款记录失败');
      }
    } catch (err: any) {
      toast.error('网络错误：' + err.message);
    } finally {
      setIsLoadingPayments(false);
    }
  }, [adminPhone]);

  useEffect(() => {
    loadUsers();
    // Load WeChat QR URL
    apiGet('/admin/wechat-qr').then(r => {
      if (r.success) { const url = (r.data as any)?.url || ''; setQrUrl(url); setQrInput(url); }
    }).catch(() => {});
  }, [loadUsers]);

  useEffect(() => {
    if (activeTab === 'payments') {
      loadPayments();
    }
  }, [activeTab, loadPayments]);

  const handleStartEdit = (user: UserRecord) => {
    setEditingUser(user.phone);
    setEditValues({
      freeLimit: String(user.freeLimit),
      addCredits: '0',
    });
  };

  const handleSaveUser = async (user: UserRecord) => {
    const freeLimit = parseInt(editValues.freeLimit);
    const addCredits = parseInt(editValues.addCredits) || 0;
    if (isNaN(freeLimit) || freeLimit < 0) {
      toast.error('每日免费额度必须是非负整数');
      return;
    }

    try {
      const result = await apiPost('/admin/users/settings', {
        adminPhone,
        targetPhone: user.phone,
        freeLimit,
        addCredits,
      });
      if (result.success) {
        toast.success('保存成功');
        setEditingUser(null);
        // Update local state
        setUsers(prev => prev.map(u =>
          u.phone === user.phone
            ? { ...u, freeLimit, paidCredits: u.paidCredits + addCredits }
            : u
        ));
      } else {
        toast.error(result.error || '保存失败');
      }
    } catch (err: any) {
      toast.error('网络错误：' + err.message);
    }
  };

  const handleApprovePayment = async (payment: PaymentRecord) => {
    try {
      const result = await apiPost('/admin/payments/approve', {
        adminPhone,
        paymentId: payment.id,
        targetPhone: payment.phone,
        credits: payment.credits,
      });
      if (result.success) {
        toast.success(`已批准付款，为 ${payment.phone} 添加 ${payment.credits} 个配额`);
        setPayments(prev => prev.map(p =>
          p.id === payment.id ? { ...p, status: 'approved' } : p
        ));
      } else {
        toast.error(result.error || '操作失败');
      }
    } catch (err: any) {
      toast.error('网络错误：' + err.message);
    }
  };

  const handleRejectPayment = async (payment: PaymentRecord) => {
    try {
      const result = await apiPost('/admin/payments/reject', {
        adminPhone,
        paymentId: payment.id,
      });
      if (result.success) {
        toast.success('已拒绝该付款记录');
        setPayments(prev => prev.map(p =>
          p.id === payment.id ? { ...p, status: 'rejected' } : p
        ));
      } else {
        toast.error(result.error || '操作失败');
      }
    } catch (err: any) {
      toast.error('网络错误：' + err.message);
    }
  };

  const handleSaveQrUrl = async () => {
    if (!qrInput.startsWith('http')) { toast.error('请输入正确的图片URL（以http开头）'); return; }
    setIsSavingQr(true);
    try {
      const result = await apiPost('/admin/wechat-qr', { adminPhone, url: qrInput });
      if (result.success) { setQrUrl(qrInput); toast.success('微信收款码已更新'); }
      else toast.error(result.error || '保存失败');
    } catch (err: any) { toast.error('网络错误：' + err.message); }
    finally { setIsSavingQr(false); }
  };

  const filteredUsers = users.filter(u =>
    u.phone.includes(searchText) ||
    u.nickname.toLowerCase().includes(searchText.toLowerCase())
  );

  const formatDate = (d: string) => {
    if (!d) return '-';
    try {
      return new Date(d).toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return d; }
  };

  const pendingPayments = payments.filter(p => p.status === 'pending').length;

  // v6.0.102: 付款通知权限请求处理
  const handleRequestNotifPermission = async () => {
    if (!onRequestNotifPermission) return;
    setIsRequestingNotif(true);
    try {
      const result = await onRequestNotifPermission();
      if (result === 'granted') {
        toast.success('✅ 通知权限已开启！有新付款时将推送系统通知');
      } else if (result === 'denied') {
        toast.error('通知权限被拒绝。请在浏览器地址栏左侧的锁图标中手动开启');
      } else {
        toast.info('请在弹出的权限请求中选择「允许」');
      }
    } finally {
      setIsRequestingNotif(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/10 bg-black/30 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-white">管理员控制台</h1>
            <p className="text-xs text-gray-500">{adminPhone}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* v6.0.102: 付款通知权限提示条 — 仅在 permission 非 granted 时显示 */}
      {onRequestNotifPermission && notifPermission !== 'granted' && notifPermission !== 'unsupported' && (
        <div className="mx-4 sm:mx-6 mt-3 flex items-center gap-3 bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-2.5 flex-shrink-0">
          <Bell className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span className="text-xs text-amber-300 flex-1">
            {notifPermission === 'denied'
              ? '通知权限已被拒绝，请在浏览器设置中手动开启以接收付款推送'
              : '开启系统通知，在后台也能收到新付款提醒'}
          </span>
          {notifPermission !== 'denied' && (
            <button
              onClick={handleRequestNotifPermission}
              disabled={isRequestingNotif}
              className="text-xs px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 transition-colors flex-shrink-0 disabled:opacity-50"
            >
              {isRequestingNotif ? '请求中...' : '开启通知'}
            </button>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex px-4 sm:px-6 gap-1 pt-4 pb-2 flex-shrink-0">
        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            activeTab === 'users'
              ? 'bg-purple-500 text-white'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Users className="w-4 h-4" />
          注册用户
          <span className="bg-white/20 text-xs px-1.5 py-0.5 rounded-full">{users.length}</span>
        </button>
        <button
          onClick={() => { setActiveTab('payments'); loadPayments(); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            activeTab === 'payments'
              ? 'bg-purple-500 text-white'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          付款记录
          {pendingPayments > 0 && (
            <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{pendingPayments}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            activeTab === 'settings'
              ? 'bg-purple-500 text-white'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Settings className="w-4 h-4" />
          设置
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-4 sm:px-6 pb-6">
        {activeTab === 'settings' && (
          <div className="max-w-md mt-4">
            <h2 className="text-white font-semibold mb-4">微信收款码设置</h2>
            <div className="mb-4">
              {qrUrl ? (
                <div className="w-40 h-40 rounded-2xl overflow-hidden bg-white flex items-center justify-center mb-3">
                  <img src={qrUrl} alt="当前收款码" className="w-full h-full object-contain" />
                </div>
              ) : (
                <div className="w-40 h-40 rounded-2xl bg-white/5 border border-dashed border-white/20 flex flex-col items-center justify-center mb-3 gap-2">
                  <QrCode className="w-10 h-10 text-gray-500" />
                  <span className="text-xs text-gray-500">暂未设置</span>
                </div>
              )}
              <p className="text-xs text-gray-400 mb-3">上传您的微信收款码到图床（如 imgur、sm.ms），复制图片直链粘贴到下方。</p>
              <input
                type="url"
                value={qrInput}
                onChange={e => setQrInput(e.target.value)}
                placeholder="https://example.com/wechat-qr.jpg"
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-green-500/50 transition-colors text-sm mb-3"
              />
              <button
                onClick={handleSaveQrUrl}
                disabled={isSavingQr}
                className="w-full py-3 rounded-xl bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-semibold transition-colors"
              >
                {isSavingQr ? '保存中...' : '保存收款码'}
              </button>
            </div>

            {/* v6.0.102: 通知权限设置 */}
            <div className="mt-6 pt-6 border-t border-white/10">
              <h2 className="text-white font-semibold mb-1">付款到达通知</h2>
              <p className="text-xs text-gray-400 mb-4">
                用户提交付款记录后，向您的浏览器推送系统通知（即使 App 在后台也能收到）。
              </p>
              {notifPermission === 'unsupported' ? (
                <div className="flex items-center gap-2 text-xs text-gray-500 bg-white/3 rounded-xl p-3">
                  <BellOff className="w-4 h-4 flex-shrink-0" />
                  <span>当前浏览器不支持通知功能</span>
                </div>
              ) : notifPermission === 'granted' ? (
                <div className="flex items-center gap-2 text-xs text-green-400 bg-green-500/8 border border-green-500/20 rounded-xl p-3">
                  <Bell className="w-4 h-4 flex-shrink-0" />
                  <span>✅ 系统通知已开启 — 有新付款时将实时推送</span>
                </div>
              ) : notifPermission === 'denied' ? (
                <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/8 border border-red-500/20 rounded-xl p-3">
                  <BellOff className="w-4 h-4 flex-shrink-0" />
                  <span>通知权限已被拒绝。请点击浏览器地址栏左侧的锁/信息图标 → 通知 → 允许</span>
                </div>
              ) : (
                <button
                  onClick={handleRequestNotifPermission}
                  disabled={isRequestingNotif || !onRequestNotifPermission}
                  className="w-full py-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/20 text-amber-300 font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Bell className="w-4 h-4" />
                  {isRequestingNotif ? '请求通知权限中...' : '开启付款到达通知'}
                </button>
              )}
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div>
            {/* Search + Refresh */}
            <div className="flex gap-2 mb-4">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchText}
                  onChange={e => setSearchText(e.target.value)}
                  placeholder="搜索手机号或昵称..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 text-sm"
                />
              </div>
              <button
                onClick={loadUsers}
                disabled={isLoadingUsers}
                className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingUsers ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {isLoadingUsers ? (
              <div className="flex items-center justify-center py-16">
                <RefreshCw className="w-6 h-6 text-purple-400 animate-spin mr-3" />
                <span className="text-gray-400">加载用户列表...</span>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredUsers.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    {searchText ? '未找到匹配用户' : '暂无注册用户'}
                  </div>
                ) : (
                  filteredUsers.map(user => (
                    <div key={user.phone} className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
                      {/* User row */}
                      <div
                        className="flex items-center gap-3 p-4 cursor-pointer"
                        onClick={() => setExpandedUser(expandedUser === user.phone ? null : user.phone)}
                      >
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-sm font-bold">
                            {user.nickname?.[0] || user.phone.slice(-2)}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-medium text-sm">{user.nickname}</span>
                            <span className="text-gray-500 text-xs">{user.phone.slice(0, 3)}****{user.phone.slice(-4)}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            {(user as any).isAdmin ? (
                              <span className="text-xs text-amber-400 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                                管理员 · 无限配额
                              </span>
                            ) : (
                              <>
                                <span className="text-xs text-gray-500">今日: {user.usedToday}/{user.freeLimit}免费</span>
                                {user.paidCredits > 0 && (
                                  <span className="text-xs text-green-400">+{user.paidCredits}付费</span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                        {expandedUser === user.phone ? (
                          <ChevronUp className="w-4 h-4 text-gray-500 flex-shrink-0" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
                        )}
                      </div>

                      {/* Expanded details */}
                      {expandedUser === user.phone && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="border-t border-white/8 p-4 space-y-3"
                        >
                          {/* Info grid */}
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="bg-white/3 rounded-xl p-3">
                              <div className="text-gray-500 text-xs mb-1">注册时间</div>
                              <div className="text-white text-xs">{formatDate(user.createdAt)}</div>
                            </div>
                            <div className="bg-white/3 rounded-xl p-3">
                              <div className="text-gray-500 text-xs mb-1">最近登录</div>
                              <div className="text-white text-xs">{formatDate(user.updatedAt)}</div>
                            </div>
                          </div>

                          {editingUser === user.phone ? (
                            <div className="space-y-3">
                              {(user as any).isAdmin ? (
                                <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                                  <span className="text-amber-400 text-xs">⚡ 管理员账号无需配置配额，默认享有无限生成权限</span>
                                </div>
                              ) : (
                                <>
                                  <div>
                                    <label className="text-xs text-gray-400 mb-1 block">每日免费配额（个/天）</label>
                                    <input
                                      type="number"
                                      value={editValues.freeLimit}
                                      onChange={e => setEditValues(prev => ({ ...prev, freeLimit: e.target.value }))}
                                      min={0}
                                      className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-purple-500/50"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-gray-400 mb-1 block">
                                      添加付费配额（个，当前已有 {user.paidCredits} 个）
                                    </label>
                                    <input
                                      type="number"
                                      value={editValues.addCredits}
                                      onChange={e => setEditValues(prev => ({ ...prev, addCredits: e.target.value }))}
                                      min={0}
                                      className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-purple-500/50"
                                    />
                                  </div>
                                </>
                              )}
                              <div className="flex gap-2">
                                {!(user as any).isAdmin && (
                                  <button
                                    onClick={() => handleSaveUser(user)}
                                    className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium transition-colors"
                                  >
                                    <Save className="w-4 h-4" />
                                    保存
                                  </button>
                                )}
                                <button
                                  onClick={() => setEditingUser(null)}
                                  className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 text-sm transition-colors"
                                >
                                  取消
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleStartEdit(user)}
                              className="w-full py-2 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-400 hover:text-purple-300 text-sm font-medium transition-colors"
                            >
                              {(user as any).isAdmin ? '查看账号信息' : '编辑配额设置'}
                            </button>
                          )}
                        </motion.div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'payments' && (
          <div>
            <div className="flex justify-end mb-4">
              <button
                onClick={loadPayments}
                disabled={isLoadingPayments}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-colors text-sm"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingPayments ? 'animate-spin' : ''}`} />
                刷新
              </button>
            </div>

            {isLoadingPayments ? (
              <div className="flex items-center justify-center py-16">
                <RefreshCw className="w-6 h-6 text-purple-400 animate-spin mr-3" />
                <span className="text-gray-400">加载付款记录...</span>
              </div>
            ) : payments.length === 0 ? (
              <div className="text-center py-12 text-gray-500">暂无付款记录</div>
            ) : (
              <div className="space-y-3">
                {payments.map(payment => (
                  <div
                    key={payment.id}
                    className={`bg-white/3 border rounded-2xl p-4 ${
                      payment.status === 'pending'
                        ? 'border-orange-500/30'
                        : payment.status === 'approved'
                        ? 'border-green-500/20'
                        : 'border-red-500/20'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <span className="text-white font-medium text-sm">
                          {payment.phone.slice(0, 3)}****{payment.phone.slice(-4)}
                        </span>
                        <span className="text-gray-500 text-xs ml-2">{formatDate(payment.createdAt)}</span>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-lg font-medium ${
                        payment.status === 'pending'
                          ? 'bg-orange-500/20 text-orange-400'
                          : payment.status === 'approved'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {payment.status === 'pending' ? '待审核' : payment.status === 'approved' ? '已批准' : '已拒绝'}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm mb-2">
                      <span className="text-gray-400">金额: <span className="text-white font-medium">¥{payment.amount}</span></span>
                      <span className="text-gray-400">配额: <span className="text-white font-medium">{payment.credits} 个</span></span>
                    </div>
                    {payment.note && (
                      <p className="text-xs text-gray-500 mb-3">{payment.note}</p>
                    )}
                    {payment.status === 'pending' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApprovePayment(payment)}
                          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-400 hover:text-green-300 text-sm font-medium transition-colors"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          批准并添加配额
                        </button>
                        <button
                          onClick={() => handleRejectPayment(payment)}
                          className="flex-1 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-sm font-medium transition-colors"
                        >
                          拒绝
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}