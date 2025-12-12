import React, { useState, useRef, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html, Center, PerspectiveCamera, Environment, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { BlueprintAnalysis, Wall, Room, Door, Point2D } from '../types';
import { RotateCcw, Undo2, MousePointer2 } from 'lucide-react';

// Fix for missing JSX.IntrinsicElements in this environment
declare global {
  namespace JSX {
    interface IntrinsicElements {
      group: any;
      mesh: any;
      cylinderGeometry: any;
      meshStandardMaterial: any;
      sphereGeometry: any;
      shapeGeometry: any;
      ambientLight: any;
      directionalLight: any;
      planeGeometry: any;
      gridHelper: any;
      boxGeometry: any;
      extrudeGeometry: any;
    }
  }
  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        group: any;
        mesh: any;
        cylinderGeometry: any;
        meshStandardMaterial: any;
        sphereGeometry: any;
        shapeGeometry: any;
        ambientLight: any;
        directionalLight: any;
        planeGeometry: any;
        gridHelper: any;
        boxGeometry: any;
        extrudeGeometry: any;
      }
    }
  }
}

// --- Helper Functions ---
// Map 0-100 (2D Grid) to -25 to 25 (3D World)
const mapCoord = (val: number) => {
    if (typeof val !== 'number' || isNaN(val)) return 0;
    return (val - 50) / 2;
};

// --- Sub-Components ---

// 1. WALL SEGMENT
interface WallMeshProps {
  wall: Wall;
  doors?: Door[];
}

const WallSegment: React.FC<WallMeshProps> = ({ wall, doors }) => {
  if (!wall || !wall.start || !wall.end || 
      typeof wall.start.x !== 'number' || typeof wall.start.y !== 'number' || 
      typeof wall.end.x !== 'number' || typeof wall.end.y !== 'number') {
      return null;
  }

  // 1. Calculate Basis Vectors on Ground Plane (y=0)
  const start = new THREE.Vector3(mapCoord(wall.start.x), 0, mapCoord(wall.start.y));
  const end = new THREE.Vector3(mapCoord(wall.end.x), 0, mapCoord(wall.end.y));
  
  if (start.distanceToSquared(end) < 0.01) return null;

  const length = start.distanceTo(end);
  const height = 3.0; // Standard ceiling height
  // Determine thickness
  const thickness = wall.thickness ? Math.min(Math.max(wall.thickness / 5, 0.3), 1.0) : 0.5;

  // Calculate Rotation
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const angle = Math.atan2(dz, dx);

  // 2. Identify Doors on this Wall Segment
  const relevantDoors = useMemo(() => {
      if (!doors) return [];
      const line = new THREE.Line3(start, end);
      const closest = new THREE.Vector3();
      
      return doors.filter(door => {
          const doorPos = new THREE.Vector3(mapCoord(door.position.x), 0, mapCoord(door.position.y));
          // Check distance to line
          line.closestPointToPoint(doorPos, true, closest);
          const distToLine = closest.distanceTo(doorPos);
          
          if (distToLine > 1.0) return false; // Not on this wall line

          // Check if door is within the segment (not past ends)
          const distFromStart = closest.distanceTo(start);
          return distFromStart > 0.5 && distFromStart < (length - 0.5);
      }).map(door => ({
          ...door,
          distFromStart: start.distanceTo(new THREE.Vector3(mapCoord(door.position.x), 0, mapCoord(door.position.y)))
      }));
  }, [doors, start, end, length]);

  // 3. Create Elevation Shape (Side View)
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    // Draw Wall Profile: (0,0) is Bottom-Left of wall start
    s.moveTo(0, 0);
    s.lineTo(length, 0);
    s.lineTo(length, height);
    s.lineTo(0, height);
    s.closePath();

    // Subtract Holes for Doors
    relevantDoors.forEach(door => {
        const doorW = (door.width || 6) * 0.5;
        const doorH = 2.2; // Standard door height
        const doorLeft = door.distFromStart - doorW / 2;
        
        const hole = new THREE.Path();
        hole.moveTo(doorLeft, 0);
        hole.lineTo(doorLeft + doorW, 0);
        hole.lineTo(doorLeft + doorW, doorH);
        hole.lineTo(doorLeft, doorH);
        hole.closePath();
        s.holes.push(hole);
    });

    return s;
  }, [length, height, relevantDoors]);

  // 4. Extrude Settings with Bevels for smoother corners
  const extrudeSettings = useMemo(() => ({
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.02, // Subtle bevel
    bevelSize: 0.02,
    bevelSegments: 2, // Smooths the bevel
    steps: 1
  }), [thickness]);

  return (
    <group position={start} rotation={[0, -angle, 0]}>
        {/* 
            Geometry is created in XY plane (Elevation).
            Extrusion is along Z (Thickness).
            We need to center the extrusion on the wall line.
            Current Origin: Bottom-Left-Back corner of the wall.
            Correction: Shift Z by -thickness/2 to align with center line.
        */}
        <mesh position={[0, 0, -thickness/2]} castShadow receiveShadow>
             <extrudeGeometry args={[shape, extrudeSettings]} />
             <meshStandardMaterial color="#334155" roughness={0.5} metalness={0.1} />
        </mesh>
    </group>
  );
};

// 2. DOOR MESH
interface DoorMeshProps {
  door: Door;
}

const DoorMesh: React.FC<DoorMeshProps> = ({ door }) => {
  if (!door || !door.position || typeof door.position.x !== 'number' || typeof door.position.y !== 'number') return null;

  // Scale width: mapCoord scales input by 0.5. 
  const openingWidth = (door.width || 6) * 0.5; 
  const height = 2.2; 
  const leafThickness = 0.1;
  
  // Frame logic to cover wall intersection
  const frameDepth = 0.6; 
  const frameWidth = 0.1; // Thickness of the jamb material
  const casingWidth = 0.15; // Width of the trim on the wall face
  const casingDepth = 0.05; // How much the trim sticks out from the wall

  const rotationRad = (door.rotation || 0) * (Math.PI / 180);

  return (
    <group position={[mapCoord(door.position.x), 0, mapCoord(door.position.y)]} rotation={[0, -rotationRad, 0]}>
      
      {/* FRAME (Jambs + Header) - The part inside the wall opening */}
      {/* Left Jamb */}
      <mesh position={[-openingWidth/2 - frameWidth/2, height/2, 0]} castShadow receiveShadow>
        <boxGeometry args={[frameWidth, height, frameDepth]} />
        <meshStandardMaterial color="#334155" roughness={0.7} />
      </mesh>
      
      {/* Right Jamb */}
      <mesh position={[openingWidth/2 + frameWidth/2, height/2, 0]} castShadow receiveShadow>
        <boxGeometry args={[frameWidth, height, frameDepth]} />
        <meshStandardMaterial color="#334155" roughness={0.7} />
      </mesh>
      
      {/* Header */}
      <mesh position={[0, height + frameWidth/2, 0]} castShadow receiveShadow>
        <boxGeometry args={[openingWidth + frameWidth*2, frameWidth, frameDepth]} />
        <meshStandardMaterial color="#334155" roughness={0.7} />
      </mesh>

      {/* CASING (Trim) - Visual border on both sides of wall to hide gaps/seams */}
      {[-1, 1].map((side) => (
          <group key={side} position={[0, 0, side * (frameDepth/2 + casingDepth/2)]}>
             {/* Top Casing */}
             <mesh position={[0, height + frameWidth + casingWidth/2 - 0.05, 0]}>
                <boxGeometry args={[openingWidth + frameWidth*2 + casingWidth*2, casingWidth, casingDepth]} />
                <meshStandardMaterial color="#475569" />
             </mesh>
             {/* Left Leg Casing */}
             <mesh position={[-openingWidth/2 - frameWidth - casingWidth/2 + 0.05, height/2, 0]}>
                <boxGeometry args={[casingWidth, height, casingDepth]} />
                <meshStandardMaterial color="#475569" />
             </mesh>
             {/* Right Leg Casing */}
             <mesh position={[openingWidth/2 + frameWidth + casingWidth/2 - 0.05, height/2, 0]}>
                <boxGeometry args={[casingWidth, height, casingDepth]} />
                <meshStandardMaterial color="#475569" />
             </mesh>
          </group>
      ))}

      {/* DOOR LEAF */}
      <group position={[0, height/2, 0]}>
          <RoundedBox args={[openingWidth, height - 0.02, leafThickness]} radius={0.02} smoothness={4} castShadow receiveShadow>
            <meshStandardMaterial color="#854d0e" roughness={0.6} />
          </RoundedBox>
          
          {/* Handle/Knob */}
          <group position={[openingWidth * 0.35, 0, leafThickness/2 + 0.04]}>
            <mesh>
               <sphereGeometry args={[0.06, 16, 16]} />
               <meshStandardMaterial color="#fbbf24" metalness={0.7} roughness={0.2} />
            </mesh>
            {/* Back handle */}
            <mesh position={[0, 0, -leafThickness - 0.08]}>
               <sphereGeometry args={[0.06, 16, 16]} />
               <meshStandardMaterial color="#fbbf24" metalness={0.7} roughness={0.2} />
            </mesh>
          </group>
      </group>
    </group>
  );
};

// 3. ROOM FLOOR
interface RoomFloorProps { 
  room: Room; 
  isHighlighted: boolean;
  onClick: (id: string) => void;
}

const RoomFloor: React.FC<RoomFloorProps> = ({ 
  room, 
  isHighlighted, 
  onClick 
}) => {
  const shape = useMemo(() => {
      const s = new THREE.Shape();
      const validPoints = room.polygon?.filter(p => p && typeof p.x === 'number' && !isNaN(p.x) && typeof p.y === 'number' && !isNaN(p.y)) || [];
      
      if (validPoints.length < 3) return null;

      // Draw Floor Profile in 2D
      s.moveTo(mapCoord(validPoints[0].x), -mapCoord(validPoints[0].y));
      for (let i = 1; i < validPoints.length; i++) {
        s.lineTo(mapCoord(validPoints[i].x), -mapCoord(validPoints[i].y));
      }
      s.closePath();
      return s;
  }, [room.polygon]);

  const extrudeSettings = useMemo(() => ({
    depth: 0.1, // Create a physical slab
    bevelEnabled: false
  }), []);

  if (!shape) return null;
  if (!room.center || typeof room.center.x !== 'number' || typeof room.center.y !== 'number') return null;

  return (
    <group>
      {/* Floor Mesh - Extruded Slab */}
      <mesh 
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[0, -0.1, 0]} // Align top of slab to y=0
        onClick={(e) => {
            e.stopPropagation();
            onClick(room.id);
        }}
        onPointerOver={() => document.body.style.cursor = 'pointer'}
        onPointerOut={() => document.body.style.cursor = 'auto'}
        receiveShadow
      >
        <extrudeGeometry args={[shape, extrudeSettings]} />
        <meshStandardMaterial 
            color={isHighlighted ? "#06b6d4" : "#1e293b"} 
            opacity={isHighlighted ? 0.9 : 1}
            transparent={isHighlighted}
            emissive={isHighlighted ? "#06b6d4" : "#000000"}
            emissiveIntensity={isHighlighted ? 0.3 : 0}
            roughness={0.8}
            side={THREE.DoubleSide}
        />
      </mesh>

      {/* Room Label */}
      <Html position={[mapCoord(room.center.x), 2.5, mapCoord(room.center.y)]} center zIndexRange={[100, 0]}>
         <div 
            className={`px-3 py-1.5 rounded-lg shadow-xl backdrop-blur-md text-xs font-bold transition-all cursor-pointer select-none ${isHighlighted ? 'bg-cyan-500/90 text-white scale-110' : 'bg-slate-900/60 text-slate-200 border border-slate-700/50 hover:bg-slate-800/80'}`}
            onClick={(e) => {
                e.stopPropagation();
                onClick(room.id);
            }}
         >
            {room.name}
            <div className="text-[9px] opacity-75 font-normal tracking-wider">{Math.round(room.areaSqFt)} SQFT</div>
         </div>
      </Html>
    </group>
  );
};

// --- Main Viewer Component ---

interface Viewer3DProps {
  data: BlueprintAnalysis;
  highlightedRoomId: string | null;
  setHighlightedRoomId: (id: string | null) => void;
}

const SceneContent = ({ data, highlightedRoomId, setHighlightedRoomId }: Viewer3DProps) => {
    return (
        <>
            <ambientLight intensity={0.5} />
            <directionalLight 
                position={[20, 50, 30]} 
                intensity={1.5} 
                castShadow 
                shadow-mapSize={[2048, 2048]} 
                shadow-bias={-0.0001}
            />
            <Environment preset="city" />
            
            <group scale={[1, 1, 1]}>
                {/* Ground Plane */}
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.101, 0]} receiveShadow>
                    <planeGeometry args={[150, 150]} />
                    <meshStandardMaterial color="#0b1221" roughness={0.9} />
                    <gridHelper args={[150, 75, 0x1e293b, 0x0f172a]} rotation={[-Math.PI/2, 0, 0]} />
                </mesh>

                {/* 1. Walls - Pass doors for hole cutting */}
                {data.walls?.map((wall, i) => (
                    <WallSegment key={wall.id || `w-${i}`} wall={wall} doors={data.doors} />
                ))}
                
                {/* 2. Doors */}
                {data.doors?.map((door, i) => (
                    <DoorMesh key={door.id || `d-${i}`} door={door} />
                ))}

                {/* 3. Rooms */}
                {data.rooms?.map((room, i) => (
                    <RoomFloor 
                        key={room.id || `r-${i}`} 
                        room={room} 
                        isHighlighted={highlightedRoomId === room.id}
                        onClick={setHighlightedRoomId}
                    />
                ))}
            </group>
        </>
    );
};


const Viewer3D: React.FC<Viewer3DProps> = ({ data, highlightedRoomId, setHighlightedRoomId }) => {
    const controlsRef = useRef<any>(null);
    const [cameraPosition, setCameraPosition] = useState<[number, number, number]>([0, 80, 40]);
    const [history, setHistory] = useState<[number, number, number][]>([]);

    const handleReset = () => {
        setHighlightedRoomId(null);
        if (controlsRef.current) {
            controlsRef.current.reset();
            const camera = controlsRef.current.object;
            if (camera) {
                camera.position.set(0, 80, 40);
                camera.lookAt(0, 0, 0);
            }
            controlsRef.current.target.set(0, 0, 0);
            controlsRef.current.update();
        }
    };

    const handleUndo = () => {
        if(history.length > 0) {
            const prev = history[history.length - 1];
            setCameraPosition(prev);
            setHistory(prevHist => prevHist.slice(0, -1));
        }
    };
    
    const saveView = () => {
       // Placeholder for view history logic
    };

    return (
        <div className="w-full h-full relative bg-slate-950">
            {/* Toolbar */}
            <div className="absolute top-4 left-4 z-10 flex gap-2">
                <button 
                    onClick={handleReset}
                    className="p-2 bg-slate-800 text-white rounded hover:bg-slate-700 border border-slate-600 shadow-lg flex items-center gap-2 text-sm"
                    title="Reset Camera & Selection"
                >
                    <RotateCcw size={16} /> Reset View
                </button>
                <button 
                    onClick={handleUndo}
                    className="p-2 bg-slate-800 text-white rounded hover:bg-slate-700 border border-slate-600 shadow-lg flex items-center gap-2 text-sm opacity-50 cursor-not-allowed" 
                    title="Undo View (Mock)"
                >
                    <Undo2 size={16} /> Undo
                </button>
            </div>

            <div className="absolute top-4 right-4 z-10">
                <div className="glass-panel px-4 py-2 rounded-full text-xs text-cyan-400 font-mono flex items-center gap-2 border border-cyan-900/30 shadow-[0_0_15px_rgba(6,182,212,0.1)]">
                    <MousePointer2 size={12} />
                    <span>Click Room Label to Highlight</span>
                </div>
            </div>

            <Canvas shadows dpr={[1, 2]}>
                <PerspectiveCamera makeDefault position={cameraPosition} fov={45} />
                <OrbitControls 
                    ref={controlsRef} 
                    maxPolarAngle={Math.PI / 2.1} 
                    minDistance={10}
                    maxDistance={150}
                    onEnd={saveView}
                    enableDamping
                    dampingFactor={0.05}
                />
                <Center>
                    <SceneContent 
                        data={data} 
                        highlightedRoomId={highlightedRoomId} 
                        setHighlightedRoomId={setHighlightedRoomId} 
                    />
                </Center>
            </Canvas>
        </div>
    );
};

export default Viewer3D;