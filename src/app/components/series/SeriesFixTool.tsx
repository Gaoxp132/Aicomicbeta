/**
 * 漫剧修复工具
 * 用于诊断和修复status=completed但episodes=0的系列
 */

import { useState } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, Wrench, CheckCircle, XCircle, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { projectId, publicAnonKey } from '/utils/supabase/info';

interface SeriesFixToolProps {
  seriesId: string;
  onFixed?: () => void;
}

interface DiagnosisResult {
  seriesId: string;
  title: string;
  status: string;
  totalEpisodes: number;
  dataIntegrity: {
    characters: { count: number; status: string };
    episodes: { count: number; expected: number; status: string };
    chapters: { count: number; status: string };
    storyboards: { count: number; status: string };
  };
  issues: string[];
  fixable: boolean;
}

interface InspectionReport {
  series: any;
  statistics: {
    characters: number;
    episodes: number;
    chapters: number;
    storyboards: number;
    videos: number;
    videoProgress: string;
  };
  episodes: Array<{
    episode_number: number;
    title: string;
    storyboards: number;
    videos: number;
    hasVideo: boolean;
  }>;
  dataQuality: {
    hasCharacters: boolean;
    hasAllEpisodes: boolean;
    hasStoryboards: boolean;
    hasVideos: boolean;
    isComplete: boolean;
  };
}

export function SeriesFixTool({ seriesId, onFixed }: SeriesFixToolProps) {
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [showTool, setShowTool] = useState(false);

  const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-fc31472c`;

  // 诊断漫剧
  const handleDiagnose = async () => {
    setIsDiagnosing(true);
    setDiagnosis(null);

    try {
      const response = await fetch(`${API_BASE}/series/${seriesId}/diagnose`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '诊断失败');
      }

      if (result.success && result.diagnosis) {
        setDiagnosis(result.diagnosis);
        
        if (result.diagnosis.issues.length === 0) {
          toast.success('✅ 未检测到问题，数据完整！');
        } else {
          toast.warning(`⚠️ 检测到 ${result.diagnosis.issues.length} 个问题`);
        }
      }
    } catch (error: any) {
      console.error('[SeriesFixTool] Diagnose error:', error);
      toast.error('诊断失败：' + error.message);
    } finally {
      setIsDiagnosing(false);
    }
  };

  // 修复漫剧
  const handleFix = async () => {
    if (!diagnosis || !diagnosis.fixable) {
      toast.error('该漫剧无法自动修复');
      return;
    }

    setIsFixing(true);

    try {
      const response = await fetch(`${API_BASE}/series/${seriesId}/fix-episodes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '修复失败');
      }

      if (result.success) {
        toast.success('✅ 修复任务已启动，请稍候刷新页面查看结果');
        
        // 等待5秒后调用回调
        setTimeout(() => {
          onFixed?.();
        }, 5000);
      }
    } catch (error: any) {
      console.error('[SeriesFixTool] Fix error:', error);
      toast.error('修复失败：' + error.message);
    } finally {
      setIsFixing(false);
    }
  };

  // 如果没有展开工具，只显示一个按钮
  if (!showTool) {
    return (
      <Button
        onClick={() => {
          setShowTool(true);
          handleDiagnose();
        }}
        variant="outline"
        size="sm"
        className="gap-2 border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
      >
        <Wrench className="w-4 h-4" />
        数据诊断
      </Button>
    );
  }

  return (
    <Card className="p-6 bg-slate-800/50 border-orange-500/30">
      <div className="space-y-4">
        {/* 标题 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-orange-400" />
            <h3 className="text-lg font-semibold text-white">数据诊断工具</h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowTool(false)}
          >
            收起
          </Button>
        </div>

        {/* 说明 */}
        <Alert className="bg-orange-500/10 border-orange-500/30">
          <AlertTriangle className="w-4 h-4 text-orange-400" />
          <AlertDescription className="text-orange-200">
            此工具用于诊断和修复漫剧数据完整性问题，例如剧集缺失、分镜数据不完整等。
          </AlertDescription>
        </Alert>

        {/* 诊断按钮 */}
        <div className="flex gap-2">
          <Button
            onClick={handleDiagnose}
            disabled={isDiagnosing}
            className="gap-2"
          >
            {isDiagnosing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                诊断中...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                开始诊断
              </>
            )}
          </Button>
        </div>

        {/* 诊断结果 */}
        {diagnosis && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {/* 基本信息 */}
            <div className="p-4 bg-slate-700/30 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">漫剧标题</span>
                <span className="text-white font-medium">{diagnosis.title}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">状态</span>
                <Badge variant={
                  diagnosis.status === 'completed' ? 'default' :
                  diagnosis.status === 'generating' ? 'secondary' : 'outline'
                }>
                  {diagnosis.status}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">总集数</span>
                <span className="text-white">{diagnosis.totalEpisodes}</span>
              </div>
            </div>

            {/* 数据完整性 */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-white">数据完整性检查</h4>
              
              <DataIntegrityItem
                label="角色数据"
                count={diagnosis.dataIntegrity.characters.count}
                status={diagnosis.dataIntegrity.characters.status}
              />
              
              <DataIntegrityItem
                label="剧集数据"
                count={diagnosis.dataIntegrity.episodes.count}
                expected={diagnosis.dataIntegrity.episodes.expected}
                status={diagnosis.dataIntegrity.episodes.status}
              />
              
              <DataIntegrityItem
                label="章节数据"
                count={diagnosis.dataIntegrity.chapters.count}
                status={diagnosis.dataIntegrity.chapters.status}
              />
              
              <DataIntegrityItem
                label="分镜数据"
                count={diagnosis.dataIntegrity.storyboards.count}
                status={diagnosis.dataIntegrity.storyboards.status}
              />
            </div>

            {/* 问题列表 */}
            {diagnosis.issues.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-white">检测到的问题</h4>
                <div className="space-y-1">
                  {diagnosis.issues.map((issue, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-300"
                    >
                      <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>{issue}</span>
                    </div>
                  ))}
                </div>

                {/* 修复按钮 */}
                {diagnosis.fixable && (
                  <Button
                    onClick={handleFix}
                    disabled={isFixing}
                    className="w-full gap-2 bg-gradient-to-r from-orange-500 to-red-500"
                  >
                    {isFixing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        修复中...
                      </>
                    ) : (
                      <>
                        <Wrench className="w-4 h-4" />
                        自动修复
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}

            {/* 无问题提示 */}
            {diagnosis.issues.length === 0 && (
              <div className="flex items-center gap-2 p-4 bg-green-500/10 border border-green-500/20 rounded text-green-300">
                <CheckCircle className="w-5 h-5" />
                <span>✅ 数据完整，未检测到问题</span>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </Card>
  );
}

// 数据完整性项组件
interface DataIntegrityItemProps {
  label: string;
  count: number;
  expected?: number;
  status: string;
}

function DataIntegrityItem({ label, count, expected, status }: DataIntegrityItemProps) {
  const statusColor = 
    status === 'OK' ? 'text-green-400' :
    status === 'MISSING' ? 'text-red-400' :
    status === 'INCOMPLETE' ? 'text-orange-400' :
    'text-slate-400';

  const statusIcon = 
    status === 'OK' ? <CheckCircle className="w-4 h-4" /> :
    status === 'MISSING' ? <XCircle className="w-4 h-4" /> :
    status === 'INCOMPLETE' ? <AlertTriangle className="w-4 h-4" /> :
    null;

  return (
    <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded">
      <span className="text-sm text-slate-300">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm text-white">
          {count}{expected !== undefined && ` / ${expected}`}
        </span>
        <div className={`flex items-center gap-1 ${statusColor}`}>
          {statusIcon}
          <span className="text-xs">{status}</span>
        </div>
      </div>
    </div>
  );
}