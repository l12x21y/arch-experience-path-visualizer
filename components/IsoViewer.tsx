import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text, Grid, Line } from '@react-three/drei';
import * as THREE from 'three';
import { PathNode } from '../types';
import { downloadHtmlExport } from '../services/exportService';

// Helper to interpolate colors (Grayscale)
const getGradientColor = (t: number) => {
  const c1 = new THREE.Color('#cccccc'); 
  const c2 = new THREE.Color('#000000'); 
  return c1.lerp(c2, t);
};

interface IsoViewerProps {
  nodes: PathNode[];
  onNodeHover?: (nodeId: string | null) => void;
  onNodeClick?: (nodeId: string) => void;
  selectedNodeId?: string | null;
  // New props for presentation mode
  isPresentationMode?: boolean;
  onTogglePresentation?: (active: boolean) => void;
  transparent?: boolean; // For overlay mode
}

// --- Visual Effects ---

const PulseRing = () => {
  const ref = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (ref.current) {
        const speed = 1.5;
        const t = (state.clock.elapsedTime * speed) % 1;
        ref.current.scale.setScalar(1 + t * 2);
        const opacity = Math.max(0, 0.8 * (1 - t));
        (ref.current.material as THREE.MeshBasicMaterial).opacity = opacity;
    }
  });

  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.2, 0.25, 32]} />
        <meshBasicMaterial color="#000000" transparent side={THREE.DoubleSide} />
    </mesh>
  );
};

// --- Controllers ---

// Adjusts camera zoom based on mode
const CameraAdjuster: React.FC<{ isPresentationMode: boolean }> = ({ isPresentationMode }) => {
    const { camera } = useThree();
    
    useEffect(() => {
        // Zoom out significantly in presentation mode to fit the curve in the small box without clipping
        // Zoom in for normal editing mode
        const targetZoom = isPresentationMode ? 12 : 30;
        
        // We cast to OrthographicCamera to access zoom property safely
        if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
            (camera as THREE.OrthographicCamera).zoom = targetZoom;
            camera.updateProjectionMatrix();
        }
    }, [isPresentationMode, camera]);

    return null;
}

const CameraController: React.FC<{ selectedNodeId: string | null; nodes: PathNode[] }> = ({ selectedNodeId, nodes }) => {
  const { controls } = useThree();
  const targetVec = useRef(new THREE.Vector3(0, 0, 0));

  useFrame((state, delta) => {
    // @ts-ignore
    if (!controls) return;

    if (selectedNodeId) {
      const node = nodes.find(n => n.id === selectedNodeId);
      if (node) {
        const scale = 0.1;
        const offset = 5;
        const levelHeight = 2.0;
        
        const x = (node.x * scale) - offset;
        const y = (node.level || 0) * levelHeight;
        const h = node.intensity * 0.1;
        const z = (node.y * scale) - offset;

        targetVec.current.set(x, y + h / 2, z);
      }
    }

    // @ts-ignore
    controls.target.lerp(targetVec.current, delta * 3);
    // @ts-ignore
    controls.update();
  });

  return null;
};

// Handles the animation of the buildProgress state
// MODIFIED: Speed is now dependent on the "terrain" (intensity changes)
const BuildAnimationController: React.FC<{ 
    isBuilding: boolean; 
    setBuildProgress: (v: number) => void; 
    onComplete: () => void;
    nodes: PathNode[];
    progress: number;
}> = ({ isBuilding, setBuildProgress, onComplete, nodes, progress }) => {
    useFrame((state, delta) => {
        if (isBuilding) {
            setBuildProgress((prev) => {
                if (nodes.length < 2) return 1;

                // 1. Calculate current index based on progress
                const totalSegments = nodes.length - 1;
                const currentFloatIndex = prev * totalSegments;
                const idx = Math.floor(currentFloatIndex);
                const nextIdx = Math.min(nodes.length - 1, idx + 1);

                // 2. Calculate volatility (difference in intensity)
                const currentIntensity = nodes[idx].intensity;
                const nextIntensity = nodes[nextIdx].intensity;
                const diff = Math.abs(nextIntensity - currentIntensity);

                // 3. Dynamic Speed Formula
                // UPDATED: Much faster base speed (0.8 instead of 0.2)
                // Lower volatility factor (0.015) so it doesn't slow down too much on hills
                const volatilityFactor = 0.015; 
                const baseSpeed = 0.8; 
                const dynamicSpeed = baseSpeed / (1 + diff * volatilityFactor);

                const next = prev + delta * dynamicSpeed;
                
                if (next >= 1) {
                    onComplete();
                    return 1;
                }
                return next;
            });
        }
    });
    return null;
}

// --- Scene Components ---

const ExperienceCurves: React.FC<{ nodes: PathNode[]; progress: number }> = ({ nodes, progress }) => {
  const { intensityPoints, basePoints, colors } = useMemo(() => {
    if (nodes.length < 2) return { intensityPoints: [], basePoints: [], colors: [] };

    const scale = 0.1;
    const offset = 5;
    const levelHeight = 2.0; 

    const points3D = nodes.map(n => new THREE.Vector3(
      (n.x * scale) - offset,
      (n.level || 0) * levelHeight, 
      (n.y * scale) - offset
    ));
    
    const curve = new THREE.CatmullRomCurve3(points3D, false, 'catmullrom', 0.2);
    const samples = 200;
    const curvePoints = curve.getPoints(samples);
    
    const iPoints: THREE.Vector3[] = [];
    const bPoints: THREE.Vector3[] = [];
    const colArray: [number, number, number][] = [];

    for (let i = 0; i < curvePoints.length; i++) {
      const pt = curvePoints[i];
      const p = i / (curvePoints.length - 1); 
      
      const nodeIndexFloat = p * (nodes.length - 1);
      const idx1 = Math.floor(nodeIndexFloat);
      const idx2 = Math.min(nodes.length - 1, Math.ceil(nodeIndexFloat));
      const alpha = nodeIndexFloat - idx1;
      
      const intensity1 = nodes[idx1].intensity;
      const intensity2 = nodes[idx2].intensity;
      const interpolatedIntensity = (intensity1 * (1 - alpha) + intensity2 * alpha);

      const experienceHeight = interpolatedIntensity * 0.1;

      bPoints.push(pt.clone());
      iPoints.push(new THREE.Vector3(pt.x, pt.y + experienceHeight, pt.z));

      const color = getGradientColor(interpolatedIntensity / 100);
      colArray.push([color.r, color.g, color.b]); 
    }

    return { intensityPoints: iPoints, basePoints: bPoints, colors: colArray };

  }, [nodes]);

  if (!intensityPoints.length) return null;

  // Slicing arrays based on progress
  const visibleCount = Math.floor(intensityPoints.length * progress);
  // Ensure at least 2 points so Line doesn't crash, unless 0
  if (visibleCount < 2) return null;

  const visibleIntensityPoints = intensityPoints.slice(0, visibleCount);
  const visibleBasePoints = basePoints.slice(0, visibleCount);
  const visibleColors = colors.slice(0, visibleCount);

  return (
    <group>
        <Line 
            points={visibleBasePoints} 
            color="#999" 
            lineWidth={1} 
            transparent 
            opacity={0.4} 
            dashed 
            dashScale={5}
        />
        <Line 
            points={visibleIntensityPoints} 
            vertexColors={visibleColors} 
            lineWidth={3} 
        />
    </group>
  );
};

const Marker: React.FC<{ 
    node: PathNode; 
    index: number; 
    onHover: (id: string | null) => void;
    onClick?: (id: string) => void;
    isSelected: boolean;
    isVisible: boolean;
}> = ({ node, index, onHover, onClick, isSelected, isVisible }) => {
  const [hovered, setHovered] = useState(false);
  const meshRef = useRef<THREE.Group>(null);
  
  const scale = 0.1;
  const offset = 5;
  const levelHeight = 2.0;

  const x = (node.x * scale) - offset;
  const z = (node.y * scale) - offset;
  const y = (node.level || 0) * levelHeight;
  const h = node.intensity * 0.1;

  const isActive = hovered || isSelected;
  const color = useMemo(() => getGradientColor(node.intensity / 100), [node.intensity]);

  useFrame((state, delta) => {
    if (meshRef.current) {
        // Build Animation: Scale from 0 to 1 if visible, else 0
        const targetBaseScale = isVisible ? 1 : 0;
        
        // Hover Animation: If visible and active, scale up slightly more
        const hoverScale = (isVisible && isActive) ? 1.8 : 1;

        // Apply
        const currentScale = meshRef.current.scale.x; // Assumes uniform scaling
        const target = targetBaseScale * hoverScale; // Logic: if hidden (0), hover doesn't matter
        
        // Smooth lerp
        // If we are just appearing (current near 0), snap faster for "pop" effect
        const speed = currentScale < 0.1 ? 10 : 15;
        
        const nextScale = THREE.MathUtils.lerp(currentScale, target, delta * speed);
        meshRef.current.scale.setScalar(nextScale);
    }
  });

  const handlePointerOver = (e: any) => {
    if (!isVisible) return;
    e.stopPropagation();
    setHovered(true);
    onHover(node.id);
  };

  const handlePointerOut = (e: any) => {
    setHovered(false);
    onHover(null);
  };

  const handleClick = (e: any) => {
    if (!isVisible) return;
    e.stopPropagation();
    if (onClick) onClick(node.id);
  }

  return (
    <group position={[x, y, z]} ref={meshRef} scale={[0,0,0]}>
      {/* Ground Shadow/Base */}
      <mesh>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshBasicMaterial color="#ccc" />
      </mesh>
      
      {/* Vertical Stem */}
      <mesh position={[0, h/2, 0]}>
        <cylinderGeometry args={[0.015, 0.015, h, 8]} />
        <meshBasicMaterial color="#999" />
      </mesh>

      {/* Interactive Top Sphere */}
      <mesh 
        position={[0, h, 0]}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        <sphereGeometry args={[0.15, 32, 32]} />
        <meshStandardMaterial 
            color={color} 
            emissive={color} 
            emissiveIntensity={isActive ? 0.8 : 0} 
            toneMapped={false}
        />
      </mesh>

      {/* Ripple Effect when Selected */}
      {isSelected && (
          <group position={[0, h, 0]}>
              <PulseRing />
          </group>
      )}

      {/* Label */}
      <Text
        position={[0, h + 0.5 + (isActive ? 0.2 : 0), 0]}
        fontSize={isActive ? 0.4 : 0.2}
        fontWeight={isActive ? "bold" : "normal"}
        color={isActive ? "#000" : "#666"}
        anchorX="center"
        anchorY="middle"
        billboard
        renderOrder={100}
        depthTest={false}
      >
        {node.label || index + 1}
      </Text>
    </group>
  );
};

const NodeMarkers: React.FC<{ 
    nodes: PathNode[]; 
    onHover: (id: string | null) => void;
    onClick?: (id: string) => void;
    selectedNodeId?: string | null;
    progress: number;
}> = ({ nodes, onHover, onClick, selectedNodeId, progress }) => {
    return (
        <group>
            {nodes.map((n, i) => {
                // Logic: 
                // Total distance is 1.0.
                // Each node sits at a specific percentage along the path.
                // Simple approx: Node i is visible if progress >= i / (n-1)
                const threshold = i / Math.max(1, nodes.length - 1);
                // We add a tiny epsilon so index 0 is visible at progress > 0
                const isVisible = progress >= threshold - 0.05; 
                
                return (
                    <Marker 
                        key={n.id} 
                        node={n} 
                        index={i} 
                        onHover={onHover} 
                        onClick={onClick}
                        isSelected={selectedNodeId === n.id}
                        isVisible={isVisible}
                    />
                );
            })}
        </group>
    )
}

const IsoViewer: React.FC<IsoViewerProps> = ({ 
    nodes, 
    onNodeHover = () => {}, 
    onNodeClick, 
    selectedNodeId,
    isPresentationMode = false,
    onTogglePresentation,
    transparent = false
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Build Animation State
  const [buildProgress, setBuildProgress] = useState(1); // 1 = fully built by default
  const [isBuilding, setIsBuilding] = useState(false);

  // Sync internal playing state with prop if needed, or handle toggle logic
  // If we enter presentation mode, auto-start
  useEffect(() => {
    if (isPresentationMode && !isPlaying) {
        setIsPlaying(true);
        // Start from beginning if entering presentation
        if (nodes.length > 0 && onNodeClick) onNodeClick(nodes[0].id);
    }
  }, [isPresentationMode]);

  // Auto-Play Logic
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    if (isPlaying && onNodeClick && nodes.length > 0) {
      timeout = setTimeout(() => {
        const currentIndex = nodes.findIndex(n => n.id === selectedNodeId);
        
        // Loop Logic
        if (currentIndex === nodes.length - 1) {
            // End of loop
            if (isPresentationMode && onTogglePresentation) {
                // Exit presentation mode
                onTogglePresentation(false);
                setIsPlaying(false);
            } else {
                // Normal loop
                const nextIndex = 0;
                onNodeClick(nodes[nextIndex].id);
            }
        } else {
            // Next slide
            const nextIndex = (currentIndex + 1) % nodes.length;
            onNodeClick(nodes[nextIndex].id);
        }
      }, 3000); 
    }

    return () => clearTimeout(timeout);
  }, [isPlaying, selectedNodeId, nodes, onNodeClick, isPresentationMode, onTogglePresentation]);
  
  const handleCapture = () => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
        const image = canvas.toDataURL("image/png");
        const link = document.createElement("a");
        link.href = image;
        link.download = "archi-curve-view.png";
        link.click();
    }
  };

  const handleExportHtml = () => {
    if (nodes.length < 2) {
        alert("Please create a path with at least 2 points before exporting.");
        return;
    }
    downloadHtmlExport(nodes);
  }

  const handleTogglePlay = () => {
    const nextState = !isPlaying;
    
    // If we are starting play, we might want to enter presentation mode (if handled by parent)
    if (nextState && onTogglePresentation) {
        onTogglePresentation(true); 
    } else {
        // Fallback for standalone play without presentation mode
        if (nextState && !selectedNodeId && nodes.length > 0) {
             if (onNodeClick) onNodeClick(nodes[0].id);
        }
        setIsPlaying(nextState);
    }
    
    // If we start playing, ensure building is complete
    if (nextState) setBuildProgress(1);
  };

  const startBuild = () => {
      setIsPlaying(false); // Stop slideshow if running
      setBuildProgress(0); // Reset
      setIsBuilding(true); // Start animation
  };

  return (
    <div className={`w-full h-full relative ${transparent ? 'bg-transparent' : 'bg-white'}`}>
      {/* UI Controls - Hide in Presentation Mode (except maybe a hidden stop area?) */}
      {!isPresentationMode && (
          <div className="absolute top-4 right-4 z-10 text-neutral-800 text-right pointer-events-none flex flex-col items-end gap-3">
            <div>
                <h3 className="text-sm font-bold">3D ISO ANALYTICS</h3>
                <p className="text-xs font-normal text-neutral-500">Curve Height = Experience Intensity</p>
            </div>
            
            <div className="flex gap-2 pointer-events-auto">
                <button 
                    onClick={startBuild}
                    className="px-3 py-1 bg-black text-white text-[10px] uppercase font-bold tracking-widest hover:bg-neutral-800 transition-colors flex items-center gap-2"
                    title="Animate Path Construction"
                    disabled={isBuilding}
                >
                    {isBuilding ? 'Building...' : 'Construct'}
                </button>

                <button 
                    onClick={handleTogglePlay}
                    className={`px-3 py-1 text-[10px] uppercase font-bold tracking-widest transition-colors flex items-center gap-2 ${isPlaying ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-neutral-200 text-black hover:bg-neutral-300'}`}
                    title={isPlaying ? "Stop Auto-Play" : "Start Presentation Mode"}
                >
                    {isPlaying ? (
                        <>
                            <span>Stop</span>
                            <div className="w-2 h-2 bg-white"></div>
                        </>
                    ) : (
                        <>
                            <span>Play</span>
                            <div className="w-0 h-0 border-t-[4px] border-t-transparent border-l-[6px] border-l-black border-b-[4px] border-b-transparent"></div>
                        </>
                    )}
                </button>

                <button 
                    onClick={handleExportHtml}
                    className="px-3 py-1 bg-neutral-200 text-black text-[10px] uppercase font-bold tracking-widest hover:bg-neutral-300 transition-colors"
                    title="Download interactive HTML file"
                >
                    Export HTML
                </button>
                <button 
                    onClick={handleCapture}
                    className="px-3 py-1 bg-neutral-200 text-black text-[10px] uppercase font-bold tracking-widest hover:bg-neutral-300 transition-colors"
                    title="Save screenshot"
                >
                    Capture
                </button>
            </div>
          </div>
      )}

      <Canvas 
        shadows 
        // Increased frustum (far: 1000) to prevent clipping at edges
        camera={{ position: [20, 20, 20], zoom: 30, fov: 25, near: -200, far: 200 }} 
        orthographic
        gl={{ preserveDrawingBuffer: true, alpha: transparent }} 
      >
        {!transparent && <color attach="background" args={['#ffffff']} />}
        
        <ambientLight intensity={0.7} />
        <directionalLight position={[10, 20, 5]} intensity={0.8} castShadow />
        <pointLight position={[-10, 10, -10]} intensity={0.5} color="#white" />

        <CameraAdjuster isPresentationMode={isPresentationMode} />
        <CameraController selectedNodeId={selectedNodeId} nodes={nodes} />
        
        <BuildAnimationController 
            isBuilding={isBuilding} 
            setBuildProgress={setBuildProgress} 
            onComplete={() => setIsBuilding(false)}
            nodes={nodes}
            progress={buildProgress}
        />

        <group position={[0, -2, 0]}>
            {!transparent && (
                <Grid 
                    args={[20, 20]} 
                    cellSize={1} 
                    cellThickness={0.5} 
                    cellColor="#e5e5e5" 
                    sectionSize={5} 
                    sectionThickness={1}
                    sectionColor="#d4d4d4"
                    fadeDistance={40}
                    infiniteGrid
                />
            )}
            
            <ExperienceCurves nodes={nodes} progress={buildProgress} />
            <NodeMarkers 
                nodes={nodes} 
                onHover={onNodeHover} 
                onClick={onNodeClick} 
                selectedNodeId={selectedNodeId}
                progress={buildProgress}
            />
        </group>

        <OrbitControls makeDefault minZoom={1} maxZoom={100} enableDamping />
      </Canvas>
    </div>
  );
};

export default IsoViewer;