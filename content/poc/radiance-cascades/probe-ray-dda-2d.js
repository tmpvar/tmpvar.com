(async function () {

  const shaders = {
    BlitSource() {
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
    },

    ClearTextureSource(color, workgroupSize) {
      return /* wgsl */`
        @group(0) @binding(0) var worldTexture: texture_storage_2d<rgba8unorm, write>;
        @compute @workgroup_size(${workgroupSize.join(',')})
          fn ComputeMain(@builtin(global_invocation_id) id: vec3<u32>) {
            textureStore(worldTexture, id.xy, vec4<f32>(${color.join(',')}));
          }
      `
    }
  }

  const InitGPU = async (ctx) => {

    let adapter = await navigator.gpu.requestAdapter()
    let device = await adapter.requestDevice()

    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

    ctx.configure({
      device,
      format: presentationFormat,
      alphaMode: 'premultiplied',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });

    return {
      adapter,
      device,
      presentationFormat,
    }
  }

  let canvas = document.getElementById('probe-ray-dda-2d-canvas');
  let state = {
    canvas: canvas,
    ctx: canvas.getContext('webgpu'),
    params: {},
  }
  state.gpu = await InitGPU(state.ctx)

  // Create the world texture
  {
    state.worldTexture = state.gpu.device.createTexture({
      size: [canvas.width, canvas.height, 1],
      dimension: '2d',
      // rgb, a=emission
      format: 'rgba8unorm',
      usage: (
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING
      )
    })
    state.worldTextureSampler = state.gpu.device.createSampler({
      minFilter: 'nearest',
      magFilter: 'nearest',
    })
  }

  const ClearWorldWorkgroupSize = 16

  state.shaderModules = {
    blit: state.gpu.device.createShaderModule({
      code: shaders.BlitSource()
    }),
    clearWorld: state.gpu.device.createShaderModule({
      code: shaders.ClearTextureSource(
        [0.0, 0.0, 0.0, 1.0],
        [ClearWorldWorkgroupSize, ClearWorldWorkgroupSize, 1]
      )
    }),
  }

  state.bindGroupLayouts = {
    blit: state.gpu.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: {},
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {},
        }
      ]
    }),
    clearWorld: state.gpu.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: {
            format: "rgba8unorm"
          },
        }
      ]
    })
  }

  state.pipelines = {
    blit: state.gpu.device.createRenderPipeline({
      vertex: {
        module: state.shaderModules.blit,
        entryPoint: 'VertexMain',
      },
      fragment: {
        module: state.shaderModules.blit,
        entryPoint: 'FragmentMain',
        targets: [{
          format: state.gpu.presentationFormat
        }]
      },
      primitive: {
        topology: 'triangle-list'
      },
      layout: state.gpu.device.createPipelineLayout({
        bindGroupLayouts: [
          state.bindGroupLayouts.blit,
        ]
      }),
    }),

    clearWorld: state.gpu.device.createComputePipeline({
      compute: {
        module: state.shaderModules.clearWorld,
        entryPoint: 'ComputeMain',
      },
      layout: state.gpu.device.createPipelineLayout({
        bindGroupLayouts: [
          state.bindGroupLayouts.clearWorld
        ]
      }),
    }),
  }

  state.worldTextureBindGroup = state.gpu.device.createBindGroup({
    layout: state.pipelines.blit.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: state.worldTextureSampler },
      { binding: 1, resource: state.worldTexture.createView() }
    ]
  })

  // clear the world texture
  {
    const clearWorldPipeline = state.pipelines.clearWorld

    const clearWorldBindGroup = state.gpu.device.createBindGroup({
      layout: clearWorldPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: state.worldTexture.createView() }
      ]
    })
    let commandEncoder = state.gpu.device.createCommandEncoder()
    let passEncoder = commandEncoder.beginComputePass()
    passEncoder.setPipeline(clearWorldPipeline)
    passEncoder.setBindGroup(0, clearWorldBindGroup)
    passEncoder.dispatchWorkgroups(
      Math.floor(state.canvas.width / ClearWorldWorkgroupSize + 1),
      Math.floor(state.canvas.height / ClearWorldWorkgroupSize + 1),
      1
    )
    passEncoder.end();
    state.gpu.device.queue.submit([commandEncoder.finish()])
  }

  const RenderFrame = () => {
    window.requestAnimationFrame(RenderFrame)

    let commandEncoder = state.gpu.device.createCommandEncoder()

    let colorAttachment = {
      view: state.ctx.getCurrentTexture().createView(),
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
      loadOp: 'clear',
      storeOp: 'store'
    };

    const renderPassDesc = {
      colorAttachments: [colorAttachment],
    };

    let passEncoder = commandEncoder.beginRenderPass(renderPassDesc);
    passEncoder.setPipeline(state.pipelines.blit);
    passEncoder.setBindGroup(0, state.worldTextureBindGroup)
    passEncoder.setViewport(0, 0, canvas.width, canvas.height, 0, 1);
    passEncoder.setScissorRect(0, 0, canvas.width, canvas.height);
    passEncoder.draw(3);
    passEncoder.end();

    state.gpu.device.queue.submit([commandEncoder.finish()])
  }

  RenderFrame()
})()