// Grid shader for rendering tile boundaries
// Uses line primitives with a uniform transformation matrix

struct Uniforms {
    matrix: mat3x3f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexInput {
    @location(0) position: vec2f,
}

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) worldPos: vec2f,
}

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    let transformed = uniforms.matrix * vec3f(input.position, 1.0);
    
    var output: VertexOutput;
    output.position = vec4f(transformed.xy, 0.0, 1.0);
    output.worldPos = input.position;
    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
    // Grid lines with a subtle blue-gray color
    return vec4f(0.4, 0.5, 0.6, 1.0);
}
