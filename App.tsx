import React, { useState } from 'react';
import Editor2D from './components/Editor2D';
import IsoViewer from './components/IsoViewer';
import CustomCursor from './components/CustomCursor';
import { PathNode, PathVariation } from './types';
import { generateExperienceFromText } from './services/geminiService';

const DEFAULT_NODES: PathNode[] = [
  { id: '1', x: 20, y: 80, level: 0, intensity: 20, label: 'Entrance' },
  { id: '2', x: 40, y: 40, level: 0, intensity: 40, label: 'Corridor' },
  { id: '3', x: 60, y: 60, level: 1, intensity: 80, label: 'Main Hall' },
  { id: '4', x: 80, y: 20, level: 1, intensity: 30, label: 'Exit' },
];

type ViewMode = 'split' | '2d' | '3d';

function App() {
  const [nodes, setNodes] = useState<PathNode[]>(DEFAULT_NODES);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  
  // Drag State
  const [draggedNodeIndex, setDraggedNodeIndex] = useState<number | null>(null);

  // AI State
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Generative Path State
  const [pathVariations, setPathVariations] = useState<PathVariation[]>([]);
  const [activeVariationId, setActiveVariationId] = useState<string | null>(null);

  // Presentation Mode
  const [isPresentationMode, setIsPresentationMode] = useState(false);

  const updateNode = (id: string, changes: Partial<PathNode>) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, ...changes } : n));
  };

  const deleteNode = (id: string) => {
    setNodes(prev => prev.filter(n => n.id !== id));
    if (selectedNodeId === id) setSelectedNodeId(null);
  };

  const handleClear = () => {
    if (window.confirm("Clear all points?")) {
      setNodes([]);
      setSelectedNodeId(null);
      setPathVariations([]);
      setActiveVariationId(null);
    }
  };

  // --- Path Generation Algorithm ---
  const handleGenerateVariations = () => {
    if (nodes.length < 3) {
      alert("Need at least 3 points to generate path variations.");
      return;
    }

    const newVariations: PathVariation[] = [];
    // Generate 4 variations
    const names = ['Sequence A', 'Sequence B', 'Sequence C', 'Sequence D'];

    for (let i = 0; i < 4; i++) {
        // Randomized Nearest Neighbor Algorithm
        let availableIndices = nodes.map((_, idx) => idx);
        const pathIndices: number[] = [];

        // Variation 0 starts at 0, others random
        let currentIdx = (i === 0) ? 0 : Math.floor(Math.random() * availableIndices.length);
        
        pathIndices.push(availableIndices[currentIdx]);
        availableIndices.splice(currentIdx, 1); 

        // Greedy Walk
        while (availableIndices.length > 0) {
            const lastNode = nodes[pathIndices[pathIndices.length - 1]];

            const candidates = availableIndices.map((originalIdx) => {
                const n = nodes[originalIdx];
                const d = Math.hypot(n.x - lastNode.x, n.y - lastNode.y);
                return { originalIdx, d };
            });

            candidates.sort((a, b) => a.d - b.d);

            // K=3 Randomness window
            const poolSize = Math.min(3, candidates.length);
            const pick = Math.floor(Math.random() * poolSize);
            const chosen = candidates[pick];

            pathIndices.push(chosen.originalIdx);
            
            const idxToRemove = availableIndices.indexOf(chosen.originalIdx);
            availableIndices.splice(idxToRemove, 1);
        }

        newVariations.push({
            id: `var-${Date.now()}-${i}`,
            name: names[i],
            color: '#000', // Uniform color for gallery
            nodes: pathIndices.map(idx => nodes[idx])
        });
    }

    setPathVariations(newVariations);
    setActiveVariationId(newVariations[0].id);
    
    // Automatically switch to 2D or Split mode to see the gallery better
    if (viewMode === '3d') setViewMode('split');
  };

  const applyVariation = () => {
      const selectedVar = pathVariations.find(v => v.id === activeVariationId);
      if (selectedVar) {
          setNodes(selectedVar.nodes);
          // Clear generative mode
          setPathVariations([]);
          setActiveVariationId(null);
      }
  };

  const cancelGeneration = () => {
      setPathVariations([]);
      setActiveVariationId(null);
  };

  // Drag Handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedNodeIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault(); 
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedNodeIndex === null || draggedNodeIndex === targetIndex) return;
    const newNodes = [...nodes];
    const [movedNode] = newNodes.splice(draggedNodeIndex, 1);
    newNodes.splice(targetIndex, 0, movedNode);
    setNodes(newNodes);
    setDraggedNodeIndex(null);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, nodeId: string) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        updateNode(nodeId, { image: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (nodes.length < 2) {
      setAiError("Please draw a path with at least 2 points first.");
      return;
    }
    if (!prompt.trim()) {
      setAiError("Please describe the spatial experience.");
      return;
    }

    setAiError(null);
    setIsGenerating(true);

    const scenario = await generateExperienceFromText(prompt, nodes.length);
    
    if (scenario && scenario.nodes.length === nodes.length) {
      const newNodes = nodes.map((node, i) => ({
        ...node,
        intensity: scenario.nodes[i].intensity,
        label: scenario.nodes[i].description
      }));
      setNodes(newNodes);
    } else {
      setAiError("Failed to generate valid data. Please try again.");
    }

    setIsGenerating(false);
  };

  // Determine which node to show in the lightbox
  const activeNodeId = selectedNodeId;
  const activeNode = nodes.find(n => n.id === activeNodeId);
  const isGenerativeMode = pathVariations.length > 0;

  // --- PRESENTATION MODE RENDER ---
  if (isPresentationMode) {
      return (
          <div className="fixed inset-0 bg-black z-50 cursor-none overflow-hidden">
             {/* Background Image */}
             {activeNode?.image ? (
                 <div 
                    key={activeNode.id} // Key forces fade animation on switch
                    className="absolute inset-0 w-full h-full animate-in fade-in duration-1000"
                 >
                     <img 
                        src={activeNode.image} 
                        className="w-full h-full object-cover" 
                        alt="Presentation Background" 
                     />
                     {/* Removed Vignette Overlay to keep original image colors */}
                 </div>
             ) : (
                 <div className="absolute inset-0 w-full h-full bg-neutral-900 flex items-center justify-center">
                    <span className="text-neutral-700 text-xs tracking-[0.5em] uppercase">No Visual Signal</span>
                 </div>
             )}
             
             {/* Text Overlay */}
             {activeNode && (
                 <div className="absolute bottom-12 right-12 text-right max-w-lg animate-in slide-in-from-right-10 duration-700">
                     <h1 className="text-4xl font-light text-white tracking-tight mb-4 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                        {activeNode.label}
                     </h1>
                     <div className="h-0.5 w-16 bg-white ml-auto mb-4 opacity-50 shadow-sm"></div>
                 </div>
             )}

             {/* 3D Overlay - Bottom Left (Smaller, less obtrusive, closer to edge) */}
             <div className="absolute bottom-4 left-4 w-[280px] h-[280px] pointer-events-none animate-in fade-in zoom-in duration-1000">
                 <IsoViewer 
                    nodes={activeVariationId ? (pathVariations.find(v => v.id === activeVariationId)?.nodes || nodes) : nodes} 
                    selectedNodeId={selectedNodeId}
                    onNodeClick={setSelectedNodeId} 
                    isPresentationMode={true}
                    onTogglePresentation={setIsPresentationMode}
                    transparent={true}
                 />
             </div>
             
             {/* Exit Button (Hidden but clickable top right if needed, though loop exits automatically) */}
             <button 
                onClick={() => setIsPresentationMode(false)}
                className="absolute top-8 right-8 text-white/50 hover:text-white text-xs uppercase tracking-widest z-50 transition-colors drop-shadow-md"
             >
                Exit Preview
             </button>

             <CustomCursor />
          </div>
      )
  }

  // --- STANDARD MODE RENDER ---
  return (
    <div className="flex h-screen w-screen bg-white text-black font-sans overflow-hidden cursor-none">
      <CustomCursor />
      
      {/* Sidebar Controls - Hidden in 3D Mode */}
      <div className={`
        flex-shrink-0 border-r border-neutral-200 bg-white flex-col z-20 shadow-xl transition-all duration-300
        ${viewMode === '3d' ? 'hidden' : 'flex w-80'}
      `}>
        <div className="p-6 border-b border-neutral-200">
          <h1 className="text-xl font-bold tracking-wider text-black">ARCHI-CURVE</h1>
          <p className="text-xs text-neutral-500 mt-1 uppercase tracking-widest">Experience Visualizer</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-8 scrollbar-thin scrollbar-thumb-neutral-300">
          
          {/* GENERATIVE PATHING CONTROLS */}
          {isGenerativeMode ? (
             <div className="space-y-3 bg-blue-50 p-4 border border-blue-200 rounded animate-in slide-in-from-left-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xs font-bold text-blue-900 uppercase tracking-widest">Selection Mode</h2>
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                </div>
                <p className="text-[10px] text-blue-700 leading-tight">
                    Review the variations in the gallery below. Click a thumbnail to preview on the main canvas.
                </p>
                
                <div className="flex flex-col gap-2 pt-2">
                    <button 
                        onClick={applyVariation}
                        className="w-full py-3 bg-black text-white text-[10px] uppercase font-bold tracking-widest hover:bg-neutral-800 rounded shadow-lg"
                    >
                        Apply Selected Scheme
                    </button>
                    <button 
                        onClick={handleGenerateVariations}
                        className="w-full py-2 bg-white border border-neutral-300 text-black text-[10px] uppercase font-bold tracking-widest hover:bg-neutral-50 rounded"
                    >
                        Regenerate Options
                    </button>
                    <button 
                        onClick={cancelGeneration}
                        className="w-full py-2 text-neutral-500 text-[10px] uppercase font-bold tracking-widest hover:text-black rounded"
                    >
                        Cancel
                    </button>
                </div>
             </div>
          ) : (
            <div className="space-y-3">
                 <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
                    <h2 className="text-xs font-bold text-black uppercase tracking-widest">
                        Path Topology
                    </h2>
                 </div>
                 <button
                    onClick={handleGenerateVariations}
                    disabled={nodes.length < 3}
                    className="w-full py-2 border border-dashed border-neutral-300 text-neutral-500 hover:border-black hover:text-black rounded text-[10px] uppercase tracking-widest transition-all disabled:opacity-50"
                 >
                    ✨ Generate Path Options
                 </button>
                 <p className="text-[9px] text-neutral-400 italic px-1">
                    Randomly generates connecting paths based on point position instead of index order.
                 </p>
            </div>
          )}


          {/* Points List Section */}
          <div className={`space-y-3 ${isGenerativeMode ? 'opacity-30 pointer-events-none grayscale' : ''}`}>
            <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
              <h2 className="text-xs font-bold text-black uppercase tracking-widest">
                Path Points ({nodes.length})
              </h2>
              <span className="text-[10px] text-neutral-400">DRAG TO REORDER</span>
            </div>
            
            {nodes.length === 0 && (
               <div className="text-xs text-neutral-400 italic text-center py-4 border border-dashed border-neutral-200 rounded">
                  Click on the 2D grid to add points.
               </div>
            )}

            <div className="space-y-2">
              {nodes.map((node, index) => {
                const isSelected = node.id === selectedNodeId;
                const isDragging = draggedNodeIndex === index;

                return (
                  <div 
                    key={node.id} 
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    className={`rounded border transition-all duration-200 overflow-hidden ${
                      isSelected 
                      ? 'border-black bg-black text-white' 
                      : 'border-neutral-200 bg-white hover:border-neutral-400 text-black'
                    } ${isDragging ? 'opacity-30 border-dashed border-black' : 'opacity-100'}`}
                  >
                    {/* Summary Row */}
                    <div 
                      onClick={() => setSelectedNodeId(isSelected ? null : node.id)}
                      className="p-3 cursor-pointer flex items-center gap-3 select-none group"
                    >
                      <div className={`cursor-grab active:cursor-grabbing p-1 -ml-1 ${isSelected ? 'text-neutral-500 hover:text-white' : 'text-neutral-300 hover:text-black'}`}>
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M4 8h16v2H4zM4 14h16v2H4z" />
                        </svg>
                      </div>

                      <span className={`text-xs font-mono w-5 ${isSelected ? 'text-neutral-400' : 'text-neutral-400'}`}>
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium truncate ${isSelected ? 'text-white' : 'text-black'}`}>
                          {node.label || 'Untitled Point'}
                        </div>
                      </div>
                    </div>

                    {/* Detailed Editor (Restored) */}
                    {isSelected && (
                      <div className="px-3 pb-3 pt-1 border-t border-neutral-800/30 bg-neutral-900 text-white animate-in slide-in-from-top-2 duration-200 cursor-default">
                        
                        {/* Label Input */}
                        <div className="mb-3 mt-2">
                          <label className="text-[10px] uppercase text-neutral-500 font-bold mb-1 block">Label</label>
                          <input 
                            type="text" 
                            value={node.label || ''} 
                            onChange={(e) => updateNode(node.id, { label: e.target.value })}
                            className="w-full bg-black border border-neutral-700 rounded px-2 py-1.5 text-xs text-white focus:border-white outline-none transition-colors placeholder-neutral-700"
                            placeholder="Point Name"
                          />
                        </div>

                        {/* Image Upload */}
                        <div className="mb-3">
                           <label className="text-[10px] uppercase text-neutral-500 font-bold mb-1 block">Visual Reference</label>
                           <div className="flex items-center gap-2">
                             <input 
                                type="file" 
                                accept="image/*"
                                onChange={(e) => handleImageUpload(e, node.id)}
                                className="hidden"
                                id={`file-upload-${node.id}`}
                             />
                             <label 
                                htmlFor={`file-upload-${node.id}`}
                                className="cursor-pointer flex-1 py-1.5 bg-neutral-800 border border-dashed border-neutral-600 rounded text-center text-[10px] text-neutral-400 hover:text-white hover:border-white transition-all"
                             >
                                {node.image ? 'Change Image' : '+ Upload Image'}
                             </label>
                             {node.image && (
                               <div className="h-8 w-8 rounded border border-neutral-700 overflow-hidden bg-white">
                                 <img src={node.image} alt="preview" className="h-full w-full object-cover" />
                               </div>
                             )}
                           </div>
                        </div>

                        {/* Grid Inputs */}
                        <div className="grid grid-cols-2 gap-2 mb-3">
                           <div>
                              <label className="text-[10px] uppercase text-neutral-500 font-bold mb-1 block">X Pos</label>
                              <input 
                                type="number" 
                                min="0" max="100"
                                value={parseFloat(node.x.toFixed(1))} 
                                onChange={(e) => updateNode(node.id, { x: Number(e.target.value) })}
                                className="w-full bg-black border border-neutral-700 rounded px-2 py-1 text-xs text-white focus:border-white outline-none font-mono"
                              />
                           </div>
                           <div>
                              <label className="text-[10px] uppercase text-neutral-500 font-bold mb-1 block">Y Pos</label>
                              <input 
                                type="number" 
                                min="0" max="100"
                                value={parseFloat(node.y.toFixed(1))} 
                                onChange={(e) => updateNode(node.id, { y: Number(e.target.value) })}
                                className="w-full bg-black border border-neutral-700 rounded px-2 py-1 text-xs text-white focus:border-white outline-none font-mono"
                              />
                           </div>
                           <div>
                              <label className="text-[10px] uppercase text-neutral-500 font-bold mb-1 block">Level</label>
                              <input 
                                type="number" 
                                value={node.level} 
                                onChange={(e) => updateNode(node.id, { level: Number(e.target.value) })}
                                className="w-full bg-black border border-neutral-700 rounded px-2 py-1 text-xs text-white focus:border-white outline-none font-mono"
                              />
                           </div>
                           <div>
                              <label className="text-[10px] uppercase text-neutral-500 font-bold mb-1 block">Intensity</label>
                              <input 
                                type="number" 
                                min="0" max="100" step="1"
                                value={node.intensity} 
                                onChange={(e) => updateNode(node.id, { intensity: Number(e.target.value) })}
                                className="w-full bg-black border border-neutral-700 rounded px-2 py-1 text-xs text-white focus:border-white outline-none font-mono"
                              />
                           </div>
                        </div>

                        {/* Intensity Slider */}
                        <div className="mb-3">
                           <input 
                            type="range" 
                            min="0" max="100" step="1"
                            value={node.intensity}
                            onChange={(e) => updateNode(node.id, { intensity: Number(e.target.value) })}
                            className="w-full h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-white"
                           />
                        </div>

                        <button 
                          onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }}
                          className="w-full py-1.5 flex items-center justify-center gap-1.5 text-[10px] font-bold text-neutral-400 hover:text-white hover:bg-white/10 rounded transition-all uppercase tracking-wide border border-neutral-800 hover:border-neutral-600"
                        >
                          Delete Point
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-neutral-200 bg-white">
          <button onClick={handleClear} className="w-full py-2 border border-neutral-300 text-neutral-600 hover:text-black rounded text-xs uppercase tracking-wider">Clear All Points</button>
        </div>
      </div>

      {/* Main Work Area */}
      <div className="flex-1 flex flex-col relative overflow-hidden bg-white">
        
        {/* View Mode Toggles */}
        <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-30 bg-white/90 backdrop-blur border border-neutral-200 rounded-full p-1 flex gap-1 shadow-xl">
          <button onClick={() => setViewMode('2d')} className={`px-4 py-1.5 text-[10px] font-bold rounded-full uppercase tracking-wider ${viewMode === '2d' ? 'bg-black text-white' : 'text-neutral-500 hover:text-black'}`}>2D Plan</button>
          <button onClick={() => setViewMode('split')} className={`px-4 py-1.5 text-[10px] font-bold rounded-full uppercase tracking-wider ${viewMode === 'split' ? 'bg-black text-white' : 'text-neutral-500 hover:text-black'}`}>Split</button>
          <button onClick={() => setViewMode('3d')} className={`px-4 py-1.5 text-[10px] font-bold rounded-full uppercase tracking-wider ${viewMode === '3d' ? 'bg-black text-white' : 'text-neutral-500 hover:text-black'}`}>3D Iso</button>
        </div>

        {/* --- MAIN CONTENT ROW --- */}
        <div className={`flex-1 flex flex-col md:flex-row relative overflow-hidden transition-all duration-300 ${isGenerativeMode ? 'pb-48' : ''}`}>
          {/* Left: 2D Editor */}
          <div className={`
            relative border-neutral-200 transition-all duration-300 ease-in-out bg-white
            ${viewMode === '2d' ? 'w-full h-full border-none' : ''}
            ${viewMode === '3d' ? 'hidden' : ''}
            ${viewMode === 'split' ? 'w-full md:w-1/2 h-1/2 md:h-full border-b md:border-b-0 md:border-r' : ''}
          `}>
            <Editor2D 
              nodes={nodes} 
              setNodes={setNodes} 
              selectedNodeId={selectedNodeId}
              setSelectedNodeId={setSelectedNodeId}
              generatedVariations={pathVariations}
              activeVariationId={activeVariationId} // This tells main canvas to show active var
              onSelectVariation={setActiveVariationId}
            />
          </div>

          {/* Right: 3D Visualization */}
          <div className={`
            relative bg-white transition-all duration-300 ease-in-out flex
            ${viewMode === '3d' ? 'w-full h-full' : ''}
            ${viewMode === '2d' ? 'hidden' : ''}
            ${viewMode === 'split' ? 'w-full md:w-1/2 h-1/2 md:h-full' : ''}
          `}>
            {/* The 3D Canvas Container - UPDATED: Increased width to 30% in 3D mode */}
            <div className={`h-full transition-all duration-300 ease-in-out relative ${viewMode === '3d' ? 'w-[30%]' : 'w-full'}`}>
                {/* 
                   Pass ACTIVE variation nodes to 3D view if generating.
                   This makes the 3D view immediately reflect the clicked thumbnail.
                */}
                <IsoViewer 
                    nodes={activeVariationId ? (pathVariations.find(v => v.id === activeVariationId)?.nodes || nodes) : nodes} 
                    onNodeHover={setHoveredNodeId} 
                    onNodeClick={setSelectedNodeId} 
                    selectedNodeId={selectedNodeId}
                    isPresentationMode={false}
                    onTogglePresentation={setIsPresentationMode}
                />
            </div>
            
            {/* Lightbox - UPDATED: Reduced width to 70% in 3D mode */}
            {viewMode === '3d' && (
              <div className="w-[70%] border-l border-neutral-200 h-full bg-white flex flex-col relative transition-all duration-500">
                {activeNode ? (
                  <div className="flex-1 overflow-y-auto overflow-x-hidden relative animate-in fade-in duration-500 p-8 pt-24">
                    <div className="min-h-full flex flex-col">
                        {/* Image Area - 16:9, fills the padded area */}
                        <div className="w-full aspect-[16/9] bg-white relative flex-shrink-0 shadow-xl border border-neutral-100 overflow-hidden mb-8">
                           {activeNode.image ? (
                              <img 
                                src={activeNode.image} 
                                alt={activeNode.label} 
                                className="w-full h-full object-cover"
                              />
                           ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center text-neutral-300 bg-neutral-50">
                                 <div className="w-16 h-16 border-2 border-dashed border-neutral-300 rounded-lg flex items-center justify-center mb-2">
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                 </div>
                                 <span className="text-[10px] uppercase tracking-widest">No Visual Reference</span>
                              </div>
                           )}
                        </div>

                        {/* Metadata Footer - Just below the image */}
                        <div className="flex-shrink-0 bg-white border-t border-neutral-200 pt-8 flex flex-col justify-between">
                           <div>
                              <h2 className="text-3xl font-light text-black tracking-tight mb-2">
                                {activeNode.label || 'Untitled Moment'}
                              </h2>
                              <div className="w-16 h-1 bg-black mb-6"></div>
                           </div>
                           
                           <div className="flex gap-12">
                              <div>
                                 <span className="block text-[10px] text-neutral-400 uppercase tracking-widest mb-1">Elevation</span>
                                 <span className="font-mono text-xl">Lvl {activeNode.level}</span>
                              </div>
                           </div>
                        </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-neutral-300 select-none">
                     <div className="w-1 h-1 bg-neutral-400 rounded-full"></div>
                     <span className="my-4 text-xs tracking-widest uppercase opacity-50">Select a point to view details</span>
                     <div className="w-1 h-1 bg-neutral-400 rounded-full"></div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* --- BOTTOM GALLERY (VARIATIONS) --- */}
        {isGenerativeMode && (
            <div className="absolute bottom-0 left-0 w-full h-48 bg-neutral-50 border-t border-neutral-200 z-40 flex flex-col shadow-[0_-10px_40px_rgba(0,0,0,0.1)] animate-in slide-in-from-bottom-20 duration-500">
                <div className="h-8 flex items-center justify-between px-4 border-b border-neutral-200 bg-white">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Variation Gallery</span>
                    <span className="text-[10px] text-neutral-400">Select a thumbnail to preview above</span>
                </div>
                <div className="flex-1 flex items-center justify-center gap-6 p-4 overflow-x-auto">
                    {pathVariations.map((variation) => {
                        const isActive = activeVariationId === variation.id;
                        return (
                            <div 
                                key={variation.id}
                                onClick={() => setActiveVariationId(variation.id)}
                                className={`
                                    relative w-32 h-32 bg-white flex-shrink-0 cursor-pointer transition-all duration-300 group
                                    ${isActive ? 'scale-110 shadow-xl border-2 border-black z-10' : 'scale-95 opacity-60 hover:opacity-100 hover:scale-100 border border-neutral-200'}
                                `}
                            >
                                {/* Thumbnail Header */}
                                <div className={`absolute top-0 left-0 w-full py-1 text-[8px] text-center uppercase font-bold tracking-wider ${isActive ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-500'}`}>
                                    {variation.name}
                                </div>
                                
                                {/* Thumbnail Content - Reusing Editor2D in minimal readOnly mode */}
                                <div className="w-full h-full p-2 pt-5">
                                    <Editor2D 
                                        nodes={variation.nodes} 
                                        readOnly={true} 
                                        minimal={true}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        )}

      </div>
    </div>
  );
}

export default App;