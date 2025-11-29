<script lang="ts">
	import { InteractiveCanvas, WebGPUCanvas } from '$lib/index.js';

	let activeStep = $state<1 | 2>(2);
</script>

<main>
	<h1>WebGPU Vector Map Engine</h1>

	<nav class="tabs">
		<button class:active={activeStep === 1} onclick={() => (activeStep = 1)}>
			Step 1: Hello Triangle
		</button>
		<button class:active={activeStep === 2} onclick={() => (activeStep = 2)}>
			Step 2: Interactive Square
		</button>
	</nav>

	{#if activeStep === 1}
		<p>Step 1: Hello Triangle — WebGPU Canvas and Device Setup</p>

		<div class="canvas-container">
			<WebGPUCanvas width={600} height={400} />
		</div>

		<section class="info">
			<h2>What's happening?</h2>
			<ul>
				<li><strong>GPU Device:</strong> Connected to your graphics hardware via WebGPU</li>
				<li>
					<strong>Swap Chain:</strong> Canvas context configured with <code>bgra8unorm</code> format
				</li>
				<li><strong>Pipeline:</strong> Render pipeline with WGSL vertex & fragment shaders</li>
				<li><strong>Draw Call:</strong> Triangle rendered with interpolated vertex colors</li>
			</ul>
		</section>
	{:else}
		<p>Step 2: Interactive Square — Buffers, Uniforms, and Camera Controls</p>

		<div class="canvas-container">
			<InteractiveCanvas width={600} height={400} />
		</div>

		<section class="info">
			<h2>What's happening?</h2>
			<ul>
				<li>
					<strong>Vertex Buffer:</strong> Square geometry stored in GPU memory (6 vertices, 2 triangles)
				</li>
				<li><strong>Uniform Buffer:</strong> 3×3 transformation matrix updated every frame</li>
				<li>
					<strong>Bind Groups:</strong> Connect uniform buffer to shader via
					<code>@group(0) @binding(0)</code>
				</li>
				<li>
					<strong>Render Loop:</strong> <code>requestAnimationFrame</code> drives continuous rendering
				</li>
			</ul>
			<h2>Controls</h2>
			<ul>
				<li><strong>Pan:</strong> Click and drag to move the view</li>
				<li><strong>Zoom:</strong> Scroll wheel to zoom in/out (toward mouse position)</li>
				<li><strong>Reset:</strong> Click "Reset View" to return to default</li>
			</ul>
		</section>
	{/if}
</main>

<style>
	main {
		max-width: 800px;
		margin: 0 auto;
		padding: 2rem;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
	}

	h1 {
		color: #ff3e00;
		margin-bottom: 0.5rem;
	}

	p {
		color: #666;
		margin-bottom: 2rem;
	}

	.tabs {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.tabs button {
		padding: 0.6rem 1.2rem;
		border: 2px solid #ddd;
		background: white;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.9rem;
		transition: all 0.2s;
	}

	.tabs button:hover {
		border-color: #ff3e00;
	}

	.tabs button.active {
		background: #ff3e00;
		color: white;
		border-color: #ff3e00;
	}

	.canvas-container {
		display: flex;
		justify-content: center;
		margin: 2rem 0;
	}

	.info {
		background: #f4f4f4;
		padding: 1.5rem;
		border-radius: 8px;
		margin-top: 2rem;
	}

	.info h2 {
		margin-top: 0;
		font-size: 1.2rem;
	}

	.info h2:not(:first-child) {
		margin-top: 1.5rem;
	}

	.info ul {
		margin: 0;
		padding-left: 1.5rem;
	}

	.info li {
		margin: 0.5rem 0;
	}

	code {
		background: #e0e0e0;
		padding: 0.2rem 0.4rem;
		border-radius: 3px;
		font-size: 0.9em;
	}
</style>
