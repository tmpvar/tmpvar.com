async function ProbeRayDistribution3dBegin() {
  const rootEl = document.querySelector("#probe-ray-distribution-3d-content")
  const controlEl = rootEl.querySelector('.controls')
  const canvas = rootEl.querySelector('canvas')
  const ctx = canvas.getContext('webgpu')
  const state = {
    dirty: true,
    params: {},
  }

  try {
    state.gpu = await InitGPU(ctx);
  } catch (e) {
    console.log(e)
    rootEl.className = rootEl.className.replace('has-webgpu', '')
    return;
  }

  state.gpu.labelPrefix = "ProbeRayDistribution3D/"
  state.gpu.programs = {}
  state.gpu.buffers = {}

  const shaders = {
    DrawLines(gpu, linePositionBuffer) {
      const labelPrefix = gpu.labelPrefix + 'DrawLines/'
      const uboFields = [
        ['worldToScreen', 'mat4x4<f32>', 16 * 4],
      ]

      const uboBuffer = new ArrayBuffer(uboFields.reduce((p, c) => {
        return p + c[2]
      }, 0))

      const uboData = new DataView(uboBuffer)
      const ubo = gpu.device.createBuffer({
        label: `${labelPrefix}UBO`,
        size: uboBuffer.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      })

      const source = /* wgsl */`
        struct UBOParams {
          ${uboFields.map(i => `${i[0]}: ${i[1]},\n `).join('    ')}
        }

        struct VertexOut {
          @builtin(position) position : vec4f
        }

        @group(0) @binding(0) var<uniform> ubo: UBOParams;

        @vertex
        fn VertexMain(
          @builtin(vertex_index) vertexIndex: u32,
          @location(0) pos: vec3f
        ) -> VertexOut {
          // TODO: transform with ubo.worldToScreen
          var output: VertexOut;
          output.position = vec4f(pos, 1.0);
          return output;
        }

        @fragment
        fn FragmentMain(fragData: VertexOut) -> @location(0) vec4f {
          return vec4(1.0, 0.0, 1.0, 1.0);
        }
      `
      const shaderModule = gpu.device.createShaderModule({
        label: `${labelPrefix}Shader`,
        code: source
      })

      const bindGroupLayout = gpu.device.createBindGroupLayout({
        label: `${labelPrefix}BindGroupLayout`,
        entries: [
          {
            binding: 0,
            visibility: (GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX),
            buffer: {
              type: 'uniform',
            }
          },
        ]
      })

      const positionBufferDesc = {
        label: `${labelPrefix}PositionBufferDesc`,
        attributes: [
          {
            shaderLocation: 0,
            offset: 0,
            format: 'float32x3'
          }
        ],
        arrayStride: 12,
        stepMode: 'vertex'
      }

      const pipeline = gpu.device.createRenderPipeline({
        label: `${labelPrefix}Pipeline`,
        vertex: {
          module: shaderModule,
          entryPoint: 'VertexMain',
          buffers: [positionBufferDesc]
        },
        fragment: {
          module: shaderModule,
          entryPoint: 'FragmentMain',
          targets: [{
            format: gpu.presentationFormat
          }]
        },
        primitive: {
          topology: 'line-list'
        },
        layout: gpu.device.createPipelineLayout({
          bindGroupLayouts: [
            bindGroupLayout,
          ]
        }),
      })

      const bindGroup = gpu.device.createBindGroup({
        label: `${labelPrefix}BindGroup`,
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          {
            binding: 0,
            resource: {
              buffer: ubo
            }
          },
        ]
      })

      return function DrawLines(
        queue,
        commandEncoder,
        ctx,
        worldToScreen,
        vertexCount,
        width,
        height
      ) {
        // Write UBO data
        {
          let byteOffset = 0
          worldToScreen.forEach(v => {
            uboData.setFloat32(byteOffset, v, true)
            byteOffset += 4;
          })

          queue.writeBuffer(ubo, 0, uboBuffer)
        }

        // Note: apparently mapping the staging buffer can take multiple frames?
        let colorAttachment = {
          view: ctx.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store'
        };

        const renderPassDesc = {
          label: `${labelPrefix}RenderPass`,
          colorAttachments: [colorAttachment],
        };

        const pass = commandEncoder.beginRenderPass(renderPassDesc)
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup)
        pass.setVertexBuffer(0, linePositionBuffer);
        pass.setViewport(0, 0, width, height, 0, 1);
        pass.setScissorRect(0, 0, width, height);
        pass.draw(vertexCount);
        pass.end();
      }

    }
  }

  // Create a line buffer
  {
    state.gpu.buffers.lineVertexPositions = state.gpu.device.createBuffer({
      label: "ProbeRayDistribution3D/Buffer/LineVertexPositions",
      size: 1024 * 1024 * 16,
      usage: (
        GPUBufferUsage.COPY_DST |
        GPUBufferUsage.VERTEX
      ),
    })
  }

  state.gpu.programs = {
    drawLines: shaders.DrawLines(state.gpu, state.gpu.buffers.lineVertexPositions),
  }

  window.requestAnimationFrame(RenderFrame)

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
    ReadParams()

    if (!state.dirty) {
      window.requestAnimationFrame(RenderFrame)
      state.dirty = false
    }


    state.params.computedLineVetexCount = 2;
    let lines = new Float32Array([0.0, 0.0, 0.0, 100.0, 100.0, 100.0]);
    state.gpu.device.queue.writeBuffer(
      state.gpu.buffers.lineVertexPositions,
      0,
      lines
    );

    const commandEncoder = state.gpu.device.createCommandEncoder()

    const worldToScreen = [
      1.0, 0.0, 0.0, 0.0,
      0.0, 1.0, 0.0, 0.0,
      0.0, 0.0, 1.0, 0.0,
      0.0, 0.0, 0.0, 1.0,
    ];

    state.gpu.programs.drawLines(
      state.gpu.device.queue,
      commandEncoder,
      ctx,
      worldToScreen,
      state.params.computedLineVetexCount,
      canvas.width,
      canvas.height
    )


    window.requestAnimationFrame(RenderFrame)
    state.gpu.device.queue.submit([commandEncoder.finish()])

  }


}

if (document.readyState != 'complete') {
  document.addEventListener("readystatechange", e => {
    if (document.readyState == 'complete') {
      ProbeRayDistribution3dBegin();
    }
  })
} else {
  ProbeRayDistribution3dBegin();
}