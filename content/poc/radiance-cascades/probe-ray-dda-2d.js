(async function () {

  const shaders = {
    DebugWorldBlit(device, presentationFormat, texture, probeBuffer) {
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
        @group(0) @binding(1) var<uniform> ubo: UBOParams;
        @group(0) @binding(2) var<storage,read> probes: array<ProbeRayResult>;

        fn AngleTo(a: vec2f, b: vec2f) -> f32 {
          var diff = normalize(b - a);

          var angle = atan2(diff.x, diff.y);
          if (angle < 0) {
            angle = TAU + angle;
          }
          return angle;
        }

        fn SampleProbe(probeCenter: vec2f, samplePos: vec2f, probeIndex: i32) -> vec3f {
          var diff = normalize(samplePos - probeCenter);
          // return vec3f(diff * 0.5 + 0.5, 1.0);

          var d = distance(samplePos, probeCenter);

          if (d < f32(ubo.probeRadius>>2)) {
            var col: vec3<i32> = i32(probeIndex + 1) * vec3<i32>(158, 2 * 156, 3 * 159);
            col = col % vec3<i32>(255, 253, 127);
            return vec3f(col) / 255.0;
          }

          var angle = AngleTo(probeCenter, samplePos);
          var angleIndex = floor(f32(ubo.probeRayCount) * angle / TAU);
          // if (probes[probeIndex + i32(angleIndex)].rgba > 0) {
          //   var col: vec3<i32> = i32(angleIndex + 1) * vec3<i32>(158, 2 * 156, 3 * 159);
          //   col = col % vec3<i32>(255, 253, 127);
          //   return vec3f(col) / 255.0;
          // }
          return unpack4x8unorm(probes[probeIndex + i32(angleIndex)].rgba).rgb;
        }

        fn SampleProbes(samplePos: vec2<f32>) -> vec3<f32> {
          var probeRadius: f32 = f32(ubo.probeRadius);
          var probeDiameter: f32 = probeRadius * 2.0;
          var cascadeWidth = i32(floor(f32(ubo.width)/probeDiameter));
          var posInProbeSpace = floor(samplePos / probeDiameter);
          var posInProbeSpacePartial = fract(samplePos / probeDiameter);

          var samples = array<vec3f, 5>(vec3f(0.0), vec3f(0.0), vec3f(0.0), vec3f(0.0), vec3f(0.0));

          // center probe
          {
            var probeIndex = (
              i32(posInProbeSpace.x) + i32(posInProbeSpace.y) * cascadeWidth
            ) * ubo.probeRayCount;

            var pos = posInProbeSpace * probeDiameter + probeRadius;
            samples[0] = SampleProbe(pos, samplePos, probeIndex);
          }

          if (ubo.probeInterpolation == 0) {
            return samples[0];
          }


          // left probe
          {
            var pos = posInProbeSpace + vec2f(-1.0, 0.0);
            var probeIndex = (
              i32(pos.x) + i32(pos.y) * cascadeWidth
            ) * ubo.probeRayCount;

            samples[1] = SampleProbe(
              pos * probeDiameter + probeRadius,
              samplePos,
              probeIndex
            );
          }

          // right probe
          {
            var pos = posInProbeSpace + vec2f(1.0, 0.0);
            var probeIndex = (
              i32(pos.x) + i32(pos.y) * cascadeWidth
            ) * ubo.probeRayCount;

            samples[3] = SampleProbe(
              pos * probeDiameter + probeRadius,
              samplePos,
              probeIndex
            );
          }

          // bottom probe
          {
            var pos = posInProbeSpace + vec2f(0.0, -1.0);
            var probeIndex = (
              i32(pos.x) + i32(pos.y) * cascadeWidth
            ) * ubo.probeRayCount;

            samples[2] = SampleProbe(
              pos * probeDiameter + probeRadius,
              samplePos,
              probeIndex
            );
          }

          // top probe
          {
            var pos = posInProbeSpace + vec2f(0.0, 1.0);
            var probeIndex = (
              i32(pos.x) + i32(pos.y) * cascadeWidth
            ) * ubo.probeRayCount;

            samples[4] = SampleProbe(
              pos * probeDiameter + probeRadius,
              samplePos,
              probeIndex
            );
          }

          var lateralX = mix(samples[1], samples[3], posInProbeSpacePartial.x);
          var lateralY = mix(samples[2], samples[4], posInProbeSpacePartial.y);

          // if (posInProbeSpacePartial.x <= 0.5) {
          //   var t = posInProbeSpacePartial.x * 2.0;
          //   if (false) {
          //     lateralX = mix(samples[0], lateralX, t);
          //   } else {
          //     lateralX = mix(samples[0], lateralX, 1.0 - t);
          //   }
          // } else {
          //   var t = (posInProbeSpacePartial.x - 0.5) * 2.0;
          //   if (true) {
          //     lateralX = mix(samples[0], lateralX, t);
          //   } else {
          //     lateralX = mix(samples[0], lateralX, 1.0 - t);
          //   }
          // }

          // if (posInProbeSpacePartial.y <= 0.5) {
          //   var t = posInProbeSpacePartial.y * 2.0;
          //   lateralY = mix(samples[0], lateralY, t);
          // } else {
          //   var t = (posInProbeSpacePartial.y - 0.5) * 2.0;
          //   lateralY = mix(lateralY, samples[0], t);
          // }

          // return lateralX;
          // return (lateralX + lateralY) * 0.5;
          return mix(samples[0], (lateralX + lateralY) * 0.5, length(posInProbeSpacePartial));

          // // unpack4x8unorm(color).rgb
          // // return vec3(1.0, 0.0, 1.0);
          // return (
          //   lateralX// + lateralY
          // ) / 2.0;
        }

        @fragment
        fn FragmentMain(fragData: VertexOut) -> @location(0) vec4f {
          var scale = 1.0;
          var pixelPos: vec2<f32> = vec2<f32>(
            fragData.uv.x * f32(ubo.width) / scale,
            fragData.uv.y * f32(ubo.height) / scale
          );
          // return vec4f(fragData.uv.x, fragData.uv.y, 0.0, 1.0);

          var worldSamplePos: vec2<u32> = vec2<u32>(pixelPos);
          var packedWorldColor: u32 = textureLoad(worldTexture, worldSamplePos, 0).r;
          var color = unpack4x8unorm(packedWorldColor).rgb;
          color = (color + SampleProbes(pixelPos)) * 0.5;

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
            buffer: {
              type: 'uniform',
            }
          },
          {
            binding: 2,
            visibility: GPUShaderStage.FRAGMENT,
            buffer: {
              type: 'read-only-storage',

            }
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
          {
            binding: 0,
            resource: texture.createView()
          },
          {
            binding: 1, resource: {
              buffer: ubo
            }
          },
          {
            binding: 2,
            resource: {
              buffer: probeBuffer
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
        probeRayCount,
        probeInterpolation
      ) {

        // update uniform buffer
        uboData[0] = width
        uboData[1] = height
        // Probes
        uboData[2] = probeRadius
        uboData[3] = probeRayCount
        uboData[4] = probeInterpolation
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

    ProbeAtlasRaycast(device, probeBuffer, worldTexture, workgroupSize) {
      const uboFields = [
        "totalRays",
        "level0.probeRadius",
        "level0.probeRayCount",
        "cascadeLevelCount",
        "width",
        "height",
      ]

      let uboData = new Int32Array(uboFields.length)

      const ubo = device.createBuffer({
        size: uboData.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        label: "ProbeAtlasRaycast/ubo",
      })

      const source =  /* wgsl */`
        struct UBOParams {
          totalRays: u32,
          probeRadius: i32,
          probeRayCount: i32,
          cascadeLevelCount: i32,
          width: i32,
          height: i32,
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

        fn RayMarch(rayOrigin: vec2f, rayDirection: vec2f, probeRadius: f32) -> ProbeRayResult {

          var cursor = DDACursorInit(rayOrigin, rayDirection);
          var hit: bool = false;
          var result: ProbeRayResult;
          result.rgba = 0;

          while(!hit) {
            if (distance(cursor.mapPos, rayOrigin) > probeRadius) {
              break;
            }

            if (cursor.mapPos.x < 0 || cursor.mapPos.y < 0) {
              break;
            }

            var color: u32 = textureLoad(worldTexture, vec2<u32>(cursor.mapPos), 0).r;
            if (color != 0) {
              hit = true;
              result.rgba = color;
              // // TODO: accumulate instead of hard stopping
              // // probes[globalThreadIndex].rgba = 0xFFFFFFFF;
              // probes[globalThreadIndex].rgba = color;

              // var col: vec3<i32> = i32(globalThreadIndex + 1) * vec3<i32>(158, 2 * 156, 3 * 159);
              // col = col % vec3<i32>(255, 253, 127);
              // probes[globalThreadIndex].rgba = pack4x8unorm(
              //   vec4f(f32(col.x)/255.0, f32(col.y)/255.0, f32(col.z)/255.0, 1.0)
              // );
              break;
            }

            // Step the ray
            {
              var mask: vec2<f32> = step(cursor.sideDist, cursor.sideDist.yx);
              cursor.sideDist += mask * cursor.deltaDist;
              cursor.mapPos += mask * cursor.rayStep;
            }
          }

          return result;
        }

        @compute @workgroup_size(${workgroupSize.join(',')})
        fn ComputeMain(@builtin(global_invocation_id) id: vec3<u32>) {
          if (id.x >= ubo.totalRays) {
            return;
          }
          let globalThreadIndex: i32 = i32(id.x);


          let probeIndex = globalThreadIndex / ubo.probeRayCount;
          let probeRayIndex = globalThreadIndex % ubo.probeRayCount;
          var anglePerProbeRay = TAU / f32(ubo.probeRayCount);

          // {
          //   var col: vec3<i32> = i32(probeIndex + 1) * vec3<i32>(158, 2 * 156, 3 * 159);
          //   col = col % vec3<i32>(255, 253, 127);
          //   probes[globalThreadIndex].rgba = pack4x8unorm(
          //     vec4f(f32(col.x)/255.0, f32(col.y)/255.0, f32(col.z)/255.0, 1.0)
          //   );
          //   return;
          // }


          let probeRadius = f32(ubo.probeRadius);
          let probeDiameter = probeRadius * 2.0;
          var cascadeWidth = ubo.width / (ubo.probeRadius * 2);

          let col = probeIndex % cascadeWidth;
          let row = probeIndex / cascadeWidth;

          probes[globalThreadIndex].rgba = 0;


          var rayOrigin = vec2<f32>(
            f32(col) * probeDiameter + f32(ubo.probeRadius),
            f32(row) * probeDiameter + f32(ubo.probeRadius),
          );

          var rayDirection = normalize(vec2<f32>(
            sin(f32(probeRayIndex) * anglePerProbeRay),
            cos(f32(probeRayIndex) * anglePerProbeRay)
          ));

          rayOrigin += rayDirection * probeRadius;
          var result = RayMarch(rayOrigin, rayDirection, probeRadius);

          probes[globalThreadIndex] = result;

          // {
          //   var col: vec3<i32> = i32(globalThreadIndex + 1) * vec3<i32>(158, 2 * 156, 3 * 159);
          //   col = col % vec3<i32>(255, 253, 127);
          //   probes[globalThreadIndex].rgba = pack4x8unorm(
          //     vec4f(f32(col.x)/255.0, f32(col.y)/255.0, f32(col.z)/255.0, 1.0)
          //   );
          //   return;
          // }


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
        cascadeLevelCount
      ) {
        let probeDiameter = probeRadius * 2.0
        let totalRays = (width / probeDiameter) * (height / probeDiameter) * probeRayCount

        uboData[0] = totalRays
        uboData[1] = probeRadius
        uboData[2] = probeRayCount
        uboData[3] = cascadeLevelCount
        uboData[4] = width
        uboData[5] = height
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
        state.probeBuffer
      ),
      probeAtlastRaycast: shaders.ProbeAtlasRaycast(
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
    let totalRays = 0
    let probeRayCount = Math.pow(2.0, state.params.probeRayCount)
    let probeRadius = Math.pow(2.0, state.params.probeRadius)
    {
      // compute the total rays
      {
        let probeDiameter = probeRadius * 2.0
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
          diameter <<= 1;
          level++;
          // TODO: handle levels > 0
          break;
        }
      }

      let pass = commandEncoder.beginComputePass()
      state.gpu.programs.probeAtlastRaycast(
        state.gpu.device.queue,
        pass,
        canvas.width,
        canvas.height,
        probeRadius,
        probeRayCount
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
        canvas.height,
        probeRadius,
        probeRayCount,
        state.params.probeInterpolation
      )
    }

    state.gpu.device.queue.submit([commandEncoder.finish()])
    window.requestAnimationFrame(RenderFrame)
  }

  RenderFrame()
})()