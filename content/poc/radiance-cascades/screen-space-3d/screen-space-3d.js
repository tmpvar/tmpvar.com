import CreateOrbitCamera from './orbit-camera.js'
import CreateParamReader from './params.js'
import * as mesh from './primitives.js'

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
  state.camera.state.targetDistance = 5
  state.camera.state.scrollSensitivity = 0.01;

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
    state.gpu = await InitGPU(ctx, probeBufferByteSize);
    state.gpu.labelPrefix = "ScreenSpace3D/"

    state.gpu.buffers = {
      probes: state.gpu.device.createBuffer({
        label: `${state.gpu.labelPrefix}Buffers/Probes`,
        size: probeBufferByteSize,
        usage: GPUBufferUsage.STORAGE
      })
    }
  } catch (e) {
    console.error(e)
    rootEl.className = rootEl.className.replace('has-webgpu', '')
    return;
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
    }
  }

  const shaders = {
    RenderTriangleSoup(gpu, presentationFormat) {
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
        }

        struct UBOParams {
          worldToScreen: mat4x4<f32>,
        };

        @group(0) @binding(0) var<uniform> ubo: UBOParams;

        @vertex
        fn VertexMain(
          @location(0) inPosition: vec3f,
          @location(1) inNormal: vec3f,
        ) -> VertexOut {
          var out: VertexOut;
          out.position = ubo.worldToScreen * vec4(inPosition, 1.0);
          out.color = inPosition * 0.5 + 0.5;
          out.color = inNormal;
          return out;
        }

        @fragment
        fn FragmentMain(fragData: VertexOut) -> @location(0) vec4f{
          // return vec4(1.0, 0.0, 1.0, 1.0);
          return vec4(fragData.color * 0.5 + 0.5, 1.0);
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
        ]
      })

      const depthTexture = gpu.device.createTexture({
        label: `${labelPrefix}/DepthTexture`,
        size: [canvas.width, canvas.height],
        dimension: '2d',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        format: 'depth24plus-stencil8'
      })

      const depthTextureView = depthTexture.createView()


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
            format: presentationFormat
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
        ]
      })


      return function RenderMesh(commandEncoder, mesh, worldToScreen) {
        // update the uniform buffer
        {
          let byteOffset = 0

          worldToScreen.forEach(v => {
            uboData.setFloat32(byteOffset, v, true)
            byteOffset += 4;
          })

          gpu.device.queue.writeBuffer(ubo, 0, uboBuffer)
        }

        let colorAttachment = {
          view: ctx.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store'
        };

        let depthAttachment = {
          view: depthTextureView,
          depthClearValue: 1,
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
          stencilClearValue: 0,
          stencilLoadOp: 'clear',
          stencilStoreOp: 'store',
        }

        const renderPassDesc = {
          colorAttachments: [colorAttachment],
          depthStencilAttachment: depthAttachment,
        };

        let pass = commandEncoder.beginRenderPass(renderPassDesc);
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup)
        pass.setViewport(0, 0, canvas.width, canvas.height, 0, 1);
        pass.setScissorRect(0, 0, canvas.width, canvas.height);
        pass.setVertexBuffer(0, mesh.positionBuffer);
        pass.setVertexBuffer(1, mesh.normalBuffer);
        pass.draw(mesh.vertexCount);
        pass.end();
      }
    }
  }

  const programs = {
    renderTriangleSoup: shaders.RenderTriangleSoup(
      state.gpu,
      state.gpu.presentationFormat
    ),
  }

  const meshes = {
    cube: mesh.CreateCube(state.gpu)
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
    programs.renderTriangleSoup(
      commandEncoder,
      meshes.cube,
      state.camera.state.worldToScreen
    )

    state.gpu.device.queue.submit([commandEncoder.finish()])

    requestAnimationFrame(RenderFrame)
  }

  RenderFrame()
}

ScreenSpace3DBegin(
  document.querySelector('#screen-space-3d-content')
)