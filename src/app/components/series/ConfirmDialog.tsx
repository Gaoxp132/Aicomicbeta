/**
 * ConfirmDialog — 暗色主题确认对话框
 * v6.0.175: 替代原生 confirm() 对话框，匹配暗色玻璃 UI 风格
 * 支持自定义标题/描述/图标/按钮颜色/危险等级
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Trash2, RefreshCw, RotateCcw, Sparkles, HelpCircle } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  /** 'danger' = red, 'warning' = amber, 'info' = blue, 'purple' = violet */
  variant?: 'danger' | 'warning' | 'info' | 'purple';
  /** 自定义图标类型 */
  icon?: 'delete' | 'regenerate' | 'reset' | 'polish' | 'warning' | 'question';
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

// ═══════════════════════════════════════════════════════════════════
// useConfirm hook
// ═══════════════════════════════════════════════════════════════════

export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setState({ ...options, resolve });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    state?.resolve(true);
    setState(null);
  }, [state]);

  const handleCancel = useCallback(() => {
    state?.resolve(false);
    setState(null);
  }, [state]);

  const dialogProps = state ? {
    isOpen: true,
    title: state.title,
    description: state.description,
    confirmText: state.confirmText,
    cancelText: state.cancelText,
    variant: state.variant,
    icon: state.icon,
    onConfirm: handleConfirm,
    onCancel: handleCancel,
  } : {
    isOpen: false,
    title: '',
    onConfirm: () => {},
    onCancel: () => {},
  };

  return { confirm, dialogProps };
}

// ═══════════════════════════════════════════════════════════════════
// ConfirmDialog Component
// ═══════════════════════════════════════════════════════════════════

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info' | 'purple';
  icon?: 'delete' | 'regenerate' | 'reset' | 'polish' | 'warning' | 'question';
  onConfirm: () => void;
  onCancel: () => void;
}

const VARIANT_STYLES = {
  danger: {
    iconBg: 'bg-red-500/15 border-red-500/25',
    iconColor: 'text-red-400',
    confirmBg: 'bg-red-500 hover:bg-red-600 text-white',
    accentBorder: 'border-red-500/20',
    glowColor: 'shadow-red-500/10',
  },
  warning: {
    iconBg: 'bg-amber-500/15 border-amber-500/25',
    iconColor: 'text-amber-400',
    confirmBg: 'bg-amber-500 hover:bg-amber-600 text-white',
    accentBorder: 'border-amber-500/20',
    glowColor: 'shadow-amber-500/10',
  },
  info: {
    iconBg: 'bg-blue-500/15 border-blue-500/25',
    iconColor: 'text-blue-400',
    confirmBg: 'bg-blue-500 hover:bg-blue-600 text-white',
    accentBorder: 'border-blue-500/20',
    glowColor: 'shadow-blue-500/10',
  },
  purple: {
    iconBg: 'bg-violet-500/15 border-violet-500/25',
    iconColor: 'text-violet-400',
    confirmBg: 'bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white',
    accentBorder: 'border-violet-500/20',
    glowColor: 'shadow-violet-500/10',
  },
};

const ICON_MAP = {
  delete: Trash2,
  regenerate: RefreshCw,
  reset: RotateCcw,
  polish: Sparkles,
  warning: AlertTriangle,
  question: HelpCircle,
};

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  variant = 'danger',
  icon = 'warning',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const styles = VARIANT_STYLES[variant];
  const IconComponent = ICON_MAP[icon] || AlertTriangle;

  // 打开时聚焦取消按钮（安全默认）
  useEffect(() => {
    if (isOpen) {
      // 短暂延迟确保动画开始后聚焦
      const timer = setTimeout(() => confirmBtnRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // ESC 关闭 + Enter 确认
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onConfirm();
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [isOpen, onConfirm, onCancel]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 10 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className={`relative w-full max-w-sm bg-gray-900/95 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl ${styles.glowColor} overflow-hidden`}
          >
            {/* Top accent line */}
            <div className={`h-0.5 w-full bg-gradient-to-r ${
              variant === 'danger' ? 'from-red-500 to-red-400' :
              variant === 'warning' ? 'from-amber-500 to-amber-400' :
              variant === 'info' ? 'from-blue-500 to-blue-400' :
              'from-violet-500 to-fuchsia-500'
            }`} />

            <div className="px-6 pt-6 pb-5">
              {/* Icon + Title */}
              <div className="flex items-start gap-4">
                <div className={`flex-shrink-0 w-10 h-10 rounded-xl border flex items-center justify-center ${styles.iconBg}`}>
                  <IconComponent className={`w-5 h-5 ${styles.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <h3 className="text-white font-semibold text-base leading-tight">{title}</h3>
                  {description && (
                    <p className="text-gray-400 text-sm mt-2 leading-relaxed">{description}</p>
                  )}
                </div>
              </div>

              {/* Buttons */}
              <div className="flex justify-end gap-2.5 mt-6">
                <button
                  onClick={onCancel}
                  className="px-4 py-2 text-sm font-medium text-gray-300 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors"
                >
                  {cancelText}
                </button>
                <button
                  ref={confirmBtnRef}
                  onClick={onConfirm}
                  className={`px-4 py-2 text-sm font-medium rounded-xl transition-all ${styles.confirmBg} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-current`}
                >
                  {confirmText}
                </button>
              </div>
            </div>

            {/* Keyboard hints */}
            <div className="border-t border-white/5 px-6 py-2 flex items-center justify-center gap-4 text-[10px] text-gray-600">
              <span><kbd className="px-1 py-0.5 bg-white/5 rounded text-gray-500">Enter</kbd> 确认</span>
              <span><kbd className="px-1 py-0.5 bg-white/5 rounded text-gray-500">Esc</kbd> 取消</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
