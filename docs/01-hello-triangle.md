# Step 1: The "Hello Triangle" — WebGPU Fundamentals

This document explains everything we built in Step 1 of your WebGPU vector map engine. By the end, you'll understand how to get a GPU device, set up a canvas for rendering, write shaders, and issue your first draw call.

---

## Table of Contents

1. [The Big Picture](#the-big-picture)
2. [GPU Context: Adapter, Device, and Canvas](#gpu-context-adapter-device-and-canvas)
3. [The Swap Chain (Canvas Context)](#the-swap-chain-canvas-context)
4. [WGSL Shaders](#wgsl-shaders)
5. [The Render Pipeline](#the-render-pipeline)
6. [Command Buffers and Draw Calls](#command-buffers-and-draw-calls)
7. [Svelte 5 Integration](#svelte-5-integration)
8. [File Structure](#file-structure)

---

## The Big Picture

WebGPU is a modern graphics API that gives you **explicit control** over GPU resources. Unlike older APIs (Canvas 2D, even WebGL to some extent), WebGPU requires you to:

1. **Request access** to the GPU hardware
2. **Configure** how you'll display results
3. **Define pipelines** that describe how data flows through shaders
4. **Record commands** and submit them as batches

Here's the flow for rendering a single frame:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Adapter   │────▶│   Device    │────▶│  Pipeline   │────▶│   Render    │
│  (find GPU) │     │(create res.)│     │  (shaders)  │     │   (draw!)   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

---

## GPU Context: Adapter, Device, and Canvas

### File: `src/lib/gpu/context.ts`

### The Adapter

The **adapter** represents a physical GPU in your system. It's your first contact with WebGPU:

```typescript
const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance'
});
```

**Key concepts:**
- `navigator.gpu` is the entry point to WebGPU (only exists in supported browsers)
- `powerPreference` hints whether to use integrated or discrete GPU
- The adapter is **read-only** — you can query capabilities but not create resources

### The Device

The **device** is your main interface for creating GPU resources (buffers, textures, pipelines):

```typescript
const device = await adapter.requestDevice({
    label: 'Mapas GPU Device'
});
```

**Key concepts:**
- A device is a **logical** connection to the GPU
- All resource creation goes through the device
- Devices can be "lost" (GPU reset, tab backgrounded) — we handle this:

```typescript
device.lost.then((info) => {
    console.error(`WebGPU device was lost: ${info.message}`);
});
```

### The Full Initialization Flow

```typescript
export async function initWebGPU(canvas: HTMLCanvasElement): Promise<GPUContextResult> {
    const adapter = await requestAdapter();      // 1. Find GPU
    const device = await requestDevice(adapter); // 2. Get logical device
    const { context, format } = configureCanvasContext(canvas, device); // 3. Setup display
    return { device, context, format };
}
```

---

## The Swap Chain (Canvas Context)

The **swap chain** (called `GPUCanvasContext` in WebGPU) is the bridge between your GPU rendering and the screen.

### Why "Swap Chain"?

GPUs typically render to an **off-screen texture** while the previous frame is being displayed. When rendering completes, the textures are "swapped" — the newly rendered one goes to the screen, and the old one becomes available for the next frame. This prevents tearing and flickering.

### Configuring the Canvas

```typescript
export function configureCanvasContext(canvas: HTMLCanvasElement, device: GPUDevice) {
    const context = canvas.getContext('webgpu');
    
    // Get the preferred format (usually 'bgra8unorm' on most systems)
    const format = navigator.gpu.getPreferredCanvasFormat();
    
    // Configure the swap chain
    context.configure({
        device,
        format,
        alphaMode: 'premultiplied'
    });
    
    return { context, format };
}
```

**Key concepts:**

| Property | Meaning |
|----------|---------|
| `device` | Which GPU device will render to this canvas |
| `format` | Pixel format — `bgra8unorm` means Blue-Green-Red-Alpha, 8 bits each, unsigned normalized (0-255 → 0.0-1.0) |
| `alphaMode` | How transparency is handled when compositing with the page |

---

## WGSL Shaders

### File: `src/lib/gpu/shaders/triangle.wgsl`

**WGSL** (WebGPU Shading Language) is WebGPU's shader language. It replaces GLSL from WebGL.

### The Vertex Shader

The vertex shader runs **once per vertex** and determines where each vertex appears on screen:

```wgsl
struct VertexOutput {
    @builtin(position) position: vec4f,  // Required: clip-space position
    @location(0) color: vec3f,           // Custom: vertex color
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    // Hardcoded triangle in clip space (-1 to 1)
    var positions = array<vec2f, 3>(
        vec2f( 0.0,  0.5),   // Top
        vec2f(-0.5, -0.5),   // Bottom-left
        vec2f( 0.5, -0.5)    // Bottom-right
    );
    
    var colors = array<vec3f, 3>(
        vec3f(1.0, 0.0, 0.0),  // Red
        vec3f(0.0, 1.0, 0.0),  // Green
        vec3f(0.0, 0.0, 1.0)   // Blue
    );
    
    var output: VertexOutput;
    output.position = vec4f(positions[vertexIndex], 0.0, 1.0);
    output.color = colors[vertexIndex];
    return output;
}
```

**Key concepts:**

| WGSL Syntax | Meaning |
|-------------|---------|
| `@builtin(position)` | Special output: the vertex's position in clip space |
| `@builtin(vertex_index)` | Special input: which vertex we're processing (0, 1, or 2) |
| `@location(0)` | User-defined attribute slot — passed to fragment shader |
| `vec4f` | 4-component float vector (x, y, z, w) |
| `@vertex` | Marks this function as the vertex shader entry point |

**Clip Space:**
```
        (0, 1)
           │
(-1, 0)────┼────(1, 0)
           │
        (0, -1)
```
The visible area is -1 to 1 on both axes. Anything outside is "clipped" (not drawn).

### The Fragment Shader

The fragment shader runs **once per pixel** (fragment) covered by the triangle:

```wgsl
@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
    return vec4f(input.color, 1.0);  // RGB from vertex, A = 1 (opaque)
}
```

**Key concepts:**
- `input.color` is **interpolated** — pixels between vertices get blended colors
- `@location(0)` output goes to the first color attachment (our canvas)
- This is why our triangle has a smooth gradient — the GPU interpolates the red/green/blue vertex colors across all pixels

---

## The Render Pipeline

### File: `src/lib/gpu/pipeline.ts`

A **render pipeline** is a compiled, immutable description of how to render. It includes:

1. Which shaders to use
2. How vertices are interpreted
3. How pixels are written to the output

```typescript
const pipeline = device.createRenderPipeline({
    label: 'Triangle Render Pipeline',
    layout: 'auto',  // Let WebGPU figure out bind group layouts
    
    vertex: {
        module: shaderModule,
        entryPoint: 'vertexMain'
    },
    
    fragment: {
        module: shaderModule,
        entryPoint: 'fragmentMain',
        targets: [{ format }]  // Output format must match canvas
    },
    
    primitive: {
        topology: 'triangle-list',  // Every 3 vertices = 1 triangle
        frontFace: 'ccw',           // Counter-clockwise = front
        cullMode: 'none'            // Draw both sides
    }
});
```

### Why Pipelines Are Pre-compiled

Unlike WebGL where you set state incrementally, WebGPU pipelines are **compiled once** and reused. This:
- Validates everything upfront (fewer runtime errors)
- Allows driver optimizations
- Makes state changes explicit and predictable

---

## Command Buffers and Draw Calls

### The Render Frame

Every frame follows this pattern:

```typescript
export function renderFrame(device, context, pipeline, clearColor) {
    // 1. Get the texture we'll render to (from swap chain)
    const textureView = context.getCurrentTexture().createView();
    
    // 2. Create a command encoder (records GPU commands)
    const commandEncoder = device.createCommandEncoder();
    
    // 3. Begin a render pass (like opening a drawing context)
    const passEncoder = commandEncoder.beginRenderPass({
        colorAttachments: [{
            view: textureView,
            clearValue: clearColor,
            loadOp: 'clear',    // Clear before drawing
            storeOp: 'store'    // Keep the results
        }]
    });
    
    // 4. Record drawing commands
    passEncoder.setPipeline(pipeline);
    passEncoder.draw(3);  // Draw 3 vertices
    
    // 5. End the pass
    passEncoder.end();
    
    // 6. Submit all recorded commands to the GPU
    device.queue.submit([commandEncoder.finish()]);
}
```

### Understanding the Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    Command Encoder                           │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                   Render Pass                          │  │
│  │   1. Clear canvas with clearColor                      │  │
│  │   2. setPipeline(trianglePipeline)                     │  │
│  │   3. draw(3) ← Run vertex shader 3 times               │  │
│  │              ← Rasterize triangle                       │  │
│  │              ← Run fragment shader per pixel           │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    device.queue.submit()
                              │
                              ▼
                        GPU executes
```

---

## Svelte 5 Integration

### File: `src/lib/components/WebGPUCanvas.svelte`

We use Svelte 5's **runes** for reactive GPU lifecycle management.

### Reactive State with `$state`

```typescript
let canvas: HTMLCanvasElement | undefined = $state();
let gpuContext: GPUContextResult | null = $state(null);
let pipeline: GPURenderPipeline | null = $state(null);
let error: string | null = $state(null);
```

### Lifecycle with `$effect`

```typescript
// Initialize WebGPU when canvas is available
$effect(() => {
    if (!canvas || !supported) return;
    
    let destroyed = false;
    
    async function init() {
        const ctx = await initWebGPU(canvas);
        if (destroyed) { destroyContext(ctx.device); return; }
        gpuContext = ctx;
        
        const { pipeline: p } = createTrianglePipeline(ctx.device, ctx.format);
        pipeline = p;
        
        renderFrame(ctx.device, ctx.context, p, clearColor);
    }
    
    init();
    
    // Cleanup on unmount
    return () => {
        destroyed = true;
        if (gpuContext) destroyContext(gpuContext.device);
    };
});
```

**Why this pattern?**

1. `$effect` runs after the component mounts (canvas exists)
2. The `destroyed` flag prevents state updates after unmount
3. The return function cleans up GPU resources
4. Async initialization happens inside because `$effect` itself can't be async

### Canvas Binding

```svelte
<canvas bind:this={canvas} {width} {height}></canvas>
```

`bind:this` gives us the actual DOM element so we can call `canvas.getContext('webgpu')`.

---

## File Structure

```
src/lib/
├── gpu/
│   ├── context.ts          # GPU adapter, device, canvas setup
│   ├── pipeline.ts         # Render pipeline and frame rendering
│   └── shaders/
│       └── triangle.wgsl   # WGSL vertex & fragment shaders
├── components/
│   └── WebGPUCanvas.svelte # Svelte component with GPU lifecycle
└── index.ts                # Public exports

src/
├── app.d.ts               # TypeScript declarations (including .wgsl)
└── routes/
    └── +page.svelte       # Demo page
```

---

## What's Next? (Step 2 Preview)

In Step 2 ("Interactive Square"), we'll:

1. **Use vertex buffers** — Move vertex data from shader to GPU buffers
2. **Add uniform buffers** — Pass a transformation matrix for zoom/pan
3. **Handle user input** — Update the matrix on mouse/touch events
4. **Sync Svelte state with GPU** — Make `$zoom` and `$center` drive rendering

This will teach you how to pass dynamic data to the GPU — essential for a map engine where the view constantly changes!

---

## Quick Reference

| Concept | WebGPU Type | Our File |
|---------|-------------|----------|
| GPU Access | `GPUAdapter` → `GPUDevice` | context.ts |
| Canvas Output | `GPUCanvasContext` | context.ts |
| Shader Code | `GPUShaderModule` | pipeline.ts |
| Render Setup | `GPURenderPipeline` | pipeline.ts |
| Drawing | `GPUCommandEncoder` → `GPURenderPassEncoder` | pipeline.ts |
| UI Integration | Svelte 5 `$state`, `$effect` | WebGPUCanvas.svelte |

---

## Resources

- [WebGPU Specification](https://www.w3.org/TR/webgpu/)
- [WGSL Specification](https://www.w3.org/TR/WGSL/)
- [WebGPU Fundamentals](https://webgpufundamentals.org/)
- [Svelte 5 Runes](https://svelte.dev/docs/svelte/$state)
