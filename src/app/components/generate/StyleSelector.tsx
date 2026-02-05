import { motion } from 'motion/react';
import { Palette } from 'lucide-react';
import { Label } from '../ui/label';
import { STYLES } from '../../constants/videoGeneration';

interface StyleSelectorProps {
  selectedStyle: string;
  onStyleChange: (style: string) => void;
}

export function StyleSelector({ selectedStyle, onStyleChange }: StyleSelectorProps) {
  return (
    <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-4 sm:p-6 border border-white/10">
      <div className="flex items-center gap-2 mb-3 sm:mb-4">
        <Palette className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400" />
        <Label className="text-sm sm:text-base text-white">画面风格</Label>
      </div>
      <div className="grid grid-cols-4 lg:grid-cols-3 gap-2 sm:gap-3">
        {STYLES.map((style) => (
          <motion.button
            key={style.id}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onStyleChange(style.id)}
            className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl border-2 transition-all ${
              selectedStyle === style.id
                ? 'border-purple-500 bg-gradient-to-br ' + style.gradient + ' shadow-lg'
                : 'border-white/10 bg-white/5 hover:border-white/20'
            }`}
          >
            <div className="text-xl sm:text-2xl mb-1 sm:mb-2">{style.icon}</div>
            <div className={`text-xs sm:text-sm ${selectedStyle === style.id ? 'text-white font-medium' : 'text-gray-400'}`}>
              {style.name}
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
