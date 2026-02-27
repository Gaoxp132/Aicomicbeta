import { forwardRef } from 'react';

/**
 * Simple VideoPlayer component — a thin wrapper around <video> for use in
 * series/storyboard views. Not to be confused with immersive/VideoPlayer
 * which is a full-featured custom player with HLS support and custom controls.
 */

type VideoPlayerProps = React.VideoHTMLAttributes<HTMLVideoElement> & {
  /** Video source URL (alias for the native `src` attribute) */
  src?: string;
};

export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(
  function VideoPlayer({ src, children, ...props }, ref) {
    return (
      <video
        ref={ref}
        src={src}
        playsInline
        {...props}
      >
        {children}
      </video>
    );
  }
);
