// ==================== 中国风昵称生成器 ====================

// 中国风昵称词库
const CHINESE_SURNAMES = ['云', '月', '风', '雨', '雪', '霜', '星', '夜', '晨', '暮', '灵', '梦', '幻', '影', '墨', '竹', '兰', '菊', '梅', '莲'];
const CHINESE_NAMES = ['溪', '清', '语', '瑶', '涵', '芷', '若', '韵', '歌', '舞', '诗', '画', '音', '琴', '书', '香', '茗', '烟', '露', '霓'];
const CHINESE_SUFFIXES = ['仙', '客', '子', '君', '公子', '姑娘', '居士', '道人', '先生', '小姐'];

export function generateChineseNickname(): string {
  const surname = CHINESE_SURNAMES[Math.floor(Math.random() * CHINESE_SURNAMES.length)];
  const name = CHINESE_NAMES[Math.floor(Math.random() * CHINESE_NAMES.length)];
  const suffix = CHINESE_SUFFIXES[Math.floor(Math.random() * CHINESE_SUFFIXES.length)];
  
  // 80%概率使用"姓+名"，20%概率使用"姓+名+后缀"
  if (Math.random() < 0.8) {
    return `${surname}${name}`;
  } else {
    return `${surname}${name}${suffix}`;
  }
}
