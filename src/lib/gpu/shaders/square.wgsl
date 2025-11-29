// Square Vertex and Fragment Shaders with Vertex Buffers and Uniform Matrix
// WGSL - WebGPU Shading Language

// Uniform buffer: view-projection matrix
// mat3x3f is stored as 3 vec3f columns, each padded to vec4f (16 bytes)
struct Uniforms {
    matrix: mat3x3f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// Vertex input from buffer
struct VertexInput {
    @location(0) position: vec2f,  // From vertex buffer
    @location(1) color: vec3f,     // From vertex buffer
}

// Vertex shader output / Fragment shader input
struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) color: vec3f,
}

// Vertex shader: applies transformation matrix to position
@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    // Apply 3x3 transformation matrix
    // We extend position to vec3 with w=1 for homogeneous coordinates
    let transformed = uniforms.matrix * vec3f(input.position, 1.0);
    
    var output: VertexOutput;
    // Output clip-space position (z=0, w=1 for 2D)
    output.position = vec4f(transformed.xy, 0.0, 1.0);
    output.color = input.color;
    return output;
}

// Fragment shader: outputs the interpolated color
@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
    return vec4f(input.color, 1.0);
}
