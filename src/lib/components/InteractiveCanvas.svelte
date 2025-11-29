<script lang="ts">
	import { createColoredSquareVertices, createVertexBuffer } from '$lib/gpu/buffers.js';
	import {
		destroyContext,
		initWebGPU,
		isWebGPUSupported,
		type GPUContextResult
	} from '$lib/gpu/context.js';
	import {
		createCamera,
		createPointerState,
		handlePointerDown,
		handlePointerMove,
		handlePointerUp,
		handleWheel,
		type PointerState
	} from '$lib/gpu/controls.js';
	import {
		createBindGroup,
		createSquarePipeline,
		renderSquareFrame
	} from '$lib/gpu/squarePipeline.js';
	import {
		createUniformBuffer,
		createViewProjectionMatrix,
		updateUniformBuffer,
		type Camera2D
	} from '$lib/gpu/transform.js';

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

	// Canvas and GPU state
	let canvas: HTMLCanvasElement | undefined = $state();
	let gpuContext: GPUContextResult | null = $state(null);
	let error: string | null = $state(null);
	let supported = $state(true);

	// GPU resources
	let pipeline: GPURenderPipeline | null = $state(null);
	let vertexBuffer: GPUBuffer | null = $state(null);
	let uniformBuffer: GPUBuffer | null = $state(null);
	let bindGroup: GPUBindGroup | null = $state(null);
	let vertexCount = $state(0);

	// Camera state (reactive)
	let camera: Camera2D = $state(createCamera(0, 0, 1));
	let pointer: PointerState = $state(createPointerState());

	// Animation frame ID for cleanup
	let animationFrameId: number | null = null;

	// Check WebGPU support
	$effect(() => {
		supported = isWebGPUSupported();
		if (!supported) {
			error =
				'WebGPU is not supported in this browser. Please use Chrome, Edge, or another WebGPU-compatible browser.';
		}
	});

	// Initialize WebGPU and start render loop
	$effect(() => {
		if (!canvas || !supported) return;

		let destroyed = false;

		async function init() {
			try {
				if (!canvas || destroyed) return;

				// Initialize GPU context
				const ctx = await initWebGPU(canvas);
				if (destroyed) {
					destroyContext(ctx.device);
					return;
				}
				gpuContext = ctx;

				// Create pipeline with vertex buffer and uniform support
				const { pipeline: p, bindGroupLayout } = createSquarePipeline(ctx.device, ctx.format);
				if (destroyed) return;
				pipeline = p;

				// Create vertex buffer with colored square
				const vertices = createColoredSquareVertices(0.5);
				vertexBuffer = createVertexBuffer(ctx.device, vertices, 'Square Vertices');
				vertexCount = vertices.length;

				// Create uniform buffer for transformation matrix
				uniformBuffer = createUniformBuffer(ctx.device, 'Transform Matrix');

				// Create bind group linking uniform buffer to shader
				bindGroup = createBindGroup(ctx.device, bindGroupLayout, uniformBuffer);

				// Start render loop
				startRenderLoop();
			} catch (e) {
				if (!destroyed) {
					error = e instanceof Error ? e.message : 'Failed to initialize WebGPU';
					console.error('WebGPU initialization error:', e);
				}
			}
		}

		init();

		return () => {
			destroyed = true;
			if (animationFrameId !== null) {
				cancelAnimationFrame(animationFrameId);
				animationFrameId = null;
			}
			if (gpuContext) {
				destroyContext(gpuContext.device);
				gpuContext = null;
				pipeline = null;
				vertexBuffer = null;
				uniformBuffer = null;
				bindGroup = null;
			}
		};
	});

	function startRenderLoop() {
		function render() {
			if (!gpuContext || !pipeline || !vertexBuffer || !uniformBuffer || !bindGroup || !canvas) {
				return;
			}

			// Update transformation matrix based on camera
			const aspectRatio = width / height;
			const matrix = createViewProjectionMatrix(camera, aspectRatio);
			updateUniformBuffer(gpuContext.device, uniformBuffer, matrix);

			// Render frame
			renderSquareFrame(
				gpuContext.device,
				gpuContext.context,
				pipeline,
				vertexBuffer,
				bindGroup,
				vertexCount,
				clearColor
			);

			// Continue loop
			animationFrameId = requestAnimationFrame(render);
		}

		render();
	}

	// Event handlers
	function onPointerDown(e: PointerEvent) {
		if (!canvas) return;
		canvas.setPointerCapture(e.pointerId);
		pointer = handlePointerDown(pointer, e.offsetX, e.offsetY);
	}

	function onPointerUp(e: PointerEvent) {
		if (!canvas) return;
		canvas.releasePointerCapture(e.pointerId);
		pointer = handlePointerUp(pointer);
	}

	function onPointerMove(e: PointerEvent) {
		if (!canvas) return;
		const result = handlePointerMove(pointer, e.offsetX, e.offsetY, camera, width, height);
		pointer = result.pointer;
		camera = result.camera;
	}

	function onWheel(e: WheelEvent) {
		e.preventDefault();
		camera = handleWheel(e.deltaY, e.offsetX, e.offsetY, camera, width, height);
	}

	function resetView() {
		camera = createCamera(0, 0, 1);
	}
</script>

<div class="interactive-canvas">
	{#if !supported || error}
		<div class="error">
			<p>⚠️ {error}</p>
		</div>
	{:else}
		<canvas
			bind:this={canvas}
			{width}
			{height}
			onpointerdown={onPointerDown}
			onpointerup={onPointerUp}
			onpointermove={onPointerMove}
			onpointerleave={onPointerUp}
			onwheel={onWheel}
		></canvas>
		<div class="controls">
			<span class="info">
				Zoom: {camera.zoom.toFixed(2)}x | Center: ({camera.x.toFixed(2)}, {camera.y.toFixed(2)})
			</span>
			<button onclick={resetView}>Reset View</button>
		</div>
	{/if}
</div>

<style>
	.interactive-canvas {
		display: inline-block;
	}

	canvas {
		display: block;
		border-radius: 4px;
		cursor: grab;
		touch-action: none; /* Prevent browser handling of touch gestures */
	}

	canvas:active {
		cursor: grabbing;
	}

	.controls {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem;
		background: #1a1a2e;
		border-radius: 0 0 4px 4px;
		margin-top: -4px;
	}

	.info {
		font-family: monospace;
		font-size: 0.85rem;
		color: #888;
	}

	button {
		padding: 0.4rem 0.8rem;
		background: #ff3e00;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.85rem;
	}

	button:hover {
		background: #ff5722;
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
