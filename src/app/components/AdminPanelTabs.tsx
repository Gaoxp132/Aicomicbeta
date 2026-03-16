/**
 * AdminPanelTabs.tsx — Tab content components for AdminPanel
 * Extracted to keep AdminPanel.tsx under 500 lines.
 */
import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  RefreshCw, Save, ChevronDown, ChevronUp,
  AlertCircle, CheckCircle2, Search, QrCode, Bell, BellOff,
  Shield, ShieldCheck, UserPlus, Trash2, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiPost, apiGet } from '../utils';
import { ConfirmDialog, useConfirm } from './series/ConfirmDialog';
import { getErrorMessage } from '../utils';

// ── Types ────────────────────────────────────────────────────────────

export interface UserRecord {
  id: string;
  phone: string;
  nickname: string;
  createdAt: string;
  updatedAt: string;
  usedToday: number;
  freeLimit: number;
  paidCredits: number;
  isAdmin?: boolean;
  totalGenerated?: number;
}

export interface PaymentRecord {
  id: string;
  phone: string;
  amount: number;
  credits: number;
  status: 'pending' | 'approved' | 'rejected';
  note: string;
  createdAt: string;
}

// ── Helpers ─────────────────────────────────────────────────────────

function formatDate(d: string) {
  if (!d) return '-';
  try {
    return new Date(d).toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return d; }
}

// ═════════════════════════════════════════════════════════════════════
// Settings Tab
// ═════════════════════════════════════════════════════════════════════

interface SettingsTabProps {
  adminPhone: string;
  qrUrl: string;
  qrInput: string;
  setQrInput: (v: string) => void;
  setQrUrl: (v: string) => void;
  notifPermission?: string;
  onRequestNotifPermission?: () => Promise<string>;
  /** v6.0.176: 是否为超级管理员（可管理管理员列表） */
  isSuperAdmin?: boolean;
}

export function SettingsTab({ adminPhone, qrUrl, qrInput, setQrInput, setQrUrl, notifPermission, onRequestNotifPermission, isSuperAdmin }: SettingsTabProps) {
  const [isSavingQr, setIsSavingQr] = useState(false);
  const [isRequestingNotif, setIsRequestingNotif] = useState(false);

  // ── Admin management state ���─
  const [admins, setAdmins] = useState<{ phone: string; source: string; isSuperAdmin: boolean }[]>([]);
  const [isLoadingAdmins, setIsLoadingAdmins] = useState(false);
  const [newAdminPhone, setNewAdminPhone] = useState('');
  const [isAddingAdmin, setIsAddingAdmin] = useState(false);
  const [removingPhone, setRemovingPhone] = useState<string | null>(null);

  // v6.0.178: 二次确认弹窗
  const { confirm, dialogProps } = useConfirm();

  const loadAdmins = React.useCallback(async () => {
    if (!isSuperAdmin) return;
    setIsLoadingAdmins(true);
    try {
      const result = await apiGet(`/admin/admins?adminPhone=${encodeURIComponent(adminPhone)}`);
      if (result.success && result.data) {
        setAdmins(result.data?.admins || []);
      } else {
        toast.error(result.error || '加载管理员列表失败');
      }
    } catch (err: unknown) {
      console.error('[SettingsTab] Load admins error:', err);
      toast.error('网络错误：' + getErrorMessage(err));
    } finally {
      setIsLoadingAdmins(false);
    }
  }, [isSuperAdmin, adminPhone]);

  React.useEffect(() => {
    if (isSuperAdmin) loadAdmins();
  }, [isSuperAdmin, loadAdmins]);

  const handleAddAdmin = async () => {
    const phone = newAdminPhone.trim();
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      toast.error('请输入正确的手机号格式（11位）');
      return;
    }
    if (admins.some(a => a.phone === phone)) {
      toast.error('该手机号已是管理员');
      return;
    }
    // 二次确认
    const confirmed = await confirm({
      title: '确认添加管理员',
      description: `确定要将 ${phone.slice(0, 3)}****${phone.slice(-4)} 添加为管理员吗？该用户将获得管理面板访问权限和无限生成配额。`,
      confirmText: '确认添加',
      cancelText: '取消',
      variant: 'warning',
      icon: 'question',
    });
    if (!confirmed) return;

    setIsAddingAdmin(true);
    try {
      const result = await apiPost('/admin/admins/add', { adminPhone, targetPhone: phone });
      if (result.success) {
        toast.success(`已添加管理员：${phone}`);
        setNewAdminPhone('');
        await loadAdmins();
      } else {
        toast.error(result.error || '添加失败');
      }
    } catch (err: unknown) {
      toast.error('网络错误：' + getErrorMessage(err));
    } finally {
      setIsAddingAdmin(false);
    }
  };

  const handleRemoveAdmin = async (targetPhone: string) => {
    // 二次确认
    const confirmed = await confirm({
      title: '确认移除管理员',
      description: `确定要移除管理员 ${targetPhone.slice(0, 3)}****${targetPhone.slice(-4)} 吗？移除后该用户将失去管理面板访问权限。`,
      confirmText: '确认移除',
      cancelText: '取消',
      variant: 'danger',
      icon: 'delete',
    });
    if (!confirmed) return;

    setRemovingPhone(targetPhone);
    try {
      const result = await apiPost('/admin/admins/remove', { adminPhone, targetPhone });
      if (result.success) {
        toast.success(`已移除管理员：${targetPhone}`);
        await loadAdmins();
      } else {
        toast.error(result.error || '移除失败');
      }
    } catch (err: unknown) {
      toast.error('网络错误：' + getErrorMessage(err));
    } finally {
      setRemovingPhone(null);
    }
  };

  const handleSaveQrUrl = async () => {
    if (!qrInput.startsWith('http')) { toast.error('请输入正确的图片URL（以http开头）'); return; }
    setIsSavingQr(true);
    try {
      const result = await apiPost('/admin/wechat-qr', { adminPhone, url: qrInput });
      if (result.success) { setQrUrl(qrInput); toast.success('微信收款码已更新'); }
      else toast.error(result.error || '保存失败');
    } catch (err: unknown) { toast.error('网络错误：' + getErrorMessage(err)); }
    finally { setIsSavingQr(false); }
  };

  const handleRequestNotifPermission = async () => {
    if (!onRequestNotifPermission) return;
    setIsRequestingNotif(true);
    try {
      const result = await onRequestNotifPermission();
      if (result === 'granted') toast.success('通知权限已开启！有新付款时将推送系统通知');
      else if (result === 'denied') toast.error('通知权限被拒绝。请在浏览器地址栏左侧的锁图标中手动开启');
      else toast.info('请在弹出的权限请求中选择「允许」');
    } finally { setIsRequestingNotif(false); }
  };

  return (
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
          type="url" value={qrInput} onChange={e => setQrInput(e.target.value)}
          placeholder="https://example.com/wechat-qr.jpg"
          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-green-500/50 transition-colors text-sm mb-3"
        />
        <button onClick={handleSaveQrUrl} disabled={isSavingQr}
          className="w-full py-3 rounded-xl bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-semibold transition-colors">
          {isSavingQr ? '保存中...' : '保存收款码'}
        </button>
      </div>

      <div className="mt-6 pt-6 border-t border-white/10">
        <h2 className="text-white font-semibold mb-1">付款到达通知</h2>
        <p className="text-xs text-gray-400 mb-4">
          用户提交付款记录后，向您的浏览器推送系统通知（即使 App 在后台也能收到）。
        </p>
        {notifPermission === 'unsupported' ? (
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-white/3 rounded-xl p-3">
            <BellOff className="w-4 h-4 flex-shrink-0" /><span>当前浏览器不支持通知功能</span>
          </div>
        ) : notifPermission === 'granted' ? (
          <div className="flex items-center gap-2 text-xs text-green-400 bg-green-500/8 border border-green-500/20 rounded-xl p-3">
            <Bell className="w-4 h-4 flex-shrink-0" /><span>系统通知已开启 — 有新付款时将实时推送</span>
          </div>
        ) : notifPermission === 'denied' ? (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/8 border border-red-500/20 rounded-xl p-3">
            <BellOff className="w-4 h-4 flex-shrink-0" /><span>通知权限已被拒绝。请点击浏览器地址栏左侧的锁/信息图标 → 通知 → 允许</span>
          </div>
        ) : (
          <button onClick={handleRequestNotifPermission} disabled={isRequestingNotif || !onRequestNotifPermission}
            className="w-full py-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/20 text-amber-300 font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            <Bell className="w-4 h-4" />
            {isRequestingNotif ? '请求通知权限中...' : '开启付款到达通知'}
          </button>
        )}
      </div>

      {/* ── Admin Management (Super Admin only) ── */}
      {isSuperAdmin && (
        <div className="mt-6 pt-6 border-t border-white/10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <h2 className="text-white font-semibold">管理员管理</h2>
            </div>
            <button
              onClick={loadAdmins}
              disabled={isLoadingAdmins}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              title="刷新列表"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAdmins ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <p className="text-xs text-gray-400 mb-4">
            超级管理员（环境变量配置）可添加/移除动态管理员。环境变量中的管理员不可通过此处移除。
          </p>

          {/* Add admin */}
          <div className="flex gap-2 mb-4">
            <input
              type="tel"
              value={newAdminPhone}
              onChange={e => setNewAdminPhone(e.target.value)}
              placeholder="输入手机号添加管理员"
              maxLength={11}
              className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50 transition-colors text-sm"
            />
            <button
              onClick={handleAddAdmin}
              disabled={isAddingAdmin || !newAdminPhone.trim()}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {isAddingAdmin ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              添加
            </button>
          </div>

          {/* Admin list */}
          {isLoadingAdmins ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-5 h-5 text-amber-400 animate-spin mr-2" />
              <span className="text-gray-400 text-sm">加载管理员列表...</span>
            </div>
          ) : admins.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">暂无管理员</div>
          ) : (
            <div className="space-y-2">
              {admins.map(admin => (
                <div
                  key={admin.phone}
                  className="flex items-center justify-between p-3 rounded-xl bg-white/3 border border-white/8"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      admin.isSuperAdmin
                        ? 'bg-gradient-to-br from-amber-500 to-orange-500'
                        : 'bg-gradient-to-br from-blue-500 to-purple-500'
                    }`}>
                      {admin.isSuperAdmin
                        ? <ShieldCheck className="w-4 h-4 text-white" />
                        : <Shield className="w-4 h-4 text-white" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-white text-sm font-medium">
                          {admin.phone.slice(0, 3)}****{admin.phone.slice(-4)}
                        </span>
                        {admin.isSuperAdmin && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">
                            超级管理员
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">
                        {admin.source === 'env' ? '环境变量配置' : '动态添加'}
                      </span>
                    </div>
                  </div>
                  {admin.source === 'dynamic' && (
                    <button
                      onClick={() => handleRemoveAdmin(admin.phone)}
                      disabled={removingPhone === admin.phone}
                      className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                      title="移除管理员"
                    >
                      {removingPhone === admin.phone
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Trash2 className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Users Tab
// ═════════════════════════════════════════════════════════════════════

interface UsersTabProps {
  users: UserRecord[];
  adminPhone: string;
  isLoadingUsers: boolean;
  onRefresh: () => void;
  onUsersChange: React.Dispatch<React.SetStateAction<UserRecord[]>>;
}

export function UsersTab({ users, adminPhone, isLoadingUsers, onRefresh, onUsersChange }: UsersTabProps) {
  const [searchText, setSearchText] = useState('');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ freeLimit: string; addCredits: string }>({ freeLimit: '5', addCredits: '0' });

  const filteredUsers = users.filter(u =>
    u.phone.includes(searchText) ||
    u.nickname.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleStartEdit = (user: UserRecord) => {
    setEditingUser(user.phone);
    setEditValues({ freeLimit: String(user.freeLimit), addCredits: '0' });
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
        adminPhone, targetPhone: user.phone, freeLimit, addCredits,
      });
      if (result.success) {
        toast.success('保存成功');
        setEditingUser(null);
        onUsersChange(prev => prev.map(u =>
          u.phone === user.phone ? { ...u, freeLimit, paidCredits: u.paidCredits + addCredits } : u
        ));
      } else {
        toast.error(result.error || '保存失败');
      }
    } catch (err: unknown) {
      toast.error('网络错误：' + getErrorMessage(err));
    }
  };

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <div className="flex-1 relative">
          <Search
            className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2"
          />
          <input
            type="text"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="搜索手机号或昵称..."
          />
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoadingUsers}
          className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <RefreshCw
            className={`w-4 h-4 ${isLoadingUsers ? 'animate-spin' : ''}`}
          />
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
                <div className="flex items-center gap-3 p-4 cursor-pointer"
                  onClick={() => setExpandedUser(expandedUser === user.phone ? null : user.phone)}>
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-sm font-bold">{user.nickname?.[0] || user.phone.slice(-2)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium text-sm">{user.nickname}</span>
                      <span className="text-gray-500 text-xs">{user.phone.slice(0, 3)}****{user.phone.slice(-4)}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {user.isAdmin ? (
                        <span className="text-xs text-amber-400 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />管理员 · 无限配额
                        </span>
                      ) : (
                        <>
                          <span className="text-xs text-gray-500">今日: {user.usedToday}/{user.freeLimit}免费</span>
                          {user.paidCredits > 0 && <span className="text-xs text-green-400">+{user.paidCredits}付费</span>}
                        </>
                      )}
                    </div>
                  </div>
                  {expandedUser === user.phone
                    ? <ChevronUp className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />}
                </div>

                {expandedUser === user.phone && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="border-t border-white/8 p-4 space-y-3">
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
                        {user.isAdmin ? (
                          <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                            <span className="text-amber-400 text-xs">管理员账号无需配置配额，默认享有无限生成权限</span>
                          </div>
                        ) : (
                          <>
                            <div>
                              <label className="text-xs text-gray-400 mb-1 block">每日免费配额（个/天）</label>
                              <input type="number" value={editValues.freeLimit}
                                onChange={e => setEditValues(prev => ({ ...prev, freeLimit: e.target.value }))} min={0}
                                className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-purple-500/50" />
                            </div>
                            <div>
                              <label className="text-xs text-gray-400 mb-1 block">
                                添加付费配额（个，当前已有 {user.paidCredits} 个）
                              </label>
                              <input type="number" value={editValues.addCredits}
                                onChange={e => setEditValues(prev => ({ ...prev, addCredits: e.target.value }))} min={0}
                                className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-purple-500/50" />
                            </div>
                          </>
                        )}
                        <div className="flex gap-2">
                          {!user.isAdmin && (
                            <button onClick={() => handleSaveUser(user)}
                              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium transition-colors">
                              <Save className="w-4 h-4" />保存
                            </button>
                          )}
                          <button onClick={() => setEditingUser(null)}
                            className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 text-sm transition-colors">
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => handleStartEdit(user)}
                        className="w-full py-2 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-400 hover:text-purple-300 text-sm font-medium transition-colors">
                        {user.isAdmin ? '查看账号信息' : '编辑配额设置'}
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
  );
}

// ═════════════════════════════════════════════════════════════════════
// Payments Tab
// ═════════════════════════════════════════════════════════════════════

interface PaymentsTabProps {
  payments: PaymentRecord[];
  adminPhone: string;
  isLoadingPayments: boolean;
  onRefresh: () => void;
  onPaymentsChange: React.Dispatch<React.SetStateAction<PaymentRecord[]>>;
}

export function PaymentsTab({ payments, adminPhone, isLoadingPayments, onRefresh, onPaymentsChange }: PaymentsTabProps) {
  // v6.0.178: 二次确认弹窗
  const { confirm, dialogProps } = useConfirm();

  const handleApprovePayment = async (payment: PaymentRecord) => {
    const confirmed = await confirm({
      title: '确认批准付款',
      description: `确定要批准该笔付款吗？将为用户 ${payment.phone.slice(0, 3)}****${payment.phone.slice(-4)} 添加 ${payment.credits} 个生成配额（金额 ¥${payment.amount}）。`,
      confirmText: '批准并添加配额',
      cancelText: '取消',
      variant: 'info',
      icon: 'question',
    });
    if (!confirmed) return;

    try {
      const result = await apiPost('/admin/payments/approve', {
        adminPhone, paymentId: payment.id, targetPhone: payment.phone, credits: payment.credits,
      });
      if (result.success) {
        toast.success(`已批准付款，为 ${payment.phone} 添加 ${payment.credits} 个配额`);
        onPaymentsChange(prev => prev.map(p => p.id === payment.id ? { ...p, status: 'approved' as const } : p));
      } else {
        toast.error(result.error || '操作失败');
      }
    } catch (err: unknown) { toast.error('操作失败：' + getErrorMessage(err)); }
  };

  const handleRejectPayment = async (payment: PaymentRecord) => {
    const confirmed = await confirm({
      title: '确认拒绝付款',
      description: `确定要拒绝用户 ${payment.phone.slice(0, 3)}****${payment.phone.slice(-4)} 的付款记录吗？金额 ¥${payment.amount}，配额 ${payment.credits} 个。拒绝后不会添加配额。`,
      confirmText: '认拒绝',
      cancelText: '取消',
      variant: 'danger',
      icon: 'warning',
    });
    if (!confirmed) return;

    try {
      const result = await apiPost('/admin/payments/reject', { adminPhone, paymentId: payment.id });
      if (result.success) {
        toast.success('已拒绝该付款记录');
        onPaymentsChange(prev => prev.map(p => p.id === payment.id ? { ...p, status: 'rejected' as const } : p));
      } else {
        toast.error(result.error || '操作失败');
      }
    } catch (err: unknown) { toast.error('操作失败：' + getErrorMessage(err)); }
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={onRefresh} disabled={isLoadingPayments}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-colors text-sm">
          <RefreshCw className={`w-4 h-4 ${isLoadingPayments ? 'animate-spin' : ''}`} />刷新
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
            <div key={payment.id}
              className={`bg-white/3 border rounded-2xl p-4 ${
                payment.status === 'pending' ? 'border-orange-500/30'
                : payment.status === 'approved' ? 'border-green-500/20'
                : 'border-red-500/20'
              }`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className="text-white font-medium text-sm">
                    {payment.phone.slice(0, 3)}****{payment.phone.slice(-4)}
                  </span>
                  <span className="text-gray-500 text-xs ml-2">{formatDate(payment.createdAt)}</span>
                </div>
                <span className={`text-xs px-2 py-1 rounded-lg font-medium ${
                  payment.status === 'pending' ? 'bg-orange-500/20 text-orange-400'
                  : payment.status === 'approved' ? 'bg-green-500/20 text-green-400'
                  : 'bg-red-500/20 text-red-400'
                }`}>
                  {payment.status === 'pending' ? '待审核' : payment.status === 'approved' ? '已批准' : '已拒绝'}
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm mb-2">
                <span className="text-gray-400">金额: <span className="text-white font-medium">&yen;{payment.amount}</span></span>
                <span className="text-gray-400">配额: <span className="text-white font-medium">{payment.credits} 个</span></span>
              </div>
              {payment.note && <p className="text-xs text-gray-500 mb-3">{payment.note}</p>}
              {payment.status === 'pending' && (
                <div className="flex gap-2">
                  <button onClick={() => handleApprovePayment(payment)}
                    className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-400 hover:text-green-300 text-sm font-medium transition-colors">
                    <CheckCircle2 className="w-4 h-4" />批准并添加配额
                  </button>
                  <button onClick={() => handleRejectPayment(payment)}
                    className="flex-1 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-sm font-medium transition-colors">
                    拒绝
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}