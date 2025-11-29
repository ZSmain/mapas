/**
 * Square Pipeline Module
 * Creates pipeline with vertex buffers and uniform bindings
 */

import { getVertexBufferLayout } from './buffers.js';
import { createShaderModule } from './pipeline.js';
import squareShaderSource from './shaders/square.wgsl?raw';

export interface SquarePipelineResult {
    pipeline: GPURenderPipeline;
    bindGroupLayout: GPUBindGroupLayout;
}

/**
 * Create the square render pipeline with vertex buffer and uniform support
 */
export function createSquarePipeline(device: GPUDevice, format: GPUTextureFormat): SquarePipelineResult {
    // Create shader module
    const shaderModule = createShaderModule(device, squareShaderSource, 'Square Shader');

    // Define bind group layout for uniforms
    const bindGroupLayout = device.createBindGroupLayout({
        label: 'Square Bind Group Layout',
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.VERTEX,
                buffer: {
                    type: 'uniform'
                }
            }
        ]
    });

    // Create pipeline layout
    const pipelineLayout = device.createPipelineLayout({
        label: 'Square Pipeline Layout',
        bindGroupLayouts: [bindGroupLayout]
    });

    // Create the render pipeline
    const pipeline = device.createRenderPipeline({
        label: 'Square Render Pipeline',
        layout: pipelineLayout,

        vertex: {
            module: shaderModule,
            entryPoint: 'vertexMain',
            buffers: [getVertexBufferLayout()] // Now using vertex buffer!
        },

        fragment: {
            module: shaderModule,
            entryPoint: 'fragmentMain',
            targets: [{ format }]
        },

        primitive: {
            topology: 'triangle-list',
            frontFace: 'ccw',
            cullMode: 'none'
        }
    });

    return { pipeline, bindGroupLayout };
}

/**
 * Create a bind group for the uniform buffer
 */
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
                resource: {
                    buffer: uniformBuffer
                }
            }
        ]
    });
}

/**
 * Render a frame with vertex buffer and uniforms
 */
export function renderSquareFrame(
    device: GPUDevice,
    context: GPUCanvasContext,
    pipeline: GPURenderPipeline,
    vertexBuffer: GPUBuffer,
    bindGroup: GPUBindGroup,
    vertexCount: number,
    clearColor: GPUColor = { r: 0.1, g: 0.1, b: 0.15, a: 1.0 }
): void {
    const textureView = context.getCurrentTexture().createView();

    const commandEncoder = device.createCommandEncoder({
        label: 'Square Frame Command Encoder'
    });

    const passEncoder = commandEncoder.beginRenderPass({
        label: 'Square Render Pass',
        colorAttachments: [
            {
                view: textureView,
                clearValue: clearColor,
                loadOp: 'clear',
                storeOp: 'store'
            }
        ]
    });

    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup); // Bind uniforms
    passEncoder.setVertexBuffer(0, vertexBuffer); // Bind vertex data
    passEncoder.draw(vertexCount);

    passEncoder.end();
    device.queue.submit([commandEncoder.finish()]);
}

/**
 * Render with indexed drawing (more efficient for shared vertices)
 */
export function renderSquareFrameIndexed(
    device: GPUDevice,
    context: GPUCanvasContext,
    pipeline: GPURenderPipeline,
    vertexBuffer: GPUBuffer,
    indexBuffer: GPUBuffer,
    bindGroup: GPUBindGroup,
    indexCount: number,
    clearColor: GPUColor = { r: 0.1, g: 0.1, b: 0.15, a: 1.0 }
): void {
    const textureView = context.getCurrentTexture().createView();

    const commandEncoder = device.createCommandEncoder({
        label: 'Square Frame Command Encoder (Indexed)'
    });

    const passEncoder = commandEncoder.beginRenderPass({
        label: 'Square Render Pass (Indexed)',
        colorAttachments: [
            {
                view: textureView,
                clearValue: clearColor,
                loadOp: 'clear',
                storeOp: 'store'
            }
        ]
    });

    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.setVertexBuffer(0, vertexBuffer);
    passEncoder.setIndexBuffer(indexBuffer, 'uint16');
    passEncoder.drawIndexed(indexCount);

    passEncoder.end();
    device.queue.submit([commandEncoder.finish()]);
}
