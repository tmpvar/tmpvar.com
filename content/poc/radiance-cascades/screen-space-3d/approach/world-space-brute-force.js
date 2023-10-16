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

  const QuadDiameter = 8;

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
      // percent, raysPerPixelPerFrame, totalObjects, and the rest is padding
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

    const source =  /* wgsl */`
        const PI: f32 = ${Math.PI};
        const TAU: f32 = ${Math.PI * 2.0};

        struct UBOParams {
          ${uboFields.map(v => `${v[0]}: ${v[1]},`).join('\n          ')}
        };

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
            if (objectIndex == originalObjectID) {
              continue;
            }

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
                  fluence = vec3(1.0, 0.0, 1.0);
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
                  fluence = vec3(1.0, 0.0, 1.0);
                }
                break;
              }

              default: {
                break;
              }
            }
          }

          return fluence;
        }

        @compute @workgroup_size(${workgroupSize.join(',')})
        fn ComputeMain(@builtin(global_invocation_id) id: vec3<u32>) {
          let percent = ubo.params[0].x;
          let raysPerPixelPerFrame = ubo.params[0].y;

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

          let objectID = textureLoad(objectIDTexture, id.xy, 0).x;
          let fluence = CastRay(worldPos, normal, i32(objectID));
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
      percent,
      objectCount,
      raysPerPixelPerFrame
    ) {
      // update the uniform buffer
      {
        let byteOffset = 0
        // percent
        uboData.setFloat32(byteOffset, percent, true)
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

  const MaxPendingFrames = QuadDiameter * QuadDiameter
  let pendingFrames = 0

  return {
    update() {
      Params('bruteForceRaysPerPixelPerFrame', 'f32', (parentEl, value, oldValue) => {
        if (value != oldValue) {
          pendingFrames = MaxPendingFrames
          state.clearFluence = true
        }
        parentEl.querySelector('output').innerHTML = value
        return value;
      })

      if (state.clearFluence) {
        pendingFrames = MaxPendingFrames
      }

      if (pendingFrames > 0) {
        state.dirty = true
      }

    },
    run(commandEncoder, scene) {
      program(
        commandEncoder,
        state.camera.state.screenToWorld,
        pendingFrames / 360,
        scene.objectCount,
        Params.data.bruteForceRaysPerPixelPerFrame,
      )
    },
  }
}