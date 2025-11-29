# Step 3: The Grid — Mercator Projection and Tile Coordinates

This document explains everything we built in Step 3 of the WebGPU vector map engine. You'll learn how web maps convert geographic coordinates to pixels, how tile pyramids work, and how to render a dynamic grid that changes with zoom level.

---

## Table of Contents

1. [Overview: From Graphics to Geography](#overview-from-graphics-to-geography)
2. [Web Mercator Projection](#web-mercator-projection)
3. [Coordinate Systems](#coordinate-systems)
4. [Tile Pyramid System](#tile-pyramid-system)
5. [Calculating Visible Tiles](#calculating-visible-tiles)
6. [Generating Grid Geometry](#generating-grid-geometry)
7. [Line Primitive Rendering](#line-primitive-rendering)
8. [Updated Component](#updated-component)
9. [File Structure](#file-structure)

---

## Overview: From Graphics to Geography

In Step 2, we rendered shapes in an abstract coordinate system. Now we need to connect that to real geography:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Lng/Lat       │────▶│   World (0-1)   │────▶│   Camera        │
│  (-180 to 180,  │     │   Mercator      │     │   Coordinates   │
│   -85 to 85)    │     │   Projection    │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │   Tile Coords   │
                        │   z / x / y     │
                        └─────────────────┘
```

This step introduces:
- **Geographic projection** — Converting Lng/Lat to renderable coordinates
- **Tile coordinates** — The z/x/y system used by all web maps
- **Dynamic geometry** — Generating grid lines based on visible area

---

## Web Mercator Projection

### File: `src/lib/geo/projection.ts`

Web Mercator (EPSG:3857) is the standard projection for web maps. It has useful properties:

1. **Conformal** — Preserves angles locally (shapes look right)
2. **Cylindrical** — The world fits in a square (at each zoom level)
3. **North is up** — Consistent orientation everywhere

### The Math

```typescript
export function lngLatToWorld(lngLat: LngLat): WorldCoord {
    const { lng, lat } = lngLat;
    
    // Clamp latitude (Mercator has limits)
    const clampedLat = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat));
    
    // Longitude is linear: -180° → 0, +180° → 1
    const x = (lng + 180) / 360;
    
    // Latitude uses Mercator formula
    const latRad = (clampedLat * Math.PI) / 180;
    const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2;
    
    return { x, y };
}
```

### Why Latitude Has Limits

The Mercator projection stretches toward the poles. At ±90°, it would stretch to infinity. Web maps typically cap at **±85.051°** — the latitude where the world fits perfectly in a square.

```
Latitude →  World Y
─────────────────────
   85°   →    0.0
   60°   →    0.14
   45°   →    0.21
    0°   →    0.5
  -45°   →    0.79
  -85°   →    1.0
```

### Distortion

Mercator preserves shapes but distorts areas:

| Location | Scale Factor |
|----------|-------------|
| Equator | 1.0× |
| 45° latitude | 1.41× |
| 60° latitude | 2.0× |
| 80° latitude | 5.76× |

Greenland looks as big as Africa, but Africa is 14× larger!

---

## Coordinate Systems

We now have multiple coordinate systems to manage:

### 1. Geographic (LngLat)
- Longitude: -180° to +180° (East positive)
- Latitude: -85° to +85° (North positive)
- Used for: User input, data sources, display

### 2. World (Mercator)
- X: 0 to 1 (0 = -180°, 1 = +180°)
- Y: 0 to 1 (0 = +85°, 1 = -85°)
- **Note:** Y is inverted (0 at top)
- Used for: Tile calculations

### 3. Camera
- X: -∞ to +∞ (0 = center of world)
- Y: -∞ to +∞ (positive = north)
- Used for: Rendering, user interaction

### Conversion Functions

```typescript
// World (0,0 at top-left) to Camera (0,0 at center)
export function worldToCamera(world: WorldCoord): { x: number; y: number } {
    return {
        x: world.x - 0.5,      // Shift origin to center
        y: 0.5 - world.y       // Flip Y axis
    };
}

// Camera to World (inverse)
export function cameraToWorld(cameraX: number, cameraY: number): WorldCoord {
    return {
        x: cameraX + 0.5,
        y: 0.5 - cameraY
    };
}
```

---

## Tile Pyramid System

### File: `src/lib/geo/tiles.ts`

Web maps use a **tile pyramid** — a hierarchy of pre-rendered image (or vector) tiles at different zoom levels.

### Zoom Levels

| Zoom | Tiles | Tile Size | Coverage |
|------|-------|-----------|----------|
| 0 | 1 | Whole world | 1 tile |
| 1 | 4 | Hemisphere | 2×2 |
| 2 | 16 | Continent | 4×4 |
| ... | ... | ... | ... |
| 10 | ~1M | City | 1024×1024 |
| 18 | ~69B | Building | 262144×262144 |

The formula: **4^z tiles** at zoom level z.

### Tile Naming Convention

Tiles are identified by three numbers: `z/x/y`

```
z = zoom level (0, 1, 2, ...)
x = column (0 to 2^z - 1, left to right)
y = row (0 to 2^z - 1, top to bottom)
```

Example: **2/3/1** = zoom 2, column 3, row 1

```
Zoom 2 (4×4 grid):
┌───┬───┬───┬───┐
│0,0│1,0│2,0│3,0│
├───┼───┼───┼───┤
│0,1│1,1│2,1│3,1│ ← Tile 2/3/1 is here
├───┼───┼───┼───┤
│0,2│1,2│2,2│3,2│
├───┼───┼───┼───┤
│0,3│1,3│2,3│3,3│
└───┴───┴───┴───┘
```

### Converting Coordinates to Tiles

```typescript
export function lngLatToTile(lngLat: LngLat, zoom: number): TileCoord {
    const world = lngLatToWorld(lngLat);
    const scale = Math.pow(2, zoom);
    
    return {
        z: Math.floor(zoom),
        x: Math.floor(world.x * scale),
        y: Math.floor(world.y * scale)
    };
}
```

---

## Calculating Visible Tiles

### Camera Zoom to Tile Zoom

Our camera zoom and tile zoom are related but different:

```typescript
export function getTileZoom(cameraZoom: number, minZoom = 0, maxZoom = 18): number {
    // At camera zoom 1, we see ~2 world units → tile zoom 0
    // At camera zoom 2, we see ~1 world unit → tile zoom 1
    // At camera zoom 4, we see ~0.5 world units → tile zoom 2
    const rawZoom = Math.log2(cameraZoom) + 1;
    return Math.max(minZoom, Math.min(maxZoom, Math.floor(rawZoom)));
}
```

### Finding Visible Bounds

```typescript
export function getVisibleWorldBounds(camera: Camera2D, aspectRatio: number): WorldBounds {
    // Calculate visible extent in camera space
    const halfWidth = (aspectRatio > 1 ? aspectRatio : 1) / camera.zoom;
    const halfHeight = (aspectRatio < 1 ? 1 / aspectRatio : 1) / camera.zoom;
    
    // Get corners in camera space
    const cameraMinX = camera.x - halfWidth;
    const cameraMaxX = camera.x + halfWidth;
    const cameraMinY = camera.y - halfHeight;
    const cameraMaxY = camera.y + halfHeight;
    
    // Convert to world coordinates
    const minWorld = cameraToWorld(cameraMinX, cameraMaxY);
    const maxWorld = cameraToWorld(cameraMaxX, cameraMinY);
    
    return { minX: minWorld.x, minY: minWorld.y, maxX: maxWorld.x, maxY: maxWorld.y };
}
```

### Collecting Visible Tiles

```typescript
export function getVisibleTiles(camera: Camera2D, aspectRatio: number): TileCoord[] {
    const tileZoom = getTileZoom(camera.zoom);
    const bounds = getVisibleWorldBounds(camera, aspectRatio);
    const scale = Math.pow(2, tileZoom);
    
    const tiles: TileCoord[] = [];
    
    // Convert bounds to tile indices
    const minTileX = Math.max(0, Math.floor(bounds.minX * scale));
    const maxTileX = Math.min(scale - 1, Math.floor(bounds.maxX * scale));
    const minTileY = Math.max(0, Math.floor(bounds.minY * scale));
    const maxTileY = Math.min(scale - 1, Math.floor(bounds.maxY * scale));
    
    for (let y = minTileY; y <= maxTileY; y++) {
        for (let x = minTileX; x <= maxTileX; x++) {
            tiles.push({ z: tileZoom, x, y });
        }
    }
    
    return tiles;
}
```

---

## Generating Grid Geometry

### Dynamic Vertex Buffer

Unlike Step 2 where we had fixed geometry, the grid changes every frame based on visible tiles.

```typescript
export function createTileGridVertices(tiles: TileCoord[]): Float32Array {
    // Use a Set to avoid duplicate edges
    const edges = new Set<string>();
    const vertices: number[] = [];
    
    for (const tile of tiles) {
        const bounds = getTileBounds(tile);
        const min = worldToCamera(bounds.min);
        const max = worldToCamera(bounds.max);
        
        // Add four edges (left, right, top, bottom)
        // Use string keys to deduplicate shared edges
        const left = `${min.x},${min.y}-${min.x},${max.y}`;
        if (!edges.has(left)) {
            edges.add(left);
            vertices.push(min.x, min.y, min.x, max.y);
        }
        // ... similar for right, top, bottom
    }
    
    return new Float32Array(vertices);
}
```

### Edge Deduplication

Adjacent tiles share edges. Without deduplication, we'd draw each shared edge twice:

```
┌───────┬───────┐
│       │       │   Without dedup: 12 edges
│   A   │   B   │   With dedup: 7 edges
│       │       │
└───────┴───────┘
        ↑
   Shared edge
```

---

## Line Primitive Rendering

### File: `src/lib/gpu/gridPipeline.ts`

In Step 2, we used `triangle-list` topology. For grids, we use `line-list`:

```typescript
const pipeline = device.createRenderPipeline({
    // ...
    primitive: {
        topology: 'line-list'  // Every 2 vertices = one line
    }
});
```

### Topology Comparison

| Topology | Vertices per Shape | Use Case |
|----------|-------------------|----------|
| `point-list` | 1 | Particles, scatter plots |
| `line-list` | 2 | Grids, wireframes |
| `line-strip` | 1 (continuous) | Paths, routes |
| `triangle-list` | 3 | Filled shapes |
| `triangle-strip` | 1 (continuous) | Terrain, meshes |

### Simplified Shader

The grid shader is simpler than the square shader — position only, no color attribute:

```wgsl
struct VertexInput {
    @location(0) position: vec2f,
}

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    let transformed = uniforms.matrix * vec3f(input.position, 1.0);
    
    var output: VertexOutput;
    output.position = vec4f(transformed.xy, 0.0, 1.0);
    return output;
}

@fragment
fn fragmentMain() -> @location(0) vec4f {
    return vec4f(0.4, 0.5, 0.6, 1.0);  // Subtle blue-gray
}
```

---

## Updated Component

### File: `src/lib/components/GridCanvas.svelte`

Key additions for Step 3:

### Geographic State

```typescript
// Start centered on a location
const initialCameraPos = lngLatToCamera({ lng: 0, lat: 20 });
let camera = $state(createCamera(initialCameraPos.x, initialCameraPos.y, 2));

// Derived display values
let tileZoom = $derived(getTileZoom(camera.zoom));
let centerLngLat = $derived(cameraToLngLat(camera.x, camera.y));
```

### Dynamic Buffer Updates

```typescript
function render() {
    // Get visible tiles for current view
    const tiles = getVisibleTiles(camera, aspectRatio);
    
    // Generate grid geometry
    const vertices = createTileGridVertices(tiles);
    gridVertexCount = vertices.length / 2;
    
    // Update GPU buffer
    gridVertexBuffer = createGridVertexBuffer(device, vertices, gridVertexBuffer);
    
    // Render
    renderGridFrame(/*...*/);
}
```

### Location Presets

```svelte
<button onclick={() => goToLocation(-122.4194, 37.7749, 8)}>🌁</button>  <!-- SF -->
<button onclick={() => goToLocation(2.3522, 48.8566, 8)}>🗼</button>      <!-- Paris -->
<button onclick={() => goToLocation(139.6917, 35.6895, 8)}>🏯</button>    <!-- Tokyo -->
```

---

## File Structure

```
src/lib/
├── geo/                          [NEW FOLDER]
│   ├── projection.ts             # Mercator projection, coordinate conversion
│   └── tiles.ts                  # Tile calculations, grid geometry
├── gpu/
│   ├── context.ts                # GPU setup (unchanged)
│   ├── pipeline.ts               # Triangle pipeline (Step 1)
│   ├── buffers.ts                # Vertex buffers (Step 2)
│   ├── transform.ts              # Matrix math (Step 2)
│   ├── squarePipeline.ts         # Square pipeline (Step 2)
│   ├── controls.ts               # Camera controls (Step 2)
│   ├── gridPipeline.ts           # Grid pipeline [NEW]
│   └── shaders/
│       ├── triangle.wgsl         # Step 1
│       ├── square.wgsl           # Step 2
│       └── grid.wgsl             # Step 3 [NEW]
├── components/
│   ├── WebGPUCanvas.svelte       # Step 1
│   ├── InteractiveCanvas.svelte  # Step 2
│   └── GridCanvas.svelte         # Step 3 [NEW]
└── index.ts                      # Exports (updated)
```

---

## What's Next? (Step 4 Preview)

In Step 4 ("Vector Data"), we'll:

1. **Fetch PBF Tiles** — Load Mapbox Vector Tiles from a tile server
2. **Parse Protobuf** — Decode the binary tile format
3. **Extract Geometry** — Convert vector paths to GPU vertices
4. **Layer System** — Organize features by type (roads, water, buildings)

This will bring actual map data into our renderer!

---

## Quick Reference

| Concept | Our File | Key Function |
|---------|----------|--------------|
| Lng/Lat → World | projection.ts | `lngLatToWorld()` |
| World → Camera | projection.ts | `worldToCamera()` |
| Camera → Tile Zoom | tiles.ts | `getTileZoom()` |
| Visible Tiles | tiles.ts | `getVisibleTiles()` |
| Grid Geometry | tiles.ts | `createTileGridVertices()` |
| Line Rendering | gridPipeline.ts | `renderGridFrame()` |

---

## Key Formulas

### Web Mercator Projection

$$x = \frac{lng + 180}{360}$$

$$y = \frac{1 - \ln(\tan(lat) + \sec(lat)) / \pi}{2}$$

### Tile Count at Zoom Level

$$tiles = 4^z = 2^z \times 2^z$$

### World to Tile Index

$$tileX = \lfloor worldX \times 2^z \rfloor$$
$$tileY = \lfloor worldY \times 2^z \rfloor$$

### Meters Per Pixel

$$mpp = \frac{C \cdot \cos(lat)}{tileSize \cdot 2^z}$$

Where $C$ = Earth's circumference (40,075 km)

---

## Resources

- [Slippy Map Tilenames (OSM Wiki)](https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames)
- [Web Mercator (EPSG:3857)](https://epsg.io/3857)
- [Mapbox Vector Tile Specification](https://github.com/mapbox/vector-tile-spec)
- [WebGPU Primitive Topologies](https://www.w3.org/TR/webgpu/#enumdef-gpuprimitivetopology)
