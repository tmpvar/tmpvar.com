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
          probeRadius: i32
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
          var value = textureLoad(worldTexture, worldSamplePos, 0);
          var color: vec4f;
          if (value.r != 0) {
            color = unpack4x8unorm(value.r) * f32(value.g) / 1024.0;
          } else {
            let probeDiameter = ubo.probeRadius * 2;
            let irradianceSamplePos = pixelPos;//fragData.uv;// * f32(probeDiameter);
            color = textureLoad(irradianceTexture, vec2<i32>(irradianceSamplePos), 0);
          }

          return vec4f(
            color.rgb,
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

    ProbeAtlasRaycast(gpu, probeBuffer, worldTexture, workgroupSize, maxLevelRayCount) {
      const device = gpu.device
      const uboFields = [
        "totalRays",
        "probeRadius",
        "probeRayCount",
        "level",
        "levelCount",
        "width",
        "height",
        "maxLevel0Rays",
        "intervalRadius",
        "branchingFactor",
      ]

      // TODO: if we go over 256 bytes then this needs to be updated
      const alignedSize = gpu.adapter.limits.minUniformBufferOffsetAlignment;
      const alignedIndices = alignedSize / 4
      const maxCascadeLevels = 10;
      let uboData = new Int32Array(alignedIndices * maxCascadeLevels)

      const ubo = gpu.device.createBuffer({
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
          intervalRadius: i32,
          // WGSL wants this to be unsigned because it is used as a shift
          branchingFactor: u32,
        };

        struct ProbeRayResult {
          rgba: u32,
          radiance: f32,
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
          let p = cursor.mapPos - rayOrigin;
          cursor.sideDist = cursor.rayStep * p + ((cursor.rayStep * 0.5f) + 0.5f) *
                            cursor.deltaDist;
          return cursor;
        }

        const PI: f32 = 3.141592653589793;
        const TAU: f32 = PI * 2;

        @group(0) @binding(0) var<storage,read_write> probes: array<vec4f>;
        @group(0) @binding(1) var<uniform> ubo: UBOParams;
        @group(0) @binding(2) var worldTexture: texture_2d<u32>;

        struct RayMarchResult {
          color: vec4f,
          hit: bool,
        };

        fn RayMarch(probeCenter: vec2f, rayOrigin: vec2f, rayDirection: vec2f, maxDistance: f32) -> RayMarchResult {
          // return vec4(rayDirection * 0.5 + 0.5, 0.0, 1.0);
          var cursor = DDACursorInit(rayOrigin, rayDirection);
          // a=hit something
          var result: RayMarchResult;
          result.color = vec4f(0.0, 0.0, 0.0, 0.0);
          result.hit = false;

          while(true) {
            if (distance(cursor.mapPos, probeCenter) > maxDistance) {
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

            var value = textureLoad(worldTexture, vec2<i32>(cursor.mapPos), 0).rg;
            if (value.r != 0) {
              result.hit = true;
              result.color = unpack4x8unorm(value.r) * f32(value.g) / 1024.0;
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
          var result: RayMarchResult;
          if (pos.x < 0 || pos.y < 0 || pos.x >= cascadeWidth || pos.y >= cascadeWidth) {
            return vec4f(0.0);
          }

          let index = raysPerProbe * pos.x + pos.y * cascadeWidth * raysPerProbe;
          let rayCount = 1<<ubo.branchingFactor;
          var accColor = vec4(0.0);
          var accRadiance = 0.0;
          for (var offset=0; offset<rayCount; offset++) {
            accColor += probes[bufferStartIndex + index + offset];
          }
          return accColor / f32(rayCount);
        }

        // given: world space sample pos, angle
        // - sample each probe in the neighborhood (4)
        // - interpolate
        fn SampleUpperProbes(lowerProbeCenter: vec2f, rayIndex: i32) -> vec4f {
          let UpperLevel = ubo.level + 1;

          if (UpperLevel >= ubo.levelCount) {
            return vec4f(0.0);
          }

          let UpperRaysPerProbe = ubo.probeRayCount << ubo.branchingFactor;
          let UpperLevelRayIndex = (rayIndex << ubo.branchingFactor);
          let UpperLevelBufferOffset = ubo.maxLevel0Rays * (UpperLevel % 2);
          let UpperProbeDiameter = 2 * (ubo.probeRadius << 1);
          let UpperCascadeWidth = ubo.width / UpperProbeDiameter;

          let uv = (lowerProbeCenter/f32(UpperProbeDiameter)) / f32(UpperCascadeWidth);
          let index = uv * f32(UpperCascadeWidth) - 0.5;

          var basePos = vec2<i32>(floor(index));

          let bufferStartIndex = UpperLevelBufferOffset + UpperLevelRayIndex;
          let samples = array(
            SampleUpperProbe(
              basePos,
              UpperRaysPerProbe,
              bufferStartIndex,
              UpperCascadeWidth
            ),
            SampleUpperProbe(
              basePos + vec2<i32>(1, 0),
              UpperRaysPerProbe,
              bufferStartIndex,
              UpperCascadeWidth
            ),
            SampleUpperProbe(
              basePos + vec2<i32>(0, 1),
              UpperRaysPerProbe,
              bufferStartIndex,
              UpperCascadeWidth
            ),
            SampleUpperProbe(
              basePos + vec2<i32>(1, 1),
              UpperRaysPerProbe,
              bufferStartIndex,
              UpperCascadeWidth
            ),
          );

          var ret: RayMarchResult;
          let factor = fract(index);
          let invFactor = 1.0 - factor;

          let r1 = samples[0] * invFactor.x + samples[1] * factor.x;
          let r2 = samples[2] * invFactor.x + samples[3] * factor.x;
          return r1 * invFactor.y + r2 * factor.y;
        }

        @compute @workgroup_size(${workgroupSize.join(',')})
        fn ComputeMain(@builtin(global_invocation_id) id: vec3<u32>) {
          if (id.x > ubo.totalRays) {
            return;
          }

          let RayIndex = i32(id.x);
          let ProbeIndex = RayIndex / ubo.probeRayCount;
          let ProbeRayIndex = RayIndex % ubo.probeRayCount;

          let ProbeRadius = f32(ubo.probeRadius);
          let LowerProbeRadius = f32(ubo.probeRadius >> 1);

          let IntervalRadius = f32(ubo.intervalRadius);
          let LowerIntervalRadius = f32(ubo.intervalRadius >> ubo.branchingFactor);

          let ProbeDiameter = ProbeRadius * 2.0;
          let CascadeWidth = ubo.width / i32(ProbeDiameter);

          let col = ProbeIndex % CascadeWidth;
          let row = ProbeIndex / CascadeWidth;

          let RayAngle = TAU * (f32(ProbeRayIndex) + 0.5) /  f32(ubo.probeRayCount);
          let RayDirection = vec2<f32>(
            sin(RayAngle),
            cos(RayAngle)
          );

          let RayOrigin = vec2<f32>(
            f32(col) * ProbeDiameter + ProbeRadius,
            f32(row) * ProbeDiameter + ProbeRadius,
          );

          let OutputIndex = (ubo.maxLevel0Rays * (ubo.level % 2)) + RayIndex;
          var Result = RayMarch(
            RayOrigin,
            RayOrigin + RayDirection * LowerIntervalRadius,
            RayDirection,
            IntervalRadius
          );

          if (!Result.hit) {
            probes[OutputIndex] = SampleUpperProbes(RayOrigin, ProbeRayIndex);
          } else {
            probes[OutputIndex] = Result.color;
          }

          // color based on the angle
          // {
          //   var col = i32(OutputIndex + 1) * vec3<i32>(158, 2 * 156, 3 * 159);
          //   col = col % vec3<i32>(255, 253, 127);
          //   probes[OutputIndex].rgba = pack4x8unorm(
          //     vec4(vec3f(f32(ProbeRayIndex) / f32(ubo.probeRayCount)), 1.0)
          //   );
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
              type: 'uniform',
              hasDynamicOffset: true,
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
              buffer: ubo,
              size: alignedSize,
            }
          },
          {
            binding: 2,
            resource: worldTexture.createView()
          },
        ]
      })

      return function ProbeAtlasRaycast(
        queue,
        computePass,
        width,
        height,
        probeRadius,
        probeRayCount,
        intervalRadius,
        level,
        levelCount,
        maxLevel0Rays,
        branchingFactor
      ) {
        let probeDiameter = probeRadius * 2.0
        let totalRays = (width / probeDiameter) * (height / probeDiameter) * probeRayCount

        let levelIndexOffset = level * alignedIndices;
        uboData[levelIndexOffset + 0] = totalRays
        uboData[levelIndexOffset + 1] = probeRadius
        uboData[levelIndexOffset + 2] = probeRayCount
        uboData[levelIndexOffset + 3] = level
        uboData[levelIndexOffset + 4] = levelCount
        uboData[levelIndexOffset + 5] = width
        uboData[levelIndexOffset + 6] = height
        uboData[levelIndexOffset + 7] = maxLevel0Rays
        uboData[levelIndexOffset + 8] = intervalRadius
        uboData[levelIndexOffset + 9] = branchingFactor

        const byteOffset = level * alignedSize
        queue.writeBuffer(ubo, byteOffset, uboData, levelIndexOffset, alignedIndices)

        computePass.setPipeline(pipeline)
        computePass.setBindGroup(0, bindGroup, [byteOffset])

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
        "width",
        "probeRadius",
        "debugProbeDirections",
        "branchingFactor",
      ]

      const uboData = new Uint32Array(uboFields.length)
      const ubo = device.createBuffer({
        size: uboData.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        label: "DebugWorldBlit/ubo",
      })

      const source =  /* wgsl */`
        const PI: f32 = 3.141592653589793;
        const TAU: f32 = PI * 2.0;

        struct UBOParams {
          probeRayCount: i32,
          cascadeWidth: i32,
          width: i32,
          probeRadius: i32,
          debugProbeDirections: i32,
          branchingFactor: u32,
        };

        struct ProbeRayResult {
          rgba: u32,
          radiance: f32,
        };

        @group(0) @binding(0) var irradianceTexture: texture_storage_2d<rgba8unorm, write>;
        @group(0) @binding(1) var<storage,read_write> probes: array<vec4f>;
        @group(0) @binding(2) var<uniform> ubo: UBOParams;
        @compute @workgroup_size(${workgroupSize.join(',')})
        fn ComputeMain(@builtin(global_invocation_id) id: vec3<u32>) {
          if (i32(id.x) >= ubo.width || i32(id.y) >= ubo.width) {
            return;
          }
          textureStore(irradianceTexture, id.xy, vec4f(0.0));

          let uv = vec2f(id.xy) / f32(ubo.width);
          let Index = uv * f32(ubo.cascadeWidth);
          let StartIndex = i32(Index.x) * ubo.probeRayCount + i32(Index.y) * ubo.probeRayCount * ubo.cascadeWidth;


          if (ubo.debugProbeDirections != 0) {
            let probePixelDiameter = f32(ubo.width) / f32(ubo.cascadeWidth);
            let probeUV = fract(vec2f(id.xy) / probePixelDiameter) * 2.0 - 1.0;

            var angle = atan2(probeUV.y, probeUV.x);
            if (angle < 0.0) {
              angle += TAU;
            }

            let AnglePerProbeRay = TAU / f32(ubo.probeRayCount);
            let rayIndex = i32(angle / AnglePerProbeRay);
            // color based on the angle
            // {
            //   var col = i32(rayIndex + 1) * vec3<i32>(158, 2 * 156, 3 * 159);
            //   col = col % vec3<i32>(255, 253, 127);
            //   textureStore(irradianceTexture, id.xy, vec4(vec3f(col) / 255.0, 1.0));
            // }

            {
              let d = distance(probeUV, vec2f(0.0));
              if (d < f32(ubo.probeRadius) / probePixelDiameter * 0.5) {
                return;
              }
              if (d > f32(ubo.probeRadius << 1) / probePixelDiameter) {
                return;
              }

              textureStore(irradianceTexture, id.xy, probes[StartIndex + rayIndex]);
            }
            return;
          }

          var acc = vec4f(0.0);
          for (var rayIndex = 0; rayIndex < ubo.probeRayCount; rayIndex++) {
            let probeRayIndex = StartIndex + rayIndex;
            acc += probes[probeRayIndex];
          }
          textureStore(irradianceTexture, id.xy, acc / f32(ubo.probeRayCount));
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

      return function BuildIrradianceTexture(
        queue,
        computePass,
        probeRayCount,
        width,
        height,
        probeRadius,
        debugProbeDirections,
        branchingFactor
      ) {
        let probeDiameter = probeRadius * 2.0
        let cascadeWidth = width / probeDiameter;
        let cascadeHeight = height / probeDiameter;
        uboData[0] = probeRayCount
        uboData[1] = cascadeWidth
        uboData[2] = width
        uboData[3] = probeRadius
        uboData[4] = debugProbeDirections
        uboData[5] = branchingFactor

        queue.writeBuffer(ubo, 0, uboData)
        // console.log('probeRayCount: %s cascadeWidth: %s', probeRayCount, cascadeWidth)
        computePass.setPipeline(pipeline)
        computePass.setBindGroup(0, bindGroup)
        computePass.dispatchWorkgroups(
          Math.floor(width / workgroupSize[0] + 1),
          Math.floor(height / workgroupSize[1] + 1),
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
        "segment.start.x",
        "segment.start.y",
        "segment.end.x",
        "segment.end.y",
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
          ax: i32,
          ay: i32,
          bx: i32,
          by: i32,
          radius: i32,
          radiance: u32,
          color: u32,
        };

        @group(0) @binding(0) var texture: texture_storage_2d<rg32uint, write>;
        @group(0) @binding(1) var<uniform> ubo: UBOParams;

        fn SDFSegment(p: vec2f, a: vec2f, b: vec2f) -> f32{
          let pa = p-a;
          let ba = b-a;
          let h = clamp( dot(pa,ba)/dot(ba,ba), 0.0, 1.0 );
          return length( pa - ba*h );
        }

        fn Squared(a: i32) -> i32 {
          return a * a;
        }
        @compute @workgroup_size(${workgroupSize.join(',')})
        fn ComputeMain(@builtin(global_invocation_id) id: vec3<u32>) {
          let d = SDFSegment(
            vec2f(f32(id.x), f32(id.y)),
            vec2f(f32(ubo.ax), f32(ubo.ay)),
            vec2f(f32(ubo.bx), f32(ubo.by)),
          ) -  f32(ubo.radius);

          if (d <= 0.0) {
          // var radiusSquared : i32 = ubo.radius * ubo.radius;
          // var distanceSquared : i32 = Squared(i32(id.x) - ubo.x) + Squared(i32(id.y) - ubo.y);
          // if (distanceSquared <= radiusSquared) {
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
        ax,
        ay,
        bx,
        by,
        radius,
        radiance,
        color,
        width,
        height
      ) {
        // update the uniform buffer
        uboData[0] = ax
        uboData[1] = ay
        uboData[2] = bx
        uboData[3] = by
        uboData[4] = radius
        uboData[5] = radiance
        uboData[6] = color
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
      lastPos: [0, 0],
      down: false
    },
    params: {
      shouldClear: false,
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
    let minProbeDiameter = Math.pow(
      2,
      parseFloat(document.querySelector('#probe-ray-dda-2d-controls input[name="i-slider"]').min)
    )
    let maxProbeCount = (canvas.width / minProbeDiameter) * (canvas.height / minProbeDiameter)
    state.maxLevel0Rays = 4 * canvas.width * canvas.height;
    const raySize = ([
      'r', 'g', 'b', 'a'
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
      MoveMouse(e.offsetX, e.offsetY);
      state.mouse.lastPos[0] = state.mouse.pos[0]
      state.mouse.lastPos[1] = state.mouse.pos[1]
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
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.COPY_SRC
      ),
      label: 'WorldTexture'
    })
  }

  // Create the world texture
  {
    state.worldAndBrushPreviewTexture = state.gpu.device.createTexture({
      size: [canvas.width, canvas.height, 1],
      dimension: '2d',
      // r=rgba, b=emission
      format: 'rg32uint',
      usage: (
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.COPY_DST
      ),
      label: 'WorldAndBrushPreviewTexture'
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
        state.worldAndBrushPreviewTexture,
        state.irradianceTexture
      ),
      probeAtlasRaycast: shaders.ProbeAtlasRaycast(
        state.gpu,
        state.probeBuffer,
        state.worldAndBrushPreviewTexture,
        [256, 1, 1],
        state.maxLevel0Rays
      ),
      buildIrradianceTexture: shaders.BuildIrradianceTexture(
        state.gpu.device,
        state.probeBuffer,
        state.irradianceTexture,
        [16, 16, 1],
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
      worldPaintBrushPreview: shaders.WorldPaint(
        state.gpu.device,
        state.worldAndBrushPreviewTexture,
        [WorldPaintWorkgroupSize, WorldPaintWorkgroupSize, 1]
      ),
    }
  }

  // Clear the world Texture
  const WorldTextureClear = () => {
    let commandEncoder = state.gpu.device.createCommandEncoder()
    let pass = commandEncoder.beginComputePass()
    state.gpu.programs.worldClear(pass, canvas.width, canvas.height)
    pass.end()
    state.gpu.device.queue.submit([commandEncoder.finish()])
    state.dirty = true;
  }

  WorldTextureClear();

  {
    let commandEncoder = state.gpu.device.createCommandEncoder()

    const DrawLine = (ax, ay, bx, by, color, radiance, radius) => {
      state.gpu.programs.worldPaint(
        commandEncoder,
        state.gpu.device.queue,
        ax,
        ay,
        bx,
        by,
        radius,
        radiance,
        color,
        canvas.width,
        canvas.height
      )
    }

    DrawLine(
      canvas.width * 0.5,
      canvas.height * 0.5,
      canvas.width * 0.5,
      canvas.height * 0.5,
      0xFFFFFFFF,
      1024 * 2,
      30
    );

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
    let color = r | (g << 8) | (b << 16) | 0xFF000000

    return Param(name, color)
  }

  document.querySelector('#probe-ray-dda-2d-controls button[name="clear-button"]').addEventListener('click', (e) => {
    WorldTextureClear();
  })

  const ReadParams = () => {
    const wasDirty = state.dirty;
    const controlEl = document.getElementById('probe-ray-dda-2d-controls')
    // probe params
    {
      state.dirty = state.dirty || Param(
        'i',
        parseFloat(controlEl.querySelector('input[name="i-slider"]').value)
      )

      state.dirty = state.dirty || Param(
        'branchingFactor',
        parseFloat(controlEl.querySelector('input[name="level-branching-factor"]').value)
      )

      state.dirty = state.dirty || Param(
        'intervalRadius',
        parseFloat(controlEl.querySelector('input[name="interval-radius-slider"]').value)
      )

      state.params.probeRadius = Math.pow(2, state.params.i) * 0.5
      state.params.probeRayCount = Math.max(4, Math.pow(2, state.params.i))

      state.dirty = state.dirty || Param(
        'probeLevel',
        parseFloat(controlEl.querySelector('input[name="probe-level"]').value)
      )
    }

    // brush params
    {

      state.dirty = state.dirty || Param(
        'brushRadiance',
        parseFloat(controlEl.querySelector('input[name="brush-radiance-slider"]').value)
      )

      state.dirty = state.dirty || Param(
        'brushRadius',
        parseFloat(controlEl.querySelector('input[name="brush-radius-slider"]').value)
      )

      state.dirty = state.dirty || ColorParam(
        'color',
        controlEl.querySelector('input[name="brush-color-selector"]').value
      )

      state.dirty = state.dirty || Param(
        'erase',
        !!controlEl.querySelector('input[name="brush-erase-mode"]').checked
      )
    }

    // debug params
    {
      state.dirty = state.dirty || Param(
        'debugProbeDirections',
        !!controlEl.querySelector('input[name="debug-probe-directions-mode"]').checked
      )

    }

    if (state.dirty && !wasDirty) {
      console.log(JSON.stringify(state.params, 2, '  '))
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
        state.mouse.lastPos[0],
        canvas.height - state.mouse.lastPos[1],
        state.mouse.pos[0],
        canvas.height - state.mouse.pos[1],
        state.params.brushRadius,
        // 0..1024 maps to 0..1, but it is stored in a u32
        state.params.brushRadiance * 1024.0,
        state.params.erase ? 0 : state.params.color,
        canvas.width,
        canvas.height
      )

      state.mouse.lastPos[0] = state.mouse.pos[0]
      state.mouse.lastPos[1] = state.mouse.pos[1]
    }

    // Paint the preview brush
    {
      commandEncoder.copyTextureToTexture(
        { texture:  state.worldTexture },
        { texture:  state.worldAndBrushPreviewTexture },
        [
          canvas.width,
          canvas.height,
          1
        ]
      );

      state.gpu.programs.worldPaintBrushPreview(
        commandEncoder,
        state.gpu.device.queue,
        state.mouse.pos[0],
        canvas.height - state.mouse.pos[1],
        state.mouse.pos[0],
        canvas.height - state.mouse.pos[1],
        state.params.brushRadius,
        state.params.erase ? 0 : state.params.brushRadiance * 1024.0,
        state.params.erase ? 0 : state.params.color,
        canvas.width,
        canvas.height
      );
    }

    // Fill the probe atlas via ray casting
    {
      const probeDiameter = Math.pow(2, state.params.i)
      const levelCount = Math.min(
        Math.round(Math.log(state.canvas.width / probeDiameter) / Math.log(Math.pow(2, state.params.branchingFactor))),
        state.params.probeLevel
      );

      let pass = commandEncoder.beginComputePass()
      for (let level = levelCount; level >= 0; level--) {
        let currentProbeDiameter = probeDiameter << level;
        let currentProbeRayCount = state.params.probeRayCount << (level * state.params.branchingFactor);
        let intervalRadius = state.params.intervalRadius << (level * state.params.branchingFactor)

        state.gpu.programs.probeAtlasRaycast(
          state.gpu.device.queue,
          pass,
          canvas.width,
          canvas.height,
          currentProbeDiameter * 0.5,
          currentProbeRayCount,
          intervalRadius,
          level,
          levelCount,
          state.maxLevel0Rays,
          state.params.branchingFactor
        );
      }
      pass.end()

    }

    // Populate the irradiance texture
    {
      let pass = commandEncoder.beginComputePass()
      state.gpu.programs.buildIrradianceTexture(
        state.gpu.device.queue,
        pass,
        state.params.probeRayCount,
        canvas.width,
        canvas.height,
        state.params.probeRadius,
        state.params.debugProbeDirections,
        state.params.branchingFactor
      );
      pass.end();
    }

    // Debug Render World Texture
    {
      let probeRadius = Math.pow(2, state.params.probeRadius)

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