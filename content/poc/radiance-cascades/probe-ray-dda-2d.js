(async function () {

  const shaders = {
    DebugWorldBlit(device, presentationFormat, worldTexture, irradianceTexture) {
      const uboFields = [
        "width",
        "height",
        "probeRadius",
        "probeRayCount",
        "probeInterpolation",
      ]

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

          // Probes
          probeRadius: i32,
          probeRayCount: i32,
          probeInterpolation: i32,
        };

        struct ProbeRayResult {
          rgba: u32,
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

        const PI: f32 = 3.141592653589793;
        const TAU: f32 = PI * 2;

        @group(0) @binding(0) var worldTexture: texture_2d<u32>;
        @group(0) @binding(1) var irradianceTexture: texture_2d<f32>;
        @group(0) @binding(2) var<uniform> ubo: UBOParams;

        @fragment
        fn FragmentMain(fragData: VertexOut) -> @location(0) vec4f {
          var scale = 1.0;
          var pixelPos: vec2<f32> = vec2<f32>(
            fragData.uv.x * f32(ubo.width) / scale,
            fragData.uv.y * f32(ubo.height) / scale
          );

          var worldSamplePos: vec2<u32> = vec2<u32>(pixelPos);
          var packedWorldColor: u32 = textureLoad(worldTexture, worldSamplePos, 0).r;
          var color = unpack4x8unorm(packedWorldColor).rgb;

          return vec4f(
            color,
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
              sampleType: 'uint',
            },
          },
          {
            binding: 1,
            visibility: GPUShaderStage.FRAGMENT,
            texture: {
              sampleType: 'float',
            },
          },
          {
            binding: 2,
            visibility: GPUShaderStage.FRAGMENT,
            buffer: {
              type: 'uniform',
            }
          },
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
          {
            binding: 0,
            resource: worldTexture.createView()
          },
          {
            binding: 1,
            resource: irradianceTexture.createView()
          },
          {
            binding: 2, resource: {
              buffer: ubo
            }
          },
        ]
      })

      return async function DebugWorldBlit(
        commandEncoder,
        queue,
        ctx,
        width,
        height,
        probeRadius,
      ) {

        // update uniform buffer
        uboData[0] = width
        uboData[1] = height
        // Probes
        uboData[2] = probeRadius
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

    ProbeAtlasRaycast(device, probeBuffer, worldTexture, workgroupSize, maxLevelRayCount) {
      const uboFields = [
        "totalRays",
        "probeRadius",
        "probeRayCount",
        "level",
        "levelCount",
        "width",
        "height",
        "maxLevel0Rays",
        "probeRayBranchingFactor"
      ]

      let uboData = new Int32Array(uboFields.length)

      const ubo = device.createBuffer({
        size: uboData.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        label: "ProbeAtlasRaycast/ubo",
      })

      const source =  /* wgsl */`

        const maxLevelRayCount : u32 = ${maxLevelRayCount};

        struct UBOParams {
          totalRays: u32,
          probeRadius: i32,
          probeRayCount: i32,
          level: i32,
          levelCount: i32,
          width: i32,
          height: i32,
          maxLevel0Rays: i32,
          // how many more rays does level N+1 have than N
          // e.g., N+1 = N * probeRayBranchingFactor
          probeRayBranchingFactor: i32,
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

        fn DDACursorInit(rayOrigin: vec2<f32>, rayDir: vec2<f32>) -> DDACursor2D {
          var cursor: DDACursor2D;
          cursor.mapPos = floor(rayOrigin);

          // 1.0 / rayDir as per https://lodev.org/cgtutor/raycasting.html
          if (rayDir.x == 0.0) {
            cursor.deltaDist.x = 1e+17;
          } else {
            cursor.deltaDist.x = abs(1.0f / rayDir.x);
          }

          if (rayDir.y == 0.0) {
            cursor.deltaDist.y = 1e+17;
          } else {
            cursor.deltaDist.y = abs(1.0f / rayDir.y);
          }

          cursor.rayStep = sign(rayDir);
          var p: vec2<f32> = cursor.mapPos - rayOrigin;
          cursor.sideDist = cursor.rayStep * p + ((cursor.rayStep * 0.5f) + 0.5f) *
                            cursor.deltaDist;
          return cursor;
        }

        const PI: f32 = 3.141592653589793;
        const TAU: f32 = PI * 2;

        @group(0) @binding(0) var<storage,read_write> probes: array<ProbeRayResult>;
        @group(0) @binding(1) var<uniform> ubo: UBOParams;
        @group(0) @binding(2) var worldTexture: texture_2d<u32>;

        fn RayMarch(rayOrigin: vec2f, rayDirection: vec2f, probeRadius: f32) -> vec4f {

          var cursor = DDACursorInit(rayOrigin, rayDirection);
          // a=hit something
          var result = vec4f(0.0, 0.0, 0.0, 0.0);

          while(true) {
            if (distance(cursor.mapPos, rayOrigin) > probeRadius) {
              break;
            }

            if (
              cursor.mapPos.x < 0 ||
              cursor.mapPos.y < 0 ||
              cursor.mapPos.x > f32(ubo.width) ||
              cursor.mapPos.y > f32(ubo.height)
            ) {
              break;
            }

            var color: u32 = textureLoad(worldTexture, vec2<u32>(cursor.mapPos), 0).r;
            if (color != 0) {
              // TODO: accumulate instead of hard stopping
              result = unpack4x8unorm(color);
              result.w = 1.0;
              break;
            }

            // Step the ray
            {
              var mask: vec2f = step(cursor.sideDist, cursor.sideDist.yx);
              cursor.sideDist += mask * cursor.deltaDist;
              cursor.mapPos += mask * cursor.rayStep;
            }
          }

          return result;
        }

        fn SampleUpperProbe(pos: vec2<i32>, raysPerProbe: i32, bufferStartIndex: i32, cascadeWidth: i32) -> vec4f {
          let index = raysPerProbe * pos.x + raysPerProbe * pos.y * cascadeWidth;
          return unpack4x8unorm(
            probes[bufferStartIndex + index].rgba
          );
        }

        // given: world space sample pos, angle
        // - sample each probe in the neighborhood (4)
        // - interpolate
        fn SampleUpperProbes(pos: vec2f, angle: f32, currentValue: vec4f ) -> vec4f {
          if (currentValue.w > 0.0) {
            return currentValue;
          }

          let CurrentLevel = ubo.level;
          let UpperLevel = ubo.level + 1;

          if (UpperLevel >= ubo.levelCount) {
            return currentValue;
          }

          let UpperRaysPerProbe = ubo.probeRayCount * ubo.probeRayBranchingFactor;
          let UpperAnglePerProbeRay = TAU / f32(UpperRaysPerProbe);
          let UpperLevelRayIndex = i32(angle / UpperAnglePerProbeRay);
          let UpperLevelBufferOffset = ubo.maxLevel0Rays * (UpperLevel % 2);
          let UpperProbeDiameter = 2 * (ubo.probeRadius * ubo.probeRayBranchingFactor);
          let UpperCascadeWidth = ubo.width / UpperProbeDiameter;
          let sampleDir = vec2<i32>(step(
            vec2f(0.5),
            fract(pos / f32(ubo.probeRadius * ubo.probeRayBranchingFactor))
          )) * 2 - 1;
          let basePos = vec2<i32>(pos / f32(UpperCascadeWidth));

          let bufferStartIndex = UpperLevelBufferOffset + UpperLevelRayIndex;
          let samples = array(
            SampleUpperProbe(
              basePos,
              UpperRaysPerProbe,
              bufferStartIndex,
              UpperCascadeWidth
            ),
            SampleUpperProbe(
              basePos + vec2<i32>(sampleDir.x, 0),
              UpperRaysPerProbe,
              bufferStartIndex,
              UpperCascadeWidth
            ),
            SampleUpperProbe(
              basePos + vec2<i32>(0, sampleDir.y),
              UpperRaysPerProbe,
              bufferStartIndex,
              UpperCascadeWidth
            ),
            SampleUpperProbe(
              basePos + vec2<i32>(sampleDir.x, sampleDir.y),
              UpperRaysPerProbe,
              bufferStartIndex,
              UpperCascadeWidth
            ),
          );

          let upperSampleAverage = (samples[0] + samples[1] + samples[2] + samples[3]) * 0.25;

          // TODO:
          // - sample the 4 closest upper probes
          // - merge the upper results
          // - merge the upper with the current and return

          return (currentValue + upperSampleAverage) * 0.5;
        }

        @compute @workgroup_size(${workgroupSize.join(',')})
        fn ComputeMain(@builtin(global_invocation_id) id: vec3<u32>) {
          if (id.x >= ubo.totalRays) {
            return;
          }
          let RayIndex: i32 = i32(id.x);


          let probeIndex = RayIndex / ubo.probeRayCount;
          let probeRayIndex = RayIndex % ubo.probeRayCount;
          var anglePerProbeRay = TAU / f32(ubo.probeRayCount);

          let probeRadius = f32(ubo.probeRadius);
          let probeDiameter = probeRadius * 2.0;
          let cascadeWidth = ubo.width / (ubo.probeRadius * 2);

          let col = probeIndex % cascadeWidth;
          let row = probeIndex / cascadeWidth;

          var rayOrigin = vec2<f32>(
            f32(col) * probeDiameter + f32(ubo.probeRadius),
            f32(row) * probeDiameter + f32(ubo.probeRadius),
          );

          var rayAngle = f32(probeRayIndex) * anglePerProbeRay;
          var rayDirection = normalize(vec2<f32>(
            sin(rayAngle),
            cos(rayAngle)
          ));

          rayOrigin += rayDirection * probeRadius;
          var result: vec4f = RayMarch(rayOrigin, rayDirection, probeRadius);

          var outputIndex = (ubo.maxLevel0Rays * (ubo.level % 2)) + RayIndex;
          var upperResult = SampleUpperProbes(rayOrigin, rayAngle, result);
          probes[outputIndex].rgba = pack4x8unorm(result);
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

      return function ProbeAtlasRaycast(
        queue,
        computePass,
        width,
        height,
        probeRadius,
        probeRayCount,
        level,
        levelCount,
        maxLevel0Rays,
        probeRayBranchingFactor
      ) {
        let probeDiameter = probeRadius * 2.0
        let totalRays = (width / probeDiameter) * (height / probeDiameter) * probeRayCount

        uboData[0] = totalRays
        uboData[1] = probeRadius
        uboData[2] = probeRayCount
        uboData[3] = level
        uboData[4] = levelCount
        uboData[5] = width
        uboData[6] = height
        uboData[7] = maxLevel0Rays
        uboData[8] = probeRayBranchingFactor

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

    BuildIrradianceTexture(device, probeBuffer, irradianceTexture, workgroupSize) {
      const uboFields = [
        "probeRayCount",
        "cascadeWidth",
      ]

      const uboData = new Uint32Array(uboFields.length)
      const ubo = device.createBuffer({
        size: uboData.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        label: "DebugWorldBlit/ubo",
      })

      const source =  /* wgsl */`
        struct UBOParams {
          probeRayCount: i32,
          cascadeWidth: i32,
        };

        struct ProbeRayResult {
          rgba: u32,
        };

        @group(0) @binding(0) var irradianceTexture: texture_storage_2d<rgba8unorm, write>;
        @group(0) @binding(1) var<storage,read_write> probes: array<ProbeRayResult>;
        @group(0) @binding(2) var<uniform> ubo: UBOParams;
        @compute @workgroup_size(${workgroupSize.join(',')})
        fn ComputeMain(@builtin(global_invocation_id) id: vec3<u32>) {
          // TODO: convert id into probe offset
          let startIndex = i32(id.x) * ubo.probeRayCount + i32(id.y) * ubo.probeRayCount * ubo.cascadeWidth;
          var acc = vec4f(0.0);
          for (var rayIndex = 0; rayIndex < ubo.probeRayCount; rayIndex++) {
            let value = unpack4x8unorm(probes[startIndex + rayIndex].rgba);
            acc = max(acc, value);
          }
          textureStore(irradianceTexture, id.xy, acc);
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
            buffer: {
              type: 'storage'
            },
          },
          {
            binding: 2,
            visibility: GPUShaderStage.COMPUTE,
            buffer: {
              type: 'uniform'
            }
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
            binding: 0, resource: irradianceTexture.createView()
          },
          {
            binding: 1,
            resource: {
              buffer: probeBuffer
            }
          },
          {
            binding: 2,
            resource: {
              buffer: ubo
            }
          },
        ]
      })

      return function BuildIrradianceTexture(computePass, probeRayCount, width, height, probeRadius) {
        let probeDiameter = probeRadius * 2.0
        let cascadeWidth = width / probeDiameter;
        let cascadeHeight = width / probeDiameter;
        uboData[0] = probeRayCount
        uboData[1] = cascadeWidth

        queue.writeBuffer(ubo, 0, uboData)

        computePass.setPipeline(pipeline)
        computePass.setBindGroup(0, bindGroup)
        computePass.dispatchWorkgroups(
          Math.floor(cascadeWidth / workgroupSize[0] + 1),
          Math.floor(cascadeHeight / workgroupSize[1] + 1),
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

  state.params.probeRayBranchingFactor = 2

  // Create the probe atlas
  {
    let probeRayCount = Math.pow(state.params.probeRayBranchingFactor, parseFloat(document.getElementById('probe-ray-dda-2d-probe-rayCount-slider').max))
    let minProbeRadius = Math.pow(state.params.probeRayBranchingFactor, parseFloat(document.getElementById('probe-ray-dda-2d-probe-radius-slider').min))
    let probeDiameter = minProbeRadius * 2
    let maxProbeCount = (canvas.width / probeDiameter) * (canvas.height / probeDiameter)
    state.maxLevel0Rays = maxProbeCount * probeRayCount;
    const raySize = ([
      'rgba',
      // TODO: radiance?
      // TODO: occlusion?
    ]).length * 4;

    state.probeBuffer = state.gpu.device.createBuffer({
      label: 'ProbeBuffer',
      // Note: we need to ping-pong so the buffer needs to be doubled in size
      size: state.maxLevel0Rays * raySize * 2,
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

  // Create the irradiance texture
  {
    state.irradianceTexture = state.gpu.device.createTexture({
      size: [canvas.width, canvas.height, 1],
      dimension: '2d',
      format: 'rgba8unorm',
      usage: (
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING
      ),
      label: 'IrradianceTexture'
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
        state.irradianceTexture
      ),
      probeAtlasRaycast: shaders.ProbeAtlasRaycast(
        state.gpu.device,
        state.probeBuffer,
        state.worldTexture,
        [256, 1, 1],
        state.maxLevel0Rays
      ),
      buildIrradianceTexture: shaders.BuildIrradianceTexture(
        state.gpu.device,
        state.probeBuffer,
        state.irradianceTexture,
        [256, 1, 1],
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

  {
    let commandEncoder = state.gpu.device.createCommandEncoder()
    state.gpu.programs.worldPaint(
      commandEncoder,
      state.gpu.device.queue,
      canvas.width * 0.5,
      canvas.height * 0.5,
      50,
      state.params.brushRadiance,
      0xFFFFFFFF,
      canvas.width,
      canvas.height
    )
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
      state.dirty = state.dirty || Param(
        'probeLevel',
        parseFloat(document.getElementById('probe-ray-dda-2d-probe-level').value)
      )
      state.dirty = state.dirty || Param(
        'probeInterpolation',
        !!document.getElementById('probe-ray-dda-2d-probe-interpolation').checked
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
      let pass = commandEncoder.beginComputePass()
      const levelCount = Math.log2(state.canvas.width >> state.params.probeRadius)
      for (let level = levelCount - 1; level >= 0; level--) {
        let probeRayCount = Math.pow(state.params.probeRayBranchingFactor, state.params.probeRayCount << level)
        let probeRadius = Math.pow(state.params.probeRayBranchingFactor, state.params.probeRadius << level)

        state.gpu.programs.probeAtlasRaycast(
          state.gpu.device.queue,
          pass,
          canvas.width,
          canvas.height,
          probeRadius,
          probeRayCount,
          level,
          levelCount,
          state.maxLevel0Rays,
          state.params.probeRayBranchingFactor
        );
      }

      pass.end()
    }

    // Debug Render World Texture
    {
      let probeRadius = Math.pow(state.params.probeRayBranchingFactor, state.params.probeRadius)

      await state.gpu.programs.debugWorldBlit(
        commandEncoder,
        state.gpu.device.queue,
        state.ctx,
        canvas.width,
        canvas.height,
        probeRadius
      )
    }

    state.gpu.device.queue.submit([commandEncoder.finish()])
    window.requestAnimationFrame(RenderFrame)
  }

  RenderFrame()
})()