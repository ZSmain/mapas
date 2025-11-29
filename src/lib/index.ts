// Reexport your entry components here

// Components
export { default as InteractiveCanvas } from './components/InteractiveCanvas.svelte';
export { default as WebGPUCanvas } from './components/WebGPUCanvas.svelte';

// GPU utilities - Context
export { destroyContext, initWebGPU, isWebGPUSupported } from './gpu/context.js';
export type { GPUContextResult } from './gpu/context.js';

// GPU utilities - Triangle Pipeline (Step 1)
export { createTrianglePipeline, renderFrame } from './gpu/pipeline.js';

// GPU utilities - Buffers (Step 2)
export {
    createColoredSquareVertices, createIndexBuffer, createIndexedSquare, createSquareVertices, createVertexBuffer, getVertexBufferLayout,
    interleaveVertexData
} from './gpu/buffers.js';
export type { Vertex } from './gpu/buffers.js';

// GPU utilities - Transform (Step 2)
export {
    clampZoom, createUniformBuffer, createViewProjectionMatrix, mat3Identity, mat3Multiply, mat3Scale, mat3Translation, screenToWorld, updateUniformBuffer
} from './gpu/transform.js';
export type { Camera2D } from './gpu/transform.js';

// GPU utilities - Square Pipeline (Step 2)
export { createBindGroup, createSquarePipeline, renderSquareFrame, renderSquareFrameIndexed } from './gpu/squarePipeline.js';
export type { SquarePipelineResult } from './gpu/squarePipeline.js';

// GPU utilities - Controls (Step 2)
export {
    createCamera,
    createPointerState, fitToBounds, handlePinchZoom, handlePointerDown, handlePointerMove, handlePointerUp, handleWheel, resetCamera
} from './gpu/controls.js';
export type { PointerState } from './gpu/controls.js';

