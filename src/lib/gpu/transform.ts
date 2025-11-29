/**
 * 2D Transformation Matrix Module
 * Implements 3x3 matrix operations for zoom, pan, and projection
 *
 * Matrix layout (column-major for GPU):
 * | m0  m3  m6 |   | scaleX  0       translateX |
 * | m1  m4  m7 | = | 0       scaleY  translateY |
 * | m2  m5  m8 |   | 0       0       1          |
 *
 * We use a 3x3 matrix stored as Float32Array(12) for alignment
 * (WebGPU requires 16-byte alignment for uniform buffers)
 */

/**
 * Camera state for 2D map view
 */
export interface Camera2D {
    x: number; // Center X in world coordinates
    y: number; // Center Y in world coordinates
    zoom: number; // Zoom level (1 = 1:1, 2 = 2x zoom in)
}

/**
 * Create an identity matrix
 * Returns a Float32Array with proper padding for GPU uniform alignment
 */
export function mat3Identity(): Float32Array {
    // 3x3 matrix with padding: 3 vec3s, each padded to vec4 (16 bytes)
    // Layout: [m0, m1, m2, pad, m3, m4, m5, pad, m6, m7, m8, pad]
    return new Float32Array([
        1, 0, 0, 0, // column 0 + padding
        0, 1, 0, 0, // column 1 + padding
        0, 0, 1, 0 // column 2 + padding
    ]);
}

/**
 * Create a translation matrix
 */
export function mat3Translation(tx: number, ty: number): Float32Array {
    return new Float32Array([
        1, 0, 0, 0, // column 0
        0, 1, 0, 0, // column 1
        tx, ty, 1, 0 // column 2 (translation)
    ]);
}

/**
 * Create a scale matrix
 */
export function mat3Scale(sx: number, sy: number): Float32Array {
    return new Float32Array([
        sx, 0, 0, 0, // column 0
        0, sy, 0, 0, // column 1
        0, 0, 1, 0 // column 2
    ]);
}

/**
 * Multiply two 3x3 matrices (a * b)
 * Both matrices must be in padded format (12 floats)
 */
export function mat3Multiply(a: Float32Array, b: Float32Array): Float32Array {
    const result = new Float32Array(12);

    // Column 0
    result[0] = a[0] * b[0] + a[4] * b[1] + a[8] * b[2];
    result[1] = a[1] * b[0] + a[5] * b[1] + a[9] * b[2];
    result[2] = a[2] * b[0] + a[6] * b[1] + a[10] * b[2];
    result[3] = 0; // padding

    // Column 1
    result[4] = a[0] * b[4] + a[4] * b[5] + a[8] * b[6];
    result[5] = a[1] * b[4] + a[5] * b[5] + a[9] * b[6];
    result[6] = a[2] * b[4] + a[6] * b[5] + a[10] * b[6];
    result[7] = 0; // padding

    // Column 2
    result[8] = a[0] * b[8] + a[4] * b[9] + a[8] * b[10];
    result[9] = a[1] * b[8] + a[5] * b[9] + a[9] * b[10];
    result[10] = a[2] * b[8] + a[6] * b[9] + a[10] * b[10];
    result[11] = 0; // padding

    return result;
}

/**
 * Create a view-projection matrix for 2D rendering
 *
 * This transforms world coordinates to clip space:
 * 1. Translate by -camera position (center the view)
 * 2. Scale by zoom level
 * 3. Apply aspect ratio correction
 *
 * @param camera - Camera state (position and zoom)
 * @param aspectRatio - Canvas width / height
 */
export function createViewProjectionMatrix(camera: Camera2D, aspectRatio: number): Float32Array {
    // Step 1: Translate to center on camera position
    const translate = mat3Translation(-camera.x, -camera.y);

    // Step 2: Scale by zoom (and correct for aspect ratio)
    // If canvas is wider than tall, scale X down; if taller, scale Y down
    const scaleX = camera.zoom / (aspectRatio > 1 ? aspectRatio : 1);
    const scaleY = camera.zoom * (aspectRatio < 1 ? aspectRatio : 1);
    const scale = mat3Scale(scaleX, scaleY);

    // Combined: scale * translate (apply translation first, then scale)
    return mat3Multiply(scale, translate);
}

/**
 * Create a uniform buffer for the transformation matrix
 */
export function createUniformBuffer(device: GPUDevice, label?: string): GPUBuffer {
    return device.createBuffer({
        label: label ?? 'Uniform Buffer',
        size: 48, // 12 floats * 4 bytes = 48 bytes (mat3x3 with padding)
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
}

/**
 * Update uniform buffer with new matrix data
 */
export function updateUniformBuffer(device: GPUDevice, buffer: GPUBuffer, matrix: Float32Array): void {
    device.queue.writeBuffer(buffer, 0, matrix.buffer, matrix.byteOffset, matrix.byteLength);
}

/**
 * Convert screen coordinates to world coordinates
 * Useful for mouse interaction
 */
export function screenToWorld(
    screenX: number,
    screenY: number,
    canvasWidth: number,
    canvasHeight: number,
    camera: Camera2D
): { x: number; y: number } {
    // Convert screen coords (0 to width/height) to NDC (-1 to 1)
    const ndcX = (screenX / canvasWidth) * 2 - 1;
    const ndcY = -((screenY / canvasHeight) * 2 - 1); // Flip Y (screen Y is down)

    // Apply inverse view-projection transform
    const aspectRatio = canvasWidth / canvasHeight;
    const scaleX = aspectRatio > 1 ? aspectRatio : 1;
    const scaleY = aspectRatio < 1 ? 1 / aspectRatio : 1;

    const worldX = (ndcX * scaleX) / camera.zoom + camera.x;
    const worldY = (ndcY * scaleY) / camera.zoom + camera.y;

    return { x: worldX, y: worldY };
}

/**
 * Clamp zoom level to reasonable bounds
 */
export function clampZoom(zoom: number, minZoom: number = 0.1, maxZoom: number = 100): number {
    return Math.max(minZoom, Math.min(maxZoom, zoom));
}
