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
          @location(4) faceUV: vec2f,
          @interpolate(flat) @location(5) faceNormal: vec3f,

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
          let c10 = c010 * invFactor.x + c110 * factor.x;
          let c01 = c001 * invFactor.x + c101 * factor.x;
          let c11 = c011 * invFactor.x + c111 * factor.x;

          let c0 = c00 * invFactor.z + c10 * factor.z;
          let c1 = c01 * invFactor.z + c11 * factor.z;

          return c0 * invFactor.y + c1 * factor.y;
        }

        fn ComputeNormal(pos: vec3f) -> vec3f {
          const eps = 0.001; // or some other value
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
          ) * 1.0 / t * ratio * 0.75;

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
          let num = (1.0 + ndotl) * 0.5;
          return num * cool + (1.0 - num) * warm;
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
          var lastT = t;
          var lastD = TrilinearInterpolation(rayOrigin + rayDir * tInterval.x);
          while(t < tInterval.y) {
            let pos = rayOrigin + rayDir * t;
            let d = TrilinearInterpolation(pos);
            if (
              (debugRenderSolid > 0.0 && d <= 0.0) ||
              sign(lastD) != sign(d)
            ) {
              // let baseColor = ${HexColorToVec3f('#ffffff')};
              let baseColor = ${HexColorToVec3f('#26854c')};
              let hitNormal = sign(d) * ComputeNormal(pos);

              const lightPos = vec3(2.0, 1.0, 0.5);
              let ndotl = dot(hitNormal, -normalize((pos * 2.0 - 1.0) - lightPos));
              var color = baseColor * max(0.4, ndotl);


              // from 'A Non-Photorealistic lighting model for automatic technical illustration"
              {
                let alpha = 1.0;
                let beta = 1.0;
                let b = 0.4;
                let y = 0.4;

                let kcool = ${HexColorToVec3f('#0000FF')} * alpha;
                let kwarm = ${HexColorToVec3f('#FFFF00')} * beta;

                color = baseColor * ToneMapGooch(ndotl, kcool, kwarm);
              }
              out.color = vec4(color, 1.0);
              // out.color = vec4(hitNormal * 0.5 + 0.5, 1.0);
              return out;
            }

            lastD = d;
            lastT = t;
            t += invMaxSteps;
            steps += 1.0;
          }

          if (t >= tInterval.y) {
            let baseColor = vec3f(0.4);
            // out.color = vec4f(baseColor * g, 1.0);

            // let dFdxPos = dpdx(fragData.worldPosition);
            // let dFdyPos = dpdy(fragData.worldPosition);
            var v: f32;


            let divisions = 20.0;
            let ratio = 20.0;
            let faceUV = fragData.faceUV * divisions + 1.0 / ratio * 0.5;
            if (fragData.faceNormal.x != 0.0) {
              v = GridTextureGradBox(faceUV, dFdxPos.yz, dFdyPos.yz, ratio, saturate(t/tInterval.y));
            } else if (fragData.faceNormal.y != 0.0) {
              v = GridTextureGradBox(faceUV, dFdxPos.xz, dFdyPos.xz, ratio, saturate(t/tInterval.y));
            } else {
              v = GridTextureGradBox(faceUV, dFdxPos.xy, dFdyPos.xy, ratio, saturate(t/tInterval.y));
            }

            var color = baseColor * (1.0 - v);
            // color = mix(color, vec3(1.0), 1.0 - exp( -0.5*t*t ) );


            out.color = vec4(color, 1.0);
            return out;


            // if (length(modf(uvw).fract) > 0.5) {
            //   out.color = vec4(1.0);
            //   return out;
            // }
            // out.color = vec4(((1.0 - steps/(maxSteps * 8)) + 1.0) / 6.0);
            // out.color = vec4(normal * 0.5 + 0.5, 1.0);
            // hit = true;
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
        const PI = ${Math.PI};
        const TAU = ${Math.PI * 2.0};

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

        // // from: 'Interactive Raytracing for Isosurface Rendering' Parker et. al
        // fn ComputeConstantsBruteForce(rayOrigin: vec3f, rayDir: vec3f) -> vec4f {

        //   let a0 = rayOrigin;
        //   let b0 = rayDir;

        //   let a1


        // }

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


        struct QuadraticRoots {
          roots: vec2f,
          count: i32,
        };

        fn SolveQuadratic(a: f32, b: f32, c: f32) -> QuadraticRoots {
          var result: QuadraticRoots;
          result.count = 0;

          let q = -0.5 * (b + sign(b) * sqrt(b * b - 4 * a  * c));
          if (q == 0.0) {
            result.roots[0] = 0.0;
            result.count = 1;
            return result;
          }

          let x1 = q / a;
          let x2 = c / (q * x1);

          if (a == 0) {
            result.roots[0] = x2;
            result.count = 1;
            return result;
          }

          result.roots[0] = min(x1, x2);
          result.roots[1] = max(x1, x2);
          result.count = 2;
          return result;
        }

        fn SolveQuadraticGraphicsGems(a: f32, b: f32, c: f32) -> QuadraticRoots {
          var result: QuadraticRoots;
          result.count = 0;

          let p = b / (2 * a);
          let q = c / a;
          let D = p * p - q;

          if (abs(D) < 0.000001) {
            result.roots[0] = -p;
            result.count = 1;
          } else if (D < 0) {
            result.count = 0;
          } else { /* if (D > 0) */
            let sqrt_D = sqrt(D) - p;
            result.roots[0] = min(-p, p);
            result.roots[1] = max(-p, p);
            result.count = 2;
          }

          return result;
        }


        struct CubicRoots {
          roots: vec3f,
          count: i32,
        };

        fn SolveCubic(a: f32, b: f32, c:f32, d: f32) -> CubicRoots {
          var result: CubicRoots;
          const TAU = ${Math.PI * 2.0};
          let Q = (a * a - 3.0 * b) / 9.0;
          let R = (2 * a * a * a - 9 * a * b + 27.0 * c) / 54.0;

          let theta = acos(R/sqrt(Q * Q * Q));
          var v = -2 * sqrt(Q) * vec3f(
            cos(theta / 3.0),
            cos((theta + TAU) / 3.0),
            cos((theta - TAU) / 3.0),
          ) - a / 3.0;

          if (v.z < v.x) {
            let tmp = v.x;
            v.x = v.z;
            v.z = tmp;
          }

          if (v.y < v.x) {
            let tmp = v.x;
            v.x = v.y;
            v.y = tmp;
          }

          if (v.z < v.y) {
            let tmp = v.y;
            v.y = v.z;
            v.z = tmp;
          }

          result.roots = v;
          result.count = 3;
          return result;
        }

        const EQN_EPS_GRAPHICS_GEMS: f32 = 1e-30;

        fn IsZeroGraphicsGems(x: f32) -> bool {
          return x > -EQN_EPS_GRAPHICS_GEMS && x < EQN_EPS_GRAPHICS_GEMS;
        }

        // TODO: as per 'Interactive RayTracing for Isosurface Rendering', they modify this function
        //       to handle the A=0.0 case and they also bump up the EPS to 1e-30
        fn SolveCubicGraphicsGems(c: vec4f) -> CubicRoots {
          const oneThird = 1.0 / 3.0;

          var result: CubicRoots;
          result.count = 0;

          // normal form: x^3 + Ax^2 + Bx + C = 0
          let A = c[ 2 ] / c[ 3 ];
          let B = c[ 1 ] / c[ 3 ];
          let C = c[ 0 ] / c[ 3 ];

          var s: vec2f;

          // substitute x = y - A/3 to eliminate quadric term: x^3 +px + q = 0

          let sq_A = A * A;
          let p = oneThird * (- oneThird * sq_A + B);
          let q = 1.0/2 * (2.0/27 * A * sq_A - oneThird * A * B + C);

          /* use Cardano's formula */

          let cb_p = p * p * p;
          let D = q * q + cb_p;

          if (IsZeroGraphicsGems(D)) {
            if (IsZeroGraphicsGems(q)) {
              result.roots[0] = 0.0;
              result.count = -1;
            } else {
              let u = pow(-q, oneThird);
              let r0 = 2 * u;
              let r1 = -u;
              result.roots[0] = min(r0, r1);
              result.roots[1] = max(r0, r1);
              result.count = 2;
            }
          } else if (D < 0) {
            let phi = oneThird * acos(-q / sqrt(-cb_p));
            let t = 2 * sqrt(-p);

            result.roots[0] =   t * cos(phi);
            result.roots[1] = - t * cos(phi + PI / 3);
            result.roots[2] = - t * cos(phi - PI / 3);
            var tmp: f32;

            if (result.roots[0] > result.roots[1]) {
              tmp = result.roots[0];
              result.roots[0] = result.roots[1];
              result.roots[1] = tmp;
            }

            if (result.roots[1] > result.roots[2]) {
              tmp = result.roots[1];
              result.roots[1] = result.roots[2];
              result.roots[2] = tmp;
            }

            if (result.roots[0] > result.roots[1]) {
              tmp = result.roots[0];
              result.roots[0] = result.roots[1];
              result.roots[1] = tmp;
            }

            result.count = 3;
          } else {
            let sqrt_D = sqrt(D);
            let u = pow(sqrt_D - q, oneThird);
            let v = - pow(sqrt_D + q, oneThird);
            result.roots[0] = u + v;
            result.count = 1;
          }

          // resubstitute

          let sub = oneThird * A;

          for (var i = 0; i < result.count; i++) {
            result.roots[i] -= sub;
          }

          return result;
        }

        fn EstimateStartingT(Constants: vec4f, tstart: f32, tend: f32) -> f32 {
          let gend = EvalG(Constants, tend);
          let gstart = EvalG(Constants, tstart);
          return (gend * tstart - gstart * tend) / (gend - gstart);
        }


        fn RaymarchFixedStep(Constants: vec4f, rayOrigin: vec3f, rayDir: vec3f, startT: f32, maxT: f32) -> f32 {
          let eps = 0.02;
          let debugRenderSolid = ubo.debugParams[0].y;
          var t = max(startT, EstimateStartingT(Constants, startT, maxT));

          while(t < maxT) {
            let pos = rayOrigin + rayDir * t;
            let d = TrilinearInterpolation(pos);
            if (abs(d) <= eps) {
              return t;
            }
            t += 0.01;
          }
          return -1.0;
        }

        fn RaymarchNewtonRaphson(Constants: vec4f, rayOrigin: vec3f, rayDir: vec3f, startT: f32, maxT: f32) -> f32 {
          var remainingSteps = 500;
          const eps = 0.001;
          var t = max(startT, EstimateStartingT(Constants, startT, maxT));
          while (t >= startT && t < maxT && remainingSteps > 0) {
            let g =  EvalG(Constants, t);
            let gprime = EvalGPrime(Constants, t);
            let deltaT = -(g / gprime);

            if (abs(deltaT) < eps) {
              return t;
            }

            t += deltaT;
            remainingSteps--;
          }

          return -1.0;
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
          // out.color = vec4(normal.xyz * 0.5 + 0.5, 1.0);

          let uvw = (fragData.worldPosition * 0.5 + 0.5);
          let eye = ubo.eye.xyz * 0.5 + 0.5;
          let rayDir = normalize(uvw - eye);
          var tInterval = RayAABB(vec3(0.0), vec3(1.0), eye, 1.0 / rayDir);

          var rayOrigin = eye;
          if (tInterval.x > 0.0) {
            rayOrigin = saturate(eye + rayDir * tInterval.x);
            tInterval.y -= tInterval.x;
            tInterval.x = 0.0;
          }

          var t = tInterval.x;
          let Constants = ComputeConstants(rayOrigin, rayDir);

          // let result = SolveQuadratic(
          //   3.0 * Constants[3],
          //   2.0 * Constants[2],
          //   Constants[1]
          // );
          // let result = SolveQuadraticGraphicsGems(
          //   3.0 * Constants[3],
          //   2.0 * Constants[2],
          //   Constants[1]
          // );

          let result = SolveCubicGraphicsGems(Constants);
          // let result = SolveCubic(Constants[3], Constants[2], Constants[1], Constants[0]);

          if (result.count == -1) {
            out.color = vec4(0.2, .5, 1.0, 1.0);
            return out;
          }

          let minRoot = i32(ubo.approachParams[0][0]);
          let maxRoot = min(result.count, i32(ubo.approachParams[0][1]));
          let fixedStepToggle = select(false, true, ubo.approachParams[0][2] > 0.0);
          out.color = vec4(0.1);

          // // Note: this _should_ work for cubic roots without any sort of stepping
          // for (var i = minRoot; i < maxRoot; i++) {
          //   var root = result.roots[i];
          //   if (root >= t && root < tInterval.y) {
          //     let g = EvalG(Constants, root);
          //     if (abs(g) < 0.01) {
          //       out.color = vec4(0.0, 1.0, 0.0, 1.0);
          //       break;
          //     }
          //   }
          // }
          // return out;

          if (fixedStepToggle) {
            for (var i = minRoot; i < maxRoot; i++) {
              var root = result.roots[i];
              if (root > t && root < tInterval.y) {
                let foundT = RaymarchFixedStep(Constants, rayOrigin, rayDir, t, root);
                if (foundT >= tInterval.x) {
                  out.color = vec4(1.0, 1.0, 0.0, 1.0);
                  return out;
                } else {
                  t = root;
                }
              }
            }

            let foundT = RaymarchFixedStep(Constants, rayOrigin, rayDir, t, tInterval.y);
            if (foundT > -1.0) {
              out.color = vec4(1.0, 0.0, 1.0, 1.0);
              return out;
            }
          } else {
            for (var i = minRoot; i <= maxRoot; i++) {
              var root = result.roots[i];
              if (root >= t && root < tInterval.y) {
                let foundT = RaymarchNewtonRaphson(Constants, rayOrigin, rayDir, t, root);
                if (foundT >= 0.0) {
                  out.color = vec4(0.0, 1.0, 0.0, 1.0);
                  return out;
                } else {
                  t = root;
                }
              }
            }

            {
              let foundT = RaymarchNewtonRaphson(Constants, rayOrigin, rayDir, t, tInterval.y);
              if (foundT >= 0.0) {
                out.color = vec4(0.0, 1.0, 0.0, 1.0);
                return out;
              }

              out.color = vec4(JetLinear(f32(result.count) / 3), 1.0);
              return out;

            }
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

    let approachParams = state.params['approach-' + state.params.approach]
    switch (state.params.approach) {
      case 'fixed-step-ray-march': {
        state.approachParams[0] = approachParams.maxFixedSteps
        break;
      }
      case 'ray-tracing-signed-distance-grids': {
        state.approachParams[0] = approachParams.minRoot
        state.approachParams[1] = approachParams.maxRoot
        state.approachParams[2] = approachParams.fixedStepToggle ? 1.0 : 0.0
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