<script lang="ts">
	import {
		destroyContext,
		initWebGPU,
		isWebGPUSupported,
		type GPUContextResult
	} from '$lib/gpu/context.js';
	import { createTrianglePipeline, renderFrame } from '$lib/gpu/pipeline.js';

	interface Props {
		width?: number;
		height?: number;
		clearColor?: GPUColor;
	}

	let {
		width = 800,
		height = 600,
		clearColor = { r: 0.1, g: 0.1, b: 0.15, a: 1.0 }
	}: Props = $props();

	// Reactive state
	let canvas: HTMLCanvasElement | undefined = $state();
	let gpuContext: GPUContextResult | null = $state(null);
	let pipeline: GPURenderPipeline | null = $state(null);
	let error: string | null = $state(null);
	let supported = $state(true);

	// Check WebGPU support on mount (browser only)
	$effect(() => {
		supported = isWebGPUSupported();
		if (!supported) {
			error =
				'WebGPU is not supported in this browser. Please use Chrome, Edge, or another WebGPU-compatible browser.';
		}
	});

	// Initialize WebGPU when canvas is available
	$effect(() => {
		if (!canvas || !supported) return;

		let destroyed = false;

		async function init() {
			try {
				if (!canvas || destroyed) return;

				// Initialize GPU context (adapter, device, swap chain)
				const ctx = await initWebGPU(canvas);
				if (destroyed) {
					destroyContext(ctx.device);
					return;
				}
				gpuContext = ctx;

				// Create render pipeline
				const { pipeline: p } = createTrianglePipeline(ctx.device, ctx.format);
				if (destroyed) return;
				pipeline = p;

				// Initial render
				renderFrame(ctx.device, ctx.context, p, clearColor);
			} catch (e) {
				if (!destroyed) {
					error = e instanceof Error ? e.message : 'Failed to initialize WebGPU';
					console.error('WebGPU initialization error:', e);
				}
			}
		}

		init();

		// Cleanup on unmount or when canvas changes
		return () => {
			destroyed = true;
			if (gpuContext) {
				destroyContext(gpuContext.device);
				gpuContext = null;
				pipeline = null;
			}
		};
	});

	// Re-render when clearColor changes
	$effect(() => {
		if (gpuContext && pipeline) {
			renderFrame(gpuContext.device, gpuContext.context, pipeline, clearColor);
		}
	});
</script>

<div class="webgpu-container">
	{#if !supported || error}
		<div class="error">
			<p>⚠️ {error}</p>
		</div>
	{:else}
		<canvas bind:this={canvas} {width} {height}></canvas>
	{/if}
</div>

<style>
	.webgpu-container {
		display: inline-block;
	}

	canvas {
		display: block;
		border-radius: 4px;
	}

	.error {
		display: flex;
		align-items: center;
		justify-content: center;
		background: #1a1a2e;
		color: #ff6b6b;
		padding: 2rem;
		border-radius: 4px;
		text-align: center;
	}
</style>
