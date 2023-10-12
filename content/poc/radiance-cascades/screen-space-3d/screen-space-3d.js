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
    16 +      //   padding
    16 +      //   padding
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
          let shifted = state.params.probeRayCount << (value * level)
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
      // // rgb, a=objectType
      albedo: vec4f,
      // // rgb, a=unused
      emission: vec4f,
      pad0: vec4f,
      pad1: vec4f,
      transform: mat4x4<f32>,
    };
  `

  const shaders = {
    DebugBlitBase(gpu, outputTexture, objectsBuffer, fragCode) {
      const labelPrefix = `${outputTexture.label}DebugBlit/`
      const device = gpu.device
      const presentationFormat = gpu.presentationFormat

      let textureFormat = 'f32';
      if (outputTexture.format.indexOf('uint') > -1) {
        textureFormat = 'u32'
      } else if (outputTexture.format.indexOf('int') > -1) {
        textureFormat = 'i32'
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
              sampleType: outputTexture.format.indexOf('uint') > -1 ? 'uint' : 'float',
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
            resource: outputTexture.createView()
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
      return this.DebugBlitBase(gpu, outputTexture, objectsBuffer, fragCode)
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

          let typeID = objectData[objectID].albedo.r;
          var col = i32(typeID + 1) * vec3<i32>(158, 2 * 156, 3 * 159);
          col = col % vec3<i32>(255, 253, 127);
          return vec4(vec3f(col) / 255.0, 1.0);
        }
      `
      return this.DebugBlitBase(gpu, outputTexture, objectsBuffer, fragCode)
    },

    RenderTriangleSoup(
      gpu,
      instances,
      objectsBuffer,
      objectIDStart,
      objectIDTexture,
      depthTexture,
      presentationFormat
    ) {
      const labelPrefix = gpu.labelPrefix + 'RenderMesh/'
      const device = gpu.device
      const uboFields = [
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
        }

        struct UBOParams {
          worldToScreen: mat4x4<f32>,
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
          out.position = ubo.worldToScreen * objectData[objectID].transform * vec4(inPosition, 1.0);
          out.color = objectData[objectID].albedo.rgb;
          out.objectID = objectID;
          return out;
        }

        struct FragmentOut {
          @location(0) color: vec4f,
          @location(1) objectID: u32
        };

        @fragment
        fn FragmentMain(fragData: VertexOut) -> FragmentOut {
          var out: FragmentOut;
          out.color = vec4(fragData.color, 1.0);
          out.objectID = ${objectIDStart} + fragData.objectID;
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

      return function RenderMesh(pass, worldToScreen) {
        // update the uniform buffer
        {
          let byteOffset = 0

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

    ScreenSpaceBruteForce(gpu, fluenceTexture, depthTexture, objectIDTexture,) {


      return function ScreenSpaceBruteForce() {

      }
    }

  }

  const textures = {
    depth: state.gpu.device.createTexture({
      label: `${state.gpu.labelPrefix}DepthTexture/`,
      size: [canvas.width, canvas.height],
      dimension: '2d',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
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

    fluence: state.gpu.device.createTexture({
      label: `${state.gpu.labelPrefix}Fluence/`,
      size: [canvas.width, canvas.height],
      dimension: '2d',
      usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING,
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
        let start = index * ObjectBufferEntrySize + 64;
        for (let i = 0; i < 16; i++) {
          out[i] = dataView.getFloat32(start + i * 4, true)
        }
      },

      setTransform(index, transform) {
        let start = index * ObjectBufferEntrySize + 64;

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
    )
  }

  const scenes = {}

  const quatIdentity = [0.0, 0.0, 0.0, 1.0]
  function SceneAddInstances(scene, mesh, instanceCount) {
    console.log('offset:', scene.objectCount * ObjectBufferEntrySize, scene.objectCount, instanceCount)
    let dataView = new DataView(
      state.objectsArrayBuffer,
      scene.objectCount * ObjectBufferEntrySize,
      instanceCount * ObjectBufferEntrySize
    )
    console.log(dataView)
    let instances = CreateMeshInstances(mesh.typeID, mesh.mesh, dataView, instanceCount)


    scene.renderSteps.push(
      shaders.RenderTriangleSoup(
        state.gpu,
        instances,
        state.gpu.buffers.objects,
        scene.objectCount,
        textures.objectID,
        textures.depth,
        state.gpu.presentationFormat
      )
    )

    scene.objectCount += instanceCount

    return instances;
  }

  // scene: single emissive sphere
  {
    let sceneName = 'simple/emissive-sphere'
    console.group(sceneName)
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
    console.groupEnd()
  }

  // scene: single emissive sphere with occluder
  {
    let sceneName = 'simple/emissive-sphere-with-occluder'
    console.group(sceneName)
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
        boxes.setAlbedo(0, [3.0, 0.0, 0.0])
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
        boxes.setAlbedo(1, [3.0, 0.0, 0.0])
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
        spheres.setAlbedo(0, [3.0, 0.0, 0.0])
        spheres.setEmissions(0, [1, 1, 1])
      }
    }

    scenes[sceneName] = scene
    console.groupEnd()
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

      {
        console.group('object buffer contents')
        let a = new Float32Array(state.objectsArrayBuffer)
        for (
          let i = 0;
          i < a.length - ObjectBufferEntrySize * scenes[state.params.scene].objectCount;
          i += ObjectBufferEntrySize / 4
        ) {
          console.log(a[i + 0], a[i + 1], a[i + 2], a[i + 3])
        }
        console.groupEnd()
      }

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
        colorAttachments: [colorAttachment, objectAttachment],
        depthStencilAttachment: depthAttachment,
      };

      let pass = commandEncoder.beginRenderPass(renderPassDesc);
      scenes[state.params.scene].renderSteps.forEach(fn => {
        fn(pass, state.camera.state.worldToScreen)
      })

      pass.end();
    }

    if (state.params.debugRenderObjectIDBuffer) {
      programs.debugObjectsBuffer(commandEncoder, frameTextureView)
    }
    if (state.params.debugRenderObjectTypeIDBuffer) {
      programs.debugObjectTypesBuffer(commandEncoder, frameTextureView)
    }

    state.gpu.device.queue.submit([commandEncoder.finish()])

    requestAnimationFrame(RenderFrame)
  }

  RenderFrame()
}

ScreenSpace3DBegin(
  document.querySelector('#screen-space-3d-content')
)