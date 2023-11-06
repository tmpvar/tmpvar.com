import CreateOrbitCamera from "./orbit-camera.js"
import CreateParamReader from "./params.js"
import CreateCubeMesh from './primitive-cube.js'

import * as mat4 from './gl-matrix/mat4.js'
import * as vec4 from './gl-matrix/vec4.js'
import * as vec3 from './gl-matrix/vec3.js'


InterpolatedIsosurfaceBegin(
  document.getElementById('interpolated-isosurface-viz-3d-content')
)

async function InterpolatedIsosurfaceBegin(rootEl) {

  function Now() {
    if (window.performance && window.performance.now) {
      return window.performance.now()
    } else {
      return Time.now()
    }
  }

  function HexColorToVec3f(value) {
    let v = parseInt(value.replace("#", ""), 16)

    let r = (v >> 16) & 0xFF
    let g = (v >> 8) & 0xFF
    let b = (v >> 0) & 0xFF
    return `vec3f(f32(${r / 255.0}),f32(${g / 255.0}),f32(${b / 255.0}))`
  }


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
      down: false,
    },

    debugParams: new Float32Array(16),
    sceneParams: new Float32Array(8),
    approachParams: new Float32Array(16),

    disableCameraMovement: false,
    cameraCapturedMouse: false,

    worldToScreen: mat4.create(),
    screenToWorld: mat4.create(),
    model: mat4.fromScaling(mat4.create(), [-1, 1, 1]),
    eye: vec3.create(),
  }

  state.camera.state.distance = 3.0;
  state.camera.state.scrollSensitivity = 0.05;

  // restore camera state
  {
    let str = localStorage.getItem('isosurface-extraction-3d/camera')
    try {
      Object.assign(state.camera.state, JSON.parse(str || '{}'))
      console.log(state.camera.state);
    } catch (e) {
      localStorage.setItem('isosurface-extraction-3d/camera', '{}')
    }
  }

  try {
    state.gpu = await InitGPU(ctx);
  } catch (e) {
    console.error(e)
    rootEl.className = rootEl.className.replace('has-webgpu', '')
    return;
  }

  state.gpu.labelPrefix = "InterpolatedIsosurfaceViz3D/"

  const shaders = {
    RenderTriangleSoup(
      gpu,
      mesh,
      objectIDTexture,
      depthTexture,
      normalTexture,
      presentationFormat,
      fragmentCode
    ) {
      const labelPrefix = gpu.labelPrefix + 'RenderMesh/'
      const device = gpu.device
      const uboFields = [
        ['modelPosition', 'vec4f', 16],
        ['eye', 'vec4f', 16],
        ['screenDims', 'vec4f', 16],
        ['worldToScreen', 'mat4x4<f32>', 16 * 4],
        ['screenToWorld', 'mat4x4<f32>', 16 * 4],
        ['sceneParams', 'SceneParams', 16 * 2],
        ['approachParams', 'mat4x4<f32>', 16 * 4],
        ['debugParams', 'mat4x4<f32>', 16 * 4],
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
          @location(3) uv: vec2f,
          @location(4) faceUV: vec2f,
          @interpolate(flat) @location(5) faceNormal: vec3f,

        }

        struct SceneParams {
          c000: f32,
          c100: f32,
          c010: f32,
          c110: f32,
          c001: f32,
          c101: f32,
          c011: f32,
          c111: f32,
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

          let objectID = u32(ubo.modelPosition.w);
          let position = ubo.modelPosition.xyz;

          let worldPosition = position + inPosition;
          out.worldPosition = worldPosition;
          out.position = ubo.worldToScreen * vec4(worldPosition, 1.0);
          out.objectID = objectID;
          out.uv = out.position.xy / out.position.w;

          if (inNormal.x != 0.0) {
            out.faceUV = inPosition.yz * 0.5 + 0.5;
          } else if (inNormal.y != 0.0) {
            out.faceUV = inPosition.xz * 0.5 + 0.5;
          } else {
            out.faceUV = inPosition.xy * 0.5 + 0.5;
          }

          out.faceNormal = inNormal;

          return out;
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

        fn TrilinearInterpolation(uvw: vec3f) -> f32{
          let factor = uvw;

          let invFactor = 1.0 - factor;
          let c000 = ubo.sceneParams.c000;
          let c100 = ubo.sceneParams.c100;
          let c010 = ubo.sceneParams.c010;
          let c110 = ubo.sceneParams.c110;

          let c001 = ubo.sceneParams.c001;
          let c101 = ubo.sceneParams.c101;
          let c011 = ubo.sceneParams.c011;
          let c111 = ubo.sceneParams.c111;

          let c00 = c000 * invFactor.x + c100 * factor.x;
          let c10 = c010 * invFactor.x + c110 * factor.x;
          let c01 = c001 * invFactor.x + c101 * factor.x;
          let c11 = c011 * invFactor.x + c111 * factor.x;

          let c0 = c00 * invFactor.y + c10 * factor.y;
          let c1 = c01 * invFactor.y + c11 * factor.y;

          return c0 * invFactor.z + c1 * factor.z;
        }

        fn ComputeNormal(pos: vec3f) -> vec3f {
          const eps = 0.00001; // or some other value
          const h = vec2f(eps,0.0);
          return normalize(
             vec3f(
              (TrilinearInterpolation(pos+h.xyy) - TrilinearInterpolation(pos-h.xyy)),
              (TrilinearInterpolation(pos+h.yxy) - TrilinearInterpolation(pos-h.yxy)),
              (TrilinearInterpolation(pos+h.yyx) - TrilinearInterpolation(pos-h.yyx))
            )
          );
        }

        fn MinComponent(a: vec3f) -> f32 {
          return min(a.x, min(a.y, a.z));
        }

        fn MaxComponent(a: vec3f) -> f32 {
          return max(a.x, max(a.y, a.z));
        }

        fn RayAABB(p0: vec3f, p1: vec3f, rayOrigin: vec3f, invRaydir: vec3f) -> vec2f {
          let t0 = (p0 - rayOrigin) * invRaydir;
          let t1 = (p1 - rayOrigin) * invRaydir;
          let tmin = MaxComponent(min(t0, t1));
          let tmax = MinComponent(max(t0, t1));
          return vec2f(tmin, tmax);
        }

        struct FragmentOut {
          @location(0) color: vec4f,
          @location(1) objectID: u32,
          @location(2) normal: vec4f,
        };

        ${fragmentCode}
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
        ]
      })

      return function RenderMesh(
        pass,
        worldToScreen,
        screenToWorld,
        modelPosition,
        eye,
        screenDims,
        objectID,
        sceneParams,
        approachParams,
        debugParams
      ) {
        // update the uniform buffer
        {
          let byteOffset = 0

          // model position
          uboData.setFloat32(byteOffset + 0, modelPosition[0], true)
          uboData.setFloat32(byteOffset + 4, modelPosition[1], true)
          uboData.setFloat32(byteOffset + 8, modelPosition[2], true)
          uboData.setFloat32(byteOffset + 12, objectID, true)
          byteOffset += 16

          // eye
          uboData.setFloat32(byteOffset + 0, eye[0], true)
          uboData.setFloat32(byteOffset + 4, eye[1], true)
          uboData.setFloat32(byteOffset + 8, eye[2], true)
          uboData.setFloat32(byteOffset + 12, 0, true)
          byteOffset += 16

          // screenDims
          uboData.setFloat32(byteOffset + 0, screenDims[0], true)
          uboData.setFloat32(byteOffset + 4, screenDims[1], true)
          byteOffset += 16

          worldToScreen.forEach(v => {
            uboData.setFloat32(byteOffset, v, true)
            byteOffset += 4;
          })

          screenToWorld.forEach(v => {
            uboData.setFloat32(byteOffset, v, true)
            byteOffset += 4;
          })

          // TODO: for these params, maybe loop from 0..15 and if there is a param
          //       then write, otherwise just update the byte offset

          sceneParams.forEach(v => {
            uboData.setFloat32(byteOffset, v, true)
            byteOffset += 4;
          })

          approachParams.forEach((v, i) => {
            uboData.setFloat32(byteOffset, v, true)
            byteOffset += 4;
          })

          debugParams.forEach((v, i) => {
            uboData.setFloat32(byteOffset, v, true)
            byteOffset += 4;
          })

          gpu.device.queue.writeBuffer(ubo, 0, uboBuffer)
        }

        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup)

        pass.setVertexBuffer(0, mesh.positionBuffer);
        pass.setVertexBuffer(1, mesh.normalBuffer);
        pass.draw(mesh.vertexCount, 1);
      }
    },

    BlitOverlay(gpu, overlayContext) {
      const labelPrefix = gpu.labelPrefix + 'BlitOverlay/'
      const device = gpu.device

      const source = /* wgsl */`
        struct VertexOut {
          @builtin(position) position : vec4f,
          @location(0) uv : vec2f
        }

        const vertPos = array<vec2<f32>, 3>(
          vec2f(-1.0,-1.0),
          vec2f(-1.0, 4.0),
          vec2f( 4.0,-1.0)
        );

        @vertex
        fn VertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOut {
          var output : VertexOut;
          var pos = vertPos[vertexIndex];
          output.position = vec4f(pos, 0.0, 1.0);
          output.uv = pos * 0.5 + 0.5;
          return output;
        }

        const PI: f32 = 3.141592653589793;
        const TAU: f32 = PI * 2;

        @group(0) @binding(0) var overlayTexture: texture_2d<f32>;

        @fragment
        fn FragmentMain(fragData: VertexOut) -> @location(0) vec4f {
          var scale = 1.0;
          let dims = vec2f(textureDimensions(overlayTexture));
          var pixelPos = vec2<i32>(fragData.uv * dims);

          return textureLoad(overlayTexture, pixelPos, 0);
        }
      `;

      const shaderModule = device.createShaderModule({
        label: `${labelPrefix}/ShaderModule`,
        code: source
      })

      const bindGroupLayout = device.createBindGroupLayout({
        label: `${labelPrefix}BindGroupLayout`,
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.FRAGMENT,
            texture: {
              sampleType: 'float'
            }
          }
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
            format: gpu.presentationFormat,
            blend: {
              color: {
                srcFactor: 'one',
                operation: 'add',
                dstFactor: 'one-minus-src-alpha',
              },
              alpha: {},
            },
          }],
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
            resource: overlayContext.texture.createView()
          }
        ]
      })

      return function BlitOverlay(
        commandEncoder,
        queue,
        frameTextureView,
        rect
      ) {
        queue.copyExternalImageToTexture(
          {
            source: overlayContext.canvas,
            flipY: true,
          },
          {
            texture: overlayContext.texture,
            premultipliedAlpha: true,
          },
          [overlayContext.canvas.width, overlayContext.canvas.height]
        )

        let colorAttachment = {
          view: frameTextureView,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'load',
          storeOp: 'store'
        };

        const renderPassDesc = {
          colorAttachments: [
            colorAttachment,
          ]
        };

        let pass = commandEncoder.beginRenderPass(renderPassDesc)
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup)
        pass.setViewport(0, 0, overlayContext.canvas.width, overlayContext.canvas.height, 0, 1);
        pass.setScissorRect(0, 0, overlayContext.canvas.width, overlayContext.canvas.height);
        pass.draw(3);
        pass.end()
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
  }

  state.gpu.buffers = {}
  state.meshes = {
    cube: CreateCubeMesh(state.gpu),
  }

  // create mesh for computed triangles
  {
    const labelPrefix = `${state.gpu.labelPrefix}Mesh/ComputedTriangles/`
    const mesh = {
      label: labelPrefix,
      vertexCount: 0,
      maxVertices: 1024
    }

    mesh.positions = new Float32Array(mesh.maxVertices * 3)
    mesh.normals = new Float32Array(mesh.maxVertices * 3)

    mesh.positionBuffer = state.gpu.device.createBuffer({
      label: `${labelPrefix}PositionBuffer`,
      size: mesh.positions.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    })

    mesh.normalBuffer = state.gpu.device.createBuffer({
      label: `${labelPrefix}NormalBuffer`,
      size: mesh.normals.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    })

    mesh.update = () => {
      state.gpu.device.queue.writeBuffer(mesh.positionBuffer, 0, mesh.positions)
      state.gpu.device.queue.writeBuffer(mesh.normalBuffer, 0, mesh.normals)
    }

    mesh.positions[0] = 0.0
    mesh.positions[1] = 0.0
    mesh.positions[2] = 0.0

    mesh.positions[3] = 1.0
    mesh.positions[4] = 0.0
    mesh.positions[5] = 0.0

    mesh.positions[6] = 1.0
    mesh.positions[7] = 1.0
    mesh.positions[8] = 0.0

    mesh.normals[0] = 0.0
    mesh.normals[1] = 1.0
    mesh.normals[2] = 0.0

    mesh.normals[3] = 0.0
    mesh.normals[4] = 1.0
    mesh.normals[5] = 0.0

    mesh.normals[6] = 0.0
    mesh.normals[7] = 1.0
    mesh.normals[8] = 0.0

    mesh.update()
    mesh.vertexCount = 3

    state.meshes.computedTriangles = mesh
  }

  {
    state.overlay = {
      canvas: document.createElement('canvas'),
      hoveredCorner: -1,
      draggingCorner: -1,
      draggingLastPos: [0, 0]
    }
    state.overlay.canvas.width = 1024
    state.overlay.canvas.height = 1024
    state.overlay.ctx = state.overlay.canvas.getContext('2d', {
      alpha: true
    })
    state.overlay.texture = state.gpu.device.createTexture({
      label: `${state.gpu.labelPrefix}Overlay`,
      size: [canvas.width, canvas.height],
      dimension: '2d',
      usage: (
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING
      ),
      format: 'rgba8unorm'
    })

    let cornerScratch = vec4.create()
    let dir = vec3.create();
    let corners = [
      [-1, -1, -1],
      [1, -1, -1],
      [-1, 1, -1],
      [1, 1, -1],
      [-1, -1, 1],
      [1, -1, 1],
      [-1, 1, 1],
      [1, 1, 1],
    ]

    let cornerXYZID = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]

    let projectPointScratch = vec4.create()
    function ProjectPoint(out, pos, worldToScreen, width, height) {
      projectPointScratch[0] = pos[0]
      projectPointScratch[1] = pos[1]
      projectPointScratch[2] = pos[2]
      projectPointScratch[3] = 1

      vec4.transformMat4(projectPointScratch, projectPointScratch, worldToScreen)

      out[0] = Math.round(((projectPointScratch[0] / projectPointScratch[3]) * 0.5 + 0.5) * width)
      out[1] = height - Math.round(((projectPointScratch[1] / projectPointScratch[3]) * 0.5 + 0.5) * height)
      out[2] = projectPointScratch[2] / projectPointScratch[3]
    }

    state.overlay.update = (worldToScreen, eye) => {
      vec3.normalize(dir, eye)
      state.overlay.canvas.width = 0
      state.overlay.canvas.width = 1024
      state.overlay.canvas.height = 1024

      let ctx = state.overlay.ctx;
      const width = state.overlay.canvas.width
      const height = state.overlay.canvas.height

      for (let cornerIndex = 0; cornerIndex < 8; cornerIndex++) {

        vec4.set(
          cornerScratch,
          corners[cornerIndex][0],
          corners[cornerIndex][1],
          corners[cornerIndex][2],
          0.0
        )

        vec3.normalize(cornerScratch, cornerScratch)
        let d = vec3.dot(dir, cornerScratch)

        if (state.params.debugRenderAllCorners || d > -0.35) {
          ProjectPoint(
            cornerXYZID[cornerIndex],
            corners[cornerIndex],
            worldToScreen,
            width,
            height
          )
          cornerXYZID[cornerIndex][3] = cornerIndex
        } else {
          cornerXYZID[cornerIndex][0] = -10000.0
          cornerXYZID[cornerIndex][1] = -10000.0
          cornerXYZID[cornerIndex][2] = 10000.0
          cornerXYZID[cornerIndex][3] = 10000.0
        }
      }

      cornerXYZID.sort((a, b) => {
        return a[2] - b[2]
      })

      let radius = 5.0;
      let radiusSquared = radius * radius;
      if (!state.overlay.draggingCorner) {
        state.overlay.hoveredCorner = -1
      }

      for (let cornerIndex = 0; cornerIndex < 8; cornerIndex++) {

        let corner = cornerXYZID[cornerIndex];
        let px = corner[0]
        let py = corner[1]
        let id = corner[3]
        if (id > 8) {
          continue;
        }

        ctx.beginPath()
        let dx = px - state.mouse.pos[0]
        let dy = py - (state.mouse.pos[1])

        let hovered = (dx * dx + dy * dy) < radiusSquared

        hovered = !state.cameraCapturedMouse && (hovered || state.overlay.draggingCorner == id)

        ctx.fillStyle = 'white'
        if (state.overlay.hoveredCorner == id) {
          if (hovered) {
            ctx.fillStyle = 'orange'
            state.overlay.hoveredCorner = id
          } else {
            state.overlay.hoveredCorner = -1
          }
        } else if (hovered) {
          ctx.fillStyle = 'orange'
          state.overlay.hoveredCorner = id
        }

        ctx.arc(px, py, 5, 0, Math.PI * 2.0)
        ctx.fill()

        {
          ctx.save()
          let v = state.sceneParams[id]
          let offset = 10
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.moveTo(px + radius + offset, py)
          if (v < 0.0) {
            ctx.strokeStyle = '#5ab552'
            ctx.arc(px, py, radius + offset, 0, v / 2.0 * Math.PI, true)
          } else {
            ctx.strokeStyle = '#fa6e79'
            ctx.arc(px, py, radius + offset, 0, v / 2.0 * Math.PI, false)
          }

          ctx.stroke()
          ctx.restore()
          if (state.params.debugShowCornerLabels) {
            ctx.fillStyle = 'white';
            ctx.font = "16px Hack, monospace"
            let label = Array.from((id).toString(2).padStart(3, '0')).reverse().join('')
            let width = ctx.measureText(label).width
            ctx.fillText(label, Math.round(px - width * 0.5), (py - radius + offset * 3 + 8))
          }
        }


      }

      if (!state.mouse.down) {
        state.overlay.draggingCorner = -1
      } else {
        if (state.overlay.draggingCorner == -1) {
          state.overlay.draggingLastPos[0] = state.mouse.pos[0]
          state.overlay.draggingLastPos[1] = state.mouse.pos[1]
        }
        state.overlay.draggingCorner = state.overlay.hoveredCorner;
      }

      if (state.overlay.draggingCorner != -1) {

        let dx = state.mouse.pos[0] - state.overlay.draggingLastPos[0]
        let dy = state.mouse.pos[1] - state.overlay.draggingLastPos[1]

        let diff = (dy + dx) * -0.01

        // update the html control
        let name = 'c' + Array.from((state.overlay.draggingCorner).toString(2).padStart(3, '0')).reverse().join('')
        let v = state.params['scene-manual'][name] + diff;

        controlEl.querySelector(`.${name}-control input`).value = v
        state.overlay.draggingLastPos[0] = state.mouse.pos[0]
        state.overlay.draggingLastPos[1] = state.mouse.pos[1]
      }

      if (state.overlay.hoveredCorner != -1 || state.overlay.draggingCorner != -1) {
        state.disableCameraMovement = true
      } else if (state.overlay.draggingCorner == -1) {
        state.disableCameraMovement = false
      }

      // draw axes
      if (state.params.debugRenderAxes) {
        let center = [0, 0, 0]
        ProjectPoint(center, center, worldToScreen, width, height)

        ctx.lineWidth = 4
        let x = [1, 0, 0]
        ProjectPoint(x, x, worldToScreen, width, height)
        ctx.beginPath()
        ctx.moveTo(center[0], center[1])
        ctx.lineTo(x[0], x[1])
        ctx.strokeStyle = `rgba(${(1.0 * 0.5 + 0.5) * 255}, 127, 127, 1)`
        ctx.stroke()

        let y = [0, 1, 0]
        ProjectPoint(y, y, worldToScreen, width, height)
        ctx.beginPath()
        ctx.moveTo(center[0], center[1])
        ctx.lineTo(y[0], y[1])
        ctx.strokeStyle = `rgba(127, ${(1.0 * 0.5 + 0.5) * 255}, 127, 1)`
        ctx.stroke()

        let z = [0, 0, 1]
        ProjectPoint(z, z, worldToScreen, width, height)
        ctx.beginPath()
        ctx.moveTo(center[0], center[1])
        ctx.lineTo(z[0], z[1])
        ctx.strokeStyle = `rgba(127, 127, ${(1.0 * 0.5 + 0.5) * 255}, 1)`
        ctx.stroke()
      }
    }
  }

  state.gpu.programs = {
    raymarchFixedStep: shaders.RenderTriangleSoup(
      state.gpu,
      state.meshes.cube,
      textures.objectID,
      textures.depth,
      textures.normals,
      state.gpu.presentationFormat,
      /* wgsl */`
        fn Mod(x: vec2f, y: f32) -> vec2f {
          return x - y * floor(x / y);
        }


        // The MIT License -  Copyright © 2017 Inigo Quilez
        // see: https://www.shadertoy.com/view/XtBfzz

        // --- analytically box-filtered grid ---
        fn GridTextureGradBox(p: vec2f, ddx: vec2f, ddy: vec2f, ratio: f32, t: f32) -> f32 {
          // filter kernel
          let w = max(
            abs(ddx),
            abs(ddy)
          ) * 1.0 / t * ratio * 0.95;

          // analytic (box) filtering
          let a = p + 0.5 * w;
          let b = p - 0.5 * w;
          let i = (
            floor(a)+min(fract(a)*ratio, vec2f(1.0))-
            floor(b)-min(fract(b)*ratio, vec2f(1.0))
          ) / (ratio*w);
          //pattern
          return (1.0-i.x)*(1.0-i.y);
        }

        fn ToneMapGooch(ndotl: f32, cool: vec3f, warm: vec3f) -> vec3f {
          let num = (1.0 + ndotl);
          return num * cool + (1.0 - num) * warm;
        }

        fn IsNegative(v: f32) -> bool {
          return (bitcast<u32>(v) & (1<<31)) != 0;
        }


        // d is the previous interpolated value that allows us to determine which side of
        // the surface we were on before the zero crossing
        fn ComputeColor(pos: vec3f, rayDir: vec3f, d: f32) -> vec4f {
          let baseColor = select(${HexColorToVec3f('#5ab552')}, ${HexColorToVec3f('#fa6e79')}, d >= 0.0);
          let hitNormal = ComputeNormal(pos);

          const lightPos = vec3(1.0);
          // let lightDir = normalize((pos * 2.0 - 1.0) - lightPos);
          let lightDir = normalize(lightPos);
          let ndotl = dot(hitNormal, lightDir);
          var color = baseColor * max(0.1, ndotl);
          let reflectDir = reflect(-lightDir, hitNormal);
          let spec = pow(max(dot(rayDir, reflectDir), 0.0), 2) * 0.1;

          // from 'A Non-Photorealistic lighting model for automatic technical illustration"
          if (false) {
            let alpha = 0.6;
            let beta = 0.5;
            let b = 0.4;
            let y = 0.4;

            let kcool = ${HexColorToVec3f('#0000FF')} * alpha;
            let kwarm = ${HexColorToVec3f('#FFFF00')} * beta;

            color = baseColor + ToneMapGooch(-ndotl, kcool, kwarm);
            // color = ToneMapGooch(ndotl, kcool, kwarm);
            color += spec;
          } else {
            let spec = pow(max(dot(rayDir, reflectDir), 0.0), 16) * 0.4;
            color = baseColor * max(0.5, ndotl);// + vec3(1.0) * spec;
          }

          // color = hitNormal * 0.5 + 0.5;

          return vec4f(color, 1.0);
        }

        @fragment
        fn FragmentMain(
          fragData: VertexOut
        ) -> FragmentOut {
          var out: FragmentOut;
          out.color = vec4(fragData.color, 1.0);
          out.objectID = fragData.objectID;

          let dFdxPos = dpdx(fragData.worldPosition);
          let dFdyPos = -dpdy(fragData.worldPosition);
          let normal = normalize(cross(dFdxPos, dFdyPos));

          out.normal = vec4(normal, 1.0);

          let uvw = (fragData.worldPosition * 0.5 + 0.5);
          var eye = ubo.eye.xyz * 0.5 + 0.5;
          let rayDir = normalize(uvw - eye);
          var tInterval = RayAABB(vec3(0.0), vec3(1.0), eye, 1.0 / rayDir);

          var rayOrigin = eye;
          if (tInterval.x > 0.0) {
            rayOrigin = eye + rayDir * tInterval.x;
            tInterval.y -= tInterval.x;
            tInterval.x = 0.0;
          } else {
            tInterval.x = 0.0;
          }

          var t = tInterval.x;
          var hit = false;
          var steps = 0.0;

          let maxSteps = ubo.approachParams[0].x;
          let invMaxSteps = 1.0 / maxSteps;
          var lastT = t;
          var lastD = TrilinearInterpolation(rayOrigin);
          var d = lastD;
          var lastSlope = (TrilinearInterpolation(rayOrigin + rayDir * invMaxSteps) - lastD) / invMaxSteps;
          while(t < tInterval.y) {
            let pos = rayOrigin + rayDir * t;
            d = TrilinearInterpolation(pos);
            if (d == 0.0) {
              out.color = ComputeColor(pos, rayDir, lastD);
              return out;
            } else if (IsNegative(lastD) != IsNegative(d)) {
              // TODO: linear interpolation to find a better estimate of the zero crossing t value
              let tguess = t;// + abs(d - lastD) / (t - lastT);
              let newPos = rayOrigin + rayDir * tguess;
              out.color = ComputeColor(newPos, rayDir, lastD);
              return out;
            }

            let deltaT = t - lastT;
            let deltaD = d - lastD;
            let slope = deltaD / deltaT;
            t += invMaxSteps;


            // if (IsNegative(lastSlope) != IsNegative(slope)) {
            //   // TODO: linear interpolation to find a better estimate of the zero crossing t value
            //   // if (deltaD == 0.0) {
            //   //   continue;
            //   // }
            //   // let tguess = lastT;// + slope * min(d, lastD) / deltaD;//abs(d - lastD) / (t - lastT);
            //   // let newPos = rayOrigin + rayDir * tguess;
            //   // out.color = ComputeColor(newPos, rayDir, lastD);
            //   // return out;
            //   out.color += vec4(0.0, 0.8, 0.0, 1.0);
            //   hit = true;
            // }
            lastSlope = slope;

            lastD = d;
            lastT = t;
            steps += 1.0;
          }

          if (hit) {
            return out;
          }

          if (t >= tInterval.y) {
            let baseColor = vec3f(0.4);
            var v: f32;
            let divisions = 20.0;
            let ratio = 20.0;
            let faceUV = (fragData.faceUV) * divisions;// + 1.0 / ratio * 0.5;
            if (fragData.faceNormal.x != 0.0) {
              v = GridTextureGradBox(faceUV, dFdxPos.yz, dFdyPos.yz, ratio, saturate(t/tInterval.y));
            } else if (fragData.faceNormal.y != 0.0) {
              v = GridTextureGradBox(faceUV, dFdxPos.xz, dFdyPos.xz, ratio, saturate(t/tInterval.y));
            } else {
              v = GridTextureGradBox(faceUV, dFdxPos.xy, dFdyPos.xy, ratio, saturate(t/tInterval.y));
            }

            var color = baseColor * (1.0 - v);

            if (d < 0.0 ) {
              let c = ${HexColorToVec3f('#5ab552')};
              color = color + (v * c) * 0.2;
            }
            out.color = vec4(color, 1.0);
            return out;
          }

          if (!hit) {
            discard;
          }

          let debugRenderStepCount = ubo.debugParams[0].x;
          if (debugRenderStepCount > 0.0) {
            out.color = vec4(JetLinear(steps/maxSteps), 1.0);
          }
          return out;
        }
      `
    ),

    raytraceSignedDistanceFunctionGrids: (function () {
      return shaders.RenderTriangleSoup(
        state.gpu,
        state.meshes.cube,
        textures.objectID,
        textures.depth,
        textures.normals,
        state.gpu.presentationFormat,
      /* wgsl */`

        fn ComputeConstants(rayOrigin: vec3f, rayDir: vec3f) -> vec4f {
          /*
                6       7
                +------+
               /.     /|
            2 +------+3|
              | + 4  | + 5
              |.     |/
              +------+
            0         1

            s000 = 0
            s100 = 1
            s010 = 2
            s110 = 3

            s001 = 4
            s100 = 5
            s010 = 6
            s110 = 7

            Note: these have been swapped to be z-up!
          */

          // compute the constants
          let s000 = ubo.sceneParams.c000;
          let s100 = ubo.sceneParams.c100;
          let s010 = ubo.sceneParams.c010;
          let s110 = ubo.sceneParams.c110;

          let s001 = ubo.sceneParams.c001;
          let s101 = ubo.sceneParams.c101;
          let s011 = ubo.sceneParams.c011;
          let s111 = ubo.sceneParams.c111;

          let a = s101 - s001;
          let k0 = s000;
          let k1 = s100 - s000;
          let k2 = s010 - s000;
          let k3 = s110 - s010 - k1;
          let k4 = k0 - s001;
          let k5 = k1 - a;
          let k6 = k2 - (s011 - s001);
          let k7 = k3 - (s111 - s011 - a);

          let ox = rayOrigin.x;
          let oy = rayOrigin.z;
          let oz = rayOrigin.y;

          let dx = rayDir.x;
          let dy = rayDir.y;
          let dz = rayDir.z;

          let m0 = ox * oy;
          let m1 = dx * dy;
          let m2 = ox * dy + oy * dx;
          let m3 = k5 * oz - k1;
          let m4 = k6 * oz - k2;
          let m5 = k7 * oz - k3;

          return vec4f(
            (k4 * oz - k0) + ox * m3 + oy * m4 + m0 * m5,
            dx * m3 + dy * m4 + m2 * m5 + dz * (k4 + k5 * ox + k6 * oy + k7 * m0),
            m1 * m5 + dz * (k5 * dx + k6 * dy + k7 * m2),
            k7 * m1 * dz
          );
        }

        fn EvalG(constants: vec4f, t: f32) -> f32 {
          return constants[3] * pow(t, 3.0) +
                 constants[2] * pow(t, 2.0) +
                 constants[1] * t +
                 constants[0];
        }

        fn EvalGPrime(constants: vec4f, t: f32) -> f32 {
          return 3.0 * constants[3] * pow(t, 2.0) +
                 2.0 * constants[2] * t +
                 constants[1];
        }

        fn SolveQuadratic(a: f32, b: f32, c: f32) -> vec2f {
          let q = -0.5 * (b + sign(b) * sqrt(pow(b, 2.0) - 4.0 * a * c));
          return vec2f(q/a, c/q);
        }

        fn QuadraticRootCount(a: f32, b: f32, c: f32) -> f32 {
          let discriminant = pow(b, 2.0) - 4.0 * a * c;
          if (discriminant > 0.0) {
            return 2.0;
          } else if (discriminant == 0.0) {
            return 1.0;
          } else {
            return 0.0;
          }
        }

        @fragment
        fn FragmentMain(
          fragData: VertexOut
        ) -> FragmentOut {
          var out: FragmentOut;
          out.color = vec4(fragData.color, 1.0);
          out.objectID = fragData.objectID;

          let dFdxPos = dpdx(fragData.worldPosition);
          let dFdyPos = -dpdy(fragData.worldPosition);
          let normal = normalize(cross(dFdxPos, dFdyPos));

          out.normal = vec4(normal, 1.0);
          out.color = vec4(normal.xyz * 0.5 + 0.5, 1.0);

          let uvw = (fragData.worldPosition * 0.5 + 0.5);
          let eye = ubo.eye.xyz * 0.5 + 0.5;
          let rayDir = normalize(uvw - eye);
          var tInterval = RayAABB(vec3(0.0), vec3(1.0), eye, 1.0 / rayDir);
          if (tInterval.y < 0.0) {
            out.color = vec4(1.0, 0.0, 1.0, 1.0);
            return out;
          }

          var rayOrigin = eye;
          if (tInterval.x > 0.0) {
            rayOrigin = eye + rayDir * tInterval.x;
            tInterval.y -= tInterval.x;
            tInterval.x = 0.000001;
          } else {
            tInterval.x = 0.0;
          }

          var t = tInterval.x;
          let Constants = ComputeConstants(rayOrigin, rayDir);

          let maxSteps = 10.0;
          let kNumericEpsilon = 0.01;
          var hit = false;
          var steps = 0.0;
          while (steps < maxSteps) {
            let g =  EvalG(Constants, t);
            let gprime = EvalGPrime(Constants, t);
            let deltaT = g / gprime;
            t -= deltaT;
            steps += 1.0;
            if (abs(deltaT) <= kNumericEpsilon) {
              out.color = vec4(ComputeNormal(eye + rayDir * t) * 0.5 + 0.5, 1.0);
              hit = true;
              break;
            }
          }

          if (!hit) {
            out.color = vec4(1.0, 0.0, 1.0, 1.0);
            // discard;
          }

          return out;
        }
      `
      )
    })(),

    renderMCOutput: shaders.RenderTriangleSoup(
      state.gpu,
      state.meshes.computedTriangles,
      textures.objectID,
      textures.depth,
      textures.normals,
      state.gpu.presentationFormat,
      /* wgsl */`
       @fragment
        fn FragmentMain(
          fragData: VertexOut
        ) -> FragmentOut {
          var out: FragmentOut;
          out.color = vec4(1.0);
          out.objectID = fragData.objectID;
          return out;
        }
      `
    ),

    drawOverlay: shaders.BlitOverlay(state.gpu, state.overlay)
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

  const MoveMouse = (x, y) => {
    let ratioX = canvas.width / canvas.clientWidth
    let ratioY = canvas.height / canvas.clientHeight
    state.mouse.pos[0] = x * ratioX
    state.mouse.pos[1] = y * ratioY
    state.dirty = true;
  }

  window.addEventListener("mouseup", e => {
    state.mouse.down = false
    state.cameraCapturedMouse = false
  })

  canvas.addEventListener("mousedown", (e) => {
    if (!state.disableCameraMovement) {
      state.cameraCapturedMouse = true
    }
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

      if (!state.disableCameraMovement) {
        state.camera.rotate(dx, -dy)
      }
    }
  }, { passive: false })

  canvas.addEventListener("wheel", e => {
    state.camera.zoom(e.deltaY)
    state.dirty = true
    e.preventDefault()
  }, { passive: false })

  const Param = CreateParamReader(state, controlEl)
  function ReadParams() {
    Param('debugRenderStepCount', 'bool')
    Param('debugRenderAxes', 'bool')
    Param('debugShowCornerLabels', 'bool')
    Param('debugRenderAllCorners', 'bool')

    Param('scene', 'string')
    Param('approach', 'string')
  }

  // Note: I'm toying with the idea of automatic control wiring
  function CreateSubParams(state, controlName) {
    const cache = {}
    // let controlName = 'scene'
    let selectorControl = controlEl.querySelector(`.${controlName}-control`)
    let options = selectorControl.querySelectorAll('select option')
    options.forEach(option => {
      let controlHarness = {}
      controlHarness.el = controlEl.querySelector(`.shownBy-${controlName}[showValue="${option.value}"]`)
      if (controlHarness.el) {
        controlHarness.Param = CreateParamReader(state, controlHarness.el, controlName + '-' + option.value)
        let subcontrols = Array
          .from(controlHarness.el.querySelectorAll('.control'))
          .map(control => {
            let paramName = Array
              .from(control.classList)
              .find(name => name.endsWith('-control')).replace('-control', '')

            let el = control.querySelector(['input', 'select'])

            let paramType = 'f32'
            switch (el.type) {
              case 'checkbox': {
                paramType = 'bool'
                break;
              }
            }

            return {
              paramName, paramType
            }
          })

        controlHarness.update = () => {
          subcontrols.forEach(subcontrol => {
            controlHarness.Param(subcontrol.paramName, subcontrol.paramType)
          })
        }

      } else {
        controlHarness.update = function () { }
      }


      cache[option.value] = controlHarness
    })
    return cache
  }

  const scenes = CreateSubParams(state, 'scene')
  const approaches = CreateSubParams(state, 'approach')

  function RenderFrame() {
    ReadParams()

    scenes[state.params.scene].update()
    approaches[state.params.approach].update()

    const now = Now()
    const deltaTime = (now - state.lastFrameTime) / 1000.0
    state.lastFrameTime = now

    if (state.camera.tick(canvas.width, canvas.height, deltaTime)) {
      localStorage.setItem('isosurface-extraction-3d/camera', JSON.stringify(state.camera.state));
      state.dirty = true;
    }

    if (!state.dirty) {
      requestAnimationFrame(RenderFrame)
      return
    }
    state.dirty = false;

    mat4.multiply(
      state.worldToScreen,
      state.camera.computed.view,
      state.model,
    );

    let invModelView = mat4.create()
    mat4.invert(invModelView, state.worldToScreen)

    mat4.multiply(
      state.worldToScreen,
      state.camera.computed.projection,
      state.worldToScreen
    );

    vec3.set(
      state.eye,
      invModelView[12],
      invModelView[13],
      invModelView[14],
    )

    mat4.invert(state.screenToWorld, state.worldToScreen)

    switch (state.params.scene) {
      case 'manual': {
        // corners 0..8
        state.sceneParams[0] = state.params['scene-manual'].c000
        state.sceneParams[1] = state.params['scene-manual'].c100
        state.sceneParams[2] = state.params['scene-manual'].c010
        state.sceneParams[3] = state.params['scene-manual'].c110
        state.sceneParams[4] = state.params['scene-manual'].c001
        state.sceneParams[5] = state.params['scene-manual'].c101
        state.sceneParams[6] = state.params['scene-manual'].c011
        state.sceneParams[7] = state.params['scene-manual'].c111
        break;
      }

      case 'time-varying': {
        // corners 0..8
        state.sceneParams[0] = -0.5
        state.sceneParams[1] = 1
        state.sceneParams[2] = Math.sin(Now() * 0.0001) * 2.0
        state.sceneParams[3] = 1
        state.sceneParams[4] = 1
        state.sceneParams[5] = Math.cos(Now() * 0.001) + Math.sin(Now() * 0.001) * 2.0
        state.sceneParams[6] = 1
        state.sceneParams[7] = Math.sin(Now() * 0.0005) * 2.0

        // keep rendering frames
        state.dirty = true;
        break;
      }
    }

    state.overlay.update(
      state.worldToScreen,
      state.eye
    )

    let approachParams = state.params['approach-' + state.params.approach]
    switch (state.params.approach) {
      case 'fixed-step-ray-march': {
        state.approachParams[0] = approachParams.maxFixedSteps
        break;
      }
    }

    // Debug Params
    {
      state.debugParams[0] = state.params.debugRenderStepCount ? 1.0 : 0.0
    }

    const commandEncoder = state.gpu.device.createCommandEncoder()
    let frameTextureView = ctx.getCurrentTexture().createView()

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

    let renderFunction = state.gpu.programs.raymarchFixedStep
    // let renderFunction = state.gpu.programs.raytraceSignedDistanceFunctionGrids

    if (renderFunction) {
      let pass = commandEncoder.beginRenderPass(renderPassDesc);
      const objectID = 0

      let width = canvas.width
      let height = canvas.height
      pass.setViewport(0, 0, width, height, 0, 1);
      pass.setScissorRect(0, 0, width, height);

      renderFunction(
        pass,
        state.worldToScreen,
        state.screenToWorld,
        [0, 0, 0],
        state.eye,
        [canvas.width, canvas.height],
        objectID,
        state.sceneParams,
        state.approachParams,
        state.debugParams
      )

      // pass.setViewport(halfWidth, 0, width, halfHeight, 0, 1);
      // pass.setScissorRect(halfWidth, 0, halfWidth, halfHeight);

      state.gpu.programs.renderMCOutput(
        pass,
        state.worldToScreen,
        state.screenToWorld,
        [0, 0, 0],
        state.eye,
        [canvas.width, canvas.height],
        objectID,
        state.sceneParams,
        state.approachParams,
        state.debugParams
      )
      pass.end();
    }

    state.gpu.programs.drawOverlay(
      commandEncoder,
      state.gpu.device.queue,
      frameTextureView,
      state.worldToScreen,
      state.eye
    )

    state.gpu.device.queue.submit([commandEncoder.finish()])

    requestAnimationFrame(RenderFrame)
  }

  requestAnimationFrame(RenderFrame)
}