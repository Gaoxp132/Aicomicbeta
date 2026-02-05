import { Wand2, Sparkles, Loader2 } from 'lucide-react';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Button } from '../ui/button';

interface StorySectionProps {
  prompt: string;
  onPromptChange: (prompt: string) => void;
  onGenerateStory: () => void;
  isGeneratingStory: boolean;
}

export function StorySection({
  prompt,
  onPromptChange,
  onGenerateStory,
  isGeneratingStory
}: StorySectionProps) {
  return (
    <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-4 sm:p-6 border border-white/10">
      <div className="flex items-center gap-2 mb-3 sm:mb-4">
        <Wand2 className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400" />
        <Label className="text-sm sm:text-base text-white">故事描述</Label>
      </div>
      <Textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder="描述你想要创作的漫剧故事，例如：一个勇敢的少年在魔法世界中寻找失落的宝藏..."
        disabled={isGeneratingStory}
        className="min-h-28 sm:min-h-32 bg-white/5 border-white/10 text-sm sm:text-base text-white placeholder:text-gray-500 resize-none"
      />
      <div className="flex items-center justify-between mt-2 sm:mt-3 gap-2">
        <span className="text-xs text-gray-500">{prompt.length}/500</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onGenerateStory();
          }}
          disabled={isGeneratingStory}
          className="text-xs sm:text-sm text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 h-auto py-1.5 sm:py-2 px-2 sm:px-3"
        >
          {isGeneratingStory ? (
            <>
              <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1 animate-spin" />
              生成故事中...
            </>
          ) : (
            <>
              <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
              AI生成故事描述
            </>
          )}
        </Button>
      </div>
    </div>
  );
}