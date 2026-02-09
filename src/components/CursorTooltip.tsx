import { useState, useCallback, ReactNode, isValidElement, cloneElement } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface CursorTooltipProps {
  children: ReactNode;
  content: ReactNode;
  className?: string;
  /** If true, attaches handlers to the single child element instead of wrapping it (useful for absolutely-positioned bars). */
  asChild?: boolean;
  /** Only used when asChild=false. Keeps old behavior (wrapper fills remaining space in flex rows). */
  flex?: boolean;
}

export function CursorTooltip({
  children,
  content,
  className = '',
  asChild = false,
  flex = true,
}: CursorTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const getScale = () => {
    if (typeof window === 'undefined') return 1;
    // Prefer appZoom saved by the app; fallback to computed zoom on html
    const stored = window.localStorage?.getItem('appZoom');
    const parsed = stored ? Number(stored) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    const computedZoom = parseFloat(getComputedStyle(document.documentElement).zoom || '1');
    if (Number.isFinite(computedZoom) && computedZoom > 0) return computedZoom;
    return 1;
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // use viewport coordinates; avoid extra scale math
    setPosition({ x: e.clientX, y: e.clientY });
  }, []);

  const handleMouseEnter = useCallback(() => {
    setIsVisible(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsVisible(false);
  }, []);

  const baseX = position.x;
  const baseY = position.y;
  const scale = getScale();
  const dev = scale - 1;
  // Piecewise linear correction from user-provided data
  const dx = dev >= 0 ? dev * -720 : dev * -970;
  const dy = dev >= 0 ? dev * -260 : dev * -440;
  const finalX = (baseX + 12 + dx) / scale;
  const finalY = (baseY - 50 + dy) / scale;

  const tooltipElement = isVisible ? (
    <div
      className="fixed z-[9999] pointer-events-none"
      style={{
        left: finalX,
        top: finalY,
      }}
    >
      <div className="bg-popover text-popover-foreground px-2.5 py-1.5 rounded-md shadow-lg border border-border text-[10px] whitespace-nowrap">
        {content}
      </div>
    </div>
  ) : null;

  if (asChild && isValidElement(children)) {
    const child = children as any;
    const mergedClassName = cn(child.props?.className, className);

    return (
      <>
        {cloneElement(child, {
          className: mergedClassName,
          onMouseMove: (e: React.MouseEvent) => {
            child.props?.onMouseMove?.(e);
            handleMouseMove(e);
          },
          onMouseEnter: (e: React.MouseEvent) => {
            child.props?.onMouseEnter?.(e);
            handleMouseEnter();
          },
          onMouseLeave: (e: React.MouseEvent) => {
            child.props?.onMouseLeave?.(e);
            handleMouseLeave();
          },
        })}
        {typeof document !== 'undefined' && tooltipElement && createPortal(tooltipElement, document.body)}
      </>
    );
  }

  return (
    <div
      className={cn(flex ? 'flex-1' : '', className)}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {typeof document !== 'undefined' && tooltipElement && createPortal(tooltipElement, document.body)}
    </div>
  );
}
