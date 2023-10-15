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
      // percent, raysPerPixelPerFrame, and the rest is padding
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

        // axis aligned box centered at the origin, with size boxSize
        fn RayAABB(ro: vec3f, rd: vec3f, boxSize: vec3f) -> f32 {
          let m = 1.0f / rd; // can precompute if traversing a set of aligned boxes
          let n = m * ro;    // can precompute if traversing a set of aligned boxes
          let k = abs(m) * boxSize;
          let t1 = -n - k;
          let t2 = -n + k;
          let tN = max(max(t1.x, t1.y), t1.z);
          let tF = min(min(t2.x, t2.y), t2.z);
          if (tN > tF || tF < 0.0f) {
            return -1.0f; // no intersection
          }

          if (tN >= 0.0) {
            return tN;
          } else {
            return tF;
          }
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
          let uv = vec2f(id.xy) / dims * 2.0 - 1.0;
          let projectedPos = ubo.screenToWorld * vec4f(uv, depth, 1.0);
          let worldPos = projectedPos.xyz / projectedPos.w;

          textureStore(fluenceWriteTexture, id.xy, vec4(worldPos / 10.0 * 0.5 + 0.5, 1.0));
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

    return function WorldSpaceBruteForce(commandEncoder, screenToWorld, percent, raysPerPixelPerFrame) {
      // update the uniform buffer
      {
        let byteOffset = 0
        // percent
        uboData.setFloat32(byteOffset, percent, true)
        byteOffset += 4;

        // raysPerPixelPerFrame
        uboData.setFloat32(byteOffset, raysPerPixelPerFrame, true)
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

  const MaxPendingFrames = 360
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
    run(commandEncoder) {
      console.log(Params.data.bruteForceRaysPerPixelPerFrame);
      program(
        commandEncoder,
        state.camera.state.screenToWorld,
        pendingFrames / 360,
        Params.data.bruteForceRaysPerPixelPerFrame,
      )
    },
  }
}