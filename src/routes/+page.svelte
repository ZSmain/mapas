<script lang="ts">
	import { WebGPUCanvas } from '$lib/index.js';
</script>

<main>
	<h1>WebGPU Vector Map Engine</h1>
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
