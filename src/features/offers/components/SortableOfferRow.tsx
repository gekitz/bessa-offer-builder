import type { ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

interface SortableOfferRowProps {
  id: string;
  children: ReactNode;
}

export default function SortableOfferRow({ id, children }: SortableOfferRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex items-center">
      <button
        {...attributes}
        {...listeners}
        className="flex-shrink-0 touch-none px-2 py-2.5 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing"
      >
        <GripVertical size={14} />
      </button>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
