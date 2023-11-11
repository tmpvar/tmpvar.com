import CreateOrbitCamera from "./orbit-camera.js"
import CreateParamReader from "./params.js"
import * as primitives from "./primitives.js"

ShellTexturingBegin(
  document.getElementById('shell-texturing-content')
)

async function ShellTexturingBegin(rootEl) {
  const controlEl = rootEl.querySelector('.controls')
  const canvas = rootEl.querySelector('canvas')

  function Now() {
    if (window.performance && window.performance.now) {
      return window.performance.now()
    } else {
      return Time.now()
    }
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

  let ctx = canvas.getContext('webgpu')

  let state = {
    canvas: canvas,
    ctx,
    camera: CreateOrbitCamera(),
    mouse: {
      pos: [0, 0],
      lastPos: [0, 0],
      down: false
    },
    lastFrameTime: Now(),
    params: {},
    dirty: true,
  }

  try {
    state.gpu = await InitGPU(state.ctx)
    state.gpu.labelPrefix = "ShellTexturing/"
  } catch (e) {
    console.log(e)
    rootEl.className = rootEl.className.replace('has-webgpu', '')
    return;
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
  }

  const shaders = {
    RenderTriangleSoup(
      gpu,
      mesh,
      depthTexture,
      presentationFormat
    ) {
      const labelPrefix = gpu.labelPrefix + 'RenderMesh/'
      const device = gpu.device
      const uboFields = [
        ['eye', 'vec4f', 16],
        // x = shell offset, y = shell count, z = now in ms, w = unused
        ['params', 'vec4f', 16],
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
          @location(1) worldPosition: vec3f,
          @location(2) uvw: vec3f,
          @interpolate(flat) @location(3) instanceOffset: f32,
        }

        struct UBOParams {
          ${uboFields.map(v => `${v[0]}: ${v[1]},`).join('\n          ')}
        };

        @group(0) @binding(0) var<uniform> ubo: UBOParams;

        @vertex
        fn VertexMain(
          @location(0) inPosition: vec3f,
          @location(1) inNormal: vec3f,
          @builtin(instance_index) instanceIndex: u32
        ) -> VertexOut {
          var out: VertexOut;

          let scale = 10.0;
          let shellSpacing = ubo.params.x;
          let pos = inPosition * scale - inNormal * shellSpacing * f32(instanceIndex);

          out.instanceOffset = shellSpacing * f32(instanceIndex) / scale;

          out.worldPosition = pos;
          out.uvw = (pos / scale) * 0.5 + 0.5;
          out.position = ubo.worldToScreen * vec4(pos, 1.0);

          return out;
        }

        struct FragmentOut {
          @location(0) color: vec4f,
        };

        fn pcg2d(_v: vec2<u32>) -> vec2<u32> {
            var v = _v * 1664525u + 1013904223u;

            v.x += v.y * 1664525u;
            v.y += v.x * 1664525u;

            v ^= v >> vec2<u32>(16u);

            v.x += v.y * 1664525u;
            v.y += v.x * 1664525u;

            return v ^ (v>>vec2<u32>(16u));
        }

        @fragment
        fn FragmentMain(fragData: VertexOut) -> FragmentOut {
          var out: FragmentOut;
          let dFdxPos = dpdx(fragData.worldPosition);
          let dFdyPos = -dpdy(fragData.worldPosition);
          let normal = normalize(cross(dFdxPos, dFdyPos));
          out.color = vec4(normal * 0.5 + 0.5, 1.0);
          const divisions = 32.0;

          let hash = pcg2d(vec2<u32>(floor(fragData.uvw.xy * divisions)));
          let v = f32(hash.x) / f32(0xffffffff);
          let o = f32(hash.y) / f32(0xffffffff);
          let t = ubo.params.z;
          if (v > fragData.instanceOffset * 2.0) {
            let uv = fract(fragData.uvw.xy * divisions) * 2.0 - 1.0;
            let width = max(0.1, 1.0 - (fragData.instanceOffset * 3.0));

            let samplePos = uv + vec2f(
              sin(t * 0.01 + v * fragData.instanceOffset * 50.0) * 0.5,
              sin(t * 0.01 * o + v * fragData.instanceOffset * 50.0) * 0.5
            );

            if (length(samplePos) - (0.5 * (1.0 - fragData.instanceOffset * 3.0)) < 0.0) {
              var color = vec3f(1.0) * pow(fragData.instanceOffset * 3.0, 1);
              out.color = vec4(color, 1.0);
            } else {
              discard;
            }

          } else {
            out.color = vec4(vec3f(0.0), 1.0);
            discard;
          }


          // out.color = vec4(fragData.uvw, 1.0);
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
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: {
              type: 'uniform',
            }
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
          }]
        },
        primitive: {
          topology: 'triangle-list',
          cullMode: 'none',
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

      return function RenderMesh(mesh, pass, worldToScreen, eye, shellSpacing, shellCount, shellSubdivisions, now) {
        // update the uniform buffer
        {
          let byteOffset = 0

          eye.forEach(v => {
            uboData.setFloat32(byteOffset, v, true)
            byteOffset += 4;
          })
          byteOffset += 4


          // params
          {
            //  shell offset
            uboData.setFloat32(byteOffset, shellSpacing, true)
            byteOffset += 4

            //  shell count
            uboData.setFloat32(byteOffset, instanceCount, true)
            byteOffset += 4

            //  time in ms
            uboData.setFloat32(byteOffset, now, true)
            byteOffset += 4

            // w = unused
            byteOffset += 4
          }
          worldToScreen.forEach(v => {
            uboData.setFloat32(byteOffset, v, true)
            byteOffset += 4;
          })

          gpu.device.queue.writeBuffer(ubo, 0, uboBuffer)
        }

        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup)
        pass.setVertexBuffer(0, mesh.positionBuffer);
        pass.setVertexBuffer(1, mesh.normalBuffer);
        pass.draw(mesh.vertexCount, instanceCount);
      }
    },
  }

  const programs = {
    renderMesh: shaders.RenderTriangleSoup(
      state.gpu,
      primitives.CreatePlane(state.gpu),
      textures.depth,
      state.gpu.presentationFormat
    )
  }

  const meshes = {
    plane: primitives.CreatePlane(state.gpu),
    cube: primitives.CreateCube(state.gpu),
    sphere: primitives.CreateSphere(state.gpu, 3),
  }

  const Param = CreateParamReader(state, controlEl)
  function ReadParams() {
    Param('shellCount', 'i32')
    Param('shellSpacing', 'f32')
    Param('shellSubdivisions', 'i32')
    Param('mesh', 'string')
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

    let frameTextureView = state.ctx.getCurrentTexture().createView()
    const commandEncoder = state.gpu.device.createCommandEncoder()

    let colorAttachment = {
      view: frameTextureView,
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

    let pass = commandEncoder.beginRenderPass({
      colorAttachments: [
        colorAttachment,
      ],
      depthStencilAttachment: depthAttachment,
    });

    let width = canvas.width
    let height = canvas.height
    pass.setViewport(0, 0, width, height, 0, 1);
    pass.setScissorRect(0, 0, width, height);
    programs.renderMesh(
      pass,
      state.camera.computed.worldToScreen,
      state.camera.computed.eye,
      state.params.shellSpacing,
      state.params.shellCount,
      now
    )

    pass.end();
    state.gpu.device.queue.submit([commandEncoder.finish()])
    requestAnimationFrame(RenderFrame)
  }

  requestAnimationFrame(RenderFrame)
}