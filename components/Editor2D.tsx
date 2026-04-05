import React, { useRef, useState, useMemo } from 'react';
import { PathNode, PathVariation } from '../types';
import * as THREE from 'three';

interface Editor2DProps {
  nodes: PathNode[];
  setNodes?: (nodes: PathNode[]) => void; // Optional now for readOnly mode
  selectedNodeId?: string | null;
  setSelectedNodeId?: (id: string | null) => void;
  // New props for Generative Mode
  generatedVariations?: PathVariation[];
  activeVariationId?: string | null;
  onSelectVariation?: (id: string) => void;
  // New visual props
  readOnly?: boolean;
  minimal?: boolean; // Hides grid, text, etc for thumbnails
}

const Editor2D: React.FC<Editor2DProps> = ({ 
    nodes, 
    setNodes, 
    selectedNodeId, 
    setSelectedNodeId,
    generatedVariations = [],
    activeVariationId = null,
    onSelectVariation,
    readOnly = false,
    minimal = false
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Convert 0-100 coords to SVG pixels (0-500)
  const toSvg = (val: number) => val * 5; 

  // Accurately map mouse client coordinates to SVG viewBox coordinates (0-500)
  const getSvgCoordinates = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    
    // Create a point in screen coordinates
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    
    // Transform to SVG coordinates using the Current Transformation Matrix (CTM)
    // This handles scaling, letterboxing (preserveAspectRatio), and positioning automatically
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    
    const svgPoint = point.matrixTransform(ctm.inverse());
    return { x: svgPoint.x, y: svgPoint.y };
  };

  // Convert SVG user units (0-500) to Node units (0-100)
  const toNodeCoord = (svgVal: number) => Math.min(100, Math.max(0, svgVal / 5));

  // --- Helper: Generate simple path string for variations ---
  const getPathString = (pathNodes: PathNode[]) => {
      if (pathNodes.length < 2) return '';
      const points = pathNodes.map(n => new THREE.Vector3(n.x, n.y, 0));
      const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.2);
      const curvePoints = curve.getPoints(100);
      let d = `M ${toSvg(curvePoints[0].x)} ${toSvg(curvePoints[0].y)}`;
      for (let i = 1; i < curvePoints.length; i++) {
          d += ` L ${toSvg(curvePoints[i].x)} ${toSvg(curvePoints[i].y)}`;
      }
      return d;
  }

  // --- Algorithmic Visualization Calculations (Main Path) ---
  
  const { segments, flowPathD, tangents, influenceZones } = useMemo(() => {
    // If we are previewing a variation (overlay mode), use its nodes
    // BUT if we are in readOnly/Thumbnail mode, 'nodes' prop is already the specific variation
    const currentNodes = (activeVariationId && generatedVariations.length > 0 && !readOnly)
        ? generatedVariations.find(v => v.id === activeVariationId)?.nodes || nodes
        : nodes;

    if (currentNodes.length < 2) {
        return { segments: [], flowPathD: '', tangents: [], influenceZones: [] };
    }

    // 1. Setup Curve (Using Three.js math for consistency with 3D view)
    const points = currentNodes.map(n => new THREE.Vector3(n.x, n.y, 0));
    // Use CatmullRom for smooth architectural curves
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.2);
    
    // 2. Generate Segments for Gradient & Thickness
    const samples = 200;
    const curvePoints = curve.getPoints(samples);
    const segs = [];
    let pathString = `M ${toSvg(curvePoints[0].x)} ${toSvg(curvePoints[0].y)}`;

    for (let i = 0; i < curvePoints.length - 1; i++) {
        const p1 = curvePoints[i];
        const p2 = curvePoints[i+1];
        
        // Calculate progress (0 to 1)
        const t = i / (curvePoints.length - 1);
        
        // Interpolate Intensity
        const nodeIndexFloat = t * (currentNodes.length - 1);
        const idx1 = Math.floor(nodeIndexFloat);
        const idx2 = Math.min(currentNodes.length - 1, Math.ceil(nodeIndexFloat));
        const alpha = nodeIndexFloat - idx1;
        
        const int1 = currentNodes[idx1].intensity;
        const int2 = currentNodes[idx2].intensity;
        const intensity = int1 * (1 - alpha) + int2 * alpha; // 0 to 100

        // Visual Mapping
        const lightness = 85 - (intensity / 100) * 85; 
        const color = `hsl(0, 0%, ${lightness}%)`;
        const baseThickness = minimal ? 2 : 1;
        const strokeWidth = baseThickness + (intensity / 100) * (minimal ? 5 : 3);

        segs.push({
            x1: toSvg(p1.x), y1: toSvg(p1.y),
            x2: toSvg(p2.x), y2: toSvg(p2.y),
            color,
            strokeWidth
        });

        pathString += ` L ${toSvg(p2.x)} ${toSvg(p2.y)}`;
    }

    // 3. Calculate Tangents & Influence Zones for Nodes
    const tans = [];
    const zones = [];

    for (let i = 0; i < currentNodes.length; i++) {
        const t = i / (currentNodes.length - 1);
        const tangent = curve.getTangentAt(t); 
        
        const tx = tangent.x * 25; 
        const ty = tangent.y * 25; 
        
        const nx = toSvg(currentNodes[i].x);
        const ny = toSvg(currentNodes[i].y);
        
        tans.push({
            x1: nx - tx, y1: ny - ty,
            x2: nx + tx, y2: ny + ty
        });

        const intensity = currentNodes[i].intensity;
        if (intensity > 5) {
            zones.push({
                x: nx,
                y: ny,
                r1: 8 + intensity * 0.3, 
                r2: 8 + intensity * 0.6,
                r3: 8 + intensity * 0.9,
                opacity: Math.min(1, intensity / 80)
            });
        }
    }

    return { 
        segments: segs, 
        flowPathD: pathString, 
        tangents: tans, 
        influenceZones: zones 
    };

  }, [nodes, generatedVariations, activeVariationId, readOnly, minimal]);


  // --- Event Handlers ---

  const handleSvgClick = (e: React.MouseEvent) => {
    if (readOnly) return;
    if (!setNodes || !setSelectedNodeId) return;

    // Disable creating new nodes if we are in generative mode (unless confirmed)
    if (generatedVariations.length > 0) return;

    if (isDragging || selectedNodeId) {
      if (selectedNodeId && !isDragging) {
         setSelectedNodeId(null);
      }
      return;
    }

    if (!svgRef.current) return;
    
    // Use proper Coordinate Transform (CTM)
    const { x: svgX, y: svgY } = getSvgCoordinates(e.clientX, e.clientY);
    const x = toNodeCoord(svgX);
    const y = toNodeCoord(svgY);

    const newNode: PathNode = {
      id: crypto.randomUUID(),
      x,
      y,
      level: 0, 
      intensity: 50,
      label: `Point ${nodes.length + 1}`
    };

    setNodes([...nodes, newNode]);
    setSelectedNodeId(newNode.id);
  };

  const updateNodePos = (id: string, clientX: number, clientY: number) => {
    if (!svgRef.current || !setNodes) return;
    
    // Use proper Coordinate Transform (CTM)
    const { x: svgX, y: svgY } = getSvgCoordinates(clientX, clientY);
    const x = toNodeCoord(svgX);
    const y = toNodeCoord(svgY);

    setNodes(nodes.map(n => n.id === id ? { ...n, x, y } : n));
  };

  const handleMouseDownNode = (e: React.MouseEvent, id: string) => {
    if (readOnly) return;
    if (!setSelectedNodeId) return;

    // Disable dragging in generative mode
    if (generatedVariations.length > 0) return;

    e.stopPropagation();
    setSelectedNodeId(id);
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (readOnly) return;
    if (isDragging && selectedNodeId) {
      updateNodePos(selectedNodeId, e.clientX, e.clientY);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Determine display nodes (Main or Preview)
  const displayNodes = (activeVariationId && generatedVariations.length > 0 && !readOnly)
    ? generatedVariations.find(v => v.id === activeVariationId)?.nodes || nodes
    : nodes;

  return (
    <div className={`relative w-full h-full flex flex-col items-center justify-center bg-white overflow-hidden ${!minimal ? 'border-r border-neutral-200' : ''}`}>
       
       {!minimal && (
           <div className="absolute top-4 left-4 z-10 pointer-events-none select-none">
            <h3 className="font-bold text-black text-sm mb-1 uppercase tracking-wider">Plan Algorithm</h3>
            <div className="text-[10px] text-neutral-500 space-y-1 font-mono">
                {generatedVariations.length > 0 ? (
                    <p className="text-black font-bold animate-pulse">GENERATIVE MODE ACTIVE</p>
                ) : (
                    <>
                        <p className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full border border-black bg-neutral-200"></span> 
                            <span>Intensity Field</span>
                        </p>
                        <p className="flex items-center gap-2">
                            <span className="w-2 h-0.5 bg-black"></span>
                            <span>Calculated Spline</span>
                        </p>
                    </>
                )}
            </div>
            </div>
        )}
      
      {/* Legend / Tech Info */}
      {!minimal && (
        <div className="absolute bottom-4 right-4 z-10 pointer-events-none text-right select-none">
            <p className="text-[9px] text-neutral-400 font-mono uppercase leading-tight">
                Spline: Catmull-Rom (t=0.2)<br/>
                Resolution: 200 Samples<br/>
                Field: Radial Gradient
            </p>
        </div>
      )}

      <svg 
        ref={svgRef}
        width="500" // Keep internal coordinate system 500x500
        height="500" 
        viewBox="0 0 500 500" // This ensures it scales in any container size
        className={`bg-white touch-none select-none w-full h-full object-contain ${readOnly || generatedVariations.length > 0 ? 'cursor-default' : 'cursor-crosshair'}`}
        onClick={handleSvgClick}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
            border: minimal ? 'none' : '1px solid #f0f0f0'
        }}
      >
        <defs>
          <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#f5f5f5" strokeWidth="1"/>
          </pattern>
        </defs>
        
        {/* 1. Base Grid (Hide in minimal) */}
        {!minimal && <rect width="100%" height="100%" fill="url(#grid)" />}

        {/* --- MAIN RENDERING ENGINE --- */}
        
        {/* 2. Influence Zones */}
        {influenceZones.map((zone, i) => (
            <g key={`zone-${i}`} transform={`translate(${zone.x}, ${zone.y})`} className="pointer-events-none">
                <circle r={zone.r3} fill="none" stroke="#000" strokeOpacity={0.03 * zone.opacity} strokeWidth="1" strokeDasharray="2 2" />
                <circle r={zone.r2} fill="none" stroke="#000" strokeOpacity={0.06 * zone.opacity} strokeWidth="1" />
                {!minimal && <circle r={zone.r1} fill="none" stroke="#000" strokeOpacity={0.12 * zone.opacity} strokeWidth="1" />}
            </g>
        ))}

        {/* 3. Tangents (Hide in minimal) */}
        {!minimal && tangents.map((t, i) => (
            <line 
                key={`tan-${i}`} 
                x1={t.x1} y1={t.y1} 
                x2={t.x2} y2={t.y2} 
                stroke="#000" 
                strokeWidth="0.5" 
                strokeOpacity="0.25"
                strokeDasharray="4 2"
                className="pointer-events-none"
            />
        ))}

        {/* 4. Spline Segments */}
        {segments.map((seg, i) => (
            <line 
                key={`seg-${i}`}
                x1={seg.x1} y1={seg.y1}
                x2={seg.x2} y2={seg.y2}
                stroke={seg.color}
                strokeWidth={seg.strokeWidth}
                strokeLinecap="round"
                className="pointer-events-none"
            />
        ))}

        {/* 5. Flow Animation (Hide in minimal) */}
        {flowPathD && !minimal && (
            <path 
                d={flowPathD} 
                fill="none" 
                stroke="#000" 
                strokeWidth="1" 
                strokeDasharray="4 8"
                strokeOpacity="0.5"
                className="pointer-events-none"
            >
                <animate attributeName="stroke-dashoffset" from="24" to="0" dur="1.5s" repeatCount="indefinite" />
            </path>
        )}

        {/* 6. Nodes */}
        {displayNodes.map((node, index) => {
          const isSelected = node.id === selectedNodeId && !readOnly;
          const grayVal = Math.max(0, 100 - node.intensity);
          const color = `hsl(0, 0%, ${grayVal}%)`; 
          const radius = isSelected ? 8 : (minimal ? 8 : 5);

          return (
            <g key={node.id} transform={`translate(${toSvg(node.x)}, ${toSvg(node.y)})`}>
               {isSelected && generatedVariations.length === 0 && (
                 <>
                    <circle r="18" fill="none" stroke="#000" strokeWidth="0.5" strokeOpacity="0.2" className="animate-pulse" />
                    <circle r="12" fill="none" stroke="#000" strokeWidth="1" />
                 </>
               )}
              
              <circle 
                r={radius} 
                fill={color} 
                stroke="#000" 
                strokeWidth={isSelected ? 2 : 1.5}
                className={`${readOnly || generatedVariations.length > 0 ? 'cursor-default' : 'cursor-pointer'} transition-all duration-200`}
                onMouseDown={(e) => handleMouseDownNode(e, node.id)}
              />
              
              {!minimal && (
                <text 
                    y="-15" 
                    textAnchor="middle" 
                    fill="#000" 
                    fontSize="9" 
                    fontWeight="600" 
                    className="pointer-events-none select-none font-mono tracking-tight bg-white"
                    style={{ textShadow: '0 0 4px white, 0 0 4px white' }}
                >
                    {index + 1}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default Editor2D;