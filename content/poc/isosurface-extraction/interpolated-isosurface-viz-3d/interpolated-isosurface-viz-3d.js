import CreateOrbitCamera from "./orbit-camera.js"
import CreateParamReader from "./params.js"
import CreateCubeMesh from './primitive-cube.js'

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

    debugParams: new Float32Array(16),
    sceneParams: new Float32Array(16),
    approachParams: new Float32Array(16),
  }

  state.camera.state.distance = 3.0;
  state.camera.state.scrollSensitivity = 0.05;

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
        ['sceneParams', 'mat4x4<f32>', 16 * 4],
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
          // let factor = saturate(uvw);
          // let factor = fract(uvw);
          let factor = uvw;
          let invFactor = 1.0 - factor;
          // format: c{X}{Y}{Z}
          let c000 = ubo.sceneParams[0][0];
          let c100 = ubo.sceneParams[0][1];
          let c010 = ubo.sceneParams[0][2];
          let c110 = ubo.sceneParams[0][3];

          let c001 = ubo.sceneParams[1][0];
          let c101 = ubo.sceneParams[1][1];
          let c011 = ubo.sceneParams[1][2];
          let c111 = ubo.sceneParams[1][3];

          let c00 = c000 * invFactor.x + c100 * factor.x;
          let c01 = c010 * invFactor.x + c110 * factor.x;
          let c10 = c001 * invFactor.x + c101 * factor.x;
          let c11 = c011 * invFactor.x + c111 * factor.x;

          let c0 = c00 * invFactor.y + c10 * factor.y;
          let c1 = c01 * invFactor.y + c11 * factor.y;

          return c0 * invFactor.z + c1 * factor.z;
        }

        fn ComputeNormal(pos: vec3f) -> vec3f {
          const eps = 0.0001; // or some other value
          const h = vec2f(eps,0);
          return normalize( vec3f(TrilinearInterpolation(pos+h.xyy) - TrilinearInterpolation(pos-h.xyy),
                                  TrilinearInterpolation(pos+h.yxy) - TrilinearInterpolation(pos-h.yxy),
                                  TrilinearInterpolation(pos+h.yyx) - TrilinearInterpolation(pos-h.yyx) ) );
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
          cullMode: 'front',
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
        pass.setViewport(0, 0, canvas.width, canvas.height, 0, 1);
        pass.setScissorRect(0, 0, canvas.width, canvas.height);
        pass.setVertexBuffer(0, mesh.positionBuffer);
        pass.setVertexBuffer(1, mesh.normalBuffer);
        pass.draw(mesh.vertexCount, 1);
      }
    },
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
  state.mesh = CreateCubeMesh(state.gpu)

  state.gpu.programs = {
    raymarchFixedStep: shaders.RenderTriangleSoup(
      state.gpu,
      state.mesh,
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
          if (tInterval.y < tInterval.x) {
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
          var hit = false;
          var steps = 0.0;

          let maxSteps = ubo.approachParams[0].x;
          let invMaxSteps = 1.0 / maxSteps;
          let eps = invMaxSteps * 4.0;
          let debugRenderSolid = ubo.debugParams[0].y;
          while(t < tInterval.y) {
            let pos = rayOrigin + rayDir * t;
            if (t >= tInterval.x) {
              let d = TrilinearInterpolation(pos);
              if (
                (debugRenderSolid > 0.0 && d <= 0.0) ||
                abs(d) <= eps
              ) {
                out.color = vec4(1.0);
                out.color = vec4(ComputeNormal(pos) * 0.5 + 0.5, 1.0);
                hit = true;
                break;
              }
            }
            t += invMaxSteps;
            steps += 1.0;
          }

          if (t >= tInterval.y) {
            out.color = vec4(((1.0 - steps/(maxSteps * 8)) + 1.0) / 6.0);
            // out.color = vec4(normal * 0.5 + 0.5, 1.0);
            hit = true;
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
        state.mesh,
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
          let s000 = ubo.sceneParams[0][0];
          let s100 = ubo.sceneParams[0][1];
          let s010 = ubo.sceneParams[0][2];
          let s110 = ubo.sceneParams[0][3];

          let s001 = ubo.sceneParams[1][0];
          let s101 = ubo.sceneParams[1][1];
          let s011 = ubo.sceneParams[1][2];
          let s111 = ubo.sceneParams[1][3];

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
          let oy = rayOrigin.y;
          let oz = rayOrigin.z;

          let dx = rayDir.x;
          let dy = rayDir.y;
          let dz = rayDir.y;

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
          // if (tInterval.y < 0.0) {
          //   out.color = vec4(1.0, 0.0, 1.0, 1.0);
          //   return out;
          // }

          var rayOrigin = eye;
          if (tInterval.x > 0.0) {
            rayOrigin = eye + rayDir * tInterval.x;
            tInterval.y -= tInterval.x;
            tInterval.x = 0.0;
          }

          var t = tInterval.x;
          let Constants = ComputeConstants(rayOrigin, rayDir);

          let maxSteps = 1000.0;
          let kNumericEpsilon = 0.001;
          var hit = false;
          var steps = 0.0;
          while (steps < maxSteps && t < tInterval.y) {
            let g =  EvalG(Constants, t);
            let gprime = EvalGPrime(Constants, t);
            let deltaT = g / gprime;
            t -= deltaT;
            steps += 1.0;
            if (abs(deltaT) <= kNumericEpsilon) {
              out.color = vec4(ComputeNormal(rayOrigin + rayDir * t) * 0.5 + 0.5, 1.0);
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
    })()
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

  const Param = CreateParamReader(state, controlEl)
  function ReadParams() {
    Param('debugRenderStepCount', 'bool')
    Param('debugRenderSolid', 'f32')

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
      state.dirty = true;
    }

    if (!state.dirty) {
      requestAnimationFrame(RenderFrame)
      return
    }
    state.dirty = false;

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
        state.sceneParams[2] = Math.sin(Now() * 0.0001) * 4.0
        state.sceneParams[3] = 1
        state.sceneParams[4] = 1
        state.sceneParams[5] = -2.0 + Math.cos(Now() * 0.001) + Math.sin(Now() * 0.001) * 3.0
        state.sceneParams[6] = 1
        state.sceneParams[7] = -4 - Math.sin(Now() * 0.0005) * 4.0

        // keep rendering frames
        state.dirty = true;
        break;
      }
    }
    switch (state.params.approach) {
      case 'fixed-step-ray-march': {
        state.approachParams[0] = state.params['approach-fixed-step-ray-march'].maxFixedSteps
        break;
      }
    }

    // Debug Params
    {
      state.debugParams[0] = state.params.debugRenderStepCount ? 1.0 : 0.0
      state.debugParams[1] = state.params.debugRenderSolid ? 1.0 : 0.0
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

    let renderFunction = null
    switch (state.params.approach) {
      case 'fixed-step-ray-march': {
        renderFunction = state.gpu.programs.raymarchFixedStep;
        break;
      }
      case 'ray-tracing-signed-distance-grids': {
        renderFunction = state.gpu.programs.raytraceSignedDistanceFunctionGrids;
        break;
      }
    }

    if (renderFunction) {
      let pass = commandEncoder.beginRenderPass(renderPassDesc);
      const objectID = 0

      renderFunction(
        pass,
        state.camera.state.worldToScreen,
        state.camera.state.screenToWorld,
        [0, 0, 0],
        state.camera.state.eye,
        [canvas.width, canvas.height],
        objectID,
        state.sceneParams,
        state.approachParams,
        state.debugParams
      )
      pass.end();
    }
    state.gpu.device.queue.submit([commandEncoder.finish()])

    requestAnimationFrame(RenderFrame)
  }

  requestAnimationFrame(RenderFrame)
}