// License: MIT https://tmpvar.mit-license.org/

import CreateParamReader from "./params.js"

const DemoImage = document.createElement('img');
DemoImage.src = window.location.pathname + "flatland-2d/flatland-2d-demo.png"

async function ProbeRayDDA2DBegin() {
  const rootEl = document.querySelector('#flatland-2d-content')
  const controlEl = rootEl.querySelector('.controls')

  const shaders = {
    DebugWorldBlit(gpu, worldTexture, fluenceTexture) {
      const device = gpu.device
      const presentationFormat = gpu.presentationFormat

      const uboFields = [
        "width",
        "height",
        "probeRadius",
        "debugRenderWorldMipLevel"
      ]

      const uboData = new Uint32Array(uboFields.length)
      const ubo = device.createBuffer({
        size: uboData.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        label: "DebugWorldBlit/ubo",
      })

      const sampler = gpu.device.createSampler({
        label: "DebugWorldBlit - Sampler",
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
        magFilter: 'linear',
        minFilter: 'linear',
        mipmapFilter: 'nearest',
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

          // Debug
          debugRenderWorldMipLevel: i32,
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

        @group(0) @binding(0) var worldTexture: texture_2d<f32>;
        @group(0) @binding(1) var fluenceTexture: texture_2d<f32>;
        @group(0) @binding(2) var fluenceSampler: sampler;
        @group(0) @binding(3) var<uniform> ubo: UBOParams;

        @fragment
        fn FragmentMain(fragData: VertexOut) -> @location(0) vec4f {
          var scale = 1.0;
          var pixelPos = vec2f(
            fragData.uv.x * f32(ubo.width) / scale,
            fragData.uv.y * f32(ubo.height) / scale
          );


          if (ubo.debugRenderWorldMipLevel > -1) {
            var samplePos = vec2<i32>(
              i32(pixelPos.x) >> u32(ubo.debugRenderWorldMipLevel),
              i32(pixelPos.y) >> u32(ubo.debugRenderWorldMipLevel)
            );

            return vec4f(
              textureLoad(worldTexture, samplePos, ubo.debugRenderWorldMipLevel).rgb,
              1.0
            );
          }

          let sample = textureSample(fluenceTexture, fluenceSampler, fragData.uv / scale);
          return vec4f(
            sample.rgb,
            1.0
          );
        }
      `;

      const shaderModule = device.createShaderModule({
        label: "DebugWorldBlit - shader",
        code: source
      })

      const bindGroupLayout = device.createBindGroupLayout({
        label: "DebugWorldBlit-BindGroupLayout",
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
            texture: {
              sampleType: 'float',
            },
          },
          {
            binding: 2,
            visibility: GPUShaderStage.FRAGMENT,
            sampler: {
              type: "filtering"
            },
          },
          {
            binding: 3,
            visibility: GPUShaderStage.FRAGMENT,
            buffer: {
              type: 'uniform',
            }
          },
        ]
      })

      const pipeline = device.createRenderPipeline({
        label: "DebugWorldBlit-Pipeline",
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
        label: "DebugWorldBlit-BindGroup",
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          {
            binding: 0,
            resource: worldTexture.createView()
          },
          {
            binding: 1,
            resource: fluenceTexture.createView()
          },
          {
            binding: 2,
            resource: sampler,
          },
          {
            binding: 3,
            resource: {
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
        debugWorldMipmapLevelRender
      ) {

        // update uniform buffer
        uboData[0] = width
        uboData[1] = height
        // Probes
        uboData[2] = probeRadius
        // Debug
        uboData[3] = debugWorldMipmapLevelRender
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

    ProbeAtlasRaymarch(gpu, probeBuffer, worldTexture, workgroupSize, maxLevelRayCount) {
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
        "intervalStartRadius",
        "intervalEndRadius",
        "branchingFactor",
        "debugRaymarchMipmaps",
        "intervalAccumulationDecay",
        "debugRaymarchWithDDA",
        "debugRaymarchFixedSizeStepMultiplier"
      ]

      // TODO: if we go over 256 bytes then this needs to be updated
      const alignedSize = gpu.adapter.limits.minUniformBufferOffsetAlignment;
      const alignedIndices = alignedSize / 4
      const maxCascadeLevels = 10;
      let uboData = new Int32Array(alignedIndices * maxCascadeLevels)

      const ubo = gpu.device.createBuffer({
        size: uboData.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        label: "ProbeAtlasRaymarch/ubo",
      })

      const sampler = gpu.device.createSampler({
        label: "ProbeAtlasRaymarch - Sampler",
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
        magFilter: 'linear',
        minFilter: 'linear',
        mipmapFilter: 'nearest',
      })

      const maxWorkgroupsPerDimension = gpu.adapter.limits.maxComputeWorkgroupsPerDimension

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
          intervalStartRadius: i32,
          intervalEndRadius: i32,
          // WGSL wants this to be unsigned because it is used as a shift
          branchingFactor: u32,
          debugRaymarchMipmaps: u32,
          intervalAccumulationDecay: u32,
          debugRaymarchWithDDA: u32,
          debugRaymarchFixedSizeStepMultiplier: u32
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
        @group(0) @binding(2) var worldTexture: texture_2d<f32>;
        @group(0) @binding(3) var worldSampler: sampler;

        fn AccumulateSample(acc: vec4f, sample: vec4f, decay: f32) -> vec4f {
          if (false) {
            // TODO: I haven't had any success with this
            var opacity = exp(-sample.a * decay);
            let ab = opacity * (1.0 - acc.a);
            let a0 = acc.a + ab;

            let pa = vec4(acc.rgb * acc.a, acc.a);
            let pb = vec4(sample.rgb * opacity, opacity);

            return vec4(
              (pa.rgb * pa.a + pb.rgb * pb.a * (1.0 - pa.a)) / a0,
              // acc.rgb * acc.a + sample.rgb * opacity * (1.0 - acc.a),
              a0
            );
          } else {
            let transparency = 1.0 - sample.a;
            return vec4f(
              acc.rgb + acc.a * sample.rgb,
              acc.a * transparency
            );
          }
        }

        fn RayMarchDDA(probeCenter: vec2f, rayOrigin: vec2f, rayDirection: vec2f, maxDistance: f32) -> vec4f {
          var levelDivisor = 1.0;
          var levelMip = 0.0;
          if (ubo.debugRaymarchMipmaps > 0) {
            levelDivisor = 1.0 / f32(1<<u32(ubo.level));
            levelMip = f32(ubo.level);
          }

          let levelRayOrigin = rayOrigin * levelDivisor;
          let levelProbeCenter = probeCenter * levelDivisor;
          let levelMaxDistance = maxDistance * levelDivisor;
          var cursor = DDACursorInit(levelRayOrigin, rayDirection);
          var acc = vec4f(0.0, 0.0, 0.0, 1.0);
          let dims = vec2f(f32(ubo.width), f32(ubo.height)) * levelDivisor;

          let decay = f32(ubo.intervalAccumulationDecay) / 100.0;
          while(true) {
            if (distance(cursor.mapPos, levelProbeCenter) > levelMaxDistance) {
              break;
            }

            if (
              cursor.mapPos.x < 0 ||
              cursor.mapPos.y < 0 ||
              cursor.mapPos.x >= dims.x ||
              cursor.mapPos.y >= dims.y
            ) {
              break;
            }

            var sample = textureSampleLevel(
              worldTexture,
              worldSampler,
              cursor.mapPos / dims,
              levelMip
            );

            acc = AccumulateSample(acc, sample, decay);

            // Step the ray
            {
              var mask: vec2f = step(cursor.sideDist, cursor.sideDist.yx);
              cursor.sideDist += mask * cursor.deltaDist;
              cursor.mapPos += mask * cursor.rayStep;
            }
          }

          return acc;
        }

        fn RayMarchFixedSize(probeCenter: vec2f, rayOrigin: vec2f, rayDirection: vec2f, maxDistance: f32) -> vec4f {
          var levelDivisor = 1.0;
          var levelMip = 0.0;
          if (ubo.debugRaymarchMipmaps > 0) {
            levelDivisor = 1.0 / f32(1<<u32(ubo.level));
            levelMip = f32(ubo.level);
          }

          let levelRayOrigin = rayOrigin * levelDivisor;
          let levelProbeCenter = probeCenter * levelDivisor;
          let levelMaxDistance = maxDistance * levelDivisor;
          var acc = vec4f(0.0, 0.0, 0.0, 1.0);
          let dims = vec2f(f32(ubo.width), f32(ubo.height));

          let decay = f32(ubo.intervalAccumulationDecay) / 100.0;
          var t = 0.0;
          let stepSizeMultiplier = max(0.1, f32(ubo.debugRaymarchFixedSizeStepMultiplier) / 100.0);
          let stepSize = pow(2.0, levelMip) * stepSizeMultiplier;
          while(true) {
            let pos = rayOrigin + rayDirection * t;

            if (distance(pos, probeCenter) > maxDistance) {
              break;
            }

            if (
              pos.x < 0 ||
              pos.y < 0 ||
              pos.x >= dims.x ||
              pos.y >= dims.y
            ) {
              break;
            }

            var sample = textureSampleLevel(
              worldTexture,
              worldSampler,
              pos / dims,
              levelMip
            );

            acc = AccumulateSample(acc, sample, decay);

            t += stepSize;
          }

          return acc;
        }

        fn SampleUpperProbe(rawPos: vec2<i32>, raysPerProbe: i32, bufferStartIndex: i32, cascadeWidth: i32) -> vec4f {
          // TODO: rawPos can be out of the scene bounds, intentionally.
          //       this is a bit of a hack, that reuses an in-bounds probe multiple times
          //       instead of going out of bounds to a probe that doesn't exist or simply
          //       returning transparent black.
          //
          //       The real fix is to add another ring of probes for every level that live
          //       just out of bounds to add coverage for lower corner/edge probes

          let pos = clamp(rawPos, vec2<i32>(0), vec2<i32>(cascadeWidth - 1));

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
            return vec4f(0.0, 0.0, 0.0, 1.0);
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

          let factor = fract(index);
          let invFactor = 1.0 - factor;

          let r1 = samples[0] * invFactor.x + samples[1] * factor.x;
          let r2 = samples[2] * invFactor.x + samples[3] * factor.x;
          return r1 * invFactor.y + r2 * factor.y;
        }

        @compute @workgroup_size(${workgroupSize.join(',')})
        fn ComputeMain(@builtin(global_invocation_id) GlobalInvocationID: vec3<u32>) {
          let RayIndex = i32(GlobalInvocationID.x + GlobalInvocationID.y * ${workgroupSize[0]});
          if (RayIndex > i32(ubo.totalRays)) {
            return;
          }

          let ProbeIndex = RayIndex / ubo.probeRayCount;
          let ProbeRayIndex = RayIndex % ubo.probeRayCount;

          let ProbeRadius = f32(ubo.probeRadius);
          let LowerProbeRadius = f32(ubo.probeRadius >> 1);

          let IntervalRadius = f32(ubo.intervalEndRadius);
          let LowerIntervalRadius = f32(ubo.intervalStartRadius);

          let ProbeDiameter = ProbeRadius * 2.0;
          let CascadeWidth = ubo.width / i32(ProbeDiameter);

          let col = ProbeIndex % CascadeWidth;
          let row = ProbeIndex / CascadeWidth;

          let RayAngle = TAU * (f32(ProbeRayIndex) + 0.5) /  f32(ubo.probeRayCount);
          let RayDirection = vec2<f32>(
            cos(RayAngle),
            sin(RayAngle)
          );

          let RayOrigin = vec2<f32>(
            f32(col) * ProbeDiameter + ProbeRadius,
            f32(row) * ProbeDiameter + ProbeRadius,
          );

          let OutputIndex = (ubo.maxLevel0Rays * (ubo.level % 2)) + RayIndex;
          var LowerResult: vec4f;

          if (ubo.debugRaymarchWithDDA > 0) {
            LowerResult = RayMarchDDA(
              RayOrigin,
              RayOrigin + RayDirection * LowerIntervalRadius,
              RayDirection,
              IntervalRadius
            );
          } else {
            LowerResult = RayMarchFixedSize(
              RayOrigin,
              RayOrigin + RayDirection * LowerIntervalRadius,
              RayDirection,
              IntervalRadius
            );
          }

          var UpperResult = SampleUpperProbes(RayOrigin, ProbeRayIndex);

          probes[OutputIndex] = vec4f(
            LowerResult.rgb + LowerResult.a * UpperResult.rgb,
            LowerResult.a * UpperResult.a
          );

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
        label: 'ProbeAtlasRaymarch - ShaderModule',
        code: source
      })

      const bindGroupLayout = device.createBindGroupLayout({
        label: 'ProbeAtlasRaymarch - BindGroupLayout',
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
              sampleType: 'float'
            },
          },
          {
            binding: 3,
            visibility: GPUShaderStage.COMPUTE,
            sampler: {
              type: "filtering"
            },
          }
        ]
      })

      const pipeline = device.createComputePipeline({
        label: 'ProbeAtlasRaymarch - ComputePipeline',
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
        label: 'ProbeAtlasRaymarch - BindGroup',
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
            resource: worldTexture.createView({
              label: 'ProbeAtlasRaymarch - BindGroup - WorldTexture view'
            })
          },
          {
            binding: 3,
            resource: sampler,
          },
        ]
      })

      return function ProbeAtlasRaymarch(
        queue,
        computePass,
        width,
        height,
        probeRadius,
        probeRayCount,
        intervalStartRadius,
        intervalEndRadius,
        level,
        levelCount,
        maxLevel0Rays,
        branchingFactor,
        debugRaymarchMipmaps,
        intervalAccumulationDecay,
        debugRaymarchWithDDA,
        debugRaymarchFixedSizeStepMultiplier
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
        uboData[levelIndexOffset + 8] = intervalStartRadius
        uboData[levelIndexOffset + 9] = intervalEndRadius
        uboData[levelIndexOffset + 10] = branchingFactor
        uboData[levelIndexOffset + 11] = debugRaymarchMipmaps
        uboData[levelIndexOffset + 12] = intervalAccumulationDecay
        uboData[levelIndexOffset + 13] = debugRaymarchWithDDA
        uboData[levelIndexOffset + 14] = debugRaymarchFixedSizeStepMultiplier

        const byteOffset = level * alignedSize
        queue.writeBuffer(ubo, byteOffset, uboData, levelIndexOffset, alignedIndices)

        computePass.setPipeline(pipeline)
        computePass.setBindGroup(0, bindGroup, [byteOffset])
        let totalWorkGroups = Math.floor(totalRays / workgroupSize[0] + 1)
        let x = totalWorkGroups
        let y = 1

        if (x > maxWorkgroupsPerDimension) {
          x = maxWorkgroupsPerDimension
          y = Math.floor(totalWorkGroups / maxWorkgroupsPerDimension + 1)
        }

        computePass.dispatchWorkgroups(x, y, 1)
      }
    },

    BuildFluenceTexture(device, probeBuffer, fluenceTexture, workgroupSize) {
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

        @group(0) @binding(0) var fluenceTexture: texture_storage_2d<rgba8unorm, write>;
        @group(0) @binding(1) var<storage,read_write> probes: array<vec4f>;
        @group(0) @binding(2) var<uniform> ubo: UBOParams;
        @compute @workgroup_size(${workgroupSize.join(',')})
        fn ComputeMain(@builtin(global_invocation_id) id: vec3<u32>) {
          if (i32(id.x) >= ubo.width || i32(id.y) >= ubo.width) {
            return;
          }
          textureStore(fluenceTexture, id.xy, vec4f(0.0));

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

            let rayIndex = i32(angle / TAU * f32(ubo.probeRayCount) - 0.5);
            // color based on the angle
            // {
            //   var col = i32(rayIndex + 1) * vec3<i32>(158, 2 * 156, 3 * 159);
            //   col = col % vec3<i32>(255, 253, 127);
            //   textureStore(fluenceTexture, id.xy, vec4(vec3f(col) / 255.0, 1.0));
            // }

            {
              let d = distance(probeUV, vec2f(0.0));
              if (d < f32(ubo.probeRadius) / probePixelDiameter * 0.5) {
                return;
              }
              if (d > f32(ubo.probeRadius << 1) / probePixelDiameter) {
                return;
              }

              textureStore(fluenceTexture, id.xy, probes[StartIndex + rayIndex]);
            }
            return;
          }

          var acc = vec4f(0.0);
          for (var rayIndex = 0; rayIndex < ubo.probeRayCount; rayIndex++) {
            let probeRayIndex = StartIndex + rayIndex;
            acc += probes[probeRayIndex];
          }
          textureStore(fluenceTexture, id.xy, acc / f32(ubo.probeRayCount));
        }
      `

      const shaderModule = device.createShaderModule({
        code: source
      })

      const bindGroupLayout = device.createBindGroupLayout({
        label: 'BuildFluenceTeture - BindGroupLayout',
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
        label: 'BuildFluenceTeture - Pipeline',
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
        label: 'BuildFluenceTeture - BindGroup',
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          {
            binding: 0, resource: fluenceTexture.createView()
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

      return function BuildFluenceTexture(
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
        @group(0) @binding(0) var texture: texture_storage_2d<rgba16float, write>;
        @compute @workgroup_size(${workgroupSize.join(',')})
        fn ComputeMain(@builtin(global_invocation_id) id: vec3<u32>) {
          textureStore(texture, id.xy, vec4f(${color.join(',')}));
        }
      `

      const shaderModule = device.createShaderModule({
        code: source
      })

      const bindGroupLayout = device.createBindGroupLayout({
        label: 'WorldClear - BindGroupLayout',
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.COMPUTE,
            storageTexture: {
              format: "rgba16float"
            },
          }
        ]
      })

      const pipeline = device.createComputePipeline({
        label: 'WorldClear - ComputePipeline',
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
        label: 'WorldClear - BindGroup',
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

        @group(0) @binding(0) var texture: texture_storage_2d<rgba16float, write>;
        @group(0) @binding(1) var<uniform> ubo: UBOParams;

        fn SDFSegment(p: vec2f, a: vec2f, b: vec2f) -> f32{
          let pa = p-a;
          let ba = b-a;
          let h = clamp( dot(pa,ba)/dot(ba,ba), 0.0, 1.0 );
          return length( pa - ba*h );
        }

        @compute @workgroup_size(${workgroupSize.join(',')})
        fn ComputeMain(@builtin(global_invocation_id) id: vec3<u32>) {
          let d = SDFSegment(
            vec2f(f32(id.x), f32(id.y)),
            vec2f(f32(ubo.ax), f32(ubo.ay)),
            vec2f(f32(ubo.bx), f32(ubo.by)),
          ) -  f32(ubo.radius);

          if (d <= 0.0) {
            let color = unpack4x8unorm(ubo.color);
            let radianceMultiplier = f32(ubo.radiance) / 1024.0;
            textureStore(
              texture,
              id.xy,
              vec4(color.rgb * radianceMultiplier, color.a)
            );
          }
        }
      `

      const shaderModule = device.createShaderModule({
        label: 'WorldPaint - ShaderModule',
        code: source
      })

      const bindGroupLayout = device.createBindGroupLayout({
        label: 'WorldPaint - BindGroupLayout',
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.COMPUTE,
            storageTexture: {
              format: "rgba16float"
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
        label: 'WorldPaint - ComputePipeline',
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
        label: 'WorldPaint - BindGroup',
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          {
            binding: 0,
            // This needs to handle WorldTexture and worldAndBrushPreviewTexture
            resource: texture.createView({
              baseMipLevel: 0,
              mipLevelCount: 1,
            })
          },
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

    GenerateMipmapsBoxFilter(device, texture, workgroupSize) {
      const source =  /* wgsl */`
        @group(0) @binding(0) var src: texture_2d<f32>;
        @group(0) @binding(1) var dst: texture_storage_2d<rgba16float, write>;
        @compute @workgroup_size(${workgroupSize.join(',')})
        fn ComputeMain(@builtin(global_invocation_id) id: vec3<u32>) {
          let TextureSize = vec2<i32>(textureDimensions(src));
          let lo = vec2<i32>(id.xy) * 2;
          if (lo.x + 1 >= TextureSize.x || lo.y + 1 >= TextureSize.y) {
            return;
          }

          var color = textureLoad(src, lo + vec2<i32>(0, 0), 0)
                    + textureLoad(src, lo + vec2<i32>(1, 0), 0)
                    + textureLoad(src, lo + vec2<i32>(0, 1), 0)
                    + textureLoad(src, lo + vec2<i32>(1, 1), 0);

          textureStore(dst, id.xy, color * 0.25);
        }
      `

      const shaderModule = device.createShaderModule({
        label: 'GenerateMipmapsBoxFilter - ShaderModule',
        code: source
      })

      const bindGroupLayout = device.createBindGroupLayout({
        label: 'GenerateMipmapsBoxFilter - BindGroupLayout',
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.COMPUTE,

            texture: {
              format: "rgba16float",
              sampleType: 'float',
            },
          },
          {
            binding: 1,
            visibility: GPUShaderStage.COMPUTE,
            storageTexture: {
              format: "rgba16float",
            },
          }
        ]
      })

      const pipeline = device.createComputePipeline({
        label: 'GenerateMipmapsBoxFilter - ComputePipeline',
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

      let levelTextureViews = []
      for (var level = 0; level < texture.mipLevelCount; level++) {
        let view = texture.createView({
          label: `GenerateMipmapsBoxFilter/${texture.label}/view @ mip(${level})`,
          baseMipLevel: level,
          mipLevelCount: 1
        })
        levelTextureViews.push(view)
      }

      let levelBindGroups = [null]
      for (var level = 1; level < texture.mipLevelCount; level++) {
        const bindGroup = device.createBindGroup({
          label: `GenerateMipmapsBoxFilter - BindGroup @ mip(${level})`,
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: levelTextureViews[level - 1] },
            { binding: 1, resource: levelTextureViews[level] }
          ]
        })

        levelBindGroups.push(bindGroup);
      }

      return function GenerateMipmapsBoxFilter(commandEncoder, width, height) {
        for (var level = 1; level < texture.mipLevelCount; level++) {
          GPUTimedBlock(
            commandEncoder,
            `GenerateMipmapsBoxFilter level(${level})`, () => {
              let computePass = commandEncoder.beginComputePass();
              computePass.setPipeline(pipeline)
              computePass.setBindGroup(0, levelBindGroups[level])
              computePass.dispatchWorkgroups(
                Math.floor((width >> level) / workgroupSize[0] + 1),
                Math.floor((height >> level) / workgroupSize[1] + 1),
                1
              )
              computePass.end()
            }
          )
        }
      }
    },
  }

  const InitGPU = async (ctx, probeBufferByteSize) => {
    let adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance'
    })

    let requiredFeatures = []

    let hasTimestampQueryFeature = adapter.features.has('timestamp-query')
    if (hasTimestampQueryFeature) {
      requiredFeatures.push('timestamp-query');
    }

    window.adapter = adapter
    let device = await adapter.requestDevice({
      requiredFeatures,
      requiredLimits: {
        maxStorageBufferBindingSize: probeBufferByteSize,
        maxBufferSize: probeBufferByteSize,
      }
    })


    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

    ctx.configure({
      device,
      format: presentationFormat,
      alphaMode: 'opaque',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });

    let gpu = {
      adapter,
      device,
      presentationFormat,
    }

    gpu.timestampQueries = []
    gpu.timestampQueryCount = 0;

    if (hasTimestampQueryFeature) {
      gpu.timestampQuerySetCapacity = 1 << 6;
      gpu.timestampQuerySet = device.createQuerySet({
        type: "timestamp",
        count: gpu.timestampQuerySetCapacity,
      });

      gpu.hasTimestampQueryFeature = true
      gpu.timestampQueryBufferSizeInBytes = gpu.timestampQuerySetCapacity * 8

      gpu.timestampMappableBuffer = gpu.device.createBuffer({
        label: 'TimstampMappableBuffer',
        size: gpu.timestampQueryBufferSizeInBytes,
        usage: (
          GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        )
      })

      gpu.timestampResultBuffer = gpu.device.createBuffer({
        label: 'TimestampResultBuffer',
        size: gpu.timestampQueryBufferSizeInBytes,
        usage: (
          GPUBufferUsage.QUERY_RESOLVE |
          GPUBufferUsage.COPY_SRC |
          GPUBufferUsage.COPY_DST |
          GPUBufferUsage.STORAGE
        )
      })
    } else {
      gpu.hasTimestampQueryFeature = false
    }

    return gpu
  }

  let canvas = document.getElementById('flatland-2d-canvas');
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
      debugPerformance: false
    },
    dirty: true,
  }

  const Param = CreateParamReader(state, controlEl)

  function GPUResetTimers() {
    if (!state.gpu.hasTimestampQueryFeature) {
      return;
    }

    state.gpu.timestampQueryCount = 0;
    state.gpu.timestampQueries.length = 0;
  }

  function GPUTimedBlock(encoder, label, fn) {
    if (state.gpu.hasTimestampQueryFeature && state.params.debugPerformance) {
      const startIndex = state.gpu.timestampQueryCount++
      encoder.writeTimestamp(state.gpu.timestampQuerySet, startIndex)
      fn && fn()
      const endIndex = state.gpu.timestampQueryCount++
      encoder.writeTimestamp(state.gpu.timestampQuerySet, endIndex)
      state.gpu.timestampQueries.push({ label, startIndex, endIndex })
    } else {
      fn && fn()
    }
  }

  // Create the probe atlas
  {
    let minProbeDiameter = Math.pow(
      2,
      parseFloat(controlEl.querySelector('.probeRadius-control input').min)
    )
    let maxProbeRays = Math.pow(
      2,
      parseFloat(controlEl.querySelector('.probeRayCount-control input').max)
    )
    let maxProbeCount = (canvas.width / minProbeDiameter) * (canvas.height / minProbeDiameter)
    state.maxLevel0Rays = maxProbeRays * maxProbeCount;
    const raySize = ([
      'r', 'g', 'b', 'a'
    ]).length * 4;

    const probeBufferByteSize = state.maxLevel0Rays * raySize * 2

    try {
      state.gpu = await InitGPU(state.ctx, probeBufferByteSize)
    } catch (e) {
      console.log(e)
      rootEl.className = rootEl.className.replace('has-webgpu', '')
      return;
    }

    state.probeBuffer = state.gpu.device.createBuffer({
      label: 'ProbeBuffer',
      // Note: we need to ping-pong so the buffer needs to be doubled in size
      size: probeBufferByteSize,
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

  // Note: I'm using rgba16float because rgb values need to be scaled by a radiance
  //       multiplier and those scaled values get averaged when mipmapping.
  // Create the world texture
  {
    state.worldTexture = state.gpu.device.createTexture({
      label: 'WorldTexture',

      size: [canvas.width, canvas.height, 1],
      dimension: '2d',
      format: 'rgba16float',
      usage: (
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.COPY_SRC
      ),
      label: 'WorldTexture'
    })
  }

  // Create the world texture w/ included brush preview
  {
    state.worldAndBrushPreviewTexture = state.gpu.device.createTexture({
      label: 'WorldAndBrushPreviewTexture',
      size: [canvas.width, canvas.height, 1],
      dimension: '2d',
      format: 'rgba16float',
      usage: (
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.COPY_DST
      ),
      label: 'WorldAndBrushPreviewTexture',
      mipLevelCount: Math.log2(canvas.width)
    })
  }

  // Create the fluence texture
  {
    state.fluenceTexture = state.gpu.device.createTexture({
      label: 'FluenceTexture',
      size: [canvas.width, canvas.height, 1],
      dimension: '2d',
      format: 'rgba8unorm',
      usage: (
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING
      ),
      label: 'FluenceTexture'
    })
  }

  // Create the gpu programs
  {
    const WorldClearWorkgroupSize = 16
    const WorldPaintWorkgroupSize = 16

    state.gpu.programs = {
      debugWorldBlit: shaders.DebugWorldBlit(
        state.gpu,
        state.worldAndBrushPreviewTexture,
        state.fluenceTexture
      ),
      probeAtlasRaymarch: shaders.ProbeAtlasRaymarch(
        state.gpu,
        state.probeBuffer,
        state.worldAndBrushPreviewTexture,
        [256, 1, 1],
        state.maxLevel0Rays
      ),
      buildFluenceTexture: shaders.BuildFluenceTexture(
        state.gpu.device,
        state.probeBuffer,
        state.fluenceTexture,
        [16, 16, 1],
      ),
      worldClear: shaders.WorldClear(
        state.gpu.device,
        state.worldTexture,
        [0.0, 0.0, 0.0, 0.0],
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

      generateWorldMips: shaders.GenerateMipmapsBoxFilter(
        state.gpu.device,
        state.worldAndBrushPreviewTexture,
        [16, 16, 1],
        1
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

  // WorldTextureClear();

  // Fill with a demo image
  if (true) {
    await DemoImage.decode();
    const DemoImageBitmap = await createImageBitmap(DemoImage);

    state.gpu.device.queue.copyExternalImageToTexture(
      {
        source: DemoImageBitmap,
        flipY: true,
      },
      {
        texture: state.worldTexture,
        // TODO: without this, the anti-aliased edges of the webgpu logo will glow
        premultipliedAlpha: true,
      },
      [DemoImage.width, DemoImage.height]
    );
  }

  // Draw a bright light in the bottom left corner
  if (false) {
    let commandEncoder = state.gpu.device.createCommandEncoder()

    state.gpu.programs.worldPaint(
      commandEncoder,
      state.gpu.device.queue,
      30,
      30,
      30,
      30,
      30,
      1024 * 10,
      0xFFFFFFFF,
      canvas.width,
      canvas.height
    )
    state.gpu.device.queue.submit([commandEncoder.finish()])
  }

  controlEl.querySelector('button[name="clear-button"]').addEventListener('click', (e) => {
    WorldTextureClear();
  })

  // disable some controls based on detected webgpu features
  {
    // debug performance control
    if (!state.gpu.hasTimestampQueryFeature) {


      console.warn(`
No "timestamp-query" support, you should use Chrome Canary and launch with the following flag:
  --enable-dawn-features=allow_unsafe_apis

Example on Windows:
  "%LOCALAPPDATA%\\Google\\Chrome SxS\\Application\\chrome.exe" --enable-dawn-features=allow_unsafe_apis
      `)


      controlEl.querySelector('.debugPerformance-control').className += " error-border"

      let el = controlEl.querySelector('.debugPerformance-control input')
      el.disabled = true
      el.checked = false
      controlEl.querySelectorAll('.timestamp-query-unavailable').forEach(el => {
        el.style.display = 'block'
      })
    }
  }

  const ReadParams = () => {
    const wasDirty = state.dirty;
    // probe params
    {
      Param('probeRadius', 'i32', (parentEl, value) => {
        let newValue = Math.pow(2, value) * 0.5;
        parentEl.querySelector('output').innerHTML = `2<sup>${value}</sup> = ${newValue}`
        return newValue
      })

      Param('probeRayCount', 'i32', (parentEl, value) => {
        let newValue = Math.pow(2, value)
        parentEl.querySelector('output').innerHTML = `2<sup>${value}</sup> = <span class="highlight-orange">${newValue}</span>`
        return newValue
      })

      Param('branchingFactor', 'i32', (parentEl, value) => {
        let probeRayCount = state.params.probeRayCount;
        let displayValue = Math.pow(2, value)
        let examples = ([0, 1, 2, 3]).map(level => {
          let shifted = state.params.probeRayCount << (value * level)
          let powed = probeRayCount * Math.pow(2, value * level)
          return powed
        })

        parentEl.querySelector('output').innerHTML = `
          2<sup class="highlight-blue">${value}</sup> = ${displayValue} (<span class="highlight-orange">${probeRayCount}</span> * 2<sup>(<span  class="highlight-blue">${value}</span> * level)</sup> = ${examples.join(', ')}, ...)
        `
        return value
      })

      Param('intervalRadius', 'f32', (parentEl, value) => {
        value = Math.pow(value, 2.0)
        parentEl.querySelector('output').innerHTML = `${value.toFixed(2)}`
        return value
      })

      Param('intervalAccumulationDecay', 'i32', (parentEl, value) => {
        let displayValue = value / 100.0;
        parentEl.querySelector('output').innerHTML = `${displayValue.toFixed(2)}`
        return value
      })

      Param('maxProbeLevel', 'i32', (parentEl, value) => {
        parentEl.querySelector('output').innerHTML = `${value}`
        return value
      })
    }

    // brush params
    {
      Param('brushRadiance', 'f32', (parentEl, value) => {
        parentEl.querySelector('output').innerHTML = `${value}`
        // 0..1024 maps to 0..1, but it is stored in a u32
        return value * 1024.0
      })

      Param('brushRadius', 'f32', (parentEl, value) => {
        parentEl.querySelector('output').innerHTML = `${value}`
        return value
      })

      Param('brushOpacity', 'i32', (parentEl, value) => {
        parentEl.querySelector('output').innerHTML = `${(value / 255).toFixed(2)}`
        return value
      })

      Param('brushColor', 'color', (parentEl, value) => {
        return (value & 0x00FFFFFF) | ((state.params.brushOpacity & 0xFF) << 24)
      })

      Param('brushEraseMode', 'bool')
    }

    // debug params
    {
      Param('debugWorldMipmapLevelRender', 'i32')
      Param('debugProbeDirections', 'bool')
      Param('debugRaymarchMipmaps', 'bool')
      Param('debugRaymarchWithDDA', 'bool', (parentEl, value) => {
        let stepSizeMultiplierEl = controlEl.querySelector(
          '.debugRaymarchFixedSizeStepMultiplier-control input'
        )

        if (value) {
          stepSizeMultiplierEl.disabled = true
        } else {
          stepSizeMultiplierEl.disabled = false
        }
        return value
      }
      )

      Param('debugRaymarchFixedSizeStepMultiplier', 'i32', (parentEl, value) => {
        parentEl.querySelector('output').innerHTML = `${(value / 100).toFixed(2)}`
        return value
      })

      Param('debugDisbleBrushPreview', 'bool')
      Param('debugPerformance', 'bool', (parentEl, value) => {
        let outputEl = parentEl.querySelector('.performance-output')
        if (value) {
          outputEl.style.display = 'block'
        } else {
          outputEl.style.display = 'none'
        }
        return value
      })
    }

    if (state.dirty && !wasDirty) {
      // console.log(JSON.stringify(state.params, 2, '  '))
    }
  }

  const RenderFrame = async () => {
    // reset the timestamp query array
    GPUResetTimers()

    ReadParams()

    if (!state.gpu.hasTimestampQueryFeature || !state.params.debugPerformance) {
      if (!state.dirty) {
        window.requestAnimationFrame(RenderFrame)
        return;
      }
    }
    state.dirty = false

    let commandEncoder = state.gpu.device.createCommandEncoder()

    // Paint Into World
    if (state.mouse.down) {
      GPUTimedBlock(
        commandEncoder,
        `world paint`, () => {
          state.gpu.programs.worldPaint(
            commandEncoder,
            state.gpu.device.queue,
            state.mouse.lastPos[0],
            canvas.height - state.mouse.lastPos[1],
            state.mouse.pos[0],
            canvas.height - state.mouse.pos[1],
            state.params.brushRadius,
            state.params.brushEraseMode ? 0 : state.params.brushRadiance,
            state.params.brushEraseMode ? 0 : state.params.brushColor,
            canvas.width,
            canvas.height
          )
        }
      )
      state.mouse.lastPos[0] = state.mouse.pos[0]
      state.mouse.lastPos[1] = state.mouse.pos[1]
    }

    // Paint the preview brush
    {
      GPUTimedBlock(
        commandEncoder,
        `preview brush`, () => {
          commandEncoder.copyTextureToTexture(
            { texture: state.worldTexture },
            { texture: state.worldAndBrushPreviewTexture },
            [
              canvas.width,
              canvas.height,
              1
            ]
          );

          if (!state.params.debugDisbleBrushPreview) {
            state.gpu.programs.worldPaintBrushPreview(
              commandEncoder,
              state.gpu.device.queue,
              state.mouse.pos[0],
              canvas.height - state.mouse.pos[1],
              state.mouse.pos[0],
              canvas.height - state.mouse.pos[1],
              state.params.brushRadius,
              state.params.brushEraseMode ? 0 : state.params.brushRadiance,
              state.params.brushEraseMode ? 0 : state.params.brushColor,
              canvas.width,
              canvas.height
            );
          }
        }
      )
    }

    // Generate mipmaps
    {
      state.gpu.programs.generateWorldMips(
        commandEncoder,
        canvas.width,
        canvas.height
      )
    }

    // Fill the probe atlas via ray casting
    {
      const probeDiameter = state.params.probeRadius * 2.0
      const levelCount = Math.min(
        Math.round(Math.log(state.canvas.width / probeDiameter) / Math.log(Math.pow(2, state.params.branchingFactor))),
        state.params.maxProbeLevel
      );

      for (let level = levelCount; level >= 0; level--) {
        let currentProbeDiameter = probeDiameter << level;
        let currentProbeRayCount = state.params.probeRayCount << (level * state.params.branchingFactor);

        let intervalStartRadius = level == 0
          ? 0
          : state.params.intervalRadius << ((level - 1) * state.params.branchingFactor)
        let intervalEndRadius = state.params.intervalRadius << (level * state.params.branchingFactor)

        GPUTimedBlock(
          commandEncoder,
          `ProbeAtlasRaymarch level(${level})`, () => {
            let pass = commandEncoder.beginComputePass()
            state.gpu.programs.probeAtlasRaymarch(
              state.gpu.device.queue,
              pass,
              canvas.width,
              canvas.height,
              currentProbeDiameter * 0.5,
              currentProbeRayCount,
              intervalStartRadius,
              intervalEndRadius,
              level,
              levelCount,
              state.maxLevel0Rays,
              state.params.branchingFactor,
              state.params.debugRaymarchMipmaps,
              state.params.intervalAccumulationDecay,
              state.params.debugRaymarchWithDDA,
              state.params.debugRaymarchFixedSizeStepMultiplier
            );
            pass.end()
          }
        )
      }

    }

    // Populate the fluence texture
    {
      GPUTimedBlock(
        commandEncoder,
        `populate fluence texture`, () => {
          let pass = commandEncoder.beginComputePass()
          state.gpu.programs.buildFluenceTexture(
            state.gpu.device.queue,
            pass,
            state.params.probeRayCount,
            canvas.width,
            canvas.height,
            state.params.probeRadius,
            state.params.debugProbeDirections,
            state.params.branchingFactor
          )
          pass.end();
        }
      );
    }

    // Debug Render World Texture
    {
      let probeRadius = Math.pow(2, state.params.probeRadius)
      GPUTimedBlock(
        commandEncoder,
        `final blit`, () => {
          state.gpu.programs.debugWorldBlit(
            commandEncoder,
            state.gpu.device.queue,
            state.ctx,
            canvas.width,
            canvas.height,
            probeRadius,
            state.params.debugWorldMipmapLevelRender
          )
        }
      )
    }

    // Finish gpu timers
    if (state.gpu.hasTimestampQueryFeature) {
      commandEncoder.resolveQuerySet(
        state.gpu.timestampQuerySet,
        0,
        state.gpu.timestampQueryCount,
        state.gpu.timestampResultBuffer,
        0
      );
    }

    state.gpu.device.queue.submit([commandEncoder.finish()])

    if (state.gpu.hasTimestampQueryFeature && state.gpu.timestampQueries.length) {
      const copyEncoder = state.gpu.device.createCommandEncoder();
      copyEncoder.copyBufferToBuffer(
        state.gpu.timestampResultBuffer,
        0,
        state.gpu.timestampMappableBuffer,
        0,
        state.gpu.timestampQueryBufferSizeInBytes
      );

      state.gpu.device.queue.submit([copyEncoder.finish()]);
      await state.gpu.timestampMappableBuffer.mapAsync(GPUMapMode.READ);

      const buffer = state.gpu.timestampMappableBuffer.getMappedRange();
      const results = new BigInt64Array(buffer.slice(0))
      state.gpu.timestampMappableBuffer.unmap();

      let totalMs = 0.0
      let output = ''
      state.gpu.timestampQueries.forEach(entry => {
        let diff = Number(results[entry.endIndex] - results[entry.startIndex])
        let ms = diff / 1000000.0
        totalMs += ms
        output += `${ms.toFixed(2)}ms ${entry.label}\n`
      })
      output += `------\n`
      output += `${totalMs.toFixed(2)}ms total\n`

      controlEl.querySelector('.debugPerformance-control .performance-output code pre').innerText = output;
    }

    window.requestAnimationFrame(RenderFrame)
  }

  window.requestAnimationFrame(RenderFrame)
}

if (document.readyState != 'complete') {
  document.addEventListener("readystatechange", e => {
    if (document.readyState == 'complete') {
      ProbeRayDDA2DBegin();
    }
  })
} else {
  ProbeRayDDA2DBegin();
}
