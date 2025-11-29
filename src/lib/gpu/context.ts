/**
 * WebGPU Context Module
 * Handles GPU adapter, device, and canvas context initialization
 */

export interface GPUContextResult {
    device: GPUDevice;
    context: GPUCanvasContext;
    format: GPUTextureFormat;
}

/**
 * Check if WebGPU is supported in the current browser
 */
export function isWebGPUSupported(): boolean {
    return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

/**
 * Request and initialize the GPU adapter
 * The adapter represents the physical GPU hardware
 */
export async function requestAdapter(): Promise<GPUAdapter> {
    if (!isWebGPUSupported()) {
        throw new Error('WebGPU is not supported in this browser');
    }

    const adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance'
    });

    if (!adapter) {
        throw new Error('Failed to request GPU adapter. No compatible GPU found.');
    }

    return adapter;
}

/**
 * Request a GPU device from the adapter
 * The device is the main interface for creating GPU resources
 */
export async function requestDevice(adapter: GPUAdapter): Promise<GPUDevice> {
    const device = await adapter.requestDevice({
        label: 'Mapas GPU Device'
    });

    // Set up error handling for the device
    device.lost.then((info) => {
        console.error(`WebGPU device was lost: ${info.message}`);
        if (info.reason !== 'destroyed') {
            // Could implement auto-reconnection here
            console.warn('Device lost unexpectedly. Consider reinitializing.');
        }
    });

    return device;
}

/**
 * Configure the canvas context for WebGPU rendering (the "swap chain")
 * This bridges GPU output to the screen display
 */
export function configureCanvasContext(
    canvas: HTMLCanvasElement,
    device: GPUDevice
): { context: GPUCanvasContext; format: GPUTextureFormat } {
    const context = canvas.getContext('webgpu');

    if (!context) {
        throw new Error('Failed to get WebGPU context from canvas');
    }

    // Get the preferred format for this device (typically 'bgra8unorm')
    const format = navigator.gpu.getPreferredCanvasFormat();

    // Configure the swap chain
    context.configure({
        device,
        format,
        alphaMode: 'premultiplied'
    });

    return { context, format };
}

/**
 * Initialize the complete WebGPU context
 * Returns device, context, and format for rendering
 */
export async function initWebGPU(canvas: HTMLCanvasElement): Promise<GPUContextResult> {
    const adapter = await requestAdapter();
    const device = await requestDevice(adapter);
    const { context, format } = configureCanvasContext(canvas, device);

    return { device, context, format };
}

/**
 * Clean up GPU resources
 */
export function destroyContext(device: GPUDevice): void {
    device.destroy();
}
