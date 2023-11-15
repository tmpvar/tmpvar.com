import CreateParamReader from "../params.js";

export default function CreateWorldSpaceBruteForceApproach(
  gpu,
  fluencePreviousTexture,
  fluenceCurrentTexture,
  depthTexture,
  objectIDTexture,
  normalTexture,
  objectBuffer,
  WGSLObjectDataStruct,
  state,
  approachName,
  controlEl
) {



  const RaysPerFace = 512
  const QuadDiameter = Math.sqrt(RaysPerFace)
  const MaxRays = RaysPerFace * 6

  function CreateProgram(
    gpu,
    fluencePreviousTexture,
    fluenceCurrentTexture,
    depthTexture,
    objectIDTexture,
    normalTexture,
    objectBuffer,
    workgroupSize,
  ) {
    const labelPrefix = `${gpu.labelPrefix}WorldSpaceBruteForce/`
    const sampler = gpu.device.createSampler({
      label: `${labelPrefix}Sampler`,
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
    })

    const uboFields = [
      // rayIndex, raysPerPixelPerFrame, totalObjects, and the rest is padding
      ['params', 'mat4x4<f32>', 16 * 4],
      ['screenToWorld', 'mat4x4<f32>', 16 * 4],
    ]
    let uboBufferAlignment = 4
    let uboBufferSize = uboFields.reduce((p, c) => {
      uboBufferAlignment = Math.max(uboBufferAlignment, c[2])
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


    const GoldenRatio = (1 + Math.sqrt(5)) * 0.5
    const source =  /* wgsl */`
        const PI: f32 = ${Math.PI};
        const TAU: f32 = ${Math.PI * 2.0};

        struct UBOParams {
          ${uboFields.map(v => `${v[0]}: ${v[1]},`).join('\n          ')}
        };

         fn Compact1By1(v : u32) -> u32 {
          var x = v & 0x55555555;             // x = -f-e -d-c -b-a -9-8 -7-6 -5-4 -3-2 -1-0
          x = (x ^ (x >> 1)) & 0x33333333; // x = --fe --dc --ba --98 --76 --54 --32 --10
          x = (x ^ (x >> 2)) & 0x0f0f0f0f; // x = ---- fedc ---- ba98 ---- 7654 ---- 3210
          x = (x ^ (x >> 4)) & 0x00ff00ff; // x = ---- ---- fedc ba98 ---- ---- 7654 3210
          x = (x ^ (x >> 8)) & 0x0000ffff; // x = ---- ---- ---- ---- fedc ba98 7654 3210
          return x;
        }

        fn MortonDecodeX(code: u32) -> u32 {
          return Compact1By1(code >> 0);
        }

        fn MortonDecodeY(code: u32) -> u32 {
          return Compact1By1(code >> 1);
        }

        fn RayDirCubeFaceSubdivision(rayIndex: u32) -> vec3f {
          let face = rayIndex / ${RaysPerFace};
          let sign = select(1.0, -1.0, face % 2 == 0);
          // -x, x, -y, y, -z, z
          let axis = face / 2;
          let faceRayIndex = rayIndex % ${RaysPerFace};

          let u = (f32(MortonDecodeX(faceRayIndex)) + 0.5) / ${QuadDiameter} * 2.0 - 1.0;
          let v = (f32(MortonDecodeY(faceRayIndex)) + 0.5) / ${QuadDiameter} * 2.0 - 1.0;
          var pos: vec3f;
          pos[axis] = sign;
          pos[(axis + 1) % 3] = u;
          pos[(axis + 2) % 3] = v;
          return normalize(pos);
        }

        fn RayDirGoldenSpiral(rayIndex: f32) -> vec3f {
          let a0 = TAU * rayIndex / ${GoldenRatio};
          let a1 = acos(1.0 - 2 * (rayIndex + 0.5) / f32(${MaxRays}));
          return normalize(
            vec3f(
              cos(a0) * sin(a1),
              sin(a0) * sin(a1),
              cos(a1)
            )
          );
        }

        fn RayDirHemisphereUniformNonRandom(rayIndex: f32) -> vec3f{
          let r1 = (rayIndex % ${QuadDiameter} + 0.5) / ${QuadDiameter};
          let r2 = rayIndex / ${QuadDiameter} * TAU;

          let sinTheta = sqrt(1.0 - r1 * r1);
          let phi = TAU * r2;
          let x = sinTheta * cos(phi);
          let z = sinTheta * sin(phi);

          return normalize(vec3f(x, r1, z));
        }

        fn CreateCoordinateSystem(normal: vec3f) -> mat2x3f {
          var ret: mat2x3<f32>;
          if (abs(normal.x) > abs(normal.y)) {
            ret[0] = vec3f(normal.z, 0.0, -normal.x) / sqrt(normal.x * normal.x + normal.z * normal.z);
          } else {
            ret[0] = vec3f(0.0, -normal.z, normal.y) / sqrt(normal.y * normal.y + normal.z * normal.z);
          }
          ret[1] = cross(normal, ret[0]);
          return ret;
        }

        // sphere centered at origin
        fn RaySphere(rayOrigin: vec3f, rayDir: vec3f, sphereRadius: f32) -> f32 {
          let a = dot(rayDir, rayDir);
          let b = 2.0f * dot(rayOrigin, rayDir);
          let c = dot(rayOrigin, rayOrigin) - sphereRadius * sphereRadius;
          let discriminant = b * b - 4 * a * c;
          if (discriminant < 0.0) {
            return -1.0;
          }

          return (-b - sqrt(discriminant)) / (2.0f * a);
        }

        const MaxDistance = 1000.0;

        fn MaxComponent(v: vec3f) -> f32 {
          return max(v.x, max(v.y, v.z));
        }

        fn MinComponent(v: vec3f) -> f32 {
          return min(v.x, min(v.y, v.z));
        }

        fn RayAABB(p0: vec3f, p1: vec3f, rayOrigin: vec3f, invRaydir: vec3f) -> f32 {
          let t0 = (p0 - rayOrigin) * invRaydir;
          let t1 = (p1 - rayOrigin) * invRaydir;
          let tmin = min(t0, t1);
          let tmax = max(t0, t1);
          let a = MaxComponent(tmin);
          let b = MinComponent(tmax);
          if (b <= a) {
            return MaxDistance;
          }

          if (a > 0.0) {
            return a;
          }

          if (b > 0.0) {
            return b;
          }

          return MaxDistance;
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

        fn CastRay(rayOrigin: vec3f, rayDir: vec3f, originalObjectID: i32) -> vec3f {
          var d = MaxDistance;
          var fluence = vec3f(0.1);
          let totalObjects = i32(ubo.params[0].z);
          let surfaceOffset = rayDir * 0.5;
          for (var objectIndex: i32 = 0; objectIndex < totalObjects; objectIndex++) {
            let objectType = u32(objectData[objectIndex].albedo.w);
            switch(objectType) {
              // Box
              case 0: {
                let pos = objectData[objectIndex].position.xyz;
                let radius = objectData[objectIndex].scale.xyz;

                let invRayDir = 1.0 / rayDir;

                let ld = RayAABB(
                  pos - radius,
                  pos + radius,
                  rayOrigin,
                  invRayDir
                );

                if (ld >= 0.0 && ld < d) {
                  d = ld;
                  fluence = objectData[objectIndex].emission.rgb;
                }
                break;
              }

              // Sphere
              case 1: {

                let spherePos = objectData[objectIndex].position.xyz;
                let sphereRadius = objectData[objectIndex].scale.x;
                let ld = RaySphere((rayOrigin - spherePos), rayDir, sphereRadius);

                if (ld >= 0.0 && ld < d) {
                  d = ld;
                  fluence = objectData[objectIndex].emission.rgb;
                }
                break;
              }

              default: {
                break;
              }
            }
          }

          return fluence / (1.0 + d * d);
        }

        @compute @workgroup_size(${workgroupSize.join(',')})
        fn ComputeMain(@builtin(global_invocation_id) id: vec3<u32>) {
          let RayIndex = i32(ubo.params[0].x);
          let RaysPerFrame = i32(ubo.params[0].y);

          let depth = textureLoad(depthTexture, id.xy, 0);
          if (depth >= 1.0) {
            textureStore(fluenceWriteTexture, id.xy, vec4(0.0));
            return;
          }
          let dims = vec2f(textureDimensions(depthTexture));
          var uv = vec2f(f32(id.x), dims.y - f32(id.y)) / dims * 2.0 - 1.0;
          let projectedPos = ubo.screenToWorld * vec4f(uv, depth, 1.0);
          let worldPos = projectedPos.xyz / projectedPos.w;

          textureStore(fluenceWriteTexture, id.xy, vec4(worldPos / 20 * 0.5 + 0.5, 1.0));


          let normal = textureLoad(normalTexture, id.xy, 0).xyz;
          textureStore(fluenceWriteTexture, id.xy, vec4(normal * 0.5 + 0.5, 1.0));

          let surfaceTransform = CreateCoordinateSystem(normal);

          let objectID = textureLoad(objectIDTexture, id.xy, 0).x;

          var fluence = objectData[objectID].emission.rgb;
          for (var rayIndex=0; rayIndex<RaysPerFrame; rayIndex++) {
            // let rayDir = RayDirCubeFaceSubdivision(u32(RayIndex + rayIndex));
            let rayDir = RayDirGoldenSpiral(f32(RayIndex + rayIndex));

            // let localRayDir = RayDirHemisphereUniformNonRandom(f32(RayIndex + rayIndex));
            // let rayDir = vec3f(
            //   localRayDir.x * surfaceTransform[0].x + localRayDir.y * normal.x + localRayDir.z * surfaceTransform[1].x,
            //   localRayDir.x * surfaceTransform[0].y + localRayDir.y * normal.y + localRayDir.z * surfaceTransform[1].y,
            //   localRayDir.x * surfaceTransform[0].z + localRayDir.y * normal.z + localRayDir.z * surfaceTransform[1].z
            // );

            let dir = normalize(rayDir + normal * 0.1);
            fluence += CastRay(worldPos + rayDir * 0.1, rayDir, i32(objectID));
          }

          fluence = (fluence + textureLoad(fluenceReadTexture, vec2<i32>(id.xy), 0).xyz);
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

    return function WorldSpaceBruteForce(
      commandEncoder,
      screenToWorld,
      rayIndex,
      objectCount,
      raysPerPixelPerFrame
    ) {
      // update the uniform buffer
      {
        let byteOffset = 0
        // rayIndex
        uboData.setFloat32(byteOffset, rayIndex, true)
        byteOffset += 4;

        // raysPerPixelPerFrame
        uboData.setFloat32(byteOffset, raysPerPixelPerFrame, true)
        byteOffset += 4;

        // objectCount
        uboData.setFloat32(byteOffset, objectCount, true)
        byteOffset += 4;

        byteOffset = Math.floor(byteOffset / uboBufferAlignment + 1) * uboBufferAlignment

        // screenToWorld
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

  let program = CreateProgram(
    gpu,
    fluencePreviousTexture,
    fluenceCurrentTexture,
    depthTexture,
    objectIDTexture,
    normalTexture,
    objectBuffer,
    [16, 16, 1]
  )

  const approachControlEl = controlEl.querySelector(`div[showValue="${approachName}"]`)

  const Params = CreateParamReader(state, approachControlEl, 'approaches/' + approachName)

  let rayIndex = 0
  return {
    update() {
      Params('bruteForceRaysPerPixelPerFrame', 'f32', (parentEl, value, oldValue) => {
        if (value != oldValue) {
          rayIndex = 0
          state.clearFluence = true
        }
        parentEl.querySelector('output').innerHTML = value
        return value;
      })

      if (state.clearFluence) {
        rayIndex = 0
      }

      if (rayIndex < MaxRays) {
        state.dirty = true

      }

    },
    run(commandEncoder, scene) {
      program(
        commandEncoder,
        state.camera.state.screenToWorld,
        rayIndex,
        scene.objectCount,
        Params.data.bruteForceRaysPerPixelPerFrame,
      )
      rayIndex += Params.data.bruteForceRaysPerPixelPerFrame
    },
  }
}