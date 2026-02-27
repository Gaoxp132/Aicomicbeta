// v6.0.66: Removed motion/lucide-react from main chunk — uses CSS + inline SVGs

interface MobileBottomBarProps {
  activeTab: 'create' | 'works' | 'community' | 'profile';
  onTabChange: (tab: 'create' | 'works' | 'community' | 'profile') => void;
  userPhone?: string;
  onLoginClick: () => void;
}

// Inline SVG icons to avoid pulling lucide-react into main chunk
function Wand2Icon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72" /><path d="m14 7 3 3" /><path d="M5 6v4" /><path d="M19 14v4" /><path d="M10 2v2" /><path d="M7 8H3" /><path d="M21 16h-4" /><path d="M11 3H9" />
    </svg>
  );
}

function FilmIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="18" height="18" x="3" y="3" rx="2" /><path d="M7 3v18" /><path d="M3 7.5h4" /><path d="M3 12h18" /><path d="M3 16.5h4" /><path d="M17 3v18" /><path d="M17 7.5h4" /><path d="M17 16.5h4" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}

const TABS = [
  { id: 'create' as const, label: '创作', icon: Wand2Icon },
  { id: 'works' as const, label: '作品', icon: FilmIcon },
  { id: 'community' as const, label: '发现', icon: UsersIcon },
  { id: 'profile' as const, label: '我的', icon: UserIcon, requireLogin: true },
];

export function MobileBottomBar({ activeTab, onTabChange, userPhone, onLoginClick }: MobileBottomBarProps) {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 lg:hidden bg-black/95 backdrop-blur-xl border-t border-white/10 z-40 animate-[slideUp_0.3s_ease-out]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center justify-around py-1.5 px-2">
        {TABS.map(({ id, label, icon: Icon, requireLogin }) => {
          const isActive = activeTab === id;
          const handleClick = () => {
            if (requireLogin && !userPhone) {
              onLoginClick();
            } else {
              onTabChange(id);
            }
          };

          return (
            <button
              key={id}
              onClick={handleClick}
              className={`flex flex-col items-center gap-0.5 py-2 px-3 rounded-xl transition-all active:scale-95 ${
                isActive ? 'text-white' : 'text-gray-500'
              }`}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 shadow-lg shadow-purple-500/50'
                  : id === 'profile' && userPhone
                    ? 'bg-gradient-to-r from-purple-500/40 to-pink-500/40'
                    : 'bg-white/5'
              }`}>
                <Icon className="w-4.5 h-4.5" />
              </div>
              <span className="text-[11px] mt-0.5">
                {id === 'profile' && !userPhone ? '登录' : label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
