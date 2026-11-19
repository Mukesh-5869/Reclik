import React, { useRef, useState } from 'react';
import { MoveHorizontal } from 'lucide-react';

interface BeforeAfterSliderProps {
  beforeSrc: string;
  afterSrc: string;
  beforeAlt?: string;
  afterAlt?: string;
  protectAfter?: boolean;
}

export function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  beforeAlt = 'Original selfie',
  afterAlt = 'Transformed Reclik look preview',
  protectAfter = true,
}: BeforeAfterSliderProps) {
  const [position, setPosition] = useState(68);
  const containerRef = useRef<HTMLDivElement>(null);

  const updateFromClientX = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.max(4, Math.min(96, pct)));
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1 && e.pointerType === 'mouse') return;
    updateFromClientX(e.clientX);
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={(e) => updateFromClientX(e.clientX)}
      onPointerMove={handlePointerMove}
      onContextMenu={(e) => {
        if (protectAfter) e.preventDefault();
      }}
      className="relative w-full aspect-[3/4] overflow-hidden rounded-xl border border-black/15 dark:border-white/15 bg-[#141210] select-none touch-none cursor-ew-resize"
    >
      {/* After (Watermarked preview) */}
      <img
        src={afterSrc}
        alt={afterAlt}
        draggable={false}
        referrerPolicy="no-referrer"
        className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
      />

      {/* Before (Original selfie clipped to left side) */}
      <div
        className="absolute inset-0 overflow-hidden pointer-events-none"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        <img
          src={beforeSrc}
          alt={beforeAlt}
          draggable={false}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover pointer-events-none select-none"
        />
      </div>

      {/* Transparent protective shield to prevent long-press save/drag on mobile & desktop */}
      {protectAfter && (
        <div
          className="absolute inset-0 z-10"
          onContextMenu={(e) => e.preventDefault()}
          onDragStart={(e) => e.preventDefault()}
        />
      )}

      {/* Divider line and handle */}
      <div
        className="absolute top-0 bottom-0 z-20 w-0.5 bg-[#D4AF37] shadow-[0_0_12px_rgba(0,0,0,0.6)] pointer-events-none"
        style={{ left: `${position}%` }}
      >
        <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-[#0A0908] border-2 border-[#D4AF37] text-[#D4AF37] flex items-center justify-center shadow-lg">
          <MoveHorizontal className="w-4 h-4" />
        </div>
      </div>

      {/* Subtle corner labels */}
      <div className="absolute bottom-3 left-3 z-20 px-2.5 py-1 rounded bg-black/70 text-[11px] font-medium text-white/90 pointer-events-none">
        Original
      </div>
      <div className="absolute bottom-3 right-3 z-20 px-2.5 py-1 rounded bg-black/70 text-[11px] font-medium text-[#D4AF37] pointer-events-none">
        Reclik Look
      </div>

      {/* Keyboard-accessible range control */}
      <input
        type="range"
        min={4}
        max={96}
        value={Math.round(position)}
        aria-label="Compare original selfie and transformed look"
        onChange={(e) => setPosition(Number(e.target.value))}
        className="sr-only"
      />
    </div>
  );
}
