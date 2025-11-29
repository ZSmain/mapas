// Triangle Vertex and Fragment Shaders
// WGSL - WebGPU Shading Language

// Vertex shader output / Fragment shader input
struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) color: vec3f,
}

// Vertex shader: transforms vertex positions and passes colors to fragment shader
@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    // Hardcoded triangle vertices (clip space: -1 to 1)
    // Position (x, y) and Color (r, g, b) for each vertex
    var positions = array<vec2f, 3>(
        vec2f( 0.0,  0.5),   // Top vertex
        vec2f(-0.5, -0.5),   // Bottom-left vertex
        vec2f( 0.5, -0.5)    // Bottom-right vertex
    );

    var colors = array<vec3f, 3>(
        vec3f(1.0, 0.0, 0.0),  // Red
        vec3f(0.0, 1.0, 0.0),  // Green
        vec3f(0.0, 0.0, 1.0)   // Blue
    );

    var output: VertexOutput;
    output.position = vec4f(positions[vertexIndex], 0.0, 1.0);
    output.color = colors[vertexIndex];
    return output;
}

// Fragment shader: outputs the interpolated color for each pixel
@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
    return vec4f(input.color, 1.0);
}
