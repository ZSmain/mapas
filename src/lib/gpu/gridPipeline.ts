/**
 * Grid Rendering Pipeline
 *
 * Creates a GPU pipeline for rendering tile grid lines.
 * Uses line primitives (line-list topology) instead of triangles.
 */

import gridShaderSource from './shaders/grid.wgsl?raw';

/**
 * Result of creating the grid pipeline
 */
export interface GridPipelineResult {
    pipeline: GPURenderPipeline;
    bindGroupLayout: GPUBindGroupLayout;
}

/**
 * Create the grid rendering pipeline
 *
 * @param device - GPU device
 * @param format - Canvas texture format
 * @returns Pipeline and bind group layout
 */
export function createGridPipeline(device: GPUDevice, format: GPUTextureFormat): GridPipelineResult {
    // Create shader module
    const shaderModule = device.createShaderModule({
        label: 'Grid Shader',
        code: gridShaderSource
    });

    // Create bind group layout for uniforms
    const bindGroupLayout = device.createBindGroupLayout({
        label: 'Grid Bind Group Layout',
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.VERTEX,
                buffer: { type: 'uniform' }
            }
        ]
    });

    // Create pipeline layout
    const pipelineLayout = device.createPipelineLayout({
        label: 'Grid Pipeline Layout',
        bindGroupLayouts: [bindGroupLayout]
    });

    // Vertex buffer layout (position only)
    const vertexBufferLayout: GPUVertexBufferLayout = {
        arrayStride: 2 * 4, // 2 floats * 4 bytes
        stepMode: 'vertex',
        attributes: [
            {
                shaderLocation: 0,
                offset: 0,
                format: 'float32x2'
            }
        ]
    };

    // Create render pipeline with line-list topology
    const pipeline = device.createRenderPipeline({
        label: 'Grid Pipeline',
        layout: pipelineLayout,
        vertex: {
            module: shaderModule,
            entryPoint: 'vertexMain',
            buffers: [vertexBufferLayout]
        },
        fragment: {
            module: shaderModule,
            entryPoint: 'fragmentMain',
            targets: [{ format }]
        },
        primitive: {
            topology: 'line-list' // Two vertices per line
        }
    });

    return { pipeline, bindGroupLayout };
}

/**
 * Create a bind group for the grid pipeline
 */
export function createGridBindGroup(
    device: GPUDevice,
    layout: GPUBindGroupLayout,
    uniformBuffer: GPUBuffer
): GPUBindGroup {
    return device.createBindGroup({
        label: 'Grid Bind Group',
        layout,
        entries: [
            {
                binding: 0,
                resource: { buffer: uniformBuffer }
            }
        ]
    });
}

/**
 * Create or update the grid vertex buffer
 *
 * @param device - GPU device
 * @param vertices - Grid line vertices (pairs of points)
 * @param existingBuffer - Optional existing buffer to reuse if large enough
 * @returns New or reused vertex buffer
 */
export function createGridVertexBuffer(
    device: GPUDevice,
    vertices: Float32Array,
    existingBuffer?: GPUBuffer
): GPUBuffer {
    const requiredSize = vertices.byteLength;

    // If we have an existing buffer that's big enough, reuse it
    if (existingBuffer && existingBuffer.size >= requiredSize) {
        device.queue.writeBuffer(existingBuffer, 0, vertices.buffer, vertices.byteOffset, vertices.byteLength);
        return existingBuffer;
    }

    // Otherwise create a new buffer
    // Add some extra space to reduce reallocations
    const bufferSize = Math.max(requiredSize, 4096); // At least 4KB

    const buffer = device.createBuffer({
        label: 'Grid Vertex Buffer',
        size: bufferSize,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });

    device.queue.writeBuffer(buffer, 0, vertices.buffer, vertices.byteOffset, vertices.byteLength);

    return buffer;
}

/**
 * Render one frame of the grid
 */
export function renderGridFrame(
    device: GPUDevice,
    context: GPUCanvasContext,
    pipeline: GPURenderPipeline,
    vertexBuffer: GPUBuffer,
    bindGroup: GPUBindGroup,
    vertexCount: number,
    clearColor: GPUColor = { r: 0.05, g: 0.05, b: 0.1, a: 1.0 }
): void {
    // Get current texture to render to
    const textureView = context.getCurrentTexture().createView();

    // Create command encoder
    const commandEncoder = device.createCommandEncoder({
        label: 'Grid Frame Command Encoder'
    });

    // Begin render pass
    const passEncoder = commandEncoder.beginRenderPass({
        colorAttachments: [
            {
                view: textureView,
                clearValue: clearColor,
                loadOp: 'clear',
                storeOp: 'store'
            }
        ]
    });

    // Draw grid lines
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.setVertexBuffer(0, vertexBuffer);
    passEncoder.draw(vertexCount);

    // End pass and submit
    passEncoder.end();
    device.queue.submit([commandEncoder.finish()]);
}

/**
 * Render grid with additional geometry (e.g., a reference shape)
 */
export function renderGridWithOverlay(
    device: GPUDevice,
    context: GPUCanvasContext,
    gridPipeline: GPURenderPipeline,
    gridVertexBuffer: GPUBuffer,
    gridBindGroup: GPUBindGroup,
    gridVertexCount: number,
    overlayPipeline: GPURenderPipeline,
    overlayVertexBuffer: GPUBuffer,
    overlayBindGroup: GPUBindGroup,
    overlayVertexCount: number,
    clearColor: GPUColor = { r: 0.05, g: 0.05, b: 0.1, a: 1.0 }
): void {
    const textureView = context.getCurrentTexture().createView();

    const commandEncoder = device.createCommandEncoder({
        label: 'Grid + Overlay Frame Command Encoder'
    });

    const passEncoder = commandEncoder.beginRenderPass({
        colorAttachments: [
            {
                view: textureView,
                clearValue: clearColor,
                loadOp: 'clear',
                storeOp: 'store'
            }
        ]
    });

    // Draw grid first
    if (gridVertexCount > 0) {
        passEncoder.setPipeline(gridPipeline);
        passEncoder.setBindGroup(0, gridBindGroup);
        passEncoder.setVertexBuffer(0, gridVertexBuffer);
        passEncoder.draw(gridVertexCount);
    }

    // Draw overlay on top
    if (overlayVertexCount > 0) {
        passEncoder.setPipeline(overlayPipeline);
        passEncoder.setBindGroup(0, overlayBindGroup);
        passEncoder.setVertexBuffer(0, overlayVertexBuffer);
        passEncoder.draw(overlayVertexCount);
    }

    passEncoder.end();
    device.queue.submit([commandEncoder.finish()]);
}
