import type { ReactNode, CSSProperties } from 'react';

type FullscreenChartProps = {
  children: ReactNode;
  title?: string;
  className?: string;
  fillWidth?: boolean;
  contentClassName?: string;
  contentStyle?: CSSProperties;
};

export function FullscreenChart({
  children,
  className,
  contentClassName,
  contentStyle,
}: FullscreenChartProps) {
  if (!className && !contentClassName && !contentStyle) {
    return <>{children}</>;
  }

  return (
    <div className={className ?? undefined}>
      {contentClassName || contentStyle ? (
        <div className={contentClassName ?? undefined} style={contentStyle}>
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
