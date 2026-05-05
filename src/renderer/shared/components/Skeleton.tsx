import React from 'react';

interface SkeletonProps {
  className?: string;
  variant?: 'shimmer' | 'pulse';
  lines?: number;
  width?: string;
  height?: string;
  rounded?: boolean;
}

const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'shimmer',
  lines = 1,
  width,
  height,
  rounded = true,
}) => {
  const baseClass = variant === 'shimmer' ? 'skeleton-shimmer' : 'skeleton-pulse';
  const roundClass = rounded ? 'rounded-lg' : '';

  const style: React.CSSProperties = {
    width: width || '100%',
    height: height || (lines > 1 ? undefined : '16px'),
  };

  if (lines > 1) {
    return (
      <div className={`space-y-2 ${className}`}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`${baseClass} ${roundClass}`}
            style={{
              width: i === lines - 1 ? '60%' : '100%',
              height: '14px',
            }}
          />
        ))}
      </div>
    );
  }

  return <div className={`${baseClass} ${roundClass} ${className}`} style={style} />;
};

/** 卡片骨架屏 */
export const CardSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="glass-card rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton width="24px" height="24px" rounded />
          <Skeleton width="60%" height="16px" />
        </div>
        <Skeleton lines={3} />
      </div>
    ))}
  </div>
);

/** 列表骨架屏 */
export const ListSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => (
  <div className="space-y-2">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="flex items-center gap-3 p-3">
        <Skeleton width="32px" height="32px" rounded />
        <div className="flex-1">
          <Skeleton width="70%" height="14px" />
        </div>
      </div>
    ))}
  </div>
);

export default Skeleton;
