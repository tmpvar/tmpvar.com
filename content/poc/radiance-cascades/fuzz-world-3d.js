import CreateOrbitCamera from './orbit-camera.js'

async function FuzzWorld3dBegin() {
  const TAU = Math.PI * 2.0

  const LevelColors = [
    '#f3a833',
    '#9de64e',
    '#36c5f4',
    '#ffa2ac',
    '#cc99ff',
    '#ec273f',
    '#de5d3a'
  ]

  const LevelColorFloats = LevelColors.map(value => {
    let v = parseInt(value.replace("#", ""), 16)
    let r = (v >> 16) & 0xFF
    let g = (v >> 8) & 0xFF
    let b = (v >> 0) & 0xFF
    return [r / 255.0, g / 255.0, b / 255.0]
  })

  function Now() {
    if (window.performance && window.performance.now) {
      return window.performance.now()
    } else {
      return Time.now()
    }
  }

  const rootEl = document.querySelector("#fuzz-world-3d-content")
  const controlEl = rootEl.querySelector('.controls')
  const canvas = rootEl.querySelector('canvas')
  const ctx = canvas.getContext('webgpu')
  const state = {
    dirty: true,
    params: {},
    camera: CreateOrbitCamera(),
    lastFrameTime: Now(),

    mouse: {
      pos: [0, 0],
      lastPos: [0, 0],
      down: false
    },
  }

  try {
    state.gpu = await InitGPU(ctx);
  } catch (e) {
    console.error(e)
    rootEl.className = rootEl.className.replace('has-webgpu', '')
    return;
  }

  state.gpu.labelPrefix = "FuzzWorld3D/"

  state.gpu.buffers = {}
  state.gpu.textures = {
    output: state.gpu.device.createTexture({
      label: `${state.gpu.labelPrefix}Texture/output`,
      size: [canvas.width, canvas.height, 1],
      dimension: '2d',
      format: 'rgba8unorm',
      usage: (
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING
      ),
    })
  }

  const shaders = {
    RaymarchPrimaryRays(gpu, outputTexture, workgroupSize) {
      const labelPrefix = gpu.labelPrefix + 'RaymarchPrimaryRays/'
      const source =  /* wgsl */`
        @group(0) @binding(0) var texture: texture_storage_2d<rgba8unorm, write>;
        @compute @workgroup_size(${workgroupSize.join(',')})
        fn ComputeMain(@builtin(global_invocation_id) id: vec3<u32>) {
          textureStore(texture, id.xy, vec4f(vec4(0.0, 0.0, 1.0, 1.0)));
        }
      `

      const shaderModule = gpu.device.createShaderModule({
        code: source
      })

      const bindGroupLayout = gpu.device.createBindGroupLayout({
        label: `${labelPrefix}BindGroupLayout`,
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

      const pipeline = gpu.device.createComputePipeline({
        label: `${labelPrefix}ComputePipeline`,
        compute: {
          module: shaderModule,
          entryPoint: 'ComputeMain',
        },
        layout: gpu.device.createPipelineLayout({
          bindGroupLayouts: [
            bindGroupLayout
          ]
        }),
      })

      const bindGroup = gpu.device.createBindGroup({
        label: `${labelPrefix}BindGroup`,
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: outputTexture.createView() }
        ]
      })

      return function RaymarchPrimaryRays(commandEncoder, width, height) {
        const computePass = commandEncoder.beginComputePass()
        computePass.setPipeline(pipeline)
        computePass.setBindGroup(0, bindGroup)
        computePass.dispatchWorkgroups(
          Math.floor(width / workgroupSize[0] + 1),
          Math.floor(height / workgroupSize[1] + 1),
          1
        )
        computePass.end()
      }

    },

    Blit(gpu, outputTexture) {
      const labelPrefix = gpu.label + 'Blit/'
      const device = gpu.device
      const presentationFormat = gpu.presentationFormat

      const uboFields = [
        "width",
        "height",
        "probeRadius",
        "debugRenderWorldMipLevel"
      ]

      const sampler = gpu.device.createSampler({
        label: `${labelPrefix}Sampler`,
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
        magFilter: 'nearest',
        minFilter: 'nearest',
        mipmapFilter: 'nearest',
      })


      const uboData = new Uint32Array(uboFields.length)
      const ubo = device.createBuffer({
        label: `${labelPrefix}ubo`,
        size: uboData.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      })

      const source = /* wgsl */`
        struct VertexOut {
          @builtin(position) position : vec4f,
          @location(0) uv : vec2f
        }

        struct UBOParams {
          width: u32,
          height: u32,
        };

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

        @group(0) @binding(0) var texture: texture_2d<f32>;
        @group(0) @binding(1) var<uniform> ubo: UBOParams;
        @group(0) @binding(2) var textureSampler: sampler;

        @fragment
        fn FragmentMain(fragData: VertexOut) -> @location(0) vec4f {
          return vec4f(textureSample(texture, textureSampler, fragData.uv).rgb, 1.0);
        }
      `;

      const shaderModule = device.createShaderModule({
        label: `${labelPrefix}ShaderModule`,
        code: source
      })

      const bindGroupLayout = device.createBindGroupLayout({
        label: `${labelPrefix}BindGroupLayout`,
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.FRAGMENT,
            texture: {
              sampleType: 'float',
            },
          },
          {
            binding: 1,
            visibility: GPUShaderStage.FRAGMENT,
            buffer: {
              type: 'uniform',
            }
          },
          {
            binding: 2,
            visibility: GPUShaderStage.FRAGMENT,
            sampler: {
              type: "filtering"
            },
          },
        ]
      })

      const pipeline = device.createRenderPipeline({
        label: `${labelPrefix}Pipeline`,
        vertex: {
          module: shaderModule,
          entryPoint: 'VertexMain',
        },
        fragment: {
          module: shaderModule,
          entryPoint: 'FragmentMain',
          targets: [{
            format: presentationFormat
          }]
        },
        primitive: {
          topology: 'triangle-list'
        },
        layout: device.createPipelineLayout({
          bindGroupLayouts: [
            bindGroupLayout,
          ]
        }),
      })

      const bindGroup = device.createBindGroup({
        label: `${labelPrefix}BindGroup`,
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          {
            binding: 0,
            resource: outputTexture.createView()
          },
          {
            binding: 1,
            resource: {
              buffer: ubo
            }
          },
          {
            binding: 2,
            resource: sampler,
          },
        ]
      })

      return async function Blit(
        commandEncoder,
        queue,
        ctx,
        width,
        height
      ) {

        // update uniform buffer
        uboData[0] = width
        uboData[1] = height
        queue.writeBuffer(ubo, 0, uboData)

        let colorAttachment = {
          view: ctx.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store'
        };

        const renderPassDesc = {
          colorAttachments: [colorAttachment],
        };

        let pass = commandEncoder.beginRenderPass(renderPassDesc);
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup)
        pass.setViewport(0, 0, width, height, 0, 1);
        pass.setScissorRect(0, 0, width, height);
        pass.draw(3);
        pass.end();
      }
    }
  }

  state.gpu.programs = {
    raymarchPrimaryRays: shaders.RaymarchPrimaryRays(
      state.gpu,
      state.gpu.textures.output,
      [16, 16, 1]
    ),
    blit: shaders.Blit(
      state.gpu,
      state.gpu.textures.output
    ),
  }

  async function InitGPU(ctx) {
    let adapter = await navigator.gpu.requestAdapter()
    let device = await adapter.requestDevice()
    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

    ctx.configure({
      device,
      format: presentationFormat,
      alphaMode: 'opaque',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });

    return {
      adapter,
      device,
      presentationFormat,
    }
  }

  function ReadParams() {

  }

  function RenderFrame() {
    const now = Now()
    const deltaTime = (now - state.lastFrameTime) / 1000.0
    state.lastFrameTime = now
    ReadParams()

    // state.camera.state.yaw += deltaTime * TAU * 0.125;
    if (state.camera.tick(canvas.width, canvas.height, deltaTime)) {
      state.dirty = true;
    }
    if (!state.dirty) {
      window.requestAnimationFrame(RenderFrame)
      return;
    }
    state.dirty = false

    const commandEncoder = state.gpu.device.createCommandEncoder()
    state.gpu.programs.raymarchPrimaryRays(
      commandEncoder,
      canvas.width,
      canvas.height
    )

    state.gpu.programs.blit(
      commandEncoder,
      state.gpu.device.queue,
      ctx,
      canvas.width,
      canvas.height
    )
    window.requestAnimationFrame(RenderFrame)
    state.gpu.device.queue.submit([commandEncoder.finish()])
  }

  window.requestAnimationFrame(RenderFrame)
}

if (document.readyState != 'complete') {
  document.addEventListener("readystatechange", e => {
    if (document.readyState == 'complete') {
      FuzzWorld3dBegin();
    }
  })
} else {
  FuzzWorld3dBegin();
}