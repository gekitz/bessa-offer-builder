import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export interface SignaturePadHandle {
  clear(): void;
  toDataURL(): string;
  isEmpty(): boolean;
}

interface SignaturePadProps {
  width?: number;
  height?: number;
}

const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(function SignaturePad(
  { width = 400, height = 150 },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const empty = useRef(true);

  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const t = 'touches' in e ? e.touches[0]! : (e as React.MouseEvent);
    return {
      x: (t.clientX - rect.left) * (canvas.width / rect.width),
      y: (t.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function begin(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    drawing.current = true;
    empty.current = false;
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function move(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = getPos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function end() {
    drawing.current = false;
  }

  useEffect(() => {
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1e293b';
  }, []);

  useImperativeHandle(ref, () => ({
    clear() {
      const canvas = canvasRef.current!;
      canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
      empty.current = true;
    },
    toDataURL() {
      return canvasRef.current!.toDataURL('image/png');
    },
    isEmpty() {
      return empty.current;
    },
  }));

  return (
    <canvas
      ref={canvasRef}
      width={width * 2}
      height={height * 2}
      style={{
        width,
        height,
        border: '2px solid #e2e8f0',
        borderRadius: 12,
        background: '#fff',
        touchAction: 'none',
        cursor: 'crosshair',
      }}
      onMouseDown={begin}
      onMouseMove={move}
      onMouseUp={end}
      onMouseLeave={end}
      onTouchStart={begin}
      onTouchMove={move}
      onTouchEnd={end}
    />
  );
});

export default SignaturePad;
