/**
 * AdminPanel - User management panel for admin users
 * v6.0.176: 管理员身份由服务端验证，不再硬编码手机号
 * v6.0.102: defaultTab prop + notification permission UI (settings tab)
 * v6.0.100: admin account display fix
 * Tab content extracted to AdminPanelTabs.tsx
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, CreditCard, ArrowLeft, X, Settings, Bell,
} from 'lucide-react';
import { apiGet } from '../utils';
import { SettingsTab, UsersTab, PaymentsTab } from './AdminPanelTabs';
import type { UserRecord, PaymentRecord } from './AdminPanelTabs';

interface AdminPanelProps {
  adminPhone: string;
  onClose: () => void;
  defaultTab?: 'users' | 'payments' | 'settings';
  onRequestNotifPermission?: () => Promise<string>;
  notifPermission?: string;
  /** v6.0.176: 是否为超级管理员（可管理管理员列表） */
  isSuperAdmin?: boolean;
}

export function AdminPanel({ adminPhone, onClose, defaultTab, onRequestNotifPermission, notifPermission, isSuperAdmin }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<'users' | 'payments' | 'settings'>(defaultTab || 'users');
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isLoadingPayments, setIsLoadingPayments] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  const [qrInput, setQrInput] = useState('');

  const loadUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    try {
      const result = await apiGet(`/admin/users?adminPhone=${adminPhone}`);
      if (result.success && result.data) {
        setUsers(result.data?.users || []);
      }
    } catch {}
    finally { setIsLoadingUsers(false); }
  }, [adminPhone]);

  const loadPayments = useCallback(async () => {
    setIsLoadingPayments(true);
    try {
      const result = await apiGet(`/admin/payments?adminPhone=${adminPhone}`);
      if (result.success && result.data) {
        setPayments(result.data?.payments || []);
      }
    } catch {}
    finally { setIsLoadingPayments(false); }
  }, [adminPhone]);

  useEffect(() => {
    loadUsers();
    apiGet('/admin/wechat-qr').then(r => {
      if (r.success) { const url = r.data?.url || ''; setQrUrl(url); setQrInput(url); }
    }).catch(() => {});
  }, [loadUsers]);

  useEffect(() => {
    if (activeTab === 'payments') loadPayments();
  }, [activeTab, loadPayments]);

  const pendingPayments = payments.filter(p => p.status === 'pending').length;

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/10 bg-black/30 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-white">管理员控制台</h1>
            <p className="text-xs text-gray-500">{adminPhone}</p>
          </div>
        </div>
        <button onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Notification permission banner */}
      {onRequestNotifPermission && notifPermission !== 'granted' && notifPermission !== 'unsupported' && (
        <div className="mx-4 sm:mx-6 mt-3 flex items-center gap-3 bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-2.5 flex-shrink-0">
          <Bell className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span className="text-xs text-amber-300 flex-1">
            {notifPermission === 'denied'
              ? '通知权限已被拒绝，请在浏览器设置中手动开启以接收付款推送'
              : '开启系统通知，在后台也能收到新付款提醒'}
          </span>
          {notifPermission !== 'denied' && (
            <button onClick={async () => { if (onRequestNotifPermission) await onRequestNotifPermission(); }}
              className="text-xs px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 transition-colors flex-shrink-0">
              开启通知
            </button>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex px-4 sm:px-6 gap-1 pt-4 pb-2 flex-shrink-0">
        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            activeTab === 'users' ? 'bg-purple-500 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Users className="w-4 h-4" />注册用户
          <span className="bg-white/20 text-xs px-1.5 py-0.5 rounded-full">{users.length}</span>
        </button>
        <button
          onClick={() => { setActiveTab('payments'); loadPayments(); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            activeTab === 'payments' ? 'bg-purple-500 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <CreditCard className="w-4 h-4" />付款记录
          {pendingPayments > 0 && (
            <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{pendingPayments}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            activeTab === 'settings' ? 'bg-purple-500 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Settings className="w-4 h-4" />设置
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-4 sm:px-6 pb-6">
        {activeTab === 'settings' && (
          <SettingsTab
            adminPhone={adminPhone}
            qrUrl={qrUrl}
            qrInput={qrInput}
            setQrInput={setQrInput}
            setQrUrl={setQrUrl}
            notifPermission={notifPermission}
            onRequestNotifPermission={onRequestNotifPermission}
            isSuperAdmin={isSuperAdmin}
          />
        )}
        {activeTab === 'users' && (
          <UsersTab
            users={users}
            adminPhone={adminPhone}
            isLoadingUsers={isLoadingUsers}
            onRefresh={loadUsers}
            onUsersChange={setUsers}
          />
        )}
        {activeTab === 'payments' && (
          <PaymentsTab
            payments={payments}
            adminPhone={adminPhone}
            isLoadingPayments={isLoadingPayments}
            onRefresh={loadPayments}
            onPaymentsChange={setPayments}
          />
        )}
      </div>
    </div>
  );
}