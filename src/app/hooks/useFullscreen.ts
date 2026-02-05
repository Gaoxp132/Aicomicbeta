import { useState, useEffect, useRef } from 'react';

/**
 * 全屏功能自定义Hook
 * 管理全屏状态和方向锁定
 */
export function useFullscreen(containerRef: React.RefObject<HTMLDivElement>) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(true);

  // 检测全屏支持
  useEffect(() => {
    const checkFullscreenSupport = () => {
      const elem = document.createElement('div');
      const isSupported = !!(
        elem.requestFullscreen ||
        (elem as any).mozRequestFullScreen ||
        (elem as any).webkitRequestFullscreen ||
        (elem as any).msRequestFullscreen
      );
      
      try {
        const testFullscreen = (document as any).fullscreenEnabled || 
                              (document as any).webkitFullscreenEnabled || 
                              (document as any).mozFullScreenEnabled ||
                              (document as any).msFullscreenEnabled;
        setFullscreenSupported(isSupported && testFullscreen !== false);
      } catch (e) {
        setFullscreenSupported(false);
      }
    };
    
    checkFullscreenSupport();
  }, []);

  // 监听全屏状态变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  // 屏幕方向锁定
  useEffect(() => {
    const lockOrientation = async () => {
      if (isFullscreen && screen.orientation && (screen.orientation as any).lock) {
        try {
          await (screen.orientation as any).lock('landscape');
        } catch (error) {
          console.log('屏幕方向锁定不可用:', error);
        }
      } else if (!isFullscreen && screen.orientation && (screen.orientation as any).unlock) {
        try {
          (screen.orientation as any).unlock();
        } catch (error) {
          console.log('屏幕方向解锁不可用:', error);
        }
      }
    };
    
    lockOrientation();
  }, [isFullscreen]);

  // 切换全屏
  const toggleFullscreen = async () => {
    if (!containerRef.current) return;

    try {
      if (!isFullscreen) {
        // 进入全屏
        if (containerRef.current.requestFullscreen) {
          await containerRef.current.requestFullscreen();
        } else if ((containerRef.current as any).mozRequestFullScreen) {
          await (containerRef.current as any).mozRequestFullScreen();
        } else if ((containerRef.current as any).webkitRequestFullscreen) {
          await (containerRef.current as any).webkitRequestFullscreen();
        } else if ((containerRef.current as any).msRequestFullscreen) {
          await (containerRef.current as any).msRequestFullscreen();
        }
      } else {
        // 退出全屏
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).mozCancelFullScreen) {
          await (document as any).mozCancelFullScreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen();
        }
      }
    } catch (error) {
      console.error('全屏切换失败:', error);
    }
  };

  return {
    isFullscreen,
    fullscreenSupported,
    toggleFullscreen,
  };
}