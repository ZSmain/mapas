// Reexport your entry components here

// Components
export { default as WebGPUCanvas } from './components/WebGPUCanvas.svelte';

// GPU utilities
export { destroyContext, initWebGPU, isWebGPUSupported } from './gpu/context.js';
export type { GPUContextResult } from './gpu/context.js';
export { createTrianglePipeline, renderFrame } from './gpu/pipeline.js';

