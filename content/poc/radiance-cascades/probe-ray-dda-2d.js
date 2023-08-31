(async function () {

  const shaders = {
    DebugWorldBlit(device, presentationFormat, texture, sampler) {
      const uboFields = ["width", "height",]
      const uboData = new Uint32Array(uboFields.length)
      const ubo = device.createBuffer({
        size: uboData.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        label: "DebugWorldBlit/ubo",
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

        @group(0) @binding(0) var worldTexture: texture_2d<u32>;
        @group(0) @binding(1) var<uniform> ubo: UBOParams;
        @fragment
        fn FragmentMain(fragData: VertexOut) -> @location(0) vec4f {

          var samplePos: vec2<u32> = vec2<u32>(
            u32(fragData.uv.x * f32(ubo.width)),
            u32(fragData.uv.y * f32(ubo.height))
          );

          var color: u32 = textureLoad(worldTexture, samplePos, 0).r;
          return vec4f(
            unpack4x8unorm(color).rgb,
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
            texture: {
              sampleType: 'uint'
            },
          },
          {
            binding: 1,
            visibility: GPUShaderStage.FRAGMENT,
            buffer: {}
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
          { binding: 0, resource: texture.createView() },
          {
            binding: 1, resource: {
              buffer: ubo
            }
          }
        ]
      })

      return async function DebugWorldBlit(commandEncoder, queue, ctx, width, height) {
        // update uniform buffer
        uboData[0] = width
        uboData[1] = height
        queue.writeBuffer(ubo, 0, uboData)

        // Note: apparently mapping the staging buffer can take multiple frames?
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
    },

    ProbeAtlasBuild(device, probeBuffer, worldTexture, workgroupSize) {
      const uboFields = [
        "totalRays",
        "level0.probeRadius",
        "level0.probeRayCount",
        "level0.cascadeWidth",
      ]

      let uboData = new Int32Array(uboFields.length)

      const ubo = device.createBuffer({
        size: uboData.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        label: "ProbeAtlasBuild/ubo",
      })

      const source =  /* wgsl */`
        struct UBOParams {
          totalRays: u32,
          probeRadius: i32,
          probeRayCount: i32,
          cascadeWidth: i32,
        };

        struct ProbeRayResult {
          rgba: u32,
        };

        struct DDACursor2D {
          mapPos: vec2<f32>,
          rayStep: vec2<f32>,
          sideDist: vec2<f32>,
          deltaDist: vec2<f32>,
        };

        fn DDACursorInit(cursor: ptr<function, DDACursor2D>, rayOrigin: vec2<f32>, rayDir: vec2<f32>) {
          (*cursor).mapPos = floor(rayOrigin);

          // 1.0 / rayDir as per https://lodev.org/cgtutor/raycasting.html
          if (rayDir.x == 0.0f) {
            (*cursor).deltaDist.x = 1e+17f;
          } else {
            (*cursor).deltaDist.x = abs(1.0f / rayDir.x);
          }

          if (rayDir.y == 0.0f) {
            (*cursor).deltaDist.y = 1e+17f;
          } else {
            (*cursor).deltaDist.y = abs(1.0f / rayDir.y);
          }

          (*cursor).rayStep = sign(rayDir);
          var p: vec2<f32> = (*cursor).mapPos - rayOrigin;
          (*cursor).sideDist = (*cursor).rayStep * p + (((*cursor).rayStep * 0.5f) + 0.5f) *
                               (*cursor).deltaDist;
        }

        fn DDACursorStep(cursor: ptr<function, DDACursor2D>) {
          var mask: vec2<f32> = step((*cursor).sideDist, (*cursor).sideDist.yx);
          (*cursor).sideDist += mask * (*cursor).deltaDist;
          (*cursor).mapPos += mask * (*cursor).rayStep;
        }

        const PI: f32 = 3.141592653589793;
        const TAU: f32 = PI * 2;

        @group(0) @binding(0) var<storage,read_write> probes: array<ProbeRayResult>;
        @group(0) @binding(1) var<uniform> ubo: UBOParams;
        @group(0) @binding(2) var worldTexture: texture_2d<u32>;

        @compute @workgroup_size(${workgroupSize.join(',')})
        fn ComputeMain(@builtin(global_invocation_id) id: vec3<u32>) {
          if (id.x >= ubo.totalRays) {
            return;
          }
          let globalThreadIndex: i32 = i32(id.x);
          let probeIndex = globalThreadIndex / ubo.probeRayCount;
          let probeRayIndex = globalThreadIndex % ubo.probeRayCount;

          let col = probeIndex % ubo.cascadeWidth;
          let row = probeIndex / ubo.cascadeWidth;

          let diameter: f32 = f32(ubo.probeRadius * 2);


          var result: ProbeRayResult;
          var cursor: DDACursor2D;

          var anglePerProbeRay: f32 = TAU / f32(ubo.probeRayCount);

          var rayOrigin: vec2<f32> = vec2<f32>(
            f32(col) * diameter + f32(ubo.probeRadius),
            f32(row) * diameter + f32(ubo.probeRadius),
          );

          var rayDirection: vec2<f32> = normalize(vec2<f32>(
            sin(f32(probeRayIndex) * anglePerProbeRay),
            cos(f32(probeRayIndex) * anglePerProbeRay)
          ));
          var radiusLengthSquared: f32 = f32(ubo.probeRadius * ubo.probeRadius);

          DDACursorInit(&cursor, rayOrigin, rayDirection);

          var hit: bool = false;
          while(!hit) {
            var diff: vec2<f32> = cursor.mapPos - rayOrigin;
            var d: f32 = diff.x * diff.x + diff.y * diff.y;
            if (radiusLengthSquared < d) {
              break;
            }

            var color: u32 = textureLoad(worldTexture, vec2<u32>(cursor.mapPos), 0).r;
            if (color != 0) {
              hit = true;
              // TODO: accumulate instead of hard stopping
              result.rgba = 0xFFFF00FF;
              break;
            }
            DDACursorStep(&cursor);
          }

          probes[probeIndex + probeRayIndex] = result;
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
            buffer: {
              type: 'storage'
            },
          },
          {
            binding: 1,
            visibility: GPUShaderStage.COMPUTE,
            buffer: {
              type: 'uniform'
            }
          },
          {
            binding: 2,
            visibility: GPUShaderStage.COMPUTE,
            texture: {
              sampleType: 'uint'
            },
          },
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
          {
            binding: 0,
            resource: {
              buffer: probeBuffer
            }
          },
          {
            binding: 1,
            resource: {
              buffer: ubo
            }
          },
          {
            binding: 2,
            resource: worldTexture.createView()
          },
        ]
      })

      // TODO: build more than level 0

      return function ProbeAtlasBuild(
        queue,
        computePass,
        width,
        height,
        probeRadius,
        probeRayCount,
      ) {

        let probeDiameter = probeRadius * 2.0
        let totalRays = (width / probeDiameter) * (height / probeDiameter)

        uboData[0] = totalRays
        uboData[1] = probeRadius
        uboData[2] = probeRayCount
        uboData[3] = (width / probeDiameter)
        queue.writeBuffer(ubo, 0, uboData)

        computePass.setPipeline(pipeline)
        computePass.setBindGroup(0, bindGroup)
        computePass.dispatchWorkgroups(
          Math.floor(totalRays / workgroupSize[0] + 1),
          1,
          1
        )
      }
    },

    WorldClear(device, texture, color, workgroupSize) {
      const source =  /* wgsl */`
        @group(0) @binding(0) var texture: texture_storage_2d<rg32uint, write>;
        @compute @workgroup_size(${workgroupSize.join(',')})
        fn ComputeMain(@builtin(global_invocation_id) id: vec3<u32>) {
          textureStore(texture, id.xy, vec4<u32>(${color.join(',')}, 0, 0));
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
              format: "rg32uint"
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
      const uboFields = [
        "mouse.x",
        "mouse.y",
        "brush.radius",
        "brush.radiance",
        "rgba",
      ]

      let uboData = new Int32Array(uboFields.length)

      const ubo = device.createBuffer({
        size: uboData.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        label: "WorldPaint/ubo",
      })

      const source = /* wgsl */`
        struct UBOParams {
          x: i32,
          y: i32,
          radius: i32,
          radiance: u32,
          color: u32,
        };

        @group(0) @binding(0) var texture: texture_storage_2d<rg32uint, write>;
        @group(0) @binding(1) var<uniform> ubo: UBOParams;

        fn Squared(a: i32) -> i32 {
          return a * a;
        }
        @compute @workgroup_size(${workgroupSize.join(',')})
        fn ComputeMain(@builtin(global_invocation_id) id: vec3<u32>) {
          var radiusSquared : i32 = ubo.radius * ubo.radius;
          var distanceSquared : i32 = Squared(i32(id.x) - ubo.x) + Squared(i32(id.y) - ubo.y);
          if (distanceSquared <= radiusSquared) {
            textureStore(texture, id.xy, vec4<u32>(ubo.color, ubo.radiance, 0, 0));
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
              format: "rg32uint"
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
        queue,
        x,
        y,
        radius,
        radiance,
        color,
        width,
        height
      ) {
        // update the uniform buffer
        uboData[0] = x
        uboData[1] = y
        uboData[2] = radius
        uboData[3] = radiance
        uboData[4] = color
        queue.writeBuffer(ubo, 0, uboData)

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
    params: {
      erase: false,
      radiance: 0,
      brushRadius: 16,
      probeRadius: 4,
      probeRayCount: 2,
    },
    dirty: true,
  }
  state.gpu = await InitGPU(state.ctx)

  // Create the probe atlas
  {
    let probeRayCount = Math.pow(2, parseFloat(document.getElementById('probe-ray-dda-2d-probe-rayCount-slider').max))
    let minProbeRadius = Math.pow(2, parseFloat(document.getElementById('probe-ray-dda-2d-probe-radius-slider').min))
    let probeDiameter = minProbeRadius * 2
    let maxProbeCount = (canvas.width / probeDiameter) * (canvas.height / probeDiameter)

    let diameter = probeDiameter
    let level = 0
    let totalRays = 0
    while (1) {
      if (diameter > canvas.width || diameter > canvas.height) {
        break;
      }

      const levelProbeCount = (canvas.width / diameter) * (canvas.height / diameter)
      const levelProbeRayCount = probeRayCount << level;
      const levelRayCount = levelProbeRayCount * levelProbeCount

      totalRays += levelRayCount
      diameter <<= 1;
      level++;
    }

    const raySize = ([
      'rgba',
      // TODO: radiance?
      // TODO: occlusion?
    ]).length * 4;

    state.probeBuffer = state.gpu.device.createBuffer({
      label: 'ProbeBuffer',
      size: totalRays * raySize,
      usage: GPUBufferUsage.STORAGE
    })
  }


  // Wire up mouse
  {
    const MoveMouse = (x, y) => {
      let ratioX = canvas.width / canvas.clientWidth
      let ratioY = canvas.height / canvas.clientHeight
      state.mouse.pos[0] = x * ratioX
      state.mouse.pos[1] = y * ratioY
      state.dirty = true;
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
      // r=rgba, b=emission
      format: 'rg32uint',
      usage: (
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING
      ),
      label: 'WorldTexture'
    })
  }

  // Create the gpu programs
  {
    const WorldClearWorkgroupSize = 16
    const WorldPaintWorkgroupSize = 16

    state.gpu.programs = {
      debugWorldBlit: shaders.DebugWorldBlit(
        state.gpu.device,
        state.gpu.presentationFormat,
        state.worldTexture,
        state.worldTextureSampler
      ),
      probeAtlasBuild: shaders.ProbeAtlasBuild(
        state.gpu.device,
        state.probeBuffer,
        state.worldTexture,
        [256, 1, 1]
      ),
      worldClear: shaders.WorldClear(
        state.gpu.device,
        state.worldTexture,
        [0, 0],
        [WorldClearWorkgroupSize, WorldClearWorkgroupSize, 1]
      ),
      worldPaint: shaders.WorldPaint(
        state.gpu.device,
        state.worldTexture,
        [WorldPaintWorkgroupSize, WorldPaintWorkgroupSize, 1]
      ),
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

  const Param = (name, value) => {
    if (state.params[name] != value) {
      state.params[name] = value;
      return true;
    }
    return false;
  }

  const ColorParam = (name, value) => {
    let v = parseInt(value.replace("#", ""), 16)

    let r = (v >> 16) & 0xFF
    let g = (v >> 8) & 0xFF
    let b = (v >> 0) & 0xFF
    let color = r | (g << 8) | (b << 16)

    return Param(name, color)
  }

  const ReadParams = () => {
    // probe params
    {
      state.dirty = state.dirty || Param(
        'probeRadius',
        parseFloat(document.getElementById('probe-ray-dda-2d-probe-radius-slider').value)
      )
      state.dirty = state.dirty || Param(
        'probeRayCount',
        parseFloat(document.getElementById('probe-ray-dda-2d-probe-rayCount-slider').value)
      )
    }

    // brush params
    {
      state.dirty = state.dirty || Param(
        'erase',
        !!document.getElementById('probe-ray-dda-2d-erase').checked
      )

      state.dirty = state.dirty || Param(
        'brushRadiance',
        parseFloat(document.getElementById('probe-ray-dda-2d-brush-radiance-slider').value) / 256.0
      )

      state.dirty = state.dirty || Param(
        'brushRadius',
        parseFloat(document.getElementById('probe-ray-dda-2d-brush-radius-slider').value)
      )

      state.dirty = state.dirty || ColorParam(
        'color',
        document.getElementById('probe-ray-dda-2d-color').value
      )
    }
  }

  const RenderFrame = async () => {
    ReadParams()
    if (!state.dirty) {
      window.requestAnimationFrame(RenderFrame)
      return;
    }
    state.dirty = false

    let commandEncoder = state.gpu.device.createCommandEncoder()

    // Paint Into World
    if (state.mouse.down) {
      await state.gpu.programs.worldPaint(
        commandEncoder,
        state.gpu.device.queue,
        state.mouse.pos[0],
        canvas.height - state.mouse.pos[1],
        state.params.brushRadius,
        state.params.brushRadiance,
        state.params.erase ? 0 : state.params.color,
        canvas.width,
        canvas.height
      )
    }

    // Fill the probe atlas via ray casting
    {
      // console.log("----")
      let totalRays = 0
      let probeRayCount = Math.pow(2.0, state.params.probeRayCount)
      let probeRadius = Math.pow(2.0, state.params.probeRadius)
      // compute the total rays
      {
        let probeDiameter = probeRadius * 2.0
        let maxProbeCount = (canvas.width / probeDiameter) * (canvas.height / probeDiameter)

        let diameter = probeDiameter
        let level = 0
        while (1) {
          if (diameter > canvas.width || diameter > canvas.height) {
            break;
          }

          const levelProbeCount = (canvas.width / diameter) * (canvas.height / diameter)
          const levelProbeRayCount = probeRayCount << level;
          const levelRayCount = levelProbeRayCount * levelProbeCount
          totalRays += levelRayCount
          // console.log(level, 'total:', totalRays, levelRayCount)
          diameter <<= 1;
          level++;
        }
      }

      let pass = commandEncoder.beginComputePass()
      state.gpu.programs.probeAtlasBuild(
        state.gpu.device.queue,
        pass,
        totalRays,
        probeRayCount,
        probeRadius,
        canvas.width,
        canvas.height
      );

      pass.end()
    }

    // Debug Render World Texture
    {
      await state.gpu.programs.debugWorldBlit(
        commandEncoder,
        state.gpu.device.queue,
        state.ctx,
        canvas.width,
        canvas.height
      )
    }

    state.gpu.device.queue.submit([commandEncoder.finish()])
    window.requestAnimationFrame(RenderFrame)
  }

  RenderFrame()
})()