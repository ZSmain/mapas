<script lang="ts">
	import { cameraToLngLat, lngLatToCamera } from '$lib/geo/projection.js';
	import { createTileGridVertices, getTileZoom, getVisibleTiles } from '$lib/geo/tiles.js';
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
		createGridBindGroup,
		createGridPipeline,
		createGridVertexBuffer,
		renderGridFrame
	} from '$lib/gpu/gridPipeline.js';
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
		initialLng?: number;
		initialLat?: number;
		initialZoom?: number;
	}

	let {
		width = 800,
		height = 600,
		clearColor = { r: 0.05, g: 0.05, b: 0.1, a: 1.0 },
		initialLng = 0,
		initialLat = 20,
		initialZoom = 2
	}: Props = $props();

	// Canvas and GPU state
	let canvas: HTMLCanvasElement | undefined = $state();
	let gpuContext: GPUContextResult | null = $state(null);
	let error: string | null = $state(null);
	let supported = $state(true);

	// GPU resources
	let gridPipeline: GPURenderPipeline | null = $state(null);
	let gridVertexBuffer: GPUBuffer | null = $state(null);
	let uniformBuffer: GPUBuffer | null = $state(null);
	let gridBindGroup: GPUBindGroup | null = $state(null);
	let gridVertexCount = $state(0);

	// Camera state - start centered on a location
	const initialCameraPos = lngLatToCamera({ lng: initialLng, lat: initialLat });
	let camera: Camera2D = $state(createCamera(initialCameraPos.x, initialCameraPos.y, initialZoom));
	let pointer: PointerState = $state(createPointerState());

	// Derived state for display
	let tileZoom = $derived(getTileZoom(camera.zoom, 0, 18));
	let centerLngLat = $derived(cameraToLngLat(camera.x, camera.y));
	let visibleTiles = $derived(() => {
		const aspectRatio = width / height;
		return getVisibleTiles(camera, aspectRatio, 0, 18);
	});

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

				// Create grid pipeline
				const { pipeline, bindGroupLayout } = createGridPipeline(ctx.device, ctx.format);
				if (destroyed) return;
				gridPipeline = pipeline;

				// Create uniform buffer for transformation matrix
				uniformBuffer = createUniformBuffer(ctx.device, 'Grid Transform Matrix');

				// Create bind group
				gridBindGroup = createGridBindGroup(ctx.device, bindGroupLayout, uniformBuffer);

				// Create initial vertex buffer (will be populated in render loop)
				gridVertexBuffer = ctx.device.createBuffer({
					label: 'Grid Vertex Buffer (Initial)',
					size: 4096, // Start with 4KB
					usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
				});

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
				gridPipeline = null;
				gridVertexBuffer = null;
				uniformBuffer = null;
				gridBindGroup = null;
			}
		};
	});

	function startRenderLoop() {
		function render() {
			if (!gpuContext || !gridPipeline || !uniformBuffer || !gridBindGroup || !canvas) {
				return;
			}

			// Calculate visible tiles
			const aspectRatio = width / height;
			const tiles = getVisibleTiles(camera, aspectRatio, 0, 18);

			// Generate grid vertices
			const vertices = createTileGridVertices(tiles);
			gridVertexCount = vertices.length / 2; // 2 floats per vertex

			// Update or create vertex buffer
			if (gridVertexCount > 0) {
				gridVertexBuffer = createGridVertexBuffer(
					gpuContext.device,
					vertices,
					gridVertexBuffer ?? undefined
				);
			}

			// Update transformation matrix
			const matrix = createViewProjectionMatrix(camera, aspectRatio);
			updateUniformBuffer(gpuContext.device, uniformBuffer, matrix);

			// Render frame
			if (gridVertexBuffer && gridVertexCount > 0) {
				renderGridFrame(
					gpuContext.device,
					gpuContext.context,
					gridPipeline,
					gridVertexBuffer,
					gridBindGroup,
					gridVertexCount,
					clearColor
				);
			}

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
		const cameraPos = lngLatToCamera({ lng: initialLng, lat: initialLat });
		camera = createCamera(cameraPos.x, cameraPos.y, initialZoom);
	}

	function goToLocation(lng: number, lat: number, zoom: number) {
		const cameraPos = lngLatToCamera({ lng, lat });
		camera = createCamera(cameraPos.x, cameraPos.y, zoom);
	}
</script>

<div class="grid-canvas">
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
			<div class="info">
				<span class="coord">
					{centerLngLat.lng.toFixed(2)}°, {centerLngLat.lat.toFixed(2)}°
				</span>
				<span class="zoom-info">
					Z{tileZoom} | {visibleTiles().length} tiles
				</span>
			</div>
			<div class="buttons">
				<button onclick={() => goToLocation(-122.4194, 37.7749, 8)} title="San Francisco">🌁</button
				>
				<button onclick={() => goToLocation(2.3522, 48.8566, 8)} title="Paris">🗼</button>
				<button onclick={() => goToLocation(139.6917, 35.6895, 8)} title="Tokyo">🏯</button>
				<button onclick={resetView} title="Reset View">🌍</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.grid-canvas {
		display: inline-block;
	}

	canvas {
		display: block;
		border-radius: 4px;
		cursor: grab;
		touch-action: none;
	}

	canvas:active {
		cursor: grabbing;
	}

	.controls {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 0.75rem;
		background: #1a1a2e;
		border-radius: 0 0 4px 4px;
		margin-top: -4px;
	}

	.info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.coord {
		font-family: monospace;
		font-size: 0.9rem;
		color: #aaa;
	}

	.zoom-info {
		font-family: monospace;
		font-size: 0.75rem;
		color: #666;
	}

	.buttons {
		display: flex;
		gap: 0.5rem;
	}

	button {
		padding: 0.4rem 0.6rem;
		background: #2a2a4e;
		color: white;
		border: 1px solid #3a3a5e;
		border-radius: 4px;
		cursor: pointer;
		font-size: 1rem;
		transition: all 0.2s;
	}

	button:hover {
		background: #3a3a6e;
		border-color: #5a5a8e;
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
