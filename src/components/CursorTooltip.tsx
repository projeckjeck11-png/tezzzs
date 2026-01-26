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

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setPosition({ x: e.clientX, y: e.clientY });
  }, []);

  const handleMouseEnter = useCallback(() => {
    setIsVisible(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsVisible(false);
  }, []);

  const tooltipElement = isVisible ? (
    <div
      className="fixed z-[9999] pointer-events-none"
      style={{
        left: position.x + 12,
        top: position.y - 50,
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
