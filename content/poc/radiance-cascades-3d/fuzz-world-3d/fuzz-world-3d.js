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
      return Date.now()
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

  state.camera.state.targetDistance = 200
  state.camera.state.scrollSensitivity = 0.1;

  const maxLevel0ProbeLatticeDiameter = Math.pow(
    2,
    parseFloat(controlEl.querySelector('.probeLatticeDiameter-control input').max)
  )

  const maxRaysPerLevel0Probe = 6 * Math.pow(
    4,
    parseFloat(controlEl.querySelector('.probeRayCount-control input').max)
  )

  const maxBranchingFactor = Math.pow(
    4,
    parseFloat(controlEl.querySelector('.branchingFactor-control input').max)
  )

  const level0BytesPerProbeRay = 16
  const maxLevel0ProbeCount = Math.pow(maxLevel0ProbeLatticeDiameter, 3)
  const maxLevelCount = Math.log2(maxLevel0ProbeLatticeDiameter)

  const pingPongBufferRayCount = Math.max(
    maxRaysPerLevel0Probe * maxLevel0ProbeCount,
    maxRaysPerLevel0Probe * Math.pow(maxBranchingFactor, maxLevelCount)
  )
  const probeBufferByteSize = pingPongBufferRayCount * level0BytesPerProbeRay * 2
  console.log('pingPongBufferRayCount', pingPongBufferRayCount, 'size', probeBufferByteSize)

  try {
    state.gpu = await InitGPU(ctx, probeBufferByteSize);
  } catch (e) {
    console.error(e)
    rootEl.className = rootEl.className.replace('has-webgpu', '')
    return;
  }

  state.gpu.labelPrefix = "FuzzWorld3D/"


  const volumeDiameter = 256;
  state.gpu.textures = {
    albedo: state.gpu.device.createTexture({
      label: `${state.gpu.labelPrefix}Texture/albedo`,
      size: [volumeDiameter, volumeDiameter, volumeDiameter],
      mipLevelCount: Math.log2(volumeDiameter),
      dimension: '3d',
      format: 'rgba8unorm',
      usage: (
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING
      ),
    }),
    volume: state.gpu.device.createTexture({
      label: `${state.gpu.labelPrefix}Texture/volume`,
      size: [volumeDiameter, volumeDiameter, volumeDiameter],
      mipLevelCount: Math.log2(volumeDiameter),
      dimension: '3d',
      format: 'rgba16float',
      usage: (
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING
      ),
    }),
    fluence: state.gpu.device.createTexture({
      label: `${state.gpu.labelPrefix}Texture/fluence`,
      size: [volumeDiameter, volumeDiameter, volumeDiameter],
      mipLevelCount: Math.log2(volumeDiameter),
      dimension: '3d',
      format: 'rgba16float',
      usage: (
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING
      ),
    }),
    output: state.gpu.device.createTexture({
      label: `${state.gpu.labelPrefix}Texture/output`,
      size: [canvas.width, canvas.height, 1],
      dimension: '2d',
      format: 'rgba8unorm',
      usage: (
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING
      ),
    }),
  }

  state.gpu.buffers = {
    probes: state.gpu.device.createBuffer({
      label: 'ProbeBuffer',
      // Note: we need to ping-pong so the buffer needs to be doubled in size
      size: probeBufferByteSize,
      usage: GPUBufferUsage.STORAGE
    })
  }

  const shaders = {
    BuildScene(gpu, volumeTexture, albedoTexture, workgroupSize, sceneNames) {


      const sdfCommon = /* wgsl */`
        fn SDFSphere(pos: vec3f, center: vec3f, radius: f32) -> f32 {
          return distance(pos, center) - radius;
        }

        fn SDFBox( p: vec3f, b: vec3f ) -> f32 {
          let q = abs(p) - b;
          return length(max(q,vec3f(0.0))) + min(max(q.x,max(q.y,q.z)),0.0);
        }

        fn SDFSegment( p: vec3f, a: vec3f, b: vec3f, r: f32 ) -> f32 {
          let pa = p - a;
          let ba = b - a;
          let h = clamp( dot(pa,ba)/dot(ba,ba), 0.0, 1.0 );
          return length( pa - ba*h ) - r;
        }

        // lifted from: https://jbaker.graphics/writings/DEC.html
        fn de( pos: vec3f ) -> f32{
          var s=4.;
          var p = abs(pos);
          let off=p*4.6;
          for (var i=0.0; i<8.0; i+=1.0){
            p=1.-abs(abs(p-2.)-1.);
            var r=-13.*clamp(.38*max(1.3/dot(p,p),.7),0.,3.3);
            s*=r;
            p*=r;
            p+=off;
          }
          return length(cross(p,normalize(vec3(1,3,3))))/s-.006;
        }
      `;

      const sources = {
        'single-centered-sphere': /* wgsl */`
          ${sdfCommon}

          @group(0) @binding(0) var volumeTexture: texture_storage_3d<rgba16float, write>;
          @group(0) @binding(1) var albedoTexture: texture_storage_3d<rgba8unorm, write>;

          @compute @workgroup_size(${workgroupSize.join(',')})
          fn ComputeMain(@builtin(global_invocation_id) id: vec3<u32>) {
            let dims = vec3f(textureDimensions(volumeTexture));
            let pos = vec3f(id.xyz);

            // a singular emissive sphere
            let light = SDFSphere(pos, dims * 0.5, 8);
            if (light < 0.0) {
              textureStore(volumeTexture, id, vec4f(vec3f(100.0), 1.0));
              textureStore(albedoTexture, id, vec4f(1.0, 1.0, 1.0, 1.0));
            } else {
              textureStore(volumeTexture, id.xyz, vec4f(0.0, 0.0, 0.0, 0.0));
              textureStore(albedoTexture, id.xyz, vec4f(0.0, 0.0, 0.0, 0.0));
            }
          }
        `,
        'occluder': /* wgsl */`
          ${sdfCommon}

          @group(0) @binding(0) var volumeTexture: texture_storage_3d<rgba16float, write>;
          @group(0) @binding(1) var albedoTexture: texture_storage_3d<rgba8unorm, write>;

          @compute @workgroup_size(${workgroupSize.join(',')})
          fn ComputeMain(@builtin(global_invocation_id) id: vec3<u32>) {
            let dims = vec3f(textureDimensions(volumeTexture));
            let pos = vec3f(id.xyz);

            textureStore(volumeTexture, id.xyz, vec4f(0.0, 0.0, 0.0, 0.0));
            textureStore(albedoTexture, id.xyz, vec4f(0.0, 0.0, 0.0, 0.0));

            let floor = SDFBox(
              pos - vec3f(dims.x * 0.5, 96, dims.z * 0.5),
              vec3f(dims.x, 15.0, dims.z)
            );

            if (floor <= 0.0) {
              textureStore(volumeTexture, id, vec4f(vec3f(0.0), 0.0));
              textureStore(albedoTexture, id, vec4f(1.0, 1.0, 1.0, 1.0));
            }

            {
              let box = SDFBox(
                pos - vec3f(100, dims.y * 0.5, 128),
                vec3f(8.0, dims.y * 0.5, 32.0)
              );

              if (box <= 0.0) {
                textureStore(volumeTexture, id, vec4f(vec3f(0.0), 0.0));
                textureStore(albedoTexture, id, vec4f(1.0, 1.0, 1.0, 1.0));
              }
            }

            {
              let box = SDFBox(
                pos - vec3f(128, dims.y * 0.5, 100),
                vec3f(32.0, dims.y * 0.5, 8.0)
              );

              if (box <= 0.0) {
                textureStore(volumeTexture, id, vec4f(vec3f(0.0), 0.0));
                textureStore(albedoTexture, id, vec4f(1.0, 1.0, 1.0, 1.0));
              }
            }

            let light = SDFSphere(pos, vec3f(32, 160, dims.z * 0.5  - 64), 16);
            if (light < 0.0) {
              textureStore(volumeTexture, id, vec4f(vec3f(100.0), 1.0));
              textureStore(albedoTexture, id, vec4f(1.0, 1.0, 1.0, 1.0));
            }
          }
        `,
        'fractal-with-sphere': /* wgsl */`
          ${sdfCommon}
          fn SampleSDF(pos: vec3f, dims: vec3f) -> f32 {
            let radius = 24.0;
            let halfDims = dims * 0.5;
            return max(
              -SDFBox(pos - halfDims, vec3f(radius * 0.35, radius * 0.35, radius * 2.0)),
              max(
                -SDFBox(pos - halfDims, vec3f(radius * 0.35, radius * 2.0, radius * 0.35)),
                max(
                  -SDFBox(pos - halfDims, vec3f(radius * 2.0, radius * 0.35, radius * 0.35)),
                  SDFSphere(pos, halfDims, radius)
                )
              )
            );
          }

          @group(0) @binding(0) var volumeTexture: texture_storage_3d<rgba16float, write>;
          @group(0) @binding(1) var albedoTexture: texture_storage_3d<rgba8unorm, write>;

          @compute @workgroup_size(${workgroupSize.join(',')})
          fn ComputeMain(@builtin(global_invocation_id) id: vec3<u32>) {
            let dims = vec3f(textureDimensions(volumeTexture));
            let pos = vec3f(id.xyz);

            textureStore(volumeTexture, id.xyz, vec4f(0.0, 0.0, 0.0, 0.0));
            textureStore(albedoTexture, id.xyz, vec4f(0.0, 0.0, 0.0, 0.0));

            var d0 = SampleSDF(pos, dims);

            var d1 = de(pos * 0.01) * 100.0;

            var color = vec3(0.0, 0.0, 0.0);
            var falloff = 10.0;
            var opacity = 1.0;
            var alpha = 1.0;
            if (abs(d1) <= 0.3) {
              falloff = 1.0;
              opacity = 1.0;//0.25;
              color = vec3(1.0, 0.0, 0.4);
              // alpha = clamp(sqrt(-d1), 0.0, falloff) / falloff * opacity;
              // alpha = 0.015;
              alpha = opacity;
              // textureStore(
              //   volumeTexture,
              //   id.xyz,
              //   vec4f(color, alpha)
              // );

              textureStore(albedoTexture, id, vec4f(color, 0.6));
            }

            d0 = max(d0, -(d1 - 3.0));
            if (d0 <= 2.0) {
              let emission = vec3(5.0);
              opacity = 1.0;
              falloff = 1.0;
              alpha = opacity;
              // alpha = clamp(sqrt(d0), 0.0, falloff) / falloff * opacity;
              // alpha = (2.0 - max(0.0, d0)) * 0.5;
              textureStore(
                volumeTexture,
                id.xyz,
                vec4f(emission, alpha)
              );
              textureStore(albedoTexture, id, vec4f(1.0, 1.0, 1.0, 1.0));
            }

            // a singular emissive sphere
            let light = SDFSphere(vec3f(id.xyz), dims * 0.5, 16);
            if (light < 0.0) {
              textureStore(volumeTexture, id, vec4f(vec3f(10.0), 1.0));
              textureStore(albedoTexture, id, vec4f(1.0, 1.0, 1.0, 1.0));
            } else {
            }
          }
        `,
      }


      const scenes = {}
      sceneNames.forEach(sceneName => {
        const labelPrefix = gpu.labelPrefix + `scenes/${sceneName}/`
        const scene = {}
        scene.shaderModule = gpu.device.createShaderModule({
          label: `${labelPrefix}ShaderModule`,
          code: sources[sceneName]
        })

        scene.bindGroupLayout = gpu.device.createBindGroupLayout({
          label: `${labelPrefix}BindGroupLayout`,
          entries: [
            {
              binding: 0,
              visibility: GPUShaderStage.COMPUTE,
              storageTexture: {
                format: "rgba16float",
                viewDimension: '3d',
              },
            },
            {
              binding: 1,
              visibility: GPUShaderStage.COMPUTE,
              storageTexture: {
                format: "rgba8unorm",
                viewDimension: '3d',
              },
            },
          ]
        })

        scene.pipeline = gpu.device.createComputePipeline({
          label: `${labelPrefix}ComputePipeline`,
          compute: {
            module: scene.shaderModule,
            entryPoint: 'ComputeMain',
          },
          layout: gpu.device.createPipelineLayout({
            bindGroupLayouts: [
              scene.bindGroupLayout
            ]
          }),
        })

        scene.bindGroup = gpu.device.createBindGroup({
          label: `${labelPrefix}BindGroup`,
          layout: scene.pipeline.getBindGroupLayout(0),
          entries: [
            {
              binding: 0,
              resource: volumeTexture.createView({
                dimension: '3d',
                baseMipLevel: 0,
                mipLevelCount: 1,
              })
            },
            {
              binding: 1,
              resource: albedoTexture.createView({
                dimension: '3d',
                baseMipLevel: 0,
                mipLevelCount: 1,
              })
            },
          ]
        })

        scenes[sceneName] = scene
      })

      return function BuildScene(commandEncoder, params) {
        const scene = scenes[params.scene]
        if (!scene) {
          console.error(`scene ${params.scene} gpu program not found`)
          return
        }
        const computePass = commandEncoder.beginComputePass()
        computePass.setPipeline(scene.pipeline)
        computePass.setBindGroup(0, scene.bindGroup)
        computePass.dispatchWorkgroups(
          Math.floor(volumeTexture.width / workgroupSize[0] + 1),
          Math.floor(volumeTexture.height / workgroupSize[1] + 1),
          Math.floor(volumeTexture.depthOrArrayLayers / workgroupSize[2] + 1),
        )
        computePass.end()
      }
    },

    MipmapVolume(gpu, volumeTexture, workgroupSize) {
      const labelPrefix = gpu.labelPrefix + 'MipmapVolume/'
      const source =  /* wgsl */`
        @group(0) @binding(0) var src: texture_3d<f32>;
        @group(0) @binding(1) var dst: texture_storage_3d<${volumeTexture.format}, write>;

        @compute @workgroup_size(${workgroupSize.join(',')})
        fn ComputeMain(@builtin(global_invocation_id) id: vec3<u32>) {
          let TextureSize = vec3<i32>(textureDimensions(src));
          let lo = vec3<i32>(id) * 2;
          if (
            lo.x + 1 >= TextureSize.x ||
            lo.y + 1 >= TextureSize.y ||
            lo.z + 1 >= TextureSize.z
          ) {
            return;
          }

          var color = textureLoad(src, lo + vec3<i32>(0, 0, 0), 0)
                    + textureLoad(src, lo + vec3<i32>(1, 0, 0), 0)
                    + textureLoad(src, lo + vec3<i32>(0, 1, 0), 0)
                    + textureLoad(src, lo + vec3<i32>(1, 1, 0), 0)
                    + textureLoad(src, lo + vec3<i32>(0, 0, 1), 0)
                    + textureLoad(src, lo + vec3<i32>(1, 0, 1), 0)
                    + textureLoad(src, lo + vec3<i32>(0, 1, 1), 0)
                    + textureLoad(src, lo + vec3<i32>(1, 1, 1), 0)
                    ;

          textureStore(dst, id, color / 8.0);
          // textureStore(dst, id, vec4(color.rgb * color.a, color.a / 8.0));
        }
      `

      const shaderModule = gpu.device.createShaderModule({
        label: `${labelPrefix}ShaderModule`,
        code: source
      })

      const bindGroupLayout = gpu.device.createBindGroupLayout({
        label: `${labelPrefix}BindGroupLayout`,
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.COMPUTE,
            texture: {
              format: volumeTexture.format,
              sampleType: 'float',
              viewDimension: '3d',
            },
          },
          {
            binding: 1,
            visibility: GPUShaderStage.COMPUTE,
            storageTexture: {
              format: volumeTexture.format,
              viewDimension: '3d',
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


      let levelTextureViews = []
      for (var level = 0; level < volumeTexture.mipLevelCount; level++) {
        let view = volumeTexture.createView({
          label: `${labelPrefix}/Volume/MipLevel/${level}`,
          dimension: '3d',
          baseMipLevel: level,
          mipLevelCount: 1
        })
        levelTextureViews.push(view)
      }

      let levelBindGroups = [null]
      for (var level = 1; level < volumeTexture.mipLevelCount; level++) {
        const bindGroup = gpu.device.createBindGroup({
          label: `${labelPrefix}/BindGroup/MipLevel/${level}`,
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: levelTextureViews[level - 1] },
            { binding: 1, resource: levelTextureViews[level] }
          ]
        })

        levelBindGroups.push(bindGroup);
      }

      return function MipmapVolume(commandEncoder) {
        for (var level = 1; level < volumeTexture.mipLevelCount; level++) {
          const computePass = commandEncoder.beginComputePass()
          computePass.setPipeline(pipeline)
          computePass.setBindGroup(0, levelBindGroups[level])
          computePass.dispatchWorkgroups(
            Math.floor(volumeTexture.width / workgroupSize[0] + 1),
            Math.floor(volumeTexture.height / workgroupSize[1] + 1),
            Math.floor(volumeTexture.depthOrArrayLayers / workgroupSize[2] + 1),
          )
          computePass.end()
        }
      }
    },

    RaymarchProbeRays(
      gpu,
      volumeTexture,
      probeBuffer,
      workgroupSize,
      maxLevelCount,
      pingPongBufferRayCount
    ) {
      const labelPrefix = gpu.labelPrefix + 'RaymarchProbeRays/'
      const maxWorkgroupsPerDimension = gpu.adapter.limits.maxComputeWorkgroupsPerDimension

      const uboFields = [
        ['level', 'u32', 4],
        ['probeRadius', 'i32', 4],
        ['probeRayCount', 'i32', 4],
        ['intervalStartRadius', 'f32', 4],
        ['intervalEndRadius', 'f32', 4],
        ['debugRaymarchFixedSizeStepMultiplier', 'f32', 4],
        ['branchingFactor', 'u32', 4],
        ['levelCount', 'u32', 4],
        ['probeLatticeDiameter', 'i32', 4],
      ]

      let uboBufferSize = uboFields.reduce((p, c) => {
        return p + c[2]
      }, 0)

      const alignedUBOIncrement = Math.max(16, gpu.adapter.limits.minUniformBufferOffsetAlignment)
      uboBufferSize = Math.floor(uboBufferSize / alignedUBOIncrement + 1) * alignedUBOIncrement
      const uboBuffer = new ArrayBuffer(uboBufferSize * (maxLevelCount + 1))

      const uboData = new DataView(uboBuffer)
      const ubo = gpu.device.createBuffer({
        label: `${labelPrefix}UBO`,
        size: uboBuffer.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      })

      const sampler = gpu.device.createSampler({
        label: `${labelPrefix}Sampler`,
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
        magFilter: 'linear',
        minFilter: 'linear',
        mipmapFilter: 'nearest',
      })

      const source =  /* wgsl */`
        const PI: f32 = ${Math.PI};
        const TAU: f32 = ${Math.PI * 2.0};
        const pingPongBufferRayCount: i32 = ${pingPongBufferRayCount};

        struct UBOParams {
          ${uboFields.map(i => `${i[0]}: ${i[1]},\n `).join('    ')}
        };


        fn SampleUpperProbe(
          rawPos: vec3<i32>,
          raysPerProbe: i32,
          PingPongBufferOffset: i32,
          ProbeRayIndex: i32,
          cascadeWidth: i32
        ) -> vec4f {
          // TODO: rawPos can be out of the scene bounds, intentionally.
          //       this is a bit of a hack, that reuses an in-bounds probe multiple times
          //       instead of going out of bounds to a probe that doesn't exist or simply
          //       returning transparent black.
          //
          //       The real fix is to add another ring of probes for every level that live
          //       just out of bounds to add coverage for lower corner/edge probes

          let pos = clamp(rawPos, vec3<i32>(0), vec3<i32>(cascadeWidth - 1));

          let ProbeIndex = (
            pos.x +
            pos.y * cascadeWidth +
            pos.z * cascadeWidth * cascadeWidth
          );

          let ProbeRayOffset = ProbeIndex * raysPerProbe + ProbeRayIndex;

          let rayCount = i32(ubo.branchingFactor);
          var accColor = vec4(0.0);
          var accRadiance = 0.0;
          for (var rayIndex=0; rayIndex<rayCount; rayIndex++) {
            accColor += probes[PingPongBufferOffset + ProbeRayOffset + rayIndex];
          }
          return accColor / f32(rayCount);
        }

        // given: world space sample pos, angle
        // - sample each probe in the neighborhood (8)
        // - interpolate
        fn SampleUpperProbes(lowerProbeCenterUVW: vec3f, LowerProbeRayIndex: i32) -> vec4f {
          let UpperLevel = i32(ubo.level + 1);
          if (UpperLevel >= i32(ubo.levelCount)) {
            return vec4f(0.0);
          }
          let UpperLatticeDiameter = ubo.probeLatticeDiameter >> u32(UpperLevel);
          let UpperProbeRayIndex = LowerProbeRayIndex * i32(ubo.branchingFactor);
          let UpperRaysPerProbe = ubo.probeRayCount * i32(ubo.branchingFactor);
          let BasePos = vec3<i32>(floor(lowerProbeCenterUVW * f32(UpperLatticeDiameter) - 0.5));

          let BufferStartIndex = (pingPongBufferRayCount * (UpperLevel % 2));
          let samples = array(
            SampleUpperProbe(
              BasePos + vec3<i32>(0, 0, 0),
              UpperRaysPerProbe,
              BufferStartIndex,
              UpperProbeRayIndex,
              UpperLatticeDiameter
            ),
            SampleUpperProbe(
              BasePos + vec3<i32>(1, 0, 0),
              UpperRaysPerProbe,
              BufferStartIndex,
              UpperProbeRayIndex,
              UpperLatticeDiameter
            ),
            SampleUpperProbe(
              BasePos + vec3<i32>(0, 1, 0),
              UpperRaysPerProbe,
              BufferStartIndex,
              UpperProbeRayIndex,
              UpperLatticeDiameter
            ),
            SampleUpperProbe(
              BasePos + vec3<i32>(1, 1, 0),
              UpperRaysPerProbe,
              BufferStartIndex,
              UpperProbeRayIndex,
              UpperLatticeDiameter
            ),
            SampleUpperProbe(
              BasePos + vec3<i32>(0, 0, 1),
              UpperRaysPerProbe,
              BufferStartIndex,
              UpperProbeRayIndex,
              UpperLatticeDiameter
            ),
            SampleUpperProbe(
              BasePos + vec3<i32>(1, 0, 1),
              UpperRaysPerProbe,
              BufferStartIndex,
              UpperProbeRayIndex,
              UpperLatticeDiameter
            ),
            SampleUpperProbe(
              BasePos + vec3<i32>(0, 1, 1),
              UpperRaysPerProbe,
              BufferStartIndex,
              UpperProbeRayIndex,
              UpperLatticeDiameter
            ),
            SampleUpperProbe(
              BasePos + vec3<i32>(1, 1, 1),
              UpperRaysPerProbe,
              BufferStartIndex,
              UpperProbeRayIndex,
              UpperLatticeDiameter
            ),
          );

          let index = lowerProbeCenterUVW * f32(UpperLatticeDiameter);
          let factor = fract(index);
          let invFactor = 1.0 - factor;

          let c00 = samples[0] * invFactor.x + samples[1] * factor.x;
          let c01 = samples[2] * invFactor.x + samples[3] * factor.x;
          let c10 = samples[4] * invFactor.x + samples[5] * factor.x;
          let c11 = samples[6] * invFactor.x + samples[7] * factor.x;

          let c0 = c00 * invFactor.y + c10 * factor.y;
          let c1 = c01 * invFactor.y + c11 * factor.y;

          return c0 * invFactor.z + c1 * factor.z;
        }

        fn Accumulate(a: vec4f, b: vec4f) -> vec4f {
          let a0 = a.a + b.a * (1.0 - a.a);
          return select(
            a,
            vec4((a.rgb * a.a + b.rgb * b.a * (1.0 - a.a)) / a0, a0),
            a0 > 0
          );
        }

        fn RayMarchFixedSize(
          probeCenter: vec3f,
          rayOrigin: vec3f,
          rayDirection: vec3f,
          maxDistance: f32
        ) -> vec4f {
          let levelMip = f32(ubo.level);
          var acc = vec4f(0.0, 0.0, 0.0, 0.0);
          let dims = vec3f(textureDimensions(volumeTexture));

          var t = 0.0;
          let stepSizeMultiplier = max(0.1, ubo.debugRaymarchFixedSizeStepMultiplier);
          let stepSize = pow(2.0, levelMip) * stepSizeMultiplier;
          var occlusion = 0.0;
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
              volumeTexture,
              volumeSampler,
              pos / dims,
              levelMip
            );

            acc = Accumulate(acc, sample);
            if (acc.a > 1.0) {
              break;
            }
            // occlusion += sample.a;
            // if (occlusion > 0.001) {
            //   break;
            // }

            t += stepSize;
          }

          return acc;
        }

        fn Compact1By1(x: u32) -> u32{
          var ret = x & 0x55555555;                 // x = -f-e -d-c -b-a -9-8 -7-6 -5-4 -3-2 -1-0
          ret = (ret ^ (ret >> 1)) & 0x33333333; // x = --fe --dc --ba --98 --76 --54 --32 --10
          ret = (ret ^ (ret >> 2)) & 0x0f0f0f0f; // x = ---- fedc ---- ba98 ---- 7654 ---- 3210
          ret = (ret ^ (ret >> 4)) & 0x00ff00ff; // x = ---- ---- fedc ba98 ---- ---- 7654 3210
          ret = (ret ^ (ret >> 8)) & 0x0000ffff; // x = ---- ---- ---- ---- fedc ba98 7654 3210
          return ret;
        }

        fn MortonDecodeX(code: u32) -> u32{
          return Compact1By1(code >> 0);
        }

        fn MortonDecodeY(code: u32) -> u32 {
          return Compact1By1(code >> 1);
        }


        @group(0) @binding(0) var<storage, read_write> probes: array<vec4f>;
        @group(0) @binding(1) var<uniform> ubo: UBOParams;
        @group(0) @binding(2) var volumeTexture: texture_3d<f32>;
        @group(0) @binding(3) var volumeSampler: sampler;

        @compute @workgroup_size(${workgroupSize.join(',')})
        fn ComputeMain(@builtin(global_invocation_id) id: vec3<u32>) {
          let dims = vec3f(textureDimensions(volumeTexture));
          let RayIndex: i32 = i32(
            id.x +
            id.y * ${workgroupSize[0]} +
            id.z * ${workgroupSize[0] * workgroupSize[0]}
          );

          let ProbeRayIndex = RayIndex % ubo.probeRayCount;
          let ProbeIndex = RayIndex / ubo.probeRayCount;
          let LatticeDiameter = ubo.probeLatticeDiameter >> ubo.level;
          const CubeFaceCount = 6;
          var rayDirection: vec3f;
          // Cube Face Subdivision
          {
            let level = ubo.level;
            // pow(branchingFactor, level)
            let raysPerFace = 1 << ((ubo.branchingFactor/2) * level);
            let totalRayCount = raysPerFace * CubeFaceCount;
            let diameter = sqrt(f32(raysPerFace));

            let face = ProbeRayIndex / raysPerFace;
            var sign = select(-1.0, 1.0, face % 2 == 1);
            // -x, x, -y, y, -z, z
            let axis: i32 = face / 2;
            let FaceRayIndex = u32(ProbeRayIndex % raysPerFace);

            let u = (f32(MortonDecodeX(FaceRayIndex)) + 0.5) / diameter * 2.0 - 1.0;
            let v = (f32(MortonDecodeY(FaceRayIndex)) + 0.5) / diameter * 2.0 - 1.0;

            rayDirection[axis] = sign;
            rayDirection[(axis + 1) % 3] = u;
            rayDirection[(axis + 2) % 3] = v;
            rayDirection = normalize(rayDirection);
          }

          var idx = ProbeIndex;
          let z = idx / (LatticeDiameter * LatticeDiameter);
          idx -= z * (LatticeDiameter * LatticeDiameter);
          let LatticePosition = vec3f(
            f32(idx % LatticeDiameter),
            f32(idx / LatticeDiameter),
            f32(z)
          );

          let LowerIntervalRadius = f32(ubo.intervalStartRadius);
          let IntervalRadius = f32(ubo.intervalEndRadius);

          let ProbeCenterUVW = (LatticePosition + 0.5) / f32(LatticeDiameter);
          let ProbeCenter = ProbeCenterUVW * dims;

          let LowerResult = RayMarchFixedSize(
            ProbeCenter,
            ProbeCenter + rayDirection * LowerIntervalRadius,
            rayDirection,
            IntervalRadius
          );

          let UpperResult = SampleUpperProbes(ProbeCenterUVW, ProbeRayIndex);
          let OutputIndex = (i32(ubo.level) % 2) * pingPongBufferRayCount + RayIndex;
          probes[OutputIndex] = Accumulate(LowerResult, UpperResult);
        }
      `

      const shaderModule = gpu.device.createShaderModule({
        label: `${labelPrefix}ShaderModule`,
        code: source
      })

      const bindGroupLayout = gpu.device.createBindGroupLayout({
        label: `${labelPrefix}BindGroupLayout`,
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
              sampleType: 'float',
              viewDimension: '3d',
            },
          },
          {
            binding: 3,
            visibility: GPUShaderStage.COMPUTE,
            sampler: {
              type: "filtering"
            },
          },
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
              size: uboBufferSize,
            }
          },
          {
            binding: 2,
            resource: volumeTexture.createView({
              dimension: '3d',
              baseMipLevel: 0,
              mipLevelCount: volumeTexture.mipLevelCount,
            })
          },
          {
            binding: 3,
            resource: sampler,
          },
        ]
      })

      return function RaymarchProbeRays(
        commandEncoder,
        params
      ) {
        const levelCount = params.debugMaxProbeLevel + 1

        for (let level = levelCount - 1; level >= 0; level--) {
          let probeRadius = 2 << level
          let intervalStartRadius = level == 0 ? 0 : params.intervalRadius << (level - 1)
          let intervalEndRadius = params.intervalRadius << level
          let levelProbeRayCount = params.probeRayCount * Math.pow(params.branchingFactor, level)
          let byteOffset = uboBufferSize * level;

          // level
          uboData.setInt32(byteOffset, level, true)
          byteOffset += 4

          uboData.setInt32(byteOffset, probeRadius, true)
          byteOffset += 4

          uboData.setInt32(byteOffset, levelProbeRayCount, true)
          byteOffset += 4

          uboData.setFloat32(byteOffset, intervalStartRadius, true)
          byteOffset += 4

          uboData.setFloat32(byteOffset, intervalEndRadius, true)
          byteOffset += 4

          uboData.setFloat32(byteOffset, params.debugRaymarchFixedSizeStepMultiplier, true)
          byteOffset += 4

          uboData.setUint32(byteOffset, params.branchingFactor, true)
          byteOffset += 4

          uboData.setInt32(byteOffset, levelCount, true)
          byteOffset += 4

          uboData.setInt32(byteOffset, params.probeLatticeDiameter, true)
          byteOffset += 4
        }
        gpu.device.queue.writeBuffer(ubo, 0, uboBuffer)

        for (let level = levelCount - 1; level >= 0; level--) {
          let byteOffset = uboBufferSize * level;

          const computePass = commandEncoder.beginComputePass()
          computePass.setPipeline(pipeline)
          computePass.setBindGroup(0, bindGroup, [byteOffset])
          const totalRays = (
            Math.pow(params.probeLatticeDiameter >> level, 3) *
            params.probeRayCount * Math.pow(params.branchingFactor, level)
          )
          const totalWorkGroups = totalRays / workgroupSize[0];
          let x = totalWorkGroups
          let y = 1
          let z = 1

          if (x > maxWorkgroupsPerDimension) {
            y = x / maxWorkgroupsPerDimension
            x = maxWorkgroupsPerDimension
          }

          if (y > maxWorkgroupsPerDimension) {
            z = y / maxWorkgroupsPerDimension
            y = maxWorkgroupsPerDimension
          }

          computePass.dispatchWorkgroups(x, y, z)
          computePass.end()
        }
      }
    },

    ComputeFluence(
      gpu,
      volumeTexture,
      fluenceTexture,
      probeBuffer,
      workgroupSize,
    ) {
      const labelPrefix = gpu.labelPrefix + 'ComputeFluence/'

      const uboFields = [
        ['probeRayCount', 'i32', 4],
        ['probeLatticeDiameter', 'i32', 4]
      ];

      let uboBufferSize = uboFields.reduce((p, c) => {
        return p + c[2]
      }, 0)
      uboBufferSize = Math.floor(uboBufferSize / 16 + 1) * 16
      const uboBuffer = new ArrayBuffer(uboBufferSize)

      const uboData = new DataView(uboBuffer)
      const ubo = gpu.device.createBuffer({
        label: `${labelPrefix}UBO`,
        size: uboBuffer.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      })

      const source =  /* wgsl */`
        struct UBOParams {
          ${uboFields.map(i => `${i[0]}: ${i[1]},\n `).join('    ')}
        };

        @group(0) @binding(0) var<storage, read_write> probes: array<vec4f>;
        @group(0) @binding(1) var fluenceTexture: texture_storage_3d<rgba16float, write>;
        @group(0) @binding(2) var<uniform> ubo: UBOParams;
        @group(0) @binding(3) var volumeTexture: texture_3d<f32>;

        @compute @workgroup_size(${workgroupSize.join(',')})
        fn ComputeMain(@builtin(global_invocation_id) id: vec3<u32>) {
          let dims = vec3f(textureDimensions(fluenceTexture));
          let uvw = vec3f(id) / dims;
          let Index = vec3<i32>(uvw * f32(ubo.probeLatticeDiameter));

          let StartIndex = (
            Index.x +
            Index.y * ubo.probeLatticeDiameter +
            Index.z * (ubo.probeLatticeDiameter * ubo.probeLatticeDiameter)
          ) * ubo.probeRayCount;

          var acc = vec4f(0.0);
          for (var probeRayIndex = 0; probeRayIndex < ubo.probeRayCount; probeRayIndex++) {
            acc += probes[StartIndex + probeRayIndex];
          }
          acc /= f32(ubo.probeRayCount);
          textureStore(fluenceTexture, id, acc);
        }
      `

      const shaderModule = gpu.device.createShaderModule({
        label: `${labelPrefix}ShaderModule`,
        code: source
      })

      const bindGroupLayout = gpu.device.createBindGroupLayout({
        label: `${labelPrefix}BindGroupLayout`,
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
            storageTexture: {
              format: "rgba16float",
              viewDimension: '3d',
            },
          },
          {
            binding: 2,
            visibility: GPUShaderStage.COMPUTE,
            buffer: {
              type: 'uniform',
            }
          },
          {
            binding: 3,
            visibility: GPUShaderStage.COMPUTE,
            texture: {
              format: "rgba16float",
              sampleType: 'float',
              viewDimension: '3d',
            },
          },
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
          {
            binding: 0,
            resource: {
              buffer: probeBuffer
            }
          },
          {
            binding: 1,
            resource: fluenceTexture.createView({
              dimension: '3d',
              baseMipLevel: 0,
              mipLevelCount: 1,
            })
          },
          {
            binding: 2,
            resource: {
              buffer: ubo
            }
          },
          {
            binding: 3,
            resource: volumeTexture.createView({
              label: `${labelPrefix}/Volume/View`,
              dimension: '3d',
              baseMipLevel: 0,
              mipLevelCount: 1
            })
          }
        ]
      })

      return function ComputeFluence(
        commandEncoder,
        params
      ) {
        // update uniform buffer
        {
          let byteOffset = 0

          uboData.setInt32(byteOffset, params.probeRayCount, true)
          byteOffset += 4;
          gpu.device.queue.writeBuffer(ubo, 0, uboBuffer)

          uboData.setInt32(byteOffset, params.probeLatticeDiameter, true)
          byteOffset += 4;
          gpu.device.queue.writeBuffer(ubo, 0, uboBuffer)
        }

        const computePass = commandEncoder.beginComputePass()
        computePass.setPipeline(pipeline)
        computePass.setBindGroup(0, bindGroup)
        computePass.dispatchWorkgroups(
          Math.floor(fluenceTexture.width / workgroupSize[0] + 1),
          Math.floor(fluenceTexture.height / workgroupSize[1] + 1),
          Math.floor(fluenceTexture.depthOrArrayLayers / workgroupSize[2] + 1),
        )
        computePass.end()
      }
    },

    RaymarchPrimaryRays(
      gpu,
      albedoTexture,
      volumeTexture,
      outputTexture,
      workgroupSize,
    ) {
      const labelPrefix = gpu.labelPrefix + 'RaymarchPrimaryRays/'

      const uboFields = [
        ['worldToScreen', 'mat4x4<f32>', 16 * 4],
        ['screenToWorld', 'mat4x4<f32>', 16 * 4],
        ['eye', 'vec4f', 16],
        ['width', 'i32', 4],
        ['height', 'i32', 4],
        ['fov', 'f32', 4],
        ['debugRenderRawFluence', 'i32', 4],
        ['probeLatticeDiameter', 'i32', 4],
      ]

      let uboBufferSize = uboFields.reduce((p, c) => {
        return p + c[2]
      }, 0)
      uboBufferSize = Math.floor(uboBufferSize / 16 + 1) * 16
      const uboBuffer = new ArrayBuffer(uboBufferSize)

      const uboData = new DataView(uboBuffer)
      const ubo = gpu.device.createBuffer({
        label: `${labelPrefix}UBO`,
        size: uboBuffer.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      })

      const sampler = gpu.device.createSampler({
        label: `${labelPrefix}Sampler`,
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
        magFilter: 'linear',
        minFilter: 'linear',
        mipmapFilter: 'linear',
      })

      const source =  /* wgsl */`

        fn MinComponent(a: vec3f) -> f32 {
          return min(a.x, min(a.y, a.z));
        }

        fn MaxComponent(a: vec3f) -> f32 {
          return max(a.x, max(a.y, a.z));
        }

        fn RayAABB(p0: vec3f, p1: vec3f, rayOrigin: vec3f, invRaydir: vec3f) -> f32 {
          let t0 = (p0 - rayOrigin) * invRaydir;
          let t1 = (p1 - rayOrigin) * invRaydir;
          let tmin = MaxComponent(min(t0, t1));
          let tmax = MinComponent(max(t0, t1));
          var hit = 0.0;
          if (tmin <= tmax) {
            if (tmin >= 0) {
              return tmin;
            } else {
              return 0.0;
            }
          } else {
            return -1.0;
          }
        }

        fn ComputeRayDir(ndc: vec2f, inv: mat4x4<f32>) -> vec3f {
          var far = inv * vec4f(-ndc.x, ndc.y, 0.1, 1.0);
          far /= far.w;
          var near = inv * vec4f(-ndc.x, ndc.y, 0.0, 1.0);
          near /= near.w;
          return normalize(far.xyz - near.xyz);
        }

        struct UBOParams {
          ${uboFields.map(i => `${i[0]}: ${i[1]},\n `).join('    ')}
        };

        fn Accumulate(a: vec4f, b: vec4f) -> vec4f {
          if (b.a > 0.0) {
            let a0 = a.a + b.a * (1.0 - a.a);
            return vec4(
              (a.rgb * a.a + b.rgb * b.a * (1.0 - a.a)) / a0,
              a0
            );
          } else {
            return a;
          }
        }

        @group(0) @binding(0) var outputTexture: texture_storage_2d<rgba8unorm, write>;
        @group(0) @binding(1) var<uniform> ubo: UBOParams;
        @group(0) @binding(2) var albedoTexture: texture_3d<f32>;
        @group(0) @binding(3) var volumeTexture: texture_3d<f32>;
        @group(0) @binding(4) var volumeSampler: sampler;

        fn MarchCone(rayOrigin: vec3f, rayDirection: vec3f, boxRadius: vec3f) -> vec4f {
          var acc = vec4f(0.0);
          var t = 0.0;
          var stepSize = 0.001;
          let levelCount = f32(log2(boxRadius.x * 2.0));
          var level = 0.0;
          var steps = 512;
          while(true) {
            steps--;
            if (steps < 0) {
              acc = vec4(1.0, 0.0, 0.0, 1.0);
              break;
            }

            t += max(1.0, t * stepSize);
            let hitPos = rayOrigin + rayDirection * t;
            let uvw = (hitPos / boxRadius) * 0.5 + 0.5;

            if (
              (uvw.x < 0.0 || uvw.x >= 1.0) ||
              (uvw.y < 0.0 || uvw.y >= 1.0) ||
              (uvw.z < 0.0 || uvw.z >= 1.0)
            ) {
              break;
            }

            let percent = 0.125 * t * tan(ubo.fov * 0.5) / f32(boxRadius.x);
            level = percent * levelCount;

            stepSize = 0.00125 * level;
            if (ubo.debugRenderRawFluence == 1) {
              let fluence = textureSampleLevel(volumeTexture, volumeSampler, uvw, level);
              acc = Accumulate(acc, fluence);
            } else {
              var albedo = textureSampleLevel(albedoTexture, volumeSampler, uvw, level);
              if (albedo.a > 0.0) {
                let fluence = textureSampleLevel(volumeTexture, volumeSampler, uvw, level);
                var c = vec4(
                  albedo.rgb * fluence.rgb,
                  albedo.a
                );

                acc = Accumulate(acc , c);
              }
            }
          }
          return acc;
        }

        fn MarchRay(rayOrigin: vec3f, rayDirection: vec3f, boxRadius: vec3f) -> vec4f {
          var acc = vec4f(0.0);
          var t = 0.0;
          var stepSize = 1.0;
          let levelCount = f32(log2(boxRadius.x * 2.0));
          var steps = 512;

          while(true) {
            steps--;
            if (steps < 0) {
              acc = vec4(1.0, 0.0, 0.0, 1.0);
              break;
            }

            t += stepSize;
            let hitPos = rayOrigin + rayDirection * t;
            let uvw = (hitPos / boxRadius) * 0.5 + 0.5;

            if (
              (uvw.x < 0.0 || uvw.x >= 1.0) ||
              (uvw.y < 0.0 || uvw.y >= 1.0) ||
              (uvw.z < 0.0 || uvw.z >= 1.0)
            ) {
              break;
            }
            let fluence = textureLoad(volumeTexture, vec3<i32>(uvw * boxRadius * 2.0), 0);
            // let fluence = textureSampleLevel(volumeTexture, volumeSampler, uvw, 0);
            acc = Accumulate(acc, fluence);
            // if (acc.a >= 0) {
            //   break;
            // }
          }
          return acc;
        }

        @compute @workgroup_size(${workgroupSize.join(',')})
        fn ComputeMain(@builtin(global_invocation_id) id: vec3<u32>) {
          let dims = vec3f(textureDimensions(volumeTexture));
          let uv = vec2f(
            f32(id.x) / f32(ubo.width),
            f32(id.y) / f32(ubo.height),
          );

          let rayDir = ComputeRayDir(
            uv * 2.0 - 1.0,
            ubo.screenToWorld
          );
          let boxRadius = dims * 0.5;
          var aabbHitT = 0.0;
          if (
            (ubo.eye.x < -boxRadius.x || ubo.eye.x >= boxRadius.x) ||
            (ubo.eye.y < -boxRadius.y || ubo.eye.y >= boxRadius.y) ||
            (ubo.eye.z < -boxRadius.z || ubo.eye.z >= boxRadius.z)
          ) {
            aabbHitT = RayAABB(-boxRadius, boxRadius, ubo.eye.xyz, 1.0 / rayDir);
          }

          var acc = vec4f(0.0);
          if (aabbHitT >= 0.0) {
            let aabbHit = ubo.eye.xyz + rayDir * aabbHitT;
            if (ubo.debugRenderRawFluence == 1) {
              acc = MarchRay(aabbHit, rayDir, boxRadius);
            } else {
              acc = MarchCone(aabbHit, rayDir, boxRadius);
            }
          }

          let backgroundColor = vec4f(0.0, 0.0, 0.0, 1.0);
          let color = Accumulate(acc, backgroundColor);

          textureStore(
            outputTexture,
            id.xy,
            color
          );
        }
      `

      const shaderModule = gpu.device.createShaderModule({
        label: `${labelPrefix}ShaderModule`,
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
          },
          {
            binding: 1,
            visibility: GPUShaderStage.COMPUTE,
            buffer: {
              type: 'uniform',
            }
          },
          {
            binding: 2,
            visibility: GPUShaderStage.COMPUTE,
            texture: {
              sampleType: 'float',
              viewDimension: '3d',
            },
          },
          {
            binding: 3,
            visibility: GPUShaderStage.COMPUTE,
            texture: {
              sampleType: 'float',
              viewDimension: '3d',
            },
          },
          {
            binding: 4,
            visibility: GPUShaderStage.COMPUTE,
            sampler: {
              type: "filtering"
            },
          },
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
            resource: albedoTexture.createView({
              dimension: '3d',
              baseMipLevel: 0,
              mipLevelCount: volumeTexture.mipLevelCount,
            })
          },
          {
            binding: 3,
            resource: volumeTexture.createView({
              dimension: '3d',
              baseMipLevel: 0,
              mipLevelCount: volumeTexture.mipLevelCount,
            })
          },
          {
            binding: 4,
            resource: sampler,
          },
        ]
      })

      return function RaymarchPrimaryRays(
        commandEncoder,
        width,
        height,
        eye,
        worldToScreen,
        screenToWorld,
        fov,
        params
      ) {
        // update uniform buffer
        {
          let byteOffset = 0

          worldToScreen.forEach(v => {
            uboData.setFloat32(byteOffset, v, true)
            byteOffset += 4;
          })

          screenToWorld.forEach(v => {
            uboData.setFloat32(byteOffset, v, true)
            byteOffset += 4;
          })

          eye.forEach(v => {
            uboData.setFloat32(byteOffset, v, true)
            byteOffset += 4;
          })

          // eye.w, unused
          byteOffset += 4;

          // width
          uboData.setInt32(byteOffset, width, true)
          byteOffset += 4

          // height
          uboData.setInt32(byteOffset, height, true)
          byteOffset += 4

          // fov
          uboData.setFloat32(byteOffset, fov, true)
          byteOffset += 4

          // debugRenderRawFluence
          uboData.setInt32(byteOffset, params.debugRenderRawFluence ? 1 : 0, true)
          byteOffset += 4;

          uboData.setInt32(byteOffset, params.probeLatticeDiameter, true)
          byteOffset += 4;

          gpu.device.queue.writeBuffer(ubo, 0, uboBuffer)
        }

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
    buildScene: shaders.BuildScene(
      state.gpu,
      state.gpu.textures.volume,
      state.gpu.textures.albedo,
      [16, 4, 4],
      Array.from(controlEl.querySelectorAll(".scene-control select option")).map(e => e.value)
    ),
    mipmapVolume: shaders.MipmapVolume(
      state.gpu,
      state.gpu.textures.volume,
      [16, 4, 4]
    ),
    mipmapAlbedo: shaders.MipmapVolume(
      state.gpu,
      state.gpu.textures.albedo,
      [16, 4, 4]
    ),
    mipmapFluence: shaders.MipmapVolume(
      state.gpu,
      state.gpu.textures.fluence,
      [16, 4, 4]
    ),
    computeFluence: shaders.ComputeFluence(
      state.gpu,
      state.gpu.textures.volume,
      state.gpu.textures.fluence,
      state.gpu.buffers.probes,
      [16, 4, 4]
    ),
    raymarchProbeRays: shaders.RaymarchProbeRays(
      state.gpu,
      state.gpu.textures.volume,
      state.gpu.buffers.probes,
      [256, 1, 1],
      maxLevelCount,
      pingPongBufferRayCount
    ),
    raymarchPrimaryRays: shaders.RaymarchPrimaryRays(
      state.gpu,
      state.gpu.textures.albedo,
      state.gpu.textures.fluence,
      state.gpu.textures.output,
      [16, 16, 1],
    ),
    blit: shaders.Blit(
      state.gpu,
      state.gpu.textures.output
    ),
  }

  async function InitGPU(ctx, probeBufferByteSize) {
    let adapter = await navigator.gpu.requestAdapter()
    let device = await adapter.requestDevice({
      requiredLimits: {
        maxStorageBufferBindingSize: probeBufferByteSize,
        maxBufferSize: probeBufferByteSize,
      },
    })
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

  const Param = (paramName, paramType, cb) => {
    let selector = `.${paramName}-control`
    let parentEl = controlEl.querySelector(selector)
    let el = parentEl.querySelector(['input', 'select'])
    if (!el) {
      console.warn("could not locate '%s input'", selector)
      return false
    }

    let value = 0;
    switch (el.type) {
      case 'checkbox': {
        if (el.checked) {
          value = el.value
        }
        break;
      }
      default: {
        value = el.value;
        break;
      }
    }

    switch (paramType) {
      case 'f32': {
        value = parseFloat(value);
        break;
      }
      case 'i32': {
        value = parseFloat(value) | 0;
        break;
      }
      case 'bool': {
        value = !!parseFloat(value) ? 1 : 0;
        break;
      }
      case 'color': {
        value = ParseColor(value)
        break;
      }
    }

    if (cb) {
      value = cb(parentEl, value)
    }

    if (state.params[paramName] != value) {
      state.params[paramName] = value
      state.dirty = true
      return true
    }
    return false
  }

  function ReadParams() {

    Param('debugRaymarchFixedSizeStepMultiplier', 'f32', (parentEl, value, oldValue) => {
      parentEl.querySelector('output').innerHTML = value;
      return value;
    })

    Param('debugMaxProbeLevel', 'i32', (parentEl, value, oldValue) => {
      parentEl.querySelector('output').innerHTML = value;
      return value;
    })

    Param('scene', 'string')

    Param('debugRenderRawFluence', 'f32')

    Param('branchingFactor', 'i32', (parentEl, value) => {
      let probeRayCount = state.params.probeRayCount;
      let displayValue = Math.pow(4, value)
      let examples = ([0, 1, 2, 3]).map(level => {
        let powed = probeRayCount * Math.pow(4, value * level)
        return powed
      })

      parentEl.querySelector('output').innerHTML = `
          4<sup class="highlight-blue">${value}</sup> = ${displayValue} (<span class="highlight-orange">${probeRayCount}</span> * 2<sup>(<span  class="highlight-blue">${value}</span> * level)</sup> = ${examples.join(', ')}, ...)
        `
      return displayValue
    })


    Param('intervalRadius', 'i32', (parentEl, value, oldValue) => {
      parentEl.querySelector('output').innerHTML = value;
      return value;
    })

    Param('probeRayCount', 'i32', (parentEl, value) => {
      let newValue = 6 * Math.pow(4, value)
      parentEl.querySelector('output').innerHTML = `6 * 4<sup>${value}</sup> = <span class="highlight-orange">${newValue}</span>`
      return newValue
    })

    Param('probeLatticeDiameter', 'i32', (parentEl, value) => {
      let newValue = Math.pow(2, value)
      parentEl.querySelector('output').innerHTML = `2<sup>${value}</sup> = ${newValue}`
      return newValue
    })

  }

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

    if (state.mouse.down) {
      let dx = state.mouse.pos[0] - state.mouse.lastPos[0]
      let dy = state.mouse.pos[1] - state.mouse.lastPos[1]

      state.mouse.lastPos[0] = state.mouse.pos[0]
      state.mouse.lastPos[1] = state.mouse.pos[1]

      if (Math.abs(dx) < 1.0 && Math.abs(dy) < 1.0) {
        return;
      }

      state.camera.rotate(-dx, -dy)
    }
  }, { passive: false })

  canvas.addEventListener("wheel", e => {
    state.camera.zoom(e.deltaY)
    state.dirty = true
    e.preventDefault()
  }, { passive: false })

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

    state.gpu.programs.buildScene(commandEncoder, state.params)

    state.gpu.programs.mipmapVolume(commandEncoder)
    state.gpu.programs.mipmapAlbedo(commandEncoder)

    const debugRaymarchFixedSizeStepMultiplier = 1.0;
    state.gpu.programs.raymarchProbeRays(
      commandEncoder,
      state.params
    )

    state.gpu.programs.computeFluence(commandEncoder, state.params)
    state.gpu.programs.mipmapFluence(commandEncoder)

    state.gpu.programs.raymarchPrimaryRays(
      commandEncoder,
      canvas.width,
      canvas.height,
      state.camera.state.eye,
      state.camera.state.worldToScreen,
      state.camera.state.screenToWorld,
      state.camera.state.fov,
      state.params
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