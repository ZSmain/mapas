# Step 2: The "Interactive Square" — Buffers and Transformation

This document explains everything we built in Step 2 of the WebGPU vector map engine. You'll learn how to store geometry in GPU buffers, pass transformation data via uniforms, and create interactive pan/zoom controls.

---

## Table of Contents

1. [Overview: From Static to Dynamic](#overview-from-static-to-dynamic)
2. [Vertex Buffers](#vertex-buffers)
3. [Buffer Layouts and Attributes](#buffer-layouts-and-attributes)
4. [Uniform Buffers](#uniform-buffers)
5. [Bind Groups](#bind-groups)
6. [Transformation Matrices](#transformation-matrices)
7. [Camera Controls](#camera-controls)
8. [The Render Loop](#the-render-loop)
9. [Updated Shaders](#updated-shaders)
10. [File Structure](#file-structure)

---

## Overview: From Static to Dynamic

In Step 1, we hardcoded triangle vertices inside the shader. This works for demos but not for real applications where:

- Geometry comes from external data (map tiles, user drawings)
- The view needs to pan and zoom
- Shapes need to be colored based on data

Step 2 introduces the patterns that make dynamic rendering possible:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Vertex Buffer  │────▶│  Vertex Shader  │────▶│   Rasterizer    │
│  (positions,    │     │  (transform by  │     │   (pixels)      │
│   colors)       │     │   matrix)       │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               ▲
                               │
                        ┌──────┴──────┐
                        │   Uniform   │
                        │   Buffer    │
                        │  (matrix)   │
                        └─────────────┘
```

---

## Vertex Buffers

### File: `src/lib/gpu/buffers.ts`

A **vertex buffer** is GPU memory that stores per-vertex data. Instead of defining vertices in the shader, we:

1. Define vertex data on the CPU
2. Upload it to GPU memory
3. Tell the pipeline how to interpret the bytes

### Vertex Data Structure

```typescript
export interface Vertex {
    position: [number, number];      // x, y
    color: [number, number, number]; // r, g, b
}
```

Each vertex has 5 floats = 20 bytes.

### Interleaving Data

GPUs can read data in different layouts. We use **interleaved** format where all attributes for one vertex are together:

```
Vertex 0: [x, y, r, g, b]
Vertex 1: [x, y, r, g, b]
Vertex 2: [x, y, r, g, b]
...
```

```typescript
export function interleaveVertexData(vertices: Vertex[]): Float32Array {
    const data = new Float32Array(vertices.length * 5);
    for (let i = 0; i < vertices.length; i++) {
        const offset = i * 5;
        data[offset + 0] = vertices[i].position[0]; // x
        data[offset + 1] = vertices[i].position[1]; // y
        data[offset + 2] = vertices[i].color[0];    // r
        data[offset + 3] = vertices[i].color[1];    // g
        data[offset + 4] = vertices[i].color[2];    // b
    }
    return data;
}
```

### Creating the Buffer

```typescript
export function createVertexBuffer(device: GPUDevice, vertices: Vertex[]): GPUBuffer {
    const data = interleaveVertexData(vertices);
    
    const buffer = device.createBuffer({
        label: 'Vertex Buffer',
        size: data.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true  // Map immediately for writing
    });
    
    // Copy CPU data to GPU buffer
    new Float32Array(buffer.getMappedRange()).set(data);
    buffer.unmap();  // Release the mapping
    
    return buffer;
}
```

**Key concepts:**

| Property | Meaning |
|----------|---------|
| `size` | Buffer size in bytes |
| `usage` | `VERTEX` = use as vertex data, `COPY_DST` = can receive copies |
| `mappedAtCreation` | Map to CPU memory immediately (for initial data upload) |

---

## Buffer Layouts and Attributes

The GPU needs to know how to interpret the raw bytes in the vertex buffer. This is defined by a **vertex buffer layout**:

```typescript
export function getVertexBufferLayout(): GPUVertexBufferLayout {
    return {
        arrayStride: 5 * 4,  // 20 bytes per vertex
        stepMode: 'vertex',  // Advance per vertex (not per instance)
        attributes: [
            {
                // Position (x, y)
                shaderLocation: 0,    // @location(0) in shader
                offset: 0,            // Starts at byte 0
                format: 'float32x2'   // 2 floats = vec2f
            },
            {
                // Color (r, g, b)
                shaderLocation: 1,    // @location(1) in shader
                offset: 2 * 4,        // Starts at byte 8 (after 2 floats)
                format: 'float32x3'   // 3 floats = vec3f
            }
        ]
    };
}
```

### Visual Layout

```
Byte:    0    4    8   12   16   20   24   28   32   36   40
         ├────┼────┼────┼────┼────┼────┼────┼────┼────┼────┤
         │ x₀ │ y₀ │ r₀ │ g₀ │ b₀ │ x₁ │ y₁ │ r₁ │ g₁ │ b₁ │
         └────┴────┴────┴────┴────┴────┴────┴────┴────┴────┘
         │←── Vertex 0 (20 bytes) ──►│←── Vertex 1 (20 bytes) ──►│
         │    │         │            │
         │    │         └─ @location(1): color, offset=8, float32x3
         │    └─ @location(0): position, offset=0, float32x2
         └─ arrayStride = 20 bytes
```

---

## Uniform Buffers

### File: `src/lib/gpu/transform.ts`

**Uniform buffers** pass data that's the same for all vertices in a draw call — like a transformation matrix.

### Creating a Uniform Buffer

```typescript
export function createUniformBuffer(device: GPUDevice): GPUBuffer {
    return device.createBuffer({
        label: 'Uniform Buffer',
        size: 48,  // 12 floats * 4 bytes (3x3 matrix with padding)
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
}
```

### Updating Every Frame

Unlike vertex buffers (created once), uniform buffers are **updated frequently**:

```typescript
export function updateUniformBuffer(device: GPUDevice, buffer: GPUBuffer, matrix: Float32Array): void {
    device.queue.writeBuffer(buffer, 0, matrix.buffer, matrix.byteOffset, matrix.byteLength);
}
```

`writeBuffer` is faster than mapping for frequent small updates — it queues the copy to happen alongside rendering.

---

## Bind Groups

### File: `src/lib/gpu/squarePipeline.ts`

**Bind groups** connect GPU resources (buffers, textures) to shader bindings.

### Bind Group Layout

First, define what bindings exist:

```typescript
const bindGroupLayout = device.createBindGroupLayout({
    label: 'Square Bind Group Layout',
    entries: [
        {
            binding: 0,                      // @binding(0) in shader
            visibility: GPUShaderStage.VERTEX,  // Only vertex shader uses it
            buffer: { type: 'uniform' }      // It's a uniform buffer
        }
    ]
});
```

### Creating the Bind Group

Then, create a bind group that links an actual buffer to the layout:

```typescript
export function createBindGroup(
    device: GPUDevice,
    layout: GPUBindGroupLayout,
    uniformBuffer: GPUBuffer
): GPUBindGroup {
    return device.createBindGroup({
        label: 'Square Bind Group',
        layout,
        entries: [
            {
                binding: 0,
                resource: { buffer: uniformBuffer }
            }
        ]
    });
}
```

### Using in Render Pass

```typescript
passEncoder.setBindGroup(0, bindGroup);  // @group(0)
passEncoder.setVertexBuffer(0, vertexBuffer);
passEncoder.draw(vertexCount);
```

---

## Transformation Matrices

### Why 3×3 Matrices?

For 2D graphics, we use 3×3 matrices in **homogeneous coordinates**. This lets us combine translation, rotation, and scale into a single matrix multiplication:

```
| scaleX    0      translateX |   | x |   | x' |
|   0    scaleY   translateY | × | y | = | y' |
|   0       0          1     |   | 1 |   | 1  |
```

### Matrix Memory Layout

WebGPU uses **column-major** order and requires **16-byte alignment** for uniform buffer elements:

```typescript
export function mat3Identity(): Float32Array {
    // 3 columns, each padded from vec3 to vec4 (12 floats total)
    return new Float32Array([
        1, 0, 0, 0,  // column 0 + padding
        0, 1, 0, 0,  // column 1 + padding
        0, 0, 1, 0   // column 2 + padding
    ]);
}
```

**Why padding?** GPU hardware reads memory in aligned chunks. A `mat3x3f` in WGSL is stored as 3 `vec3f` values, but each `vec3f` is padded to 16 bytes (like `vec4f`). So 3×3 matrix = 48 bytes, not 36.

### View-Projection Matrix

The camera transform combines:
1. **Translation** — Move world so camera center is at origin
2. **Scale** — Apply zoom level and aspect ratio correction

```typescript
export function createViewProjectionMatrix(camera: Camera2D, aspectRatio: number): Float32Array {
    // Step 1: Translate to center on camera position
    const translate = mat3Translation(-camera.x, -camera.y);
    
    // Step 2: Scale by zoom (with aspect ratio correction)
    const scaleX = camera.zoom / (aspectRatio > 1 ? aspectRatio : 1);
    const scaleY = camera.zoom * (aspectRatio < 1 ? aspectRatio : 1);
    const scale = mat3Scale(scaleX, scaleY);
    
    // Combined: scale * translate
    return mat3Multiply(scale, translate);
}
```

---

## Camera Controls

### File: `src/lib/gpu/controls.ts`

### Camera State

```typescript
export interface Camera2D {
    x: number;      // Center X in world coordinates
    y: number;      // Center Y in world coordinates
    zoom: number;   // Zoom level (1 = 1:1)
}
```

### Pan (Drag to Move)

When the user drags, we:
1. Calculate mouse movement in pixels
2. Convert to world units (accounting for zoom and aspect ratio)
3. Move camera in the opposite direction (drag right → camera moves left)

```typescript
export function handlePointerMove(pointer, x, y, camera, width, height) {
    if (!pointer.isDown) return { pointer, camera };
    
    const deltaX = x - pointer.lastX;
    const deltaY = y - pointer.lastY;
    
    // Convert pixel delta to world units
    const aspectRatio = width / height;
    const scaleX = (aspectRatio > 1 ? aspectRatio : 1) / camera.zoom;
    const scaleY = (aspectRatio < 1 ? 1 / aspectRatio : 1) / camera.zoom;
    
    const worldDeltaX = (-deltaX / width) * 2 * scaleX;
    const worldDeltaY = (deltaY / height) * 2 * scaleY;
    
    return {
        pointer: { ...pointer, lastX: x, lastY: y },
        camera: {
            x: camera.x + worldDeltaX,
            y: camera.y + worldDeltaY,
            zoom: camera.zoom
        }
    };
}
```

### Zoom (Scroll Toward Cursor)

The trick to "zoom toward mouse" is:
1. Find world position under mouse **before** zoom
2. Apply zoom
3. Find world position under mouse **after** zoom
4. Adjust camera to keep that point under the mouse

```typescript
export function handleWheel(deltaY, mouseX, mouseY, camera, width, height) {
    // World position under mouse BEFORE zoom
    const worldBefore = screenToWorld(mouseX, mouseY, width, height, camera);
    
    // Calculate new zoom
    const zoomDelta = -deltaY * 0.001 * camera.zoom;
    const newZoom = clampZoom(camera.zoom + zoomDelta);
    
    // World position under mouse AFTER zoom (camera position unchanged)
    const tempCamera = { ...camera, zoom: newZoom };
    const worldAfter = screenToWorld(mouseX, mouseY, width, height, tempCamera);
    
    // Adjust camera to keep worldBefore under the mouse
    return {
        x: camera.x + (worldBefore.x - worldAfter.x),
        y: camera.y + (worldBefore.y - worldAfter.y),
        zoom: newZoom
    };
}
```

---

## The Render Loop

### File: `src/lib/components/InteractiveCanvas.svelte`

For smooth interaction, we render continuously using `requestAnimationFrame`:

```typescript
function startRenderLoop() {
    function render() {
        // 1. Update transformation matrix from camera state
        const matrix = createViewProjectionMatrix(camera, width / height);
        updateUniformBuffer(device, uniformBuffer, matrix);
        
        // 2. Render frame
        renderSquareFrame(device, context, pipeline, vertexBuffer, bindGroup, vertexCount);
        
        // 3. Request next frame
        animationFrameId = requestAnimationFrame(render);
    }
    render();
}
```

### Cleanup

Always cancel the animation frame and destroy GPU resources when the component unmounts:

```typescript
return () => {
    if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
    }
    if (gpuContext) {
        destroyContext(gpuContext.device);
    }
};
```

---

## Updated Shaders

### File: `src/lib/gpu/shaders/square.wgsl`

### Uniform Declaration

```wgsl
struct Uniforms {
    matrix: mat3x3f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
```

- `@group(0)` — First bind group
- `@binding(0)` — First binding in that group
- `var<uniform>` — Read-only data, same for all vertices

### Vertex Input from Buffer

```wgsl
struct VertexInput {
    @location(0) position: vec2f,  // From vertex buffer
    @location(1) color: vec3f,     // From vertex buffer
}
```

The `@location` decorators match the `shaderLocation` in our buffer layout.

### Applying the Transform

```wgsl
@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    // Extend 2D position to 3D for matrix multiplication
    let transformed = uniforms.matrix * vec3f(input.position, 1.0);
    
    var output: VertexOutput;
    output.position = vec4f(transformed.xy, 0.0, 1.0);  // Clip space
    output.color = input.color;
    return output;
}
```

---

## File Structure

```
src/lib/
├── gpu/
│   ├── context.ts          # GPU adapter, device, canvas setup
│   ├── pipeline.ts         # Triangle pipeline (Step 1)
│   ├── buffers.ts          # Vertex buffer creation [NEW]
│   ├── transform.ts        # Matrix math, uniform buffers [NEW]
│   ├── squarePipeline.ts   # Square pipeline with uniforms [NEW]
│   ├── controls.ts         # Pan/zoom camera controls [NEW]
│   └── shaders/
│       ├── triangle.wgsl   # Step 1 shader
│       └── square.wgsl     # Step 2 shader [NEW]
├── components/
│   ├── WebGPUCanvas.svelte        # Static triangle (Step 1)
│   └── InteractiveCanvas.svelte   # Interactive square (Step 2) [NEW]
└── index.ts                # Public exports
```

---

## What's Next? (Step 3 Preview)

In Step 3 ("The Grid"), we'll:

1. **Mercator Projection** — Convert Lat/Lon to world coordinates
2. **Tile Coordinates** — Calculate visible (z, x, y) tiles from camera state
3. **Grid Rendering** — Draw tile boundaries using our buffer/uniform system
4. **Dynamic Geometry** — Update vertex buffers when tiles change

This will establish the geographic foundation for loading real map data!

---

## Quick Reference

| Concept | WebGPU Type | Our File |
|---------|-------------|----------|
| Geometry Storage | `GPUBuffer` (VERTEX) | buffers.ts |
| Per-Vertex Data | `GPUVertexBufferLayout` | buffers.ts |
| Transform Data | `GPUBuffer` (UNIFORM) | transform.ts |
| Shader Binding | `GPUBindGroup` | squarePipeline.ts |
| Matrix Math | `Float32Array` | transform.ts |
| User Input | Pointer/Wheel Events | controls.ts |
| Continuous Render | `requestAnimationFrame` | InteractiveCanvas.svelte |

---

## Key Differences from Step 1

| Aspect | Step 1 | Step 2 |
|--------|--------|--------|
| Vertex Data | Hardcoded in shader | GPU vertex buffer |
| Transform | None | Uniform buffer with matrix |
| Rendering | Single render | Continuous render loop |
| Interaction | None | Pan and zoom |
| Pipeline Layout | `'auto'` | Explicit bind group layout |

---

## Resources

- [WebGPU Buffer Best Practices](https://toji.dev/webgpu-best-practices/buffer-uploads.html)
- [WGSL Memory Layout](https://www.w3.org/TR/WGSL/#memory-layouts)
- [Homogeneous Coordinates](https://www.songho.ca/math/homogeneous/homogeneous.html)
- [Svelte 5 Runes](https://svelte.dev/docs/svelte/$state)
