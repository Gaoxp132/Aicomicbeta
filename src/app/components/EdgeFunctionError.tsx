import { AlertCircle, ExternalLink, Terminal, FileText } from 'lucide-react';
import { Button } from './ui/button';

interface EdgeFunctionErrorProps {
  showError: boolean;
  dismissError: () => void;
}

export function EdgeFunctionError({ showError, dismissError }: EdgeFunctionErrorProps) {
  if (!showError) return null;
  
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 border border-red-500/30 rounded-2xl shadow-2xl max-w-2xl w-full p-8">
        {/* 标题 */}
        <div className="flex items-start gap-4 mb-6">
          <div className="flex-shrink-0 w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-red-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-white mb-2">
              无法连接到后端服务
            </h2>
            <p className="text-gray-300 text-sm">
              Edge Function 还没有部署到 Supabase，或者首次启动需要更长时间（冷启动）。
            </p>
          </div>
        </div>

        {/* 错误信息 */}
        <div className="bg-black/40 border border-red-500/20 rounded-lg p-4 mb-6">
          <div className="text-sm font-mono text-red-300">
            <div className="text-red-400 font-semibold mb-1">连接超时或失败</div>
            <div className="text-gray-400">Edge Function 未响应（超时30秒）- 请先部署后端服务或等待冷启动完成</div>
          </div>
        </div>

        {/* 解决方案 */}
        <div className="space-y-4 mb-6">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Terminal className="w-5 h-5 text-purple-400" />
            快速解决方案
          </h3>
          
          {/* 方式1：自动脚本 */}
          <div className="bg-white/5 border border-purple-500/20 rounded-lg p-4">
            <div className="font-semibold text-purple-300 mb-2">
              方式1：使用自动部署脚本（推荐）
            </div>
            <div className="space-y-2 text-sm text-gray-300">
              <div className="bg-black/40 rounded p-3 font-mono text-xs">
                <div className="text-gray-500"># macOS/Linux</div>
                <div className="text-green-400">./deploy-edge-function.sh</div>
                <div className="text-gray-500 mt-2"># Windows</div>
                <div className="text-green-400">deploy-edge-function.bat</div>
              </div>
            </div>
          </div>

          {/* 方式2：手动部署 */}
          <div className="bg-white/5 border border-blue-500/20 rounded-lg p-4">
            <div className="font-semibold text-blue-300 mb-2">
              方式2：手动部署（4个命令）
            </div>
            <div className="space-y-2 text-sm text-gray-300">
              <div className="bg-black/40 rounded p-3 font-mono text-xs space-y-1">
                <div className="text-gray-500"># 1. 安装 CLI</div>
                <div className="text-green-400">npm install -g supabase</div>
                <div className="text-gray-500 mt-2"># 2. 登录</div>
                <div className="text-green-400">supabase login</div>
                <div className="text-gray-500 mt-2"># 3. 链接项目</div>
                <div className="text-green-400">supabase link --project-ref cjjbxfzwjhnuwkqsntop</div>
                <div className="text-gray-500 mt-2"># 4. 部署</div>
                <div className="text-green-400">supabase functions deploy make-server-fc31472c</div>
              </div>
            </div>
          </div>
        </div>

        {/* 验证方式 */}
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 mb-6">
          <div className="text-sm text-green-300">
            <div className="font-semibold mb-2">✅ 部署后验证：</div>
            <div className="text-gray-300">
              在浏览器中打开项目根目录的 <code className="bg-black/40 px-2 py-1 rounded">QUICK_TEST.html</code> 文件，
              或使用 <code className="bg-black/40 px-2 py-1 rounded">CONNECTION_DIAGNOSTIC.html</code> 进行完整诊断。
            </div>
          </div>
        </div>

        {/* 文档链接 */}
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => window.open('/QUICK_TEST.html', '_blank')}
            className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            快速测试
          </Button>
          <Button
            onClick={() => window.open('/CONNECTION_DIAGNOSTIC.html', '_blank')}
            variant="outline"
            className="flex-1 border-purple-600 text-purple-300 hover:bg-purple-600/10"
          >
            <Terminal className="w-4 h-4 mr-2" />
            完整诊断
          </Button>
          {dismissError && (
            <Button
              onClick={dismissError}
              variant="ghost"
              className="flex-1 text-gray-400 hover:bg-white/5"
            >
              暂时关闭
            </Button>
          )}
        </div>

        {/* 底部提示 */}
        <div className="mt-6 pt-6 border-t border-white/10">
          <p className="text-xs text-gray-500 text-center">
            完整部署指南请查看 <code className="bg-black/40 px-2 py-1 rounded">DEPLOYMENT_INSTRUCTIONS.md</code> 文件
          </p>
        </div>
      </div>
    </div>
  );
}