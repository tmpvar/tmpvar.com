import CreateOrbitCamera from './orbit-camera.js'


async function ProbeRayDistribution3dBegin() {
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

  function Now() {
    if (window.performance && window.performance.now) {
      return window.performance.now()
    } else {
      return Time.now()
    }
  }

  const LevelColorFloats = LevelColors.map(value => {
    let v = parseInt(value.replace("#", ""), 16)
    let r = (v >> 16) & 0xFF
    let g = (v >> 8) & 0xFF
    let b = (v >> 0) & 0xFF
    return [r / 255.0, g / 255.0, b / 255.0]
  })

  const rootEl = document.querySelector("#probe-ray-distribution-3d-content")
  const controlEl = rootEl.querySelector('.controls')
  const canvas = rootEl.querySelector('canvas')
  const ctx = canvas.getContext('webgpu')
  const state = {
    dirty: true,
    rebuildLineBuffer: true,
    params: {},
    camera: CreateOrbitCamera(),
    lastFrameTime: Now(),

    mouse: {
      pos: [0, 0],
      lastPos: [0, 0],
      down: false
    },
  }

  try {
    state.gpu = await InitGPU(ctx);
  } catch (e) {
    console.error(e)
    rootEl.className = rootEl.className.replace('has-webgpu', '')
    return;
  }

  state.gpu.labelPrefix = "ProbeRayDistribution3D/"
  state.gpu.programs = {}
  state.gpu.buffers = {}

  const shaders = {
    DrawLines(gpu, linePositionBuffer, lineColorBuffer) {
      const labelPrefix = gpu.labelPrefix + 'DrawLines/'
      const uboFields = [
        ['worldToScreen', 'mat4x4<f32>', 16 * 4],
      ]

      const uboBuffer = new ArrayBuffer(uboFields.reduce((p, c) => {
        return p + c[2]
      }, 0))

      const uboData = new DataView(uboBuffer)
      const ubo = gpu.device.createBuffer({
        label: `${labelPrefix}UBO`,
        size: uboBuffer.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      })

      const source = /* wgsl */`
        struct UBOParams {
          ${uboFields.map(i => `${i[0]}: ${i[1]},\n `).join('    ')}
        }

        struct VertexOut {
          @builtin(position) position: vec4f,
          @location(0) color: vec3f
        }

        @group(0) @binding(0) var<uniform> ubo: UBOParams;

        @vertex
        fn VertexMain(
          @builtin(vertex_index) vertexIndex: u32,
          @location(0) pos: vec3f,
          @location(1) color: vec3f
        ) -> VertexOut {
          // TODO: transform with ubo.worldToScreen
          var output: VertexOut;
          output.position = ubo.worldToScreen * vec4f(pos, 1.0);
          output.color = color;
          return output;
        }

        @fragment
        fn FragmentMain(fragData: VertexOut) -> @location(0) vec4f {
          return vec4(fragData.color, 1.0);
        }
      `
      const shaderModule = gpu.device.createShaderModule({
        label: `${labelPrefix}Shader`,
        code: source
      })

      const bindGroupLayout = gpu.device.createBindGroupLayout({
        label: `${labelPrefix}BindGroupLayout`,
        entries: [
          {
            binding: 0,
            visibility: (GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX),
            buffer: {
              type: 'uniform',
            }
          },
        ]
      })

      const positionBufferDesc = {
        label: `${labelPrefix}PositionBufferDesc`,
        attributes: [
          {
            shaderLocation: 0,
            offset: 0,
            format: 'float32x3'
          },
        ],
        arrayStride: 12,
        stepMode: 'vertex'
      }

      const colorBufferDesc = {
        label: `${labelPrefix}PositionBufferDesc`,
        attributes: [
          {
            shaderLocation: 1,
            offset: 0,
            format: 'float32x3'
          }
        ],
        arrayStride: 12,
        stepMode: 'vertex'
      }

      const pipeline = gpu.device.createRenderPipeline({
        label: `${labelPrefix}Pipeline`,
        vertex: {
          module: shaderModule,
          entryPoint: 'VertexMain',
          buffers: [positionBufferDesc, colorBufferDesc]
        },
        fragment: {
          module: shaderModule,
          entryPoint: 'FragmentMain',
          targets: [{
            format: gpu.presentationFormat
          }]
        },
        primitive: {
          topology: 'line-list'
        },
        layout: gpu.device.createPipelineLayout({
          bindGroupLayouts: [
            bindGroupLayout,
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
              buffer: ubo
            }
          },
        ]
      })

      return function DrawLines(
        queue,
        commandEncoder,
        ctx,
        worldToScreen,
        vertexCount,
        width,
        height
      ) {
        // Write UBO data
        {
          let byteOffset = 0
          worldToScreen.forEach(v => {
            uboData.setFloat32(byteOffset, v, true)
            byteOffset += 4;
          })

          queue.writeBuffer(ubo, 0, uboBuffer)
        }

        // Note: apparently mapping the staging buffer can take multiple frames?
        let colorAttachment = {
          view: ctx.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store'
        };

        const renderPassDesc = {
          label: `${labelPrefix}RenderPass`,
          colorAttachments: [colorAttachment],
        };

        const pass = commandEncoder.beginRenderPass(renderPassDesc)
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup)
        pass.setVertexBuffer(0, linePositionBuffer);
        pass.setVertexBuffer(1, lineColorBuffer);
        pass.setViewport(0, 0, width, height, 0, 1);
        pass.setScissorRect(0, 0, width, height);
        pass.draw(vertexCount);
        pass.end();
      }

    }
  }

  // Create line buffers
  {
    state.gpu.buffers.lineVertexPositions = state.gpu.device.createBuffer({
      label: "ProbeRayDistribution3D/Buffer/LineVertexPositions",
      size: 1024 * 1024 * 16,
      usage: (
        GPUBufferUsage.COPY_DST |
        GPUBufferUsage.VERTEX
      ),
    })

    state.gpu.buffers.lineVertexColors = state.gpu.device.createBuffer({
      label: "ProbeRayDistribution3D/Buffer/LineVertexColors",
      size: 1024 * 1024 * 16,
      usage: (
        GPUBufferUsage.COPY_DST |
        GPUBufferUsage.VERTEX
      ),
    })
  }

  state.gpu.programs = {
    drawLines: shaders.DrawLines(
      state.gpu,
      state.gpu.buffers.lineVertexPositions,
      state.gpu.buffers.lineVertexColors
    ),
  }

  window.requestAnimationFrame(RenderFrame)

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

  function RebuildLineBuffers() {
    let verts = []
    let colors = []

    const Add = (pos, level) => {
      let pd = level == 0 ? 0 : (1 << (level - 1))
      let d = 1 << level
      verts.push(pos[0] * pd, pos[1] * pd, pos[2] * pd)
      verts.push(pos[0] * d, pos[1] * d, pos[2] * d);

      Array.prototype.push.apply(colors, LevelColorFloats[level])
      Array.prototype.push.apply(colors, LevelColorFloats[level])
    }

    const pos = [0, 0, 0]

    switch (state.params.rayPackingApproach) {
      case 'lat-lon-subdivision': {
        for (let level = state.params.minLevel; level <= state.params.maxLevel; level++) {
          const hrings = 4 << level
          const vrings = 4 << level
          for (let a0 = 0; a0 < hrings; a0++) {
            let angle0 = TAU * (a0 + 0.5) / hrings;
            for (let a1 = 0; a1 < vrings; a1++) {
              let angle1 = TAU * (a1 + 0.5) / vrings;

              pos[0] = Math.sin(angle0) * Math.cos(angle1)
              pos[1] = Math.sin(angle0) * Math.sin(angle1)
              pos[2] = Math.cos(angle0)

              Add(pos, level)
            }
          }
        }
        break;
      }

      // see: https://extremelearning.com.au/how-to-evenly-distribute-points-on-a-sphere-more-effectively-than-the-canonical-fibonacci-lattice/
      case 'golden-spiral': {
        let goldenRatio = (1 + Math.sqrt(5)) * 0.5

        for (let level = state.params.minLevel; level <= state.params.maxLevel; level++) {
          const rayCount = 8 << level
          for (let rayIndex = 0; rayIndex < rayCount; rayIndex++) {
            let a0 = TAU * rayIndex / goldenRatio
            let a1 = Math.acos(1.0 - 2*(rayIndex + 0.5) / rayCount)
            pos[0] = Math.cos(a0) * Math.sin(a1)
            pos[1] = Math.sin(a0) * Math.sin(a1)
            pos[2] = Math.cos(a1)

            Add(pos, level)
          }
        }
        break;
      }

      // see: A New Computationally Efficient Method for Spacing n Points on a Sphere
      //      https://scholar.rose-hulman.edu/cgi/viewcontent.cgi?article=1387&context=rhumj
      case 'kogan-spiral': {
        for (let level = state.params.minLevel; level <= state.params.maxLevel; level++) {
          const rayCount = 8 << level
          const x = 0.1 + 1.2 * rayCount
          const start = (-1.0 + 1.0 / (rayCount - 1.0))
          const increment = (2.0 - 2.0 / (rayCount - 1.0)) / (rayCount - 1.0)
          for (let rayIndex = 0; rayIndex < rayCount; rayIndex++) {
            let s = start + rayIndex * increment;

            const a0 = s * x
            const a1 = Math.PI / 2.0 * Math.sign(s) * (1.0 - Math.sqrt(1.0 - Math.abs(s)))

            pos[0] = Math.cos(a0) * Math.cos(a1)
            pos[1] = Math.sin(a0) * Math.cos(a1)
            pos[2] = Math.sin(a1)

            Add(pos,  level)
          }
        }
        break;
      }


    }

    state.params.computedLineVetexCount = verts.length / 3;

    state.gpu.device.queue.writeBuffer(
      state.gpu.buffers.lineVertexPositions,
      0,
      new Float32Array(verts),
    );

    state.gpu.device.queue.writeBuffer(
      state.gpu.buffers.lineVertexColors,
      0,
      new Float32Array(colors),
    );
  }

  const ParseColor = (value) => {
    let v = parseInt(value.replace("#", ""), 16)

    let r = (v >> 16) & 0xFF
    let g = (v >> 8) & 0xFF
    let b = (v >> 0) & 0xFF
    return r | (g << 8) | (b << 16) | 0xFF000000
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

    const oldValue = state.params[paramName]
    if (cb) {
      value = cb(parentEl, value, oldValue)
    }

    if (oldValue != value) {
      state.params[paramName] = value
      state.dirty = true
      return true
    }
    return false

  }

  function ReadParams() {

    Param('rayPackingApproach', 'string', (parentEl, value, oldValue) => {
      if (value !== oldValue) {
        console.log('ray packing approach', value, oldValue)
        state.rebuildLineBuffer = true
      }
      return value
    })
    Param('minLevel', 'i32', (parentEl, value, oldValue) => {
      if (value !== oldValue) {
        state.rebuildLineBuffer = true
      }
      parentEl.querySelector('output').innerText = value
      return value
    })
    Param('maxLevel', 'i32', (parentEl, value, oldValue) => {
      if (value !== oldValue) {
        state.rebuildLineBuffer = true
        state.camera.state.targetDistance = 2 << value
      }
      parentEl.querySelector('output').innerText = value
      return value
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

      state.camera.rotate(dx, -dy)
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

    if (state.rebuildLineBuffer) {
      RebuildLineBuffers();
      console.log('rebuild line buffer')
      state.rebuildLineBuffer = false
      state.dirty = true;
    }

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
    state.gpu.programs.drawLines(
      state.gpu.device.queue,
      commandEncoder,
      ctx,
      state.camera.state.worldToScreen,
      state.params.computedLineVetexCount,
      canvas.width,
      canvas.height
    )

    window.requestAnimationFrame(RenderFrame)
    state.gpu.device.queue.submit([commandEncoder.finish()])
  }
}

if (document.readyState != 'complete') {
  document.addEventListener("readystatechange", e => {
    if (document.readyState == 'complete') {
      ProbeRayDistribution3dBegin();
    }
  })
} else {
  ProbeRayDistribution3dBegin();
}