(async function () {

  const shaders = {
    Blit(device, presentationFormat, texture, sampler) {
      const source = /* wgsl */`
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

      const shaderModule = device.createShaderModule({
        code: source
      })

      const bindGroupLayout = device.createBindGroupLayout({
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
      })

      const pipeline = device.createRenderPipeline({
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
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: sampler },
          { binding: 1, resource: texture.createView() }
        ]
      })

      return function Blit(pass) {
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup)
        pass.draw(3);
      }
    },

    WorldClear(device, texture, color, workgroupSize) {
      const source =  /* wgsl */`
        @group(0) @binding(0) var texture: texture_storage_2d<rgba8unorm, write>;
        @compute @workgroup_size(${workgroupSize.join(',')})
        fn ComputeMain(@builtin(global_invocation_id) id: vec3<u32>) {
          textureStore(texture, id.xy, vec4<f32>(${color.join(',')}));
        }
      `

      const shaderModule = device.createShaderModule({
        code: source
      })

      const bindGroupLayout = device.createBindGroupLayout({
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

      const pipeline = device.createComputePipeline({
        compute: {
          module: shaderModule,
          entryPoint: 'ComputeMain',
        },
        layout: device.createPipelineLayout({
          bindGroupLayouts: [
            bindGroupLayout
          ]
        }),
      })

      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: texture.createView() }
        ]
      })

      return function ClearWorld(computePass, width, height) {
        computePass.setPipeline(pipeline)
        computePass.setBindGroup(0, bindGroup)
        computePass.dispatchWorkgroups(
          Math.floor(width / workgroupSize[0] + 1),
          Math.floor(height / workgroupSize[1] + 1),
          1
        )
      }
    },

    WorldPaint(device, texture, workgroupSize) {
      const uboSize = ([
        "mouse.x",
        "mouse.y",
        "brush.radius",
        "brush.radiance",
        "rgba",
      ]).length * 4

      const stagingBuffer = device.createBuffer({
        size: uboSize,
        usage: GPUBufferUsage.MAP_WRITE | GPUBufferUsage.COPY_SRC,
      })

      const ubo = device.createBuffer({
        size: uboSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      })

      const source = /* wgsl */`
        struct UBOParams {
          x: i32,
          y: i32,
          radius: i32,
          radiance: u32,
          color: u32,
        };

        @group(0) @binding(0) var texture: texture_storage_2d<rgba8unorm, write>;
        @group(0) @binding(1) var<uniform> ubo: UBOParams;

        fn Squared(a: i32) -> i32 {
          return a * a;
        }
        @compute @workgroup_size(${workgroupSize.join(',')})
        fn ComputeMain(@builtin(global_invocation_id) id: vec3<u32>) {
          var radiusSquared : i32 = ubo.radius * ubo.radius;
          var distanceSquared : i32 = Squared(i32(id.x) - ubo.x) + Squared(i32(id.y) - ubo.y);
          if (distanceSquared <= radiusSquared) {
            textureStore(texture, id.xy, vec4<f32>(1.0, 0.0, 1.0, 1.0));
          }
        }
      `

      const shaderModule = device.createShaderModule({
        code: source
      })

      const bindGroupLayout = device.createBindGroupLayout({
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.COMPUTE,
            storageTexture: {
              format: "rgba8unorm"
            },
          },
          {
            binding: 1,
            visibility: GPUShaderStage.COMPUTE,
            buffer: {}
          }
        ]
      })

      const pipeline = device.createComputePipeline({
        compute: {
          module: shaderModule,
          entryPoint: 'ComputeMain',
        },
        layout: device.createPipelineLayout({
          bindGroupLayouts: [
            bindGroupLayout
          ]
        }),
      })

      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: texture.createView() },
          {
            binding: 1, resource: {
              buffer: ubo
            }
          }
        ]
      })

      return async function WorldPaint(
        commandEncoder,
        x,
        y,
        radius,
        color,
        radiance,
        width,
        height
      ) {

        // update the uniform buffer
        await stagingBuffer.mapAsync(GPUMapMode.WRITE)
        let uboData = new Int32Array(stagingBuffer.getMappedRange())
        uboData[0] = x
        uboData[1] = y
        uboData[2] = radius
        uboData[3] = radiance
        uboData[4] = color
        stagingBuffer.unmap()

        commandEncoder.copyBufferToBuffer(stagingBuffer, 0, ubo, 0, uboSize);

        let computePass = commandEncoder.beginComputePass()

        computePass.setPipeline(pipeline)
        computePass.setBindGroup(0, bindGroup)
        computePass.dispatchWorkgroups(
          Math.floor(width / workgroupSize[0] + 1),
          Math.floor(height / workgroupSize[1] + 1),
          1
        )
        computePass.end();

      }
    },
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
    mouse: {
      pos: [0, 0],
      down: false
    },
    brush: {
      radius: 16,
      radiance: 0
    },
    params: {},
  }
  state.gpu = await InitGPU(state.ctx)

  // Wire up mouse
  {
    const MoveMouse = (x, y) => {
      let ratioX = canvas.width / canvas.clientWidth
      let ratioY = canvas.height / canvas.clientHeight
      state.mouse.pos[0] = x * ratioX
      state.mouse.pos[1] = y * ratioY
    }

    window.addEventListener("mouseup", e => {
      state.mouse.down = false
    })

    canvas.addEventListener("mousedown", (e) => {
      state.mouse.down = true
      e.preventDefault()
    }, { passive: false })

    canvas.addEventListener("mousemove", e => {
      MoveMouse(e.offsetX, e.offsetY)
      e.preventDefault()
    }, { passive: false })

    canvas.addEventListener("touchstart", (e) => {
      if (e.touches.length == 1) {
        state.mouse.down = true
        let touch = e.touches[0]
        let rect = e.target.getBoundingClientRect();
        MoveMouse(touch.clientX - rect.x, touch.clientY - rect.y)
        e.preventDefault()
      }
    }, { passive: false })

    canvas.addEventListener("touchend", (e) => {
      if (e.touches.length == 0) {
        state.mouse.down = false
      }
    })

    canvas.addEventListener("touchmove", e => {
      if (e.touches.length == 1) {
        let touch = e.touches[0]
        let rect = e.target.getBoundingClientRect();
        MoveMouse(touch.clientX - rect.x, touch.clientY - rect.y)
        e.preventDefault()
      }
    }, { passive: false })
  }

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

  // Create the gpu programs
  {
    const WorldClearWorkgroupSize = 16
    const WorldPaintWorkgroupSize = 16

    state.gpu.programs = {
      blit: shaders.Blit(
        state.gpu.device,
        state.gpu.presentationFormat,
        state.worldTexture,
        state.worldTextureSampler
      ),
      worldClear: shaders.WorldClear(
        state.gpu.device,
        state.worldTexture,
        [0.0, 0.0, 0.0, 1.0],
        [WorldClearWorkgroupSize, WorldClearWorkgroupSize, 1]
      ),
      worldPaint: shaders.WorldPaint(
        state.gpu.device,
        state.worldTexture,
        [WorldPaintWorkgroupSize, WorldPaintWorkgroupSize, 1]
      )
    }
  }

  // Clear the world Texture
  {
    let commandEncoder = state.gpu.device.createCommandEncoder()
    let pass = commandEncoder.beginComputePass()
    state.gpu.programs.worldClear(pass, canvas.width, canvas.height)
    pass.end()
    state.gpu.device.queue.submit([commandEncoder.finish()])
  }

  const RenderFrame = async () => {
    window.requestAnimationFrame(RenderFrame)

    let commandEncoder = state.gpu.device.createCommandEncoder()

    // Paint Into World
    if (state.mouse.down) {
      await state.gpu.programs.worldPaint(
        commandEncoder,
        state.mouse.pos[0],
        canvas.height - state.mouse.pos[1],
        state.brush.radius,
        state.brush.radiance,
        0x00FFFFFF,
        canvas.width,
        canvas.height
      )
    }

    // Final Gather
    {
      let colorAttachment = {
        view: state.ctx.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store'
      };

      const renderPassDesc = {
        colorAttachments: [colorAttachment],
      };

      let pass = commandEncoder.beginRenderPass(renderPassDesc);
      pass.setViewport(0, 0, canvas.width, canvas.height, 0, 1);
      pass.setScissorRect(0, 0, canvas.width, canvas.height);
      state.gpu.programs.blit(pass)
      pass.end();
    }

    state.gpu.device.queue.submit([commandEncoder.finish()])
  }

  RenderFrame()
})()