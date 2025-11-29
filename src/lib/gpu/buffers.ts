/**
 * WebGPU Buffer Module
 * Creates and manages GPU buffers for vertex data
 */

/**
 * Vertex data structure: position (x, y) + color (r, g, b)
 * Each vertex is 5 floats = 20 bytes
 */
export interface Vertex {
    position: [number, number];
    color: [number, number, number];
}

/**
 * Interleave vertex data into a Float32Array
 * Format: [x, y, r, g, b, x, y, r, g, b, ...]
 */
export function interleaveVertexData(vertices: Vertex[]): Float32Array {
    const data = new Float32Array(vertices.length * 5);
    for (let i = 0; i < vertices.length; i++) {
        const offset = i * 5;
        data[offset + 0] = vertices[i].position[0]; // x
        data[offset + 1] = vertices[i].position[1]; // y
        data[offset + 2] = vertices[i].color[0]; // r
        data[offset + 3] = vertices[i].color[1]; // g
        data[offset + 4] = vertices[i].color[2]; // b
    }
    return data;
}

/**
 * Create a vertex buffer from vertex data
 */
export function createVertexBuffer(device: GPUDevice, vertices: Vertex[], label?: string): GPUBuffer {
    const data = interleaveVertexData(vertices);

    const buffer = device.createBuffer({
        label: label ?? 'Vertex Buffer',
        size: data.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true
    });

    // Copy data to buffer
    new Float32Array(buffer.getMappedRange()).set(data);
    buffer.unmap();

    return buffer;
}

/**
 * Vertex buffer layout descriptor
 * Tells the pipeline how to interpret vertex data
 */
export function getVertexBufferLayout(): GPUVertexBufferLayout {
    return {
        arrayStride: 5 * 4, // 5 floats * 4 bytes each = 20 bytes per vertex
        stepMode: 'vertex', // Advance per vertex (not per instance)
        attributes: [
            {
                // Position attribute (x, y)
                shaderLocation: 0, // @location(0) in shader
                offset: 0,
                format: 'float32x2' // vec2f
            },
            {
                // Color attribute (r, g, b)
                shaderLocation: 1, // @location(1) in shader
                offset: 2 * 4, // After 2 floats (8 bytes)
                format: 'float32x3' // vec3f
            }
        ]
    };
}

/**
 * Create square vertices (two triangles)
 * Default: centered at origin, size 1x1
 */
export function createSquareVertices(
    size: number = 1.0,
    color: [number, number, number] = [1.0, 0.5, 0.2]
): Vertex[] {
    const half = size / 2;

    // Two triangles forming a square (counter-clockwise winding)
    // Triangle 1: top-left, bottom-left, bottom-right
    // Triangle 2: top-left, bottom-right, top-right
    return [
        // Triangle 1
        { position: [-half, half], color }, // top-left
        { position: [-half, -half], color }, // bottom-left
        { position: [half, -half], color }, // bottom-right
        // Triangle 2
        { position: [-half, half], color }, // top-left
        { position: [half, -half], color }, // bottom-right
        { position: [half, half], color } // top-right
    ];
}

/**
 * Create square with different colors per vertex (for gradient effect)
 */
export function createColoredSquareVertices(size: number = 1.0): Vertex[] {
    const half = size / 2;

    const topLeft: [number, number, number] = [1.0, 0.0, 0.0]; // Red
    const bottomLeft: [number, number, number] = [0.0, 1.0, 0.0]; // Green
    const bottomRight: [number, number, number] = [0.0, 0.0, 1.0]; // Blue
    const topRight: [number, number, number] = [1.0, 1.0, 0.0]; // Yellow

    return [
        // Triangle 1
        { position: [-half, half], color: topLeft },
        { position: [-half, -half], color: bottomLeft },
        { position: [half, -half], color: bottomRight },
        // Triangle 2
        { position: [-half, half], color: topLeft },
        { position: [half, -half], color: bottomRight },
        { position: [half, half], color: topRight }
    ];
}

/**
 * Create an index buffer for indexed drawing
 * Useful when vertices are shared between triangles
 */
export function createIndexBuffer(device: GPUDevice, indices: number[], label?: string): GPUBuffer {
    const data = new Uint16Array(indices);

    const buffer = device.createBuffer({
        label: label ?? 'Index Buffer',
        size: data.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true
    });

    new Uint16Array(buffer.getMappedRange()).set(data);
    buffer.unmap();

    return buffer;
}

/**
 * Create square with indexed vertices (more efficient)
 * Only 4 unique vertices instead of 6
 */
export function createIndexedSquare(device: GPUDevice, size: number = 1.0): {
    vertexBuffer: GPUBuffer;
    indexBuffer: GPUBuffer;
    indexCount: number;
} {
    const half = size / 2;

    // 4 unique vertices
    const vertices: Vertex[] = [
        { position: [-half, half], color: [1.0, 0.0, 0.0] }, // 0: top-left (red)
        { position: [-half, -half], color: [0.0, 1.0, 0.0] }, // 1: bottom-left (green)
        { position: [half, -half], color: [0.0, 0.0, 1.0] }, // 2: bottom-right (blue)
        { position: [half, half], color: [1.0, 1.0, 0.0] } // 3: top-right (yellow)
    ];

    // 6 indices forming 2 triangles
    const indices = [
        0, 1, 2, // Triangle 1
        0, 2, 3 // Triangle 2
    ];

    return {
        vertexBuffer: createVertexBuffer(device, vertices, 'Square Vertex Buffer'),
        indexBuffer: createIndexBuffer(device, indices, 'Square Index Buffer'),
        indexCount: indices.length
    };
}
