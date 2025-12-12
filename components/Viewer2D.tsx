import React from 'react';
import { BlueprintAnalysis } from '../types';
import { ZoomIn } from 'lucide-react';

interface Viewer2DProps {
  data: BlueprintAnalysis;
  imageUrl: string | null;
  highlightedRoomId: string | null;
  setHighlightedRoomId: (id: string | null) => void;
}

const Viewer2D: React.FC<Viewer2DProps> = ({ data, imageUrl, highlightedRoomId, setHighlightedRoomId }) => {
  return (
    <div className="w-full h-full bg-slate-950 relative overflow-hidden flex flex-col border-r border-slate-800">
       {/* Header / Toolbar */}
       <div className="absolute top-4 left-4 z-10 flex gap-2">
            <div className="px-3 py-1 bg-slate-800/90 backdrop-blur rounded border border-slate-700 text-xs font-mono text-cyan-400 shadow-lg flex items-center gap-2">
                <ZoomIn size={12} />
                2D Blueprint
            </div>
       </div>

       <div className="absolute bottom-4 left-4 z-10 pointer-events-none">
            <div className="text-[10px] text-slate-500 flex flex-col gap-1 drop-shadow-md">
                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full border border-cyan-400"></span> Select Room</div>
            </div>
       </div>

       {/* SVG Canvas */}
       <div className="flex-1 p-4 flex items-center justify-center bg-slate-900/50 overflow-hidden relative">
         <svg 
            viewBox="0 0 100 100" 
            preserveAspectRatio="xMidYMid meet"
            className="w-full h-full max-w-full max-h-full drop-shadow-2xl" 
            style={{ 
                width: '100%',
                height: '100%',
                display: 'block'
            }}
         >
            {/* 1. Original Blueprint Image as Background */}
            {imageUrl && (
                <image 
                    href={imageUrl} 
                    x="0" 
                    y="0" 
                    width="100" 
                    height="100" 
                    preserveAspectRatio="none" 
                    style={{ opacity: 0.9 }}
                />
            )}

            {/* 2. Interactive Room Overlays (Invisible unless highlighted) */}
            {data.rooms?.map((room) => {
               // Safety: Check if polygon and center exist
               if (!room.polygon || room.polygon.length === 0 || !room.center) return null;
               
               // Safely construct points string, filtering undefined points
               const pointsStr = room.polygon
                 .filter(p => p && typeof p.x === 'number' && typeof p.y === 'number')
                 .map(p => `${p.x},${p.y}`)
                 .join(' ');
                 
               if (!pointsStr) return null;

               const isHighlighted = highlightedRoomId === room.id;

               return (
                   <g 
                    key={room.id} 
                    onClick={(e) => { e.stopPropagation(); setHighlightedRoomId(room.id); }} 
                    className="cursor-pointer transition-all duration-300"
                   >
                      <polygon 
                         points={pointsStr}
                         fill={isHighlighted ? '#06b6d4' : 'transparent'}
                         fillOpacity={isHighlighted ? 0.4 : 0}
                         stroke={isHighlighted ? '#22d3ee' : 'transparent'}
                         strokeWidth={isHighlighted ? "0.5" : "0"}
                         className="transition-all duration-200 hover:fill-cyan-500/20 hover:stroke-cyan-500/30 hover:stroke-[0.2]"
                      />
                      
                      {/* Room Label - Visible only when highlighted to keep drawing clean */}
                      {isHighlighted && (
                          <foreignObject x={room.center.x - 10} y={room.center.y - 5} width="20" height="10" className="pointer-events-none overflow-visible">
                              <div className="flex flex-col items-center justify-center text-center scale-125 transition-transform">
                                <span className="text-[3px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] leading-none">{room.name}</span>
                              </div>
                          </foreignObject>
                      )}
                   </g>
               );
            })}
         </svg>
       </div>
    </div>
  );
}

export default Viewer2D;