import { PathNode } from '../types';

export const downloadHtmlExport = (nodes: PathNode[]) => {
  const htmlContent = generateHtmlContent(nodes);
  const blob = new Blob([htmlContent], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `archi-curve-interactive-${new Date().toISOString().slice(0,10)}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const generateHtmlContent = (nodes: PathNode[]) => {
  const nodesJson = JSON.stringify(nodes);
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Archi-Curve Interactive Experience</title>
    <style>
        body { margin: 0; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #fff; color: #111; cursor: none; }
        #app { display: flex; width: 100vw; height: 100vh; transition: all 0.5s ease; }
        
        /* 3D Container (Left) */
        #view-3d { 
            width: 25%; 
            height: 100%; 
            position: relative; 
            background: #fff; 
            border-right: 1px solid #e5e5e5;
            transition: all 0.5s ease;
            z-index: 10;
        }
        
        /* Lightbox Container (Right) */
        #lightbox { 
            width: 75%; 
            height: 100%; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            background: #fff; 
            position: relative; 
            transition: all 0.5s ease;
            z-index: 5;
        }

        /* --- Presentation Mode Styles --- */
        body.presentation #app {
            display: block;
        }
        
        /* In presentation mode, 3D view becomes a small HUD overlay */
        body.presentation #view-3d {
            position: fixed;
            bottom: 20px;
            left: 20px;
            width: 280px !important;
            height: 280px !important;
            background: transparent !important;
            border: none;
            z-index: 100;
            /* CRITICAL FIX: Allow interaction (rotation/clicking) in HUD mode */
            pointer-events: auto !important; 
        }

        /* Lightbox becomes full screen */
        body.presentation #lightbox {
            position: fixed;
            top: 0; left: 0;
            width: 100vw;
            height: 100vh;
            z-index: 50;
            background: #000;
        }

        /* Hide UI in presentation */
        body.presentation .controls, 
        body.presentation .watermark,
        body.presentation #empty-state {
            display: none !important;
        }

        /* Show Exit Button only in presentation */
        #btn-exit { display: none; }
        body.presentation #btn-exit { display: block; }

        /* Full screen image styling */
        body.presentation #active-content {
            padding: 0 !important;
            width: 100%; height: 100%;
            background: #000;
        }
        
        body.presentation #lb-image-container {
            position: absolute; top:0; left:0; width:100%; height:100%;
            margin: 0 !important; border: none !important; background: #000 !important;
        }
        
        body.presentation #lb-image {
            width: 100%; height: 100%;
            object-fit: cover !important; 
            opacity: 1 !important; /* ORIGINAL COLORS: Removed opacity */
            display: block !important;
        }
        
        /* Overlay text in presentation */
        body.presentation #lb-info {
            position: absolute;
            bottom: 50px;
            right: 50px;
            text-align: right;
            z-index: 60;
            color: white;
            animation: slideIn 1s ease;
        }
        
        body.presentation #lb-label {
            font-size: 32px !important; /* Smaller size as requested */
            color: white !important;
            font-weight: 300;
            margin-bottom: 20px;
            text-shadow: 0 2px 4px rgba(0,0,0,0.8); /* Strong shadow for readability */
        }
        
        body.presentation #lb-divider {
            background: white !important;
            opacity: 0.5;
            margin-left: auto; margin-right: 0;
            box-shadow: 0 1px 2px rgba(0,0,0,0.5);
        }
        
        body.presentation #lb-detail {
            display: none !important; /* Hide Sequence Node text as requested */
        }
        
        /* Cursor */
        #cursor {
            position: fixed; width: 12px; height: 12px; 
            background: black; 
            border: 2px solid white;
            border-radius: 50%; 
            pointer-events: none; z-index: 9999;
            transform: translate(-50%, -50%); transition: transform 0.05s linear;
        }

        @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }

        /* Mobile / Responsive tweak (Normal Mode) */
        @media (max-width: 768px) {
            #app:not(.presentation) { flex-direction: column; }
            #view-3d { width: 100%; height: 50%; border-right: none; border-bottom: 1px solid #e5e5e5; }
            #lightbox { width: 100%; height: 50%; }
        }

        /* UI Elements */
        .watermark {
            position: absolute;
            top: 20px;
            right: 20px;
            text-align: right;
            pointer-events: none;
            z-index: 10;
        }
        .watermark h3 { margin: 0; font-size: 14px; font-weight: 800; letter-spacing: 0.05em; }
        .watermark p { margin: 5px 0 0 0; font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.1em; }

        /* Controls */
        .controls {
            position: absolute;
            top: 70px;
            right: 20px;
            display: flex;
            flex-direction: column;
            gap: 5px;
            align-items: flex-end;
            z-index: 20;
        }

        #btn-exit {
            position: absolute;
            top: 30px;
            right: 30px;
            background: transparent;
            border: 1px solid rgba(255,255,255,0.2);
            color: rgba(255,255,255,0.5);
            padding: 8px 16px;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 2px;
            cursor: pointer;
            z-index: 999;
            transition: all 0.2s;
            text-shadow: 0 1px 2px rgba(0,0,0,0.5);
        }
        #btn-exit:hover { background: white; color: black; text-shadow: none; }
        
        .btn {
            background: #f0f0f0;
            border: none;
            padding: 6px 12px;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            cursor: pointer;
            transition: all 0.2s;
            color: #111;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .btn:hover { background: #e0e0e0; }
        .btn.active { background: #000; color: #fff; }
        .btn:disabled { opacity: 0.5; cursor: default; }

        /* Typography */
        h1 { font-weight: 800; letter-spacing: -0.02em; }
        .mono { font-family: 'Courier New', Courier, monospace; }
        
        /* Loading Overlay */
        #loading {
            position: fixed; top:0; left:0; width:100%; height:100%;
            background: white; z-index: 999; display: flex;
            align-items: center; justify-content: center;
            font-size: 12px; letter-spacing: 2px; text-transform: uppercase;
        }
    </style>
    <!-- Import Three.js from CDN -->
    <script type="importmap">
        {
            "imports": {
                "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
                "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
            }
        }
    </script>
</head>
<body>
    <div id="cursor"></div>
    <div id="loading">Loading Experience...</div>
    <button id="btn-exit">Exit Preview</button>

    <div id="app">
        <div id="view-3d">
            <div class="watermark">
                <h3>ARCHI-CURVE</h3>
                <p>Interactive Export</p>
            </div>
            
            <div class="controls">
                <button id="btn-construct" class="btn">Construct</button>
                <button id="btn-play" class="btn">
                    <span id="play-text">Play</span>
                    <div id="play-icon" style="width: 0; height: 0; border-top: 3px solid transparent; border-bottom: 3px solid transparent; border-left: 5px solid currentColor;"></div>
                </button>
            </div>
        </div>
        
        <div id="lightbox">
            <!-- Empty State -->
            <div id="empty-state" style="text-align:center; color:#ccc; user-select: none;">
                <div style="width:1px; height:80px; background:linear-gradient(to bottom, transparent, #eee, transparent); margin: 0 auto 20px auto;"></div>
                <h2 style="font-weight:300; letter-spacing:0.25em; text-transform:uppercase; line-height: 1.6; font-size: 16px;">
                    Click points to<br>experience space
                </h2>
                <div style="width:1px; height:80px; background:linear-gradient(to bottom, transparent, #eee, transparent); margin: 20px auto 0 auto;"></div>
            </div>

            <!-- Active Content -->
            <div id="active-content" style="display:none; width:100%; height:100%; flex-direction:column; padding: 40px; box-sizing: border-box; animation: fadeIn 0.5s ease;">
                
                <!-- Image Container -->
                <div id="lb-image-container" style="flex:1; width: 100%; min-height: 0; display:flex; align-items:center; justify-content:center; background:rgba(249,250,251, 0.5); border: 1px solid #f3f4f6; overflow:hidden; position:relative; margin-bottom: 30px;">
                    <img id="lb-image" src="" style="max-width:100%; max-height:100%; object-fit:contain; display: none;" />
                    <div id="lb-no-image" style="display:flex; flex-direction:column; align-items:center; justify-content:center; color:#e5e5e5;">
                        <span style="font-size: 48px; opacity: 0.2;">□</span>
                        <span style="font-size:10px; text-transform:uppercase; letter-spacing:2px; margin-top: 10px;">No Visual Reference</span>
                    </div>
                </div>

                <!-- Text Info -->
                <div id="lb-info" style="text-align:center; flex-shrink: 0;">
                    <h1 id="lb-label" style="font-size:32px; margin:0; color: #000;">Label</h1>
                    <div id="lb-divider" style="width: 30px; height: 2px; background: #000; margin: 15px auto; opacity: 0.1;"></div>
                    <p id="lb-detail" style="color:#666; font-size: 12px; margin-top:5px;" class="mono">LEVEL <span id="lb-level">0</span></p>
                </div>
            </div>
        </div>
    </div>

    <script type="module">
        import * as THREE from 'three';
        import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

        // --- Data Injection ---
        const nodes = ${nodesJson};
        
        // --- Constants ---
        const SCALE = 0.1;
        const OFFSET = 5;
        const LEVEL_HEIGHT = 2.0;

        // --- State ---
        let selectedNodeId = null;
        let buildProgress = 1.0;
        let isBuilding = false;
        let isPlaying = false;
        let playTimerAccumulator = 0;
        
        const orderedNodeIds = nodes.map(n => n.id);
        const nodeMeshes = {}; // Map id -> { group, sphere, originalScale }
        let intensityLine, baseLine;
        let totalCurvePoints = 0;

        // --- Init Scene ---
        const container = document.getElementById('view-3d');
        const scene = new THREE.Scene();
        // Allow transparent background
        const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setClearColor(0xffffff, 1); // Default white background
        renderer.shadowMap.enabled = true;
        container.appendChild(renderer.domElement);

        // Camera
        const aspect = container.clientWidth / container.clientHeight;
        const frustumSize = 40; // Increased to ensure fitting
        const camera = new THREE.OrthographicCamera(
            frustumSize * aspect / -2, frustumSize * aspect / 2,
            frustumSize / 2, frustumSize / -2,
            1, 1000
        );
        camera.position.set(20, 20, 20);
        camera.lookAt(0, 0, 0);

        // Controls
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.minZoom = 0.5;
        controls.maxZoom = 100;
        
        // Target tracking for auto-camera movement
        const controlsTarget = new THREE.Vector3(0,0,0);

        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(10, 20, 5);
        dirLight.castShadow = true;
        scene.add(dirLight);

        // Grid
        const gridHelper = new THREE.GridHelper(20, 20, 0xe5e5e5, 0xe5e5e5);
        scene.add(gridHelper);

        const contentGroup = new THREE.Group();
        contentGroup.position.y = -2;
        scene.add(contentGroup);

        // Custom Cursor Logic
        const cursor = document.getElementById('cursor');
        window.addEventListener('mousemove', (e) => {
            cursor.style.transform = \`translate(\${e.clientX}px, \${e.clientY}px)\`;
        });

        // --- Helpers ---
        function getGradientColor(t) {
            const c1 = new THREE.Color('#cccccc');
            const c2 = new THREE.Color('#000000');
            return c1.lerp(c2, t);
        }

        // --- Build Scene Objects ---
        const clickableObjects = [];

        if (nodes.length > 1) {
            const points3D = nodes.map(n => new THREE.Vector3(
                (n.x * SCALE) - OFFSET,
                (n.level || 0) * LEVEL_HEIGHT,
                (n.y * SCALE) - OFFSET
            ));
            
            const curve = new THREE.CatmullRomCurve3(points3D, false, 'catmullrom', 0.2);
            const samples = 200;
            const curvePoints = curve.getPoints(samples);
            totalCurvePoints = curvePoints.length;

            const intensityGeo = new THREE.BufferGeometry();
            const baseGeo = new THREE.BufferGeometry();
            
            const intensityPositions = [];
            const basePositions = [];
            const colors = [];

            for (let i = 0; i < curvePoints.length; i++) {
                const pt = curvePoints[i];
                const progress = i / (curvePoints.length - 1);
                
                const nodeIndexFloat = progress * (nodes.length - 1);
                const idx1 = Math.floor(nodeIndexFloat);
                const idx2 = Math.min(nodes.length - 1, Math.ceil(nodeIndexFloat));
                const alpha = nodeIndexFloat - idx1;
                
                const int1 = nodes[idx1].intensity;
                const int2 = nodes[idx2].intensity;
                const val = (int1 * (1 - alpha) + int2 * alpha);
                
                const h = val * 0.1;
                const color = getGradientColor(val / 100);

                basePositions.push(pt.x, pt.y, pt.z);
                intensityPositions.push(pt.x, pt.y + h, pt.z);
                colors.push(color.r, color.g, color.b);
            }

            intensityGeo.setAttribute('position', new THREE.Float32BufferAttribute(intensityPositions, 3));
            intensityGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            baseGeo.setAttribute('position', new THREE.Float32BufferAttribute(basePositions, 3));

            const intensityMat = new THREE.LineBasicMaterial({ vertexColors: true, linewidth: 3 });
            const baseMat = new THREE.LineDashedMaterial({ color: 0x999999, dashSize: 0.2, gapSize: 0.1, opacity: 0.4, transparent: true });

            intensityLine = new THREE.Line(intensityGeo, intensityMat);
            baseLine = new THREE.Line(baseGeo, baseMat);
            baseLine.computeLineDistances();

            intensityLine.geometry.setDrawRange(0, totalCurvePoints);
            baseLine.geometry.setDrawRange(0, totalCurvePoints);

            contentGroup.add(intensityLine);
            contentGroup.add(baseLine);
        }

        nodes.forEach((node, idx) => {
            const x = (node.x * SCALE) - OFFSET;
            const z = (node.y * SCALE) - OFFSET;
            const y = (node.level || 0) * LEVEL_HEIGHT;
            const h = node.intensity * 0.1;

            const group = new THREE.Group();
            group.position.set(x, y, z);
            
            const stem = new THREE.Mesh(
                new THREE.CylinderGeometry(0.015, 0.015, h, 8).translate(0, h/2, 0),
                new THREE.MeshBasicMaterial({ color: 0x999999 })
            );
            group.add(stem);

            const dot = new THREE.Mesh(
                new THREE.SphereGeometry(0.08, 16, 16),
                new THREE.MeshBasicMaterial({ color: 0xcccccc })
            );
            group.add(dot);

            const color = getGradientColor(node.intensity / 100);
            const sphere = new THREE.Mesh(
                new THREE.SphereGeometry(0.15, 32, 32),
                new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 0 })
            );
            sphere.position.y = h;
            sphere.userData = { isNode: true, id: node.id };
            group.add(sphere);
            
            clickableObjects.push(sphere);

            // Add text sprite
            const canvas = document.createElement('canvas');
            canvas.width = 256; canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#666666';
            ctx.font = 'bold 36px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(node.label || (idx+1).toString(), 128, 32);
            const texture = new THREE.CanvasTexture(canvas);
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
            sprite.scale.set(2, 0.5, 1);
            sprite.position.set(0, h + 0.6, 0);
            group.add(sprite);

            const threshold = idx / Math.max(1, nodes.length - 1);
            nodeMeshes[node.id] = { group, sphere, sprite, threshold };
            contentGroup.add(group);
        });

        // --- Interaction Logic ---
        function setNodeVisibility() {
            if (intensityLine && baseLine) {
                const count = Math.floor(totalCurvePoints * buildProgress);
                const drawCount = count < 2 ? 0 : count;
                intensityLine.geometry.setDrawRange(0, drawCount);
                baseLine.geometry.setDrawRange(0, drawCount);
            }
            Object.values(nodeMeshes).forEach(item => {
                const isVisible = buildProgress >= (item.threshold - 0.05);
                const targetScale = isVisible ? 1 : 0;
                item.group.scale.setScalar(THREE.MathUtils.lerp(item.group.scale.x, targetScale, 0.2));
            });
        }

        function updateLightbox(id) {
            const emptyState = document.getElementById('empty-state');
            const activeContent = document.getElementById('active-content');
            
            if (!id) {
                emptyState.style.display = 'block';
                activeContent.style.display = 'none';
                return;
            }

            const node = nodes.find(n => n.id === id);
            if (!node) return;

            emptyState.style.display = 'none';
            activeContent.style.display = 'flex';

            document.getElementById('lb-label').textContent = node.label || 'Point';
            document.getElementById('lb-level').textContent = node.level;
            
            const imgEl = document.getElementById('lb-image');
            const noImgEl = document.getElementById('lb-no-image');
            
            if (node.image) {
                imgEl.src = node.image;
                imgEl.style.display = 'block';
                noImgEl.style.display = 'none';
            } else {
                imgEl.style.display = 'none';
                noImgEl.style.display = 'flex';
            }
        }

        function highlightNode(id) {
            Object.values(nodeMeshes).forEach(item => {
                item.sphere.scale.set(1,1,1);
                item.sphere.material.emissiveIntensity = 0;
            });

            if (id && nodeMeshes[id]) {
                const item = nodeMeshes[id];
                item.sphere.scale.set(1.8, 1.8, 1.8);
                item.sphere.material.emissiveIntensity = 0.5;
                
                // Only move camera to node in Normal Mode
                if (!isPlaying) {
                    const node = nodes.find(n => n.id === id);
                    if (node) {
                        const x = (node.x * SCALE) - OFFSET;
                        const y = (node.level || 0) * LEVEL_HEIGHT;
                        const h = node.intensity * 0.1;
                        const z = (node.y * SCALE) - OFFSET;
                        controlsTarget.set(x, y + h/2, z);
                    }
                }
            }
        }
        
        function startBuild() {
            isPlaying = false;
            if(document.body.classList.contains('presentation')) togglePlay(); // Exit presentation
            
            isBuilding = true;
            buildProgress = 0;
            document.getElementById('btn-construct').innerText = "Building...";
            document.getElementById('btn-construct').disabled = true;
        }

        function togglePlay() {
            isPlaying = !isPlaying;
            isBuilding = false;
            buildProgress = 1;
            
            document.body.classList.toggle('presentation');

            const btn = document.getElementById('btn-play');
            const txt = document.getElementById('play-text');
            const icon = document.getElementById('play-icon');

            if (isPlaying) {
                // START PRESENTATION
                btn.classList.add('active');
                txt.innerText = "STOP";
                icon.style.borderLeft = "none";
                icon.style.width = "8px"; icon.style.height = "8px"; icon.style.backgroundColor = "white";
                
                // Overlay Mode settings
                renderer.setClearColor(0x000000, 0); // Transparent
                gridHelper.visible = false;
                
                // Adjust Zoom for small HUD - 1.8 ensures full curve is seen large enough
                camera.zoom = 1.8;
                // Force camera target to center of scene to show full curve
                controlsTarget.set(0, 0, 0);

                if (!selectedNodeId && nodes.length > 0) selectNode(nodes[0].id);
                
            } else {
                // STOP PRESENTATION
                btn.classList.remove('active');
                txt.innerText = "PLAY";
                icon.style.backgroundColor = "transparent";
                icon.style.width = "0"; icon.style.height = "0";
                icon.style.borderLeft = "5px solid currentColor";
                
                // Normal Mode settings
                renderer.setClearColor(0xffffff, 1);
                gridHelper.visible = true;
                camera.zoom = 1.0; // Standard zoom
            }
            
            camera.updateProjectionMatrix();
            // Force resize event to recalculate canvas size for new container dims
            setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
        }

        function selectNode(id) {
            selectedNodeId = (selectedNodeId === id) ? null : id;
            updateLightbox(selectedNodeId);
            highlightNode(selectedNodeId);
        }

        document.getElementById('btn-construct').addEventListener('click', startBuild);
        document.getElementById('btn-play').addEventListener('click', togglePlay);
        document.getElementById('btn-exit').addEventListener('click', () => {
             if (isPlaying) togglePlay();
        });

        // Resize Logic
        const resizeObserver = new ResizeObserver(() => {
             const w = container.clientWidth;
             const h = container.clientHeight;
             if(w && h) {
                 const aspect = w / h;
                 camera.left = -frustumSize * aspect / 2;
                 camera.right = frustumSize * aspect / 2;
                 camera.top = frustumSize / 2;
                 camera.bottom = -frustumSize / 2;
                 camera.updateProjectionMatrix();
                 renderer.setSize(w, h);
             }
        });
        resizeObserver.observe(container);

        // Raycasting
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        
        // Use click instead of pointerdown to allow for cleaner interaction
        // Simple drag check
        let isDragging = false;
        renderer.domElement.addEventListener('pointerdown', () => { isDragging = false; });
        renderer.domElement.addEventListener('pointermove', () => { isDragging = true; });
        
        renderer.domElement.addEventListener('pointerup', (event) => {
            if (isDragging) return; // Ignore if user was rotating camera
            
            const rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(clickableObjects);
            if (intersects.length > 0) selectNode(intersects[0].object.userData.id);
        });

        // Animation Loop
        const PLAY_DURATION = 3000;
        let lastTime = 0;

        function animate(time) {
            requestAnimationFrame(animate);
            const delta = (time - lastTime) / 1000;
            lastTime = time;

            // Variable Speed Construction Logic
            if (isBuilding && nodes.length > 1) {
                const totalSegments = nodes.length - 1;
                const currentFloatIndex = buildProgress * totalSegments;
                const idx = Math.floor(currentFloatIndex);
                const nextIdx = Math.min(nodes.length - 1, idx + 1);
                
                const currentIntensity = nodes[idx].intensity;
                const nextIntensity = nodes[nextIdx].intensity;
                const diff = Math.abs(nextIntensity - currentIntensity);
                
                // Same logic as React app
                const volatilityFactor = 0.015; 
                const baseSpeed = 0.8; 
                const dynamicSpeed = baseSpeed / (1 + diff * volatilityFactor);
                
                buildProgress += delta * dynamicSpeed * 0.2; // Adjusted for frame delta
                
                if (buildProgress >= 1) {
                    buildProgress = 1;
                    isBuilding = false;
                    document.getElementById('btn-construct').innerText = "Construct";
                    document.getElementById('btn-construct').disabled = false;
                }
            }
            setNodeVisibility();

            if (isPlaying && selectedNodeId) {
                playTimerAccumulator += delta * 1000;
                if (playTimerAccumulator > PLAY_DURATION) {
                    playTimerAccumulator = 0;
                    const currentIndex = orderedNodeIds.indexOf(selectedNodeId);
                    
                    // Loop check
                    if (currentIndex === orderedNodeIds.length - 1) {
                        togglePlay(); // Exit at end
                    } else {
                        const nextIndex = (currentIndex + 1) % orderedNodeIds.length;
                        selectedNodeId = orderedNodeIds[nextIndex];
                        updateLightbox(selectedNodeId);
                        highlightNode(selectedNodeId);
                    }
                }
            }

            // In Play Mode, lock to center. In Normal Mode, follow target.
            if (isPlaying) {
                controls.target.lerp(new THREE.Vector3(0,0,0), 0.1);
            } else {
                controls.target.lerp(controlsTarget, 0.05);
            }
            
            controls.update();
            renderer.render(scene, camera);
        }
        
        document.getElementById('loading').style.display = 'none';
        animate(0);
    </script>
</body>
</html>`;
};