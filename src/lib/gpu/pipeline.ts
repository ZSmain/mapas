/**
 * WebGPU Render Pipeline Module
 * Creates and manages the GPU render pipeline
 */

// Import shader as raw string using Vite's ?raw suffix
import triangleShaderSource from './shaders/triangle.wgsl?raw';

export interface PipelineResult {
    pipeline: GPURenderPipeline;
    shaderModule: GPUShaderModule;
}

/**
 * Create a shader module from WGSL source code
 */
export function createShaderModule(device: GPUDevice, code: string, label?: string): GPUShaderModule {
    return device.createShaderModule({
        label: label ?? 'Shader Module',
        code
    });
}

/**
 * Create the triangle render pipeline
 * Defines how vertices are processed and fragments are colored
 */
export function createTrianglePipeline(device: GPUDevice, format: GPUTextureFormat): PipelineResult {
    // Create shader module from WGSL source
    const shaderModule = createShaderModule(device, triangleShaderSource, 'Triangle Shader');

    // Create the render pipeline
    const pipeline = device.createRenderPipeline({
        label: 'Triangle Render Pipeline',
        layout: 'auto', // Let WebGPU figure out the bind group layout

        // Vertex stage configuration
        vertex: {
            module: shaderModule,
            entryPoint: 'vertexMain'
            // No buffers needed - we're using hardcoded vertices in the shader
        },

        // Fragment stage configuration
        fragment: {
            module: shaderModule,
            entryPoint: 'fragmentMain',
            targets: [
                {
                    format // Must match the canvas context format
                }
            ]
        },

        // Primitive topology - how vertices form shapes
        primitive: {
            topology: 'triangle-list', // Each 3 vertices form a triangle
            frontFace: 'ccw', // Counter-clockwise winding
            cullMode: 'none' // No face culling for this simple example
        }
    });

    return { pipeline, shaderModule };
}

/**
 * Create a render pass descriptor for clearing and drawing
 */
export function createRenderPassDescriptor(
    view: GPUTextureView,
    clearColor: GPUColor = { r: 0.1, g: 0.1, b: 0.15, a: 1.0 }
): GPURenderPassDescriptor {
    return {
        label: 'Main Render Pass',
        colorAttachments: [
            {
                view,
                clearValue: clearColor,
                loadOp: 'clear',
                storeOp: 'store'
            }
        ]
    };
}

/**
 * Execute a single render frame
 * Creates command buffer, sets up render pass, draws, and submits
 */
export function renderFrame(
    device: GPUDevice,
    context: GPUCanvasContext,
    pipeline: GPURenderPipeline,
    clearColor?: GPUColor
): void {
    // Get the current texture from the swap chain
    const textureView = context.getCurrentTexture().createView();

    // Create command encoder
    const commandEncoder = device.createCommandEncoder({
        label: 'Frame Command Encoder'
    });

    // Begin render pass
    const renderPassDescriptor = createRenderPassDescriptor(textureView, clearColor);
    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);

    // Set pipeline and draw
    passEncoder.setPipeline(pipeline);
    passEncoder.draw(3); // 3 vertices for our triangle

    // End pass and submit
    passEncoder.end();
    device.queue.submit([commandEncoder.finish()]);
}
