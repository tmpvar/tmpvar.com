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
  console.log(LevelColorFloats)

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

  state.camera.state.targetDistance = 200
  state.camera.state.scrollSensitivity = 0.1;

  try {
    state.gpu = await InitGPU(ctx);
  } catch (e) {
    console.error(e)
    rootEl.className = rootEl.className.replace('has-webgpu', '')
    return;
  }

  state.gpu.labelPrefix = "FuzzWorld3D/"


  const volumeDiameter = 256;
  state.gpu.textures = {
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

  const level0ProbeLatticeDiameter = 64
  const level0RaysPerProbe = 8
  const level0BytesPerProbeRay = 16
  const level0ProbeCount = Math.pow(level0ProbeLatticeDiameter, 3)
  const level0ProbeRayCount = level0RaysPerProbe * level0ProbeCount
  const probeBufferByteSize = level0ProbeRayCount * level0BytesPerProbeRay * 2

  state.gpu.buffers = {
    probes: state.gpu.device.createBuffer({
      label: 'ProbeBuffer',
      // Note: we need to ping-pong so the buffer needs to be doubled in size
      size: probeBufferByteSize,
      usage: GPUBufferUsage.STORAGE
    })
  }

  const shaders = {
    FillVolumeWithSphere(gpu, volumeTexture, workgroupSize) {
      const labelPrefix = gpu.labelPrefix + 'FillVolumeWithSphere/'
      const source =  /* wgsl */`
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

        @group(0) @binding(0) var texture: texture_storage_3d<rgba16float, write>;

        fn SampleSDF(pos: vec3f, dims: vec3f) -> f32 {
          let radius = 64.0;
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

        @compute @workgroup_size(${workgroupSize.join(',')})
        fn ComputeMain(@builtin(global_invocation_id) id: vec3<u32>) {
          textureStore(texture, id.xyz, vec4f(0.0, 0.0, 0.0, 0.0));
          let dims = vec3f(textureDimensions(texture));
          let pos = vec3f(id.xyz);
          var d0 = SampleSDF(pos, dims);

          var d1 = de(pos * 0.01) * 100.0;

          var color = vec3(0.0, 0.0, 0.0);
          var falloff = 10.0;
          var opacity = 0.1;
          var alpha = 1.0;
          if (abs(d1) <= 0.3) {
            falloff = 1.0;
            opacity = 0.25;
            color = vec3(1.0, 0.0, 0.4);
            // alpha = clamp(sqrt(-d1), 0.0, falloff) / falloff * opacity;
            // alpha = 0.015;
            alpha = opacity;
            textureStore(
              texture,
              id.xyz,
              vec4f(color, alpha)
            );
          }

          d0 = max(d0, -(d1 - 3.0));
          if (d0 <= 2.0) {
            color = vec3(1.0);
            opacity = 1.0;
            falloff = 1.0;
            alpha = opacity;
            // alpha = clamp(sqrt(d0), 0.0, falloff) / falloff * opacity;
            // alpha = (2.0 - max(0.0, d0)) * 0.5;
            textureStore(
              texture,
              id.xyz,
              vec4f(color, alpha)
            );
          }
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
              format: "rgba16float",
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
            resource: volumeTexture.createView({
              dimension: '3d',
              baseMipLevel: 0,
              mipLevelCount: 1,
            })
          },
        ]
      })

      return function FillVolumeWithSphere(commandEncoder) {
        const computePass = commandEncoder.beginComputePass()
        computePass.setPipeline(pipeline)
        computePass.setBindGroup(0, bindGroup)
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
        @group(0) @binding(1) var dst: texture_storage_3d<rgba16float, write>;

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
              format: "rgba16float",
              sampleType: 'float',
              viewDimension: '3d',
            },
          },
          {
            binding: 1,
            visibility: GPUShaderStage.COMPUTE,
            storageTexture: {
              format: "rgba16float",
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
      level0ProbeLatticeDiameter,
      level0ProbeRayCount
    ) {
      const labelPrefix = gpu.labelPrefix + 'RaymarchProbeRays/'

      const uboFields = [
        ['level', 'i32', 4],
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
        const level0ProbeLatticeDiameter: i32 = ${level0ProbeLatticeDiameter};
        const level0ProbeRayCount: u32 = ${level0ProbeRayCount};

        struct UBOParams {
          ${uboFields.map(i => `${i[0]}: ${i[1]},\n `).join('    ')}
        };

        @group(0) @binding(0) var<storage, read_write> probes: array<vec4f>;
        @group(0) @binding(1) var<uniform> ubo: UBOParams;
        @group(0) @binding(2) var volumeTexture: texture_3d<f32>;
        @group(0) @binding(3) var volumeSampler: sampler;

        @compute @workgroup_size(${workgroupSize.join(',')})
        fn ComputeMain(@builtin(global_invocation_id) id: vec3<u32>) {
          let dims = vec3f(textureDimensions(volumeTexture));

          let RayIndex = (
            id.x +
            id.y * ${workgroupSize[0]} +
            id.z * ${workgroupSize[0] * workgroupSize[0]}
          );

          let ProbeRayIndex = RayIndex % level0ProbeRayCount;
          let ProbeIndex = RayIndex / level0ProbeRayCount;
          // color based on ray index
          {
            var col = i32(ProbeIndex + 1) * vec3<i32>(158, 2 * 156, 3 * 159);
            col = col % vec3<i32>(255, 253, 127);
            probes[RayIndex] = vec4(vec3f(col), 1.0);
            // probes[RayIndex] = vec4(0.0, 1.0, 0.0, 1.0);
          }
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
            buffer: {
              type: 'storage'
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
              buffer: ubo
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
      ) {
        // update uniform buffer
        {
          let byteOffset = 0
          // TODO: prepopulate a ubo section for each level
          // level
          const level = 0
          uboData.setInt32(byteOffset, level, true)
          byteOffset += 4

          gpu.device.queue.writeBuffer(ubo, 0, uboBuffer)
        }

        const computePass = commandEncoder.beginComputePass()
        computePass.setPipeline(pipeline)
        computePass.setBindGroup(0, bindGroup)
        computePass.dispatchWorkgroups(
          Math.floor(level0ProbeLatticeDiameter / workgroupSize[0] + 1),
          Math.floor(level0ProbeLatticeDiameter / workgroupSize[1] + 1),
          Math.floor(level0ProbeLatticeDiameter / workgroupSize[2] + 1),
        )
        computePass.end()
      }
    },

    ComputeFluence(
      gpu,
      fluenceTexture,
      probeBuffer,
      workgroupSize,
      level0ProbeLatticeDiameter,
      level0RaysPerProbe
    ) {
      const labelPrefix = gpu.labelPrefix + 'RaymarchProbeRays/'
      const source =  /* wgsl */`
        const level0ProbeLatticeDiameter: i32 = ${level0ProbeLatticeDiameter};
        const level0RaysPerProbe: i32 = ${level0RaysPerProbe};
        const otherDimStride: i32 = ${level0RaysPerProbe * level0ProbeLatticeDiameter};
        const otherDimStride2: i32 = ${Math.pow(level0RaysPerProbe * level0ProbeLatticeDiameter, 2)};

        @group(0) @binding(0) var<storage, read_write> probes: array<vec4f>;
        @group(0) @binding(1) var outTexture: texture_storage_3d<rgba16float, write>;

        @compute @workgroup_size(${workgroupSize.join(',')})
        fn ComputeMain(@builtin(global_invocation_id) id: vec3<u32>) {
          let dims = vec3f(textureDimensions(outTexture));
          let uvw = vec3f(id) / dims;
          let Index = vec3<i32>(uvw * f32(level0ProbeLatticeDiameter));
          let StartIndex = (
            Index.x * level0RaysPerProbe +
            Index.y * otherDimStride +
            Index.z * otherDimStride * otherDimStride
          );

          var acc = vec4f(0.0);
          for (var probeRayIndex = 0; probeRayIndex<level0RaysPerProbe; probeRayIndex++) {
            acc += probes[StartIndex + probeRayIndex];
          }
          textureStore(outTexture, id, acc / f32(level0RaysPerProbe));
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
        ]
      })

      return function ComputeFluence(
        commandEncoder,
      ) {
        const computePass = commandEncoder.beginComputePass()
        computePass.setPipeline(pipeline)
        computePass.setBindGroup(0, bindGroup)
        computePass.dispatchWorkgroups(
          Math.floor(level0ProbeLatticeDiameter / workgroupSize[0] + 1),
          Math.floor(level0ProbeLatticeDiameter / workgroupSize[1] + 1),
          Math.floor(level0ProbeLatticeDiameter / workgroupSize[2] + 1),
        )
        computePass.end()
      }
    },

    RaymarchPrimaryRays(
      gpu,
      volumeTexture,
      outputTexture,
      workgroupSize,
      level0ProbeLatticeDiameter
    ) {
      const labelPrefix = gpu.labelPrefix + 'RaymarchPrimaryRays/'


      const uboFields = [
        ['worldToScreen', 'mat4x4<f32>', 16 * 4],
        ['screenToWorld', 'mat4x4<f32>', 16 * 4],
        ['eye', 'vec4f', 16],
        ['width', 'i32', 4],
        ['height', 'i32', 4],
        ['fov', 'f32', 4],
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
        const level0ProbeLatticeDiameter: i32 = ${level0ProbeLatticeDiameter};

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

        @group(0) @binding(0) var outputTexture: texture_storage_2d<rgba8unorm, write>;
        @group(0) @binding(1) var<uniform> ubo: UBOParams;
        @group(0) @binding(2) var volumeTexture: texture_3d<f32>;
        @group(0) @binding(3) var volumeSampler: sampler;

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
            (ubo.eye.x > -boxRadius.x && ubo.eye.x < boxRadius.x) &&
            (ubo.eye.y > -boxRadius.y && ubo.eye.y < boxRadius.y) &&
            (ubo.eye.z > -boxRadius.z && ubo.eye.z < boxRadius.z)
          ) {
            textureStore(
              outputTexture,
              id.xy,
              vec4f(1.0, 1.0, 1.0, 1.0)
            );
            // return;
          } else {
            aabbHitT = RayAABB(-boxRadius, boxRadius, ubo.eye.xyz, 1.0 / rayDir);
          }


          var acc = vec4f(0.0);
          var energy = 1.0;
          var steps = 256;
          if (aabbHitT >= 0.0) {
            let aabbHit = ubo.eye.xyz + rayDir * aabbHitT;

            // TODO: improve this by sampling mips and increasing the step size
            var t = 0.0;
            var stepSize = 0.001;
            let levelCount = f32(log2(dims.x));
            var level = 0.0;
            while(true) {
              steps--;
              if (steps < 0) {
                acc = vec4(1.0, 0.0, 0.0, 1.0);
                // textureStore(
                //   outputTexture,
                //   id.xy,
                //   vec4(1.0, 0.0, 0.0, 1.0)
                // );
                break;
              }

              t += max(1.0, t * stepSize);
              let hitPos = aabbHit + rayDir * t;
              let uvw = (hitPos / boxRadius) * 0.5 + 0.5;

              if (
                (uvw.x < 0.0 || uvw.x >= 1.0) ||
                (uvw.y < 0.0 || uvw.y >= 1.0) ||
                (uvw.z < 0.0 || uvw.z >= 1.0)
              ) {
                break;
              }

              // var c = (
              //   textureSampleLevel(volumeTexture, volumeSampler, uvw, level + 0)
              //   + textureSampleLevel(volumeTexture, volumeSampler, uvw, level + 0.5)
              // //   // + textureSampleLevel(volumeTexture, volumeSampler, uvw, level + 2)
              // ) / 2.0;

              // c.a *= stepSize;

              let percent = 0.125 * t * tan(ubo.fov * 0.5) / f32(dims.x / 2);
              level = percent * levelCount;

              // stepSize = percent * percent * percent * dims.x;
              stepSize = 0.0125 * level;
              // stepSize = 1.0 / (level + 2);
              // stepSize = 0.0125;//t * level;//tan(ubo.fov * 0.5) / f32(dims.x / 2);//0.0125 * t * tan(ubo.fov * 0.5) / f32(dims.x / 2);
              // stepSize = max(0.1, f32(dims.x * 0.05) * percent * max(1.0, level));
              // stepSize = 0.5;

              var c = textureSampleLevel(volumeTexture, volumeSampler, uvw, level);
              if (c.a > 0.0) {
                var a0 = acc.a + c.a * (1.0 - acc.a);
                acc = vec4f(
                  (acc.rgb * acc.a + c.rgb * c.a * (1.0 - acc.a)) / a0,
                  a0
                );
              }

              // var alpha = acc.a + (1.0 - acc.a) * c.a;
              // acc = vec4(
              //   acc.rgb * alpha + (1.0 - alpha) * c.a * c.rgb,
              //   alpha
              // );

            }
          }


          // let backgroundColor = rayDir * 0.5 + 0.5;
          let backgroundColor = vec4f(0.1, 0.1, 0.1, 1.0);
          // if (energy >= 1.0) {
          //   textureStore(
          //     outputTexture,
          //     id.xy,
          //     backgroundColor
          //   );
          // } else {
            let alpha = 1.0 - acc.a;
            let color = vec4(
              acc.rgb * acc.a + backgroundColor.rgb * alpha,
              1.0
            );

            textureStore(
              outputTexture,
              id.xy,
              color
            );
          // }
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

      return function RaymarchPrimaryRays(
        commandEncoder,
        width,
        height,
        eye,
        worldToScreen,
        screenToWorld,
        fov
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

          // height
          uboData.setFloat32(byteOffset, fov, true)
          byteOffset += 4

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
    fillVolume: shaders.FillVolumeWithSphere(
      state.gpu,
      state.gpu.textures.volume,
      [16, 4, 4]
    ),
    mipmapVolume: shaders.MipmapVolume(
      state.gpu,
      state.gpu.textures.volume,
      [16, 4, 4]
    ),
    mipmapFluence: shaders.MipmapVolume(
      state.gpu,
      state.gpu.textures.fluence,
      [16, 4, 4]
    ),
    computeFluence: shaders.ComputeFluence(
      state.gpu,
      state.gpu.textures.fluence,
      state.gpu.buffers.probes,
      [16, 4, 4],
      level0ProbeLatticeDiameter,
      level0RaysPerProbe
    ),
    raymarchProbeRays: shaders.RaymarchProbeRays(
      state.gpu,
      state.gpu.textures.volume,
      state.gpu.buffers.probes,
      [256, 1, 1],
      level0ProbeLatticeDiameter,
      level0RaysPerProbe
    ),
    raymarchPrimaryRays: shaders.RaymarchPrimaryRays(
      state.gpu,
      state.gpu.textures.volume,
      state.gpu.textures.output,
      [16, 16, 1],
      level0ProbeLatticeDiameter
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

    state.gpu.programs.fillVolume(commandEncoder)

    state.gpu.programs.mipmapVolume(commandEncoder)

    state.gpu.programs.raymarchProbeRays(commandEncoder)

    state.gpu.programs.raymarchPrimaryRays(
      commandEncoder,
      canvas.width,
      canvas.height,
      state.camera.state.eye,
      state.camera.state.worldToScreen,
      state.camera.state.screenToWorld,
      state.camera.state.fov
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