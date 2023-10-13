import CreateOrbitCamera from './orbit-camera.js'
import CreateParamReader from './params.js'
import * as mesh from './primitives.js'
import * as mat4 from './gl-matrix/mat4.js'
import * as vec3 from './gl-matrix/vec3.js'

async function ScreenSpace3DBegin(rootEl) {

  function Now() {
    if (window.performance && window.performance.now) {
      return window.performance.now()
    } else {
      return Time.now()
    }
  }

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
  state.camera.state.targetDistance = 10
  state.camera.state.distance = state.camera.state.targetDistance
  state.camera.state.scrollSensitivity = 0.01;

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
      let dx = state.mouse.lastPos[0] - state.mouse.pos[0]
      let dy = -(state.mouse.lastPos[1] - state.mouse.pos[1])

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
  const ObjectBufferEntrySize = (
    16 +      //   albedo (rgb, a=objectType)
    16 +      //   emission (rgb, a=unused)
    16 * 4    // transform
  )
  const maxSceneObjects = 1 << 4;
  try {
    state.gpu = await InitGPU(ctx, probeBufferByteSize);
    state.gpu.labelPrefix = "ScreenSpace3D/"

    const objectsBufferSize = maxSceneObjects * ObjectBufferEntrySize
    state.objectsArrayBuffer = new ArrayBuffer(objectsBufferSize)

    state.gpu.buffers = {
      probes: state.gpu.device.createBuffer({
        label: `${state.gpu.labelPrefix}Buffers/Probes`,
        size: probeBufferByteSize,
        usage: GPUBufferUsage.STORAGE
      }),
      objects: state.gpu.device.createBuffer({
        label: `${state.gpu.labelPrefix}Buffers/Probes`,
        size: objectsBufferSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
      })
    }
  } catch (e) {
    console.error(e)
    rootEl.className = rootEl.className.replace('has-webgpu', '')
    return;
  }

  // Build Meshes
  state.meshes = {
    box: { typeID: 0, mesh: mesh.CreateCube(state.gpu) },
    sphere: { typeID: 1, mesh: mesh.CreateSphere(state.gpu, 3) },
  }

  async function InitGPU(ctx, probeBufferByteSize) {
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

  const Param = CreateParamReader(state, controlEl)
  function ReadParams() {
    // debug params
    {
      Param('debugMaxProbeLevel', 'i32')

      Param('debugRenderObjectIDBuffer', 'bool')
      Param('debugRenderObjectTypeIDBuffer', 'bool')

      Param('debugRenderRawFluence', 'bool')
      Param('debugRenderNormals', 'bool')
      Param('debugRenderDepth', 'bool')
    }

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
          let powed = probeRayCount * Math.pow(2, value * level)
          return powed
        })

        parentEl.querySelector('output').innerHTML = `
          2<sup class="highlight-blue">${value}</sup> = ${displayValue} (<span class="highlight-orange">${probeRayCount}</span> * 2<sup>(<span  class="highlight-blue">${value}</span> * level)</sup> = ${examples.join(', ')}, ...)
        `
        return value
      })

      Param('intervalRadius', 'i32', (parentEl, value) => {
        parentEl.querySelector('output').innerHTML = `${value}`
        return value
      })

      Param('scene', 'string')
    }
  }

  const WGSLObjectDataStruct = /* wgsl */`
        struct ObjectData {
          // props: mat4x4<f32>,
          // rgb, a=objectType
          albedo: vec4f,
          // rgb, a=unused
          emission: vec4f,
          transform: mat4x4<f32>,
        };
  `

  const shaders = {
    DebugBlitBase(gpu, textureDesc, objectsBuffer, fragCode) {
      const outputTexture = textureDesc.texture;
      const labelPrefix = `${outputTexture.label}DebugBlit/`
      const device = gpu.device
      const presentationFormat = gpu.presentationFormat

      let textureFormat = 'f32'
      let sampleType = 'float'
      if (textureDesc.aspect === 'depth-only') {
        sampleType = 'unfilterable-float'
      } else if (outputTexture.format.indexOf('32float') > 1) {
        sampleType = 'unfilterable-float'
      } else if (outputTexture.format.indexOf('uint') > -1) {
        textureFormat = 'u32'
        sampleType = 'uint'
      } else if (outputTexture.format.indexOf('int') > -1) {
        textureFormat = 'i32'
        sampleType = 'int'
      }

      const source = /* wgsl */`
        struct VertexOut {
          @builtin(position) position : vec4f,
          @location(0) uv: vec2f,
        };

        ${WGSLObjectDataStruct}

        @group(0) @binding(0) var outputTexture: texture_2d<${textureFormat}>;
        @group(0) @binding(1) var<storage> objectData: array<ObjectData>;

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
          output.uv.y = 1.0 - output.uv.y;
          return output;
        }

        ${fragCode}
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
              sampleType: sampleType,
            },
          },
          {
            binding: 1,
            visibility: GPUShaderStage.FRAGMENT,
            buffer: {
              type: 'read-only-storage',
            },
          },
        ]
      })

      const pipeline = device.createRenderPipeline({
        label: `${labelPrefix}RenderPipeline`,
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
            resource: outputTexture.createView({
              dimenion: '2d',
              baseMipLevel: 0,
              mipLevelCount: outputTexture.baseMipLevel,
              aspect: textureDesc.aspect,
            })
          },
          {
            binding: 1,
            resource: {
              buffer: objectsBuffer,
            }
          },
        ]
      })

      return async function DebugWorldBlit(
        commandEncoder,
        frameTextureView,
      ) {

        // Note: apparently mapping the staging buffer can take multiple frames?
        let colorAttachment = {
          view: frameTextureView,
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
        pass.setViewport(0, 0, canvas.width, canvas.height, 0, 1);
        pass.setScissorRect(0, 0, canvas.width, canvas.height);
        pass.draw(3);
        pass.end();
      }
    },

    DebugBlitObjectID(gpu, outputTexture, objectsBuffer) {
      const fragCode = /* wgsl */`
        @fragment
        fn FragmentMain(fragData: VertexOut) -> @location(0) vec4f {
          let pos = vec2<i32>(fragData.uv * vec2f(textureDimensions(outputTexture)));
          let objectID = textureLoad(outputTexture, pos, 0).r;
          if (objectID == 0xFFFF) {
            return vec4(0.0);
          }

          var col = i32(objectID + 1) * vec3<i32>(158, 2 * 156, 3 * 159);
          col = col % vec3<i32>(255, 253, 127);
          return vec4(vec3f(col) / 255.0, 1.0);
        }
      `
      return this.DebugBlitBase(gpu, { texture: outputTexture }, objectsBuffer, fragCode)
    },

    DebugBlitObjectTypeID(gpu, outputTexture, objectsBuffer) {
      const fragCode = /* wgsl */`
        @fragment
        fn FragmentMain(fragData: VertexOut) -> @location(0) vec4f {
          let pos = vec2<i32>(fragData.uv * vec2f(textureDimensions(outputTexture)));
          let objectID = textureLoad(outputTexture, pos, 0).r;
          if (objectID == 0xFFFF) {
            return vec4(0.0);
          }

          let typeID = objectData[objectID].albedo.a;
          var col = i32(typeID + 1) * vec3<i32>(158, 2 * 156, 3 * 159);
          col = col % vec3<i32>(255, 253, 127);
          return vec4(vec3f(col) / 255.0, 1.0);
        }
      `
      return this.DebugBlitBase(
        gpu, {
        texture: outputTexture
      }, objectsBuffer, fragCode)
    },

    DebugBlitFluence(gpu, fluenceTexture, objectsBuffer) {
      const fragCode = /* wgsl */`
        @fragment
        fn FragmentMain(fragData: VertexOut) -> @location(0) vec4f {
          let pos = vec2<i32>(fragData.uv * vec2f(textureDimensions(outputTexture)));
          let value = textureLoad(outputTexture, pos, 0);
          if (value.x == 0 && value.y == 0 && value.z == 0) {
            return vec4(0.0);
          }
          return value;
        }
      `
      return this.DebugBlitBase(gpu, { texture: fluenceTexture }, objectsBuffer, fragCode)
    },

    DebugBlitNormals(gpu, normalTexture, objectsBuffer) {
      const fragCode = /* wgsl */`
        @fragment
        fn FragmentMain(fragData: VertexOut) -> @location(0) vec4f {
          let pos = vec2<i32>(fragData.uv * vec2f(textureDimensions(outputTexture)));
          let value = textureLoad(outputTexture, pos, 0).rgb;
          if (value.x == 0 && value.y == 0 && value.z == 0) {
            return vec4(0.0);
          }

          return vec4(value * 0.5 + 0.5, 1.0);
        }
      `
      return this.DebugBlitBase(gpu, { texture: normalTexture }, objectsBuffer, fragCode)
    },

    DebugBlitDepth(gpu, depthTexture, objectsBuffer) {
      const fragCode = /* wgsl */`
        fn LinearizeDepth(depth: f32) -> f32{
          let zNear = 0.2; // TODO: Replace by the zNear of your perspective projection
          let zFar = 20.0; // TODO: Replace by the zFar  of your perspective projection

          return (2.0 * zNear) / (zFar + zNear - depth * (zFar - zNear));
        }

        @fragment
        fn FragmentMain(fragData: VertexOut) -> @location(0) vec4f {
          let pos = vec2<i32>(fragData.uv * vec2f(textureDimensions(outputTexture)));
          let depth = textureLoad(outputTexture, pos, 0).r;
          let linearDepth = LinearizeDepth(depth);
          return vec4f(linearDepth);
        }
      `
      return this.DebugBlitBase(
        gpu,
        {
          texture: depthTexture,
          aspect: 'depth-only'
        },
        objectsBuffer,
        fragCode
      )
    },

    RenderTriangleSoup(
      gpu,
      instances,
      objectsBuffer,
      objectIDStart,
      objectIDTexture,
      depthTexture,
      normalTexture,
      presentationFormat
    ) {
      const labelPrefix = gpu.labelPrefix + 'RenderMesh/'
      const device = gpu.device
      const uboFields = [
        ['eye', 'vec4f', 16],
        ['worldToScreen', 'mat4x4<f32>', 16 * 4],
      ]

      let uboBufferSize = uboFields.reduce((p, c) => {
        return p + c[2]
      }, 0)
      uboBufferSize = Math.floor(uboBufferSize / 16 + 1) * 16
      const uboBuffer = new ArrayBuffer(uboBufferSize)
      const uboData = new DataView(uboBuffer)
      const ubo = device.createBuffer({
        label: `${labelPrefix}UBO`,
        size: uboBuffer.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      })

      const source = /* wgsl */`
        struct VertexOut {
          @builtin(position) position : vec4f,
          @location(0) color: vec3f,
          @interpolate(flat) @location(1) objectID: u32,
          @location(2) worldPosition: vec3f,
        }

        struct UBOParams {
          ${uboFields.map(v => `${v[0]}: ${v[1]},`).join('\n          ')}
        };

        ${WGSLObjectDataStruct}

        @group(0) @binding(0) var<uniform> ubo: UBOParams;
        @group(0) @binding(1) var<storage> objectData: array<ObjectData>;

        @vertex
        fn VertexMain(
          @location(0) inPosition: vec3f,
          @location(1) inNormal: vec3f,
          @builtin(instance_index) instanceIndex: u32
        ) -> VertexOut {
          var out: VertexOut;
          let objectID = ${objectIDStart} + instanceIndex;
          let worldPosition = objectData[objectID].transform * vec4(inPosition, 1.0);
          out.worldPosition = worldPosition.xyz - ubo.eye.xyz;
          out.position = ubo.worldToScreen * worldPosition;
          out.color = objectData[objectID].albedo.rgb;
          out.objectID = objectID;
          return out;
        }

        struct FragmentOut {
          @location(0) color: vec4f,
          @location(1) objectID: u32,
          @location(2) normal: vec4f,
        };

        @fragment
        fn FragmentMain(fragData: VertexOut) -> FragmentOut {
          var out: FragmentOut;
          out.color = vec4(fragData.color, 1.0);
          out.objectID = fragData.objectID;

          let dFdxPos = dpdx(fragData.worldPosition);
          let dFdyPos = -dpdy(fragData.worldPosition);
          let normal = normalize(cross(dFdxPos, dFdyPos));

          out.normal = vec4(normal, 1.0);
          return out;
        }
      `

      const shaderModule = gpu.device.createShaderModule({
        label: `${labelPrefix}ShaderModule`,
        code: source,
      })

      const bindGroupLayout = gpu.device.createBindGroupLayout({
        label: `${labelPrefix}BindGroupLayout`,
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.VERTEX,
            buffer: {
              type: 'uniform',
            }
          },
          {
            binding: 1,
            visibility: GPUShaderStage.VERTEX,
            buffer: {
              type: 'read-only-storage',
            },
          },
        ]
      })

      const pipeline = device.createRenderPipeline({
        label: `${labelPrefix}RenderPipeline`,
        vertex: {
          module: shaderModule,
          entryPoint: 'VertexMain',
          buffers: [
            // position
            {
              attributes: [{
                shaderLocation: 0,
                offset: 0,
                format: 'float32x3',
              }],
              arrayStride: 12,
              stepMode: 'vertex',
            },
            // normal
            {
              attributes: [{
                shaderLocation: 1,
                offset: 0,
                format: 'float32x3',
              }],
              arrayStride: 12,
              stepMode: 'vertex'
            },
          ]
        },
        fragment: {
          module: shaderModule,
          entryPoint: 'FragmentMain',
          targets: [{
            format: presentationFormat,
          }, {
            format: objectIDTexture.format,
            writeMask: GPUColorWrite.RED,
          }, {
            format: normalTexture.format
          }]
        },
        primitive: {
          topology: 'triangle-list',
          cullMode: 'back',
          frontFace: 'cw',
        },
        depthStencil: {
          depthWriteEnabled: true,
          depthCompare: 'less',
          format: depthTexture.format,
        },
        layout: device.createPipelineLayout({
          bindGroupLayouts: [
            bindGroupLayout
          ]
        })
      })

      const bindGroup = device.createBindGroup({
        label: `${labelPrefix}BindGroup`,
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          {
            binding: 0,
            resource: {
              buffer: ubo
            }
          },
          {
            binding: 1,
            resource: {
              buffer: objectsBuffer,
            }
          },
        ]
      })

      return function RenderMesh(pass, worldToScreen, eye) {
        // update the uniform buffer
        {
          let byteOffset = 0

          eye.forEach(v => {
            uboData.setFloat32(byteOffset, v, true)
            byteOffset += 4;
          })
          byteOffset += 4

          worldToScreen.forEach(v => {
            uboData.setFloat32(byteOffset, v, true)
            byteOffset += 4;
          })

          gpu.device.queue.writeBuffer(ubo, 0, uboBuffer)
        }

        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup)
        pass.setViewport(0, 0, canvas.width, canvas.height, 0, 1);
        pass.setScissorRect(0, 0, canvas.width, canvas.height);
        pass.setVertexBuffer(0, instances.mesh.positionBuffer);
        pass.setVertexBuffer(1, instances.mesh.normalBuffer);
        pass.draw(instances.mesh.vertexCount, instances.count);
      }
    },

    ScreenSpaceBruteForce(
      gpu,
      fluencePreviousTexture,
      fluenceCurrentTexture,
      depthTexture,
      objectIDTexture,
      normalTexture,
      objectBuffer,
      workgroupSize,
      raysPerPixel,
    ) {
      const labelPrefix = `${gpu.labelPrefix}ScreenSpaceBruteForce/`
      const sampler = gpu.device.createSampler({
        label: `${labelPrefix}Sampler`,
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
        magFilter: 'linear',
        minFilter: 'linear',
        mipmapFilter: 'linear',
      })

      const uboFields = [
        ['eye', 'vec4f', 16],
        ['worldToScreen', 'mat4x4<f32>', 16 * 4],
        ['screenToWorld', 'mat4x4<f32>', 16 * 4],
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

      const source =  /* wgsl */`
        const PI: f32 = ${Math.PI};
        const TAU: f32 = ${Math.PI * 2.0};

        struct UBOParams {
          ${uboFields.map(v => `${v[0]}: ${v[1]},`).join('\n          ')}
        };

        fn LinearizeDepth(depth: f32) -> f32{
          let zNear = 0.2; // TODO: Replace by the zNear of your perspective projection
          let zFar = 20.0; // TODO: Replace by the zFar  of your perspective projection

          return (2.0 * zNear) / (zFar + zNear - depth * (zFar - zNear));
        }

        fn JetLinearRescale(u: f32, v: f32, x: f32) -> f32 {
          return (x - u) / (v - u);
        }

        fn JetLinear(t: f32) -> vec3f {
          const color0 = vec3f(0.0, 0.0, 0.5625); // blue
          const u1 = 1.0 / 9.0;
          const color1 = vec3f(0.0, 0.0, 1.0); // blue
          const u2 = 23.0 / 63.0;
          const color2 = vec3f(0.0, 1.0, 1.0); // cyan
          const u3 = 13.0 / 21.0;
          const color3 = vec3f(1.0, 1.0, 0.0); // yellow
          const u4 = 47.0 / 63.0;
          const color4 = vec3f(1.0, 0.5, 0.0); // orange
          const u5 = 55.0 / 63.0;
          const color5 = vec3f(1.0, 0.0, 0.0); // red
          const color6 = vec3(0.5, 0.0, 0.0); // red
          return mix(color0, color1, JetLinearRescale(0.0, u1, t)) +
                (mix(color1, color2, JetLinearRescale(u1, u2, t)) -
                  mix(color0, color1, JetLinearRescale(0.0, u1, t))) *
                  step(u1, t) +
                (mix(color2, color3, JetLinearRescale(u2, u3, t)) -
                  mix(color1, color2, JetLinearRescale(u1, u2, t))) *
                  step(u2, t) +
                (mix(color3, color4, JetLinearRescale(u3, u4, t)) -
                  mix(color2, color3, JetLinearRescale(u2, u3, t))) *
                  step(u3, t) +
                (mix(color4, color5, JetLinearRescale(u4, u5, t)) -
                  mix(color3, color4, JetLinearRescale(u3, u4, t))) *
                  step(u4, t) +
                (mix(color5, color6, JetLinearRescale(u5, 1.0, t)) -
                  mix(color4, color5, JetLinearRescale(u4, u5, t))) *
                  step(u5, t);
        }

        ${WGSLObjectDataStruct}

        @group(0) @binding(0) var fluenceWriteTexture: texture_storage_2d<rgba32float, write>;
        @group(0) @binding(1) var fluenceReadTexture: texture_2d<f32>;
        @group(0) @binding(2) var depthTexture: texture_depth_2d;
        @group(0) @binding(3) var linearSampler: sampler;
        @group(0) @binding(4) var objectIDTexture: texture_2d<u32>;
        @group(0) @binding(5) var normalTexture: texture_2d<f32>;
        @group(0) @binding(6) var<storage, read_write> objectData: array<ObjectData>;
        @group(0) @binding(7) var<uniform> ubo: UBOParams;

        fn GetWorldPos(uv: vec2f) -> vec3f {
          let depth = textureSampleLevel(depthTexture, linearSampler, uv, 0);
          let worldPos = ubo.screenToWorld * vec4f(uv, depth, 1.0);
          return worldPos.xyz / worldPos.w;
        }

        fn GetDepth(uv: vec2f) -> f32 {
          let depth = textureSampleLevel(depthTexture, linearSampler, uv, 0);
          if (false) {
            return LinearizeDepth(depth);
          }
          return depth;
        }

        @compute @workgroup_size(${workgroupSize.join(',')})
        fn ComputeMain(@builtin(global_invocation_id) id: vec3<u32>) {
          let dims = vec2f(textureDimensions(depthTexture));
          let invDims = 1.0 / dims;
          let halfInvDims = invDims * 0.5;
          let uv = vec2f(id.xy) * invDims;

          let startingDepth = GetDepth(uv);
          let normal = textureSampleLevel(normalTexture, linearSampler, uv, 0).xyz;
          var fluence = vec3f(0.0);

          let objectID = textureLoad(objectIDTexture, vec2<u32>(dims * uv), 0).r;
          if (objectID == 0xFFFF) {
            textureStore(fluenceWriteTexture, id.xy, vec4(0.0));
            return;
          } else {
            fluence = objectData[objectID].emission.rgb;
          }
          // textureStore(fluenceWriteTexture, id.xy, vec4(startingDepth));
          // return;

          let rayCount = 64.0;
          let angleStep = TAU / (rayCount+1);
          let thickness = 0.5;
          var hits = 0.0;
          for (var angle=0.0; angle<TAU; angle+=angleStep) {
            var steps = 64;
            var sampleUV = uv + halfInvDims;

            var direction = vec2f(cos(angle), sin(angle));

            // scale the direction so it steps through uv coords
            direction *= invDims;

            let uvOffset = direction;
            let ta = textureSampleLevel(depthTexture, linearSampler, uv - uvOffset, 0);
            let tb = textureSampleLevel(depthTexture, linearSampler, uv + uvOffset, 0);


            var tangentSlope = 0.0;
            if (ta >= 1.0) {
              tangentSlope = (tb - startingDepth) / (length(uvOffset));
            } else if (tb >= 1.0) {
              tangentSlope = (startingDepth - ta) / (length(uvOffset));
            } else {
              tangentSlope = (tb - ta) / (length(uvOffset) * 2.0);
            }

            // fluence = vec3(abs(tangentSlope), 0.0, 0.0);
            // break;
            var horizonSlope = 1.0;
            let thickness = 0.001;
            var t = 0.0;
            while(steps > 0) {
              steps--;
              t = max(1.0, t * 1.25);

              sampleUV = uv + direction * t;
              let depth = GetDepth(sampleUV);

              let horizonAtT = startingDepth + horizonSlope * t;
              let depthDelta = depth - horizonAtT;
              if (depthDelta <= 0.0) {
                horizonSlope = min(horizonSlope, (depth - startingDepth) / t);
                let objectID = textureLoad(objectIDTexture, vec2<u32>(dims * sampleUV), 0).r;
                if (objectID < 0xFFFF) {
                  let radiance = objectData[objectID].emission.rgb;
                  // let tangentAtT = startingDepth + tangentSlope * t;
                  var ratio = 1.0;
                  if (depthDelta < 0.0) {
                    ratio = LinearizeDepth(-depthDelta);
                  }

                  fluence += radiance * ratio;

                  if (radiance.x > 0.0 || radiance.y > 0.0 || radiance.z >= 0.0) {
                    hits = hits + 1.0;
                  }
                }
              }
            }
          }

          // if (hits == hits && hits > 0.0) {
          //   fluence /= hits;
          // } else {
          //   fluence = normal;
          // }

          // if (fluence.x <= 0.0 && fluence.y <= 0.0 && fluence.z <= 0.0) {
          //   fluence = normal * 0.5 + 0.5;
          // }


          textureStore(fluenceWriteTexture, id.xy, vec4(fluence, 1.0));
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
              format: "rgba32float"
            },
          },
          {
            binding: 1,
            visibility: GPUShaderStage.COMPUTE,
            texture: {
              sampleType: 'unfilterable-float',
            },
          },
          {
            binding: 2,
            visibility: GPUShaderStage.COMPUTE,
            texture: {
              sampleType: 'depth',
            },
          },
          {
            binding: 3,
            visibility: GPUShaderStage.COMPUTE,
            sampler: {
              type: "filtering"
            },
          },
          {
            binding: 4,
            visibility: GPUShaderStage.COMPUTE,
            texture: {
              sampleType: 'uint',
              viewDimension: '2d',
            },
          },
          {
            binding: 5,
            visibility: GPUShaderStage.COMPUTE,
            texture: {
              format: "float"
            },
          },
          {
            binding: 6,
            visibility: GPUShaderStage.COMPUTE,
            buffer: {
              type: 'storage'
            },
          },
          {
            binding: 7,
            visibility: GPUShaderStage.COMPUTE,
            buffer: {
              type: 'uniform',
              hasDynamicOffset: false,
            }
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
            resource: fluenceCurrentTexture.createView(),
          },
          {
            binding: 1,
            resource: fluencePreviousTexture.createView(),
          },
          {
            binding: 2,
            resource: depthTexture.createView({
              dimension: '2d',
              baseMipLevel: 0,
              mipLevelCount: depthTexture.mipLevelCount,
              aspect: 'depth-only',
            })
          },
          {
            binding: 3,
            resource: sampler,
          },
          {
            binding: 4,
            resource: objectIDTexture.createView()
          },
          {
            binding: 5,
            resource: normalTexture.createView()
          },
          {
            binding: 6,
            resource: {
              buffer: objectBuffer
            }
          },
          {
            binding: 7,
            resource: {
              buffer: ubo,
              size: uboBufferSize,
            }
          },
        ]
      })


      return function ScreenSpaceBruteForce(commandEncoder, screenToWorld) {
        // update the uniform buffer
        {
          let byteOffset = 0
          screenToWorld.forEach(v => {
            uboData.setFloat32(byteOffset, v, true)
            byteOffset += 4;
          })
          gpu.device.queue.writeBuffer(ubo, 0, uboBuffer)
        }



        commandEncoder.copyTextureToTexture(
          { texture: fluenceCurrentTexture },
          { texture: fluencePreviousTexture },
          [
            fluenceCurrentTexture.width,
            fluenceCurrentTexture.height,
            1
          ]
        )

        const computePass = commandEncoder.beginComputePass()
        computePass.setPipeline(pipeline)
        computePass.setBindGroup(0, bindGroup)
        computePass.dispatchWorkgroups(
          Math.floor(depthTexture.width / workgroupSize[0] + 1),
          Math.floor(depthTexture.height / workgroupSize[1] + 1),
          1
        )
        computePass.end()
      }
    }
  }

  const textures = {
    depth: state.gpu.device.createTexture({
      label: `${state.gpu.labelPrefix}DepthTexture/`,
      size: [canvas.width, canvas.height],
      dimension: '2d',
      usage: (
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC
      ),
      format: 'depth24plus-stencil8'
    }),

    objectID: state.gpu.device.createTexture({
      label: `${state.gpu.labelPrefix}ObjectIDTexture/`,
      size: [canvas.width, canvas.height],
      dimension: '2d',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING,
      // Note: I'm using u32 here because I want to use the format property to setup DebugBlit and
      //       r16uint is not supported for storage textures..
      format: 'r32uint',

    }),

    normals: state.gpu.device.createTexture({
      label: `${state.gpu.labelPrefix}Normals`,
      size: [canvas.width, canvas.height],
      dimension: '2d',
      usage: (
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING
      ),
      format: 'rgba16float',
    }),

    fluenceCurrent: state.gpu.device.createTexture({
      label: `${state.gpu.labelPrefix}Fluence/Current`,
      size: [canvas.width, canvas.height],
      dimension: '2d',
      usage: (
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING
      ),
      format: 'rgba32float',
    }),

    fluencePrevious: state.gpu.device.createTexture({
      label: `${state.gpu.labelPrefix}Fluence/Previous`,
      size: [canvas.width, canvas.height],
      dimension: '2d',
      usage: (
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING
      ),
      format: 'rgba32float',
    }),
  }

  function CreateMeshInstances(typeID, mesh, dataView, count) {

    // store the mesh typeID in the albedo.a channel
    {
      for (let i = 0; i < count; i++) {
        let offset = i * ObjectBufferEntrySize;
        dataView.setFloat32(offset, mesh.typeID, true)
      }
    }

    const instances = {
      count: count,
      dataView: dataView,
      mesh: mesh,

      getTransform(index, out) {
        let start = index * ObjectBufferEntrySize + 16 * 2;
        for (let i = 0; i < 16; i++) {
          out[i] = dataView.getFloat32(start + i * 4, true)
        }
      },

      setTransform(index, transform) {
        let start = index * ObjectBufferEntrySize + 16 * 2;
        for (let i = 0; i < 16; i++) {
          dataView.setFloat32(start + i * 4, transform[i], true)
        }
      },

      getAlbedo(index, out) {
        let start = index * ObjectBufferEntrySize
        out[0] = dataView.getFloat32(start + 0, true)
        out[1] = dataView.getFloat32(start + 4, true)
        out[2] = dataView.getFloat32(start + 8, true)
      },
      setAlbedo(index, value) {
        let start = index * ObjectBufferEntrySize
        dataView.setFloat32(start + 0, value[0], true)
        dataView.setFloat32(start + 4, value[1], true)
        dataView.setFloat32(start + 8, value[2], true)
        dataView.setFloat32(start + 12, typeID, true)
      },

      getEmissions(index, out) {
        let start = index * ObjectBufferEntrySize + 16
        out[0] = dataView.getFloat32(start + 0, true)
        out[1] = dataView.getFloat32(start + 4, true)
        out[2] = dataView.getFloat32(start + 8, true)
      },
      setEmissions(index, value) {
        let start = index * ObjectBufferEntrySize + 16
        dataView.setFloat32(start + 0, value[0], true)
        dataView.setFloat32(start + 4, value[1], true)
        dataView.setFloat32(start + 8, value[2], true)
      },
    }

    return instances
  }

  const programs = {
    debugObjectsBuffer: shaders.DebugBlitObjectID(
      state.gpu,
      textures.objectID,
      state.gpu.buffers.objects
    ),
    debugObjectTypesBuffer: shaders.DebugBlitObjectTypeID(
      state.gpu,
      textures.objectID,
      state.gpu.buffers.objects
    ),
    debugFluence: shaders.DebugBlitFluence(
      state.gpu,
      textures.fluenceCurrent,
      state.gpu.buffers.objects
    ),
    debugNormals: shaders.DebugBlitNormals(
      state.gpu,
      textures.normals,
      state.gpu.buffers.objects
    ),
    debugDepth: shaders.DebugBlitDepth(
      state.gpu,
      textures.depth,
      state.gpu.buffers.objects
    ),
    screenSpaceBruteForce: shaders.ScreenSpaceBruteForce(
      state.gpu,
      textures.fluencePrevious,
      textures.fluenceCurrent,
      textures.depth,
      textures.objectID,
      textures.normals,
      state.gpu.buffers.objects,
      [16, 16, 1],
      8// raysPerPixel
    ),
  }

  const scenes = {}

  const quatIdentity = [0.0, 0.0, 0.0, 1.0]
  function SceneAddInstances(scene, mesh, instanceCount) {
    let dataView = new DataView(
      state.objectsArrayBuffer,
      scene.objectCount * ObjectBufferEntrySize,
      instanceCount * ObjectBufferEntrySize
    )
    let instances = CreateMeshInstances(mesh.typeID, mesh.mesh, dataView, instanceCount)


    scene.renderSteps.push(
      shaders.RenderTriangleSoup(
        state.gpu,
        instances,
        state.gpu.buffers.objects,
        scene.objectCount,
        textures.objectID,
        textures.depth,
        textures.normals,
        state.gpu.presentationFormat
      )
    )

    scene.objectCount += instanceCount

    return instances;
  }

  // scene: single emissive sphere
  {
    let sceneName = 'simple/emissive-sphere'
    const scene = {
      objectCount: 0,
      renderSteps: []
    }

    let scratch = mat4.create()
    let floor = SceneAddInstances(scene, state.meshes.box, 1)
    let sphere = SceneAddInstances(scene, state.meshes.sphere, 1)

    scene.update = function () {
      // floor instance data
      {
        mat4.fromRotationTranslationScale(
          scratch,
          quatIdentity,
          [-2, 0, 0],
          [0.1, 20, 20]
        )
        floor.setTransform(0, scratch)
        floor.setAlbedo(0, [.5, .5, .5])
        floor.setEmissions(0, [0, 0, 0])
      }

      // sphere instance data
      {
        mat4.fromRotationTranslationScale(
          scratch,
          quatIdentity,
          [0, 0, 0],
          [1, 1, 1]
        )
        sphere.setTransform(0, scratch)
        sphere.setAlbedo(0, [1, 1, 1])
        sphere.setEmissions(0, [1, 1, 1])
      }
    }

    scenes[sceneName] = scene
  }

  // scene: single emissive sphere with occluder
  {
    let sceneName = 'simple/emissive-sphere-with-occluder'
    const scene = {
      objectCount: 0,
      renderSteps: []
    }

    let boxes = SceneAddInstances(scene, state.meshes.box, 2)
    let spheres = SceneAddInstances(scene, state.meshes.sphere, 1)
    let scratch = mat4.create()

    scene.update = function () {
      let floory = -2
      // floor instance data
      {
        mat4.fromRotationTranslationScale(
          scratch,
          quatIdentity,
          [0, floory, 0],
          [10, 1, 10]
        )
        boxes.setTransform(0, scratch)
        boxes.setAlbedo(0, [0.5, 0.5, 0.5])
        boxes.setEmissions(0, [0, 0, 0])
      }

      // occluder instance data
      {
        let yradius = 4
        mat4.fromRotationTranslationScale(
          scratch,
          quatIdentity,
          [0, yradius + floory, 0],
          [2, yradius, 2]
        )
        boxes.setTransform(1, scratch)
        boxes.setAlbedo(1, [0.45, 0.45, 0.45])
        boxes.setEmissions(1, [0, 0, 0])
      }

      // sphere instance data
      {
        mat4.fromRotationTranslationScale(
          scratch,
          quatIdentity,
          [0, 0, -4],
          [1, 1, 1]
        )
        spheres.setTransform(0, scratch)
        spheres.setAlbedo(0, [1.0, 1.0, 1.0])
        spheres.setEmissions(0, [1, 1, 1])
      }
    }

    scenes[sceneName] = scene
  }

  function RenderFrame() {
    ReadParams()
    const now = Now()
    const deltaTime = (now - state.lastFrameTime) / 1000.0
    state.lastFrameTime = now

    if (state.camera.tick(canvas.width, canvas.height, deltaTime)) {
      state.dirty = true;
    }

    if (!state.dirty) {
      requestAnimationFrame(RenderFrame)
      return
    }
    state.dirty = false

    let commandEncoder = state.gpu.device.createCommandEncoder()
    let frameTextureView = ctx.getCurrentTexture().createView()

    // Render the current scene
    {
      scenes[state.params.scene].update()

      state.gpu.device.queue.writeBuffer(
        state.gpu.buffers.objects,
        0,
        state.objectsArrayBuffer,
        0,
        ObjectBufferEntrySize * scenes[state.params.scene].objectCount
      )

      let colorAttachment = {
        view: frameTextureView,
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store'
      };

      let objectAttachment = {
        view: textures.objectID.createView(),
        clearValue: { r: 0xFFFF, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store'
      };

      let normalAttachment = {
        view: textures.normals.createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store'
      };

      let depthAttachment = {
        view: textures.depth.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
        stencilClearValue: 0,
        stencilLoadOp: 'clear',
        stencilStoreOp: 'store',
      }

      const renderPassDesc = {
        colorAttachments: [
          colorAttachment,
          objectAttachment,
          normalAttachment
        ],
        depthStencilAttachment: depthAttachment,
      };

      let pass = commandEncoder.beginRenderPass(renderPassDesc);
      scenes[state.params.scene].renderSteps.forEach(fn => {
        fn(pass, state.camera.state.worldToScreen, state.camera.state.eye)
      })

      pass.end();
    }

    {
      programs.screenSpaceBruteForce(commandEncoder, state.camera.state.screenToWorld);
    }

    if (state.params.debugRenderObjectIDBuffer) {
      programs.debugObjectsBuffer(commandEncoder, frameTextureView)
    }
    if (state.params.debugRenderObjectTypeIDBuffer) {
      programs.debugObjectTypesBuffer(commandEncoder, frameTextureView)
    }
    if (state.params.debugRenderRawFluence) {
      programs.debugFluence(commandEncoder, frameTextureView)
    }
    if (state.params.debugRenderNormals) {
      programs.debugNormals(commandEncoder, frameTextureView)
    }
    if (state.params.debugRenderDepth) {
      programs.debugDepth(commandEncoder, frameTextureView)
    }

    state.gpu.device.queue.submit([commandEncoder.finish()])

    requestAnimationFrame(RenderFrame)
  }

  RenderFrame()
}

ScreenSpace3DBegin(
  document.querySelector('#screen-space-3d-content')
)