/**
 * PaymentDialog - WeChat payment dialog for storyboard video credits
 * v6.0.96: 视频生成配额付费对话框
 */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CreditCard, CheckCircle2, AlertCircle, QrCode } from 'lucide-react';
import { toast } from 'sonner';
import { apiPost, apiGet } from '../utils';

interface PaymentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  userPhone: string;
  quotaInfo?: {
    usedToday: number;
    freeLimit: number;
    paidCredits: number;
  };
  onPaymentRecorded?: () => void;
}

const PRICE_PER_CREDIT = 5; // 5元/个

export function PaymentDialog({ isOpen, onClose, userPhone, quotaInfo, onPaymentRecorded }: PaymentDialogProps) {
  const [amount, setAmount] = useState('5');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  const parsedAmount = parseInt(amount) || 0;
  const credits = Math.floor(parsedAmount / PRICE_PER_CREDIT);

  // Fetch WeChat QR code URL from server KV
  useEffect(() => {
    if (!isOpen) return;
    apiGet('/admin/wechat-qr').then(r => {
      if (r.success && (r.data as any)?.url) setQrUrl((r.data as any).url);
    }).catch(() => {});
  }, [isOpen]);

  const handleSubmit = async () => {
    if (parsedAmount < PRICE_PER_CREDIT) {
      toast.error(`最低付款金额为 ${PRICE_PER_CREDIT} 元`);
      return;
    }
    if (parsedAmount % PRICE_PER_CREDIT !== 0) {
      toast.error(`付款金额必须是 ${PRICE_PER_CREDIT} 的整数倍`);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await apiPost('/payment/record', {
        phone: userPhone,
        amount: parsedAmount,
        credits,
        note: `用户${userPhone}请求购买${credits}个视频生成配额，付款${parsedAmount}元`,
      });

      if (result.success) {
        setSubmitted(true);
        onPaymentRecorded?.();
      } else {
        toast.error(result.error || '记录付款失败，请重试');
      }
    } catch (err: any) {
      toast.error('网络错误，请稍后重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSubmitted(false);
    setAmount('5');
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md"
          >
            <div className="bg-gray-900 border border-white/10 rounded-2xl p-6 shadow-2xl mx-4 max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-green-400" />
                  <h2 className="text-lg font-bold text-white">购买视频生成配额</h2>
                </div>
                <button
                  onClick={handleClose}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Quota info */}
              {quotaInfo && (
                <div className="mb-4 p-3 rounded-xl bg-orange-500/10 border border-orange-500/20">
                  <div className="flex items-center gap-2 text-orange-400 text-sm font-medium mb-1">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    今日免费配额已用完
                  </div>
                  <div className="text-xs text-gray-400 space-y-0.5">
                    <div>今日已生成: <span className="text-white">{quotaInfo.usedToday}</span> 个</div>
                    <div>每日免费额度: <span className="text-white">{quotaInfo.freeLimit}</span> 个</div>
                    {quotaInfo.paidCredits > 0 && (
                      <div>已购买额度: <span className="text-white">{quotaInfo.paidCredits}</span> 个剩余</div>
                    )}
                  </div>
                </div>
              )}

              {submitted ? (
                <div className="text-center py-6">
                  <CheckCircle2 className="w-14 h-14 text-green-400 mx-auto mb-3" />
                  <h3 className="text-white font-semibold text-lg mb-1">付款记录已提交！</h3>
                  <p className="text-gray-400 text-sm mb-2">
                    已记录付款意向：<span className="text-white font-medium">{parsedAmount} 元 / {credits} 个配额</span>
                  </p>
                  <p className="text-gray-500 text-xs">
                    管理员审核后将为您添加配额，通常在工作时间内处理。
                    <br />如有疑问请联系客服。
                  </p>
                  <button
                    onClick={handleClose}
                    className="mt-4 px-6 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white font-medium transition-colors"
                  >
                    确定
                  </button>
                </div>
              ) : (
                <>
                  {/* Pricing */}
                  <div className="mb-4 p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                    <div className="text-green-400 font-semibold mb-1">💰 定价说明</div>
                    <div className="text-white font-bold text-2xl">
                      ¥{PRICE_PER_CREDIT} <span className="text-gray-400 text-base font-normal">/ 个视频</span>
                    </div>
                    <div className="text-gray-400 text-xs mt-1">购买后永久有效，优先消耗每日免费额度</div>
                  </div>

                  {/* QR Code */}
                  <div className="flex justify-center mb-3">
                    <div className="rounded-2xl overflow-hidden w-48 h-48 bg-white flex items-center justify-center">
                      {qrUrl ? (
                        <img src={qrUrl} alt="微信收款码" className="w-full h-full object-contain" />
                      ) : (
                        <div className="flex flex-col items-center gap-2 p-4 text-center">
                          <QrCode className="w-12 h-12 text-gray-400" />
                          <span className="text-xs text-gray-500">收款码加载中</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-center text-sm text-gray-400 mb-1">
                    微信扫码支付
                  </p>
                  <p className="text-center text-xs text-gray-500 mb-4">
                    转账备注：<span className="text-white font-medium">{userPhone}</span>
                  </p>

                  {/* Amount input */}
                  <div className="mb-4">
                    <label className="block text-sm text-gray-300 mb-2">
                      选择或输入付款金额
                    </label>
                    <div className="grid grid-cols-4 gap-2 mb-2">
                      {[5, 10, 20, 50].map(v => (
                        <button
                          key={v}
                          onClick={() => setAmount(String(v))}
                          className={`py-2 rounded-xl text-sm font-medium transition-colors ${
                            amount === String(v)
                              ? 'bg-green-500 text-white'
                              : 'bg-white/5 text-gray-400 hover:bg-white/10'
                          }`}
                        >
                          ¥{v}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      min={PRICE_PER_CREDIT}
                      step={PRICE_PER_CREDIT}
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-green-500/50 transition-colors text-sm"
                      placeholder={`最低 ${PRICE_PER_CREDIT} 元`}
                    />
                    {credits > 0 && (
                      <p className="mt-1.5 text-xs text-green-400">
                        = 可生成 <span className="font-bold">{credits}</span> 个分镜视频
                      </p>
                    )}
                  </div>

                  {/* Submit */}
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting || credits === 0}
                    className="w-full py-3 rounded-xl bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-colors"
                  >
                    {isSubmitting ? '提交中...' : `已完成支付 ¥${parsedAmount}，提交付款记录`}
                  </button>
                  <p className="text-center text-xs text-gray-500 mt-2">
                    支付后点击上方按钮，管理员核实后为您添加配额
                  </p>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}