export function BlitSource() {
  return /* wgsl */`
    struct VertexOut {
      @builtin(position) position : vec4f,
      @location(0) uv : vec2f
    }

    @vertex
    fn VertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOut {
      var vertPos = array<vec2<f32>, 3>(
        vec2f(-1.0,-1.0),
        vec2f(-1.0, 4.0),
        vec2f( 4.0,-1.0)
      );

      var output : VertexOut;
      var pos = vertPos[vertexIndex];
      output.position = vec4f(pos, 0.0, 1.0);
      output.uv = pos * 0.5 + 0.5;
      return output;
    }


    @group(0) @binding(0) var worldTextureSampler: sampler;
    @group(0) @binding(1) var worldTexture: texture_2d<f32>;
    @fragment
    fn FragmentMain(fragData: VertexOut) -> @location(0) vec4f {
      // return vec4(fragData.uv.x, fragData.uv.y, 0.0, 1.0);
      return vec4f(
        textureSample(worldTexture, worldTextureSampler, fragData.uv).rgb,
        1.0
      );
    }
  `;
}

export function ClearTextureSource(color, workgroupSize) {
  return /* wgsl */`

  @group(0) @binding(0) var worldTexture: texture_storage_2d<rgba8unorm, write>;
  @compute @workgroup_size(${workgroupSize.join(',')})
    fn ComputeMain(@builtin(global_invocation_id) id: vec3<u32>) {
      textureStore(worldTexture, id.xy, vec4<f32>(${color.join(',')}));
    }
  `
}