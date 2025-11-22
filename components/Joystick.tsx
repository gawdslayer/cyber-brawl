import React, { useRef, useState, useEffect } from 'react';

interface JoystickProps {
  size?: number;
  color?: string;
  onMove: (vector: { x: number; y: number; angle: number; active: boolean }) => void;
  className?: string;
  identifier: 'move' | 'shoot';
}

export const Joystick: React.FC<JoystickProps> = ({
  size = 100,
  color = 'rgba(255, 255, 255, 0.5)',
  onMove,
  className,
  identifier
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [origin, setOrigin] = useState({ x: 0, y: 0 });

  // Handle Touch Start
  const handleStart = (clientX: number, clientY: number) => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // If static joystick, origin is center. If dynamic (not implemented here), origin is touch.
    // We use static center for this UI.
    setOrigin({ x: centerX, y: centerY });
    setActive(true);
    handleMove(clientX, clientY, centerX, centerY);
  };

  const handleMove = (clientX: number, clientY: number, centerX: number, centerY: number) => {
    const deltaX = clientX - centerX;
    const deltaY = clientY - centerY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const maxDist = size / 2;

    let x = deltaX;
    let y = deltaY;

    if (distance > maxDist) {
      const angle = Math.atan2(deltaY, deltaX);
      x = Math.cos(angle) * maxDist;
      y = Math.sin(angle) * maxDist;
    }

    setPosition({ x, y });

    // Normalize vector -1 to 1
    const normX = x / maxDist;
    const normY = y / maxDist;
    const angleRad = Math.atan2(normY, normX);

    onMove({ x: normX, y: normY, angle: angleRad, active: true });
  };

  const handleEnd = () => {
    setActive(false);
    setPosition({ x: 0, y: 0 });
    onMove({ x: 0, y: 0, angle: 0, active: false });
  };

  // Mouse Listeners
  const onMouseDown = (e: React.MouseEvent) => handleStart(e.clientX, e.clientY);
  const onMouseMove = (e: MouseEvent) => {
    if (active) handleMove(e.clientX, e.clientY, origin.x, origin.y);
  };
  const onMouseUp = () => {
    if (active) handleEnd();
  };

  // Touch Listeners
  const onTouchStart = (e: React.TouchEvent) => {
    // Prevent scrolling
    // e.preventDefault();
    const touch = e.changedTouches[0];
    handleStart(touch.clientX, touch.clientY);
  };

  const onTouchMove = (e: TouchEvent) => {
      if (!active) return;
      // e.preventDefault(); // Passive listener issue if checked here, managed globally in css
      // Find the touch that started this joystick
      for(let i=0; i< e.changedTouches.length; i++) {
          // Simple check: if we are handling single touch per joystick area
          const touch = e.changedTouches[i];
          // Heuristic: check if touch is roughly near the joystick or if we track ID (skipping ID track for simplicity)
          handleMove(touch.clientX, touch.clientY, origin.x, origin.y);
      }
  };

  useEffect(() => {
    if (active) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('touchmove', onTouchMove);
      window.addEventListener('touchend', handleEnd);
    }

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [active, origin]); // Re-bind if active changes

  return (
    <div
      ref={wrapperRef}
      className={`relative rounded-full border-2 border-white/20 backdrop-blur-sm ${className}`}
      style={{ width: size, height: size, backgroundColor: 'rgba(0,0,0,0.3)' }}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
    >
      {/* Knob */}
      <div
        className="absolute rounded-full pointer-events-none shadow-[0_0_15px_rgba(0,243,255,0.5)]"
        style={{
          width: size / 2.5,
          height: size / 2.5,
          backgroundColor: active ? '#00f3ff' : 'rgba(255,255,255,0.5)',
          left: '50%',
          top: '50%',
          transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
          transition: active ? 'none' : 'transform 0.2s ease-out',
        }}
      />
    </div>
  );
};