import React, { useState, useEffect, useRef, ReactNode } from 'react';

interface PullToRefreshProps {
    onRefresh: () => Promise<void>;
    children: ReactNode;
}

const PullToRefresh: React.FC<PullToRefreshProps> = ({ onRefresh, children }) => {
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [pullDistance, setPullDistance] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const startY = useRef(0);
    const isPulling = useRef(false);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const handleTouchStart = (e: TouchEvent) => {
            if (el.scrollTop === 0) {
                startY.current = e.touches[0].clientY;
                isPulling.current = true;
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (!isPulling.current) return;
            const y = e.touches[0].clientY;
            const distance = y - startY.current;

            if (distance > 0) {
                if (e.cancelable) e.preventDefault();
                setPullDistance(Math.min(distance * 0.4, 80));
            }
        };

        const handleTouchEnd = async () => {
            if (!isPulling.current) return;
            isPulling.current = false;

            if (pullDistance > 60) {
                setIsRefreshing(true);
                try {
                    await onRefresh();
                } finally {
                    setIsRefreshing(false);
                    setPullDistance(0);
                }
            } else {
                setPullDistance(0);
            }
        };

        // Needs to be non-passive to call preventDefault
        el.addEventListener('touchstart', handleTouchStart, { passive: true });
        el.addEventListener('touchmove', handleTouchMove, { passive: false });
        el.addEventListener('touchend', handleTouchEnd);

        return () => {
            el.removeEventListener('touchstart', handleTouchStart);
            el.removeEventListener('touchmove', handleTouchMove);
            el.removeEventListener('touchend', handleTouchEnd);
        };
    }, [pullDistance, onRefresh]);

    return (
        <div ref={containerRef} className="h-full overflow-y-auto no-scrollbar relative">
            <div
                className="absolute top-0 left-0 right-0 flex justify-center items-center overflow-hidden transition-all duration-300 z-50 pointer-events-none"
                style={{ height: `${isRefreshing ? 60 : pullDistance}px` }}
            >
                <div className={`transition-opacity duration-200 ${(pullDistance > 10 || isRefreshing) ? 'opacity-100' : 'opacity-0'}`}>
                    {isRefreshing ? (
                        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin bg-white shadow-md p-1 box-content" />
                    ) : (
                        <div className="bg-white shadow-md rounded-full w-8 h-8 flex items-center justify-center">
                            <span
                                className="material-icons-round text-slate-400 text-lg transition-transform duration-200"
                                style={{ transform: `rotate(${pullDistance > 60 ? 180 : 0}deg)` }}
                            >
                                arrow_downward
                            </span>
                        </div>
                    )}
                </div>
            </div>

            <div
                className="min-h-full transition-transform"
                style={{
                    transform: `translateY(${isRefreshing ? 60 : pullDistance}px)`,
                    transition: isPulling.current ? 'none' : 'transform 0.3s ease-out'
                }}
            >
                {children}
            </div>
        </div>
    );
};

export default PullToRefresh;
