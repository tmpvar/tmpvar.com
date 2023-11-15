import CreateParamReader from "../params.js";

export default function CreateScreenSpaceBruteForceApproach(
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
    const labelPrefix = `${gpu.labelPrefix}ScreenSpaceBruteForce/`
    const sampler = gpu.device.createSampler({
      label: `${labelPrefix}Sampler`,
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
    })

    const uboFields = [
      ['percent', 'f32', 4],
      ['raysPerPixelPerFrame', 'f32', 4],
      ['eye', 'vec4f', 16],
      ['worldToScreen', 'mat4x4<f32>', 16 * 4],
      ['screenToWorld', 'mat4x4<f32>', 16 * 4],
    ]

    let uboBufferSize = uboFields.reduce((p, c) => {
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

        fn LinearizeDepth(depth: f32) -> f32{
          let zNear = 0.2; // TODO: Replace by the zNear of your perspective projection
          let zFar = 20.0; // TODO: Replace by the zFar  of your perspective projection

          return (2.0 * zNear) / (zFar + zNear - depth * (zFar - zNear));
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

        ${WGSLObjectDataStruct}

        @group(0) @binding(0) var fluenceWriteTexture: texture_storage_2d<rgba32float, write>;
        @group(0) @binding(1) var fluenceReadTexture: texture_2d<f32>;
        @group(0) @binding(2) var depthTexture: texture_depth_2d;
        @group(0) @binding(3) var linearSampler: sampler;
        @group(0) @binding(4) var objectIDTexture: texture_2d<u32>;
        @group(0) @binding(5) var normalTexture: texture_2d<f32>;
        @group(0) @binding(6) var<storage, read_write> objectData: array<ObjectData>;
        @group(0) @binding(7) var<uniform> ubo: UBOParams;

        fn GetWorldPos(uv: vec2f) -> vec3f {
          let depth = textureSampleLevel(depthTexture, linearSampler, uv, 0);
          let worldPos = ubo.screenToWorld * vec4f(uv, depth, 1.0);
          return worldPos.xyz / worldPos.w;
        }

        fn GetDepth(uv: vec2f) -> f32 {
          let depth = textureSampleLevel(depthTexture, linearSampler, uv, 0);
          if (false) {
            return LinearizeDepth(depth);
          }
          return depth;
        }

        @compute @workgroup_size(${workgroupSize.join(',')})
        fn ComputeMain(@builtin(global_invocation_id) id: vec3<u32>) {
          let dims = vec2f(textureDimensions(depthTexture));
          let invDims = 1.0 / dims;
          let halfInvDims = invDims * 0.5;
          let uv = vec2f(id.xy) * invDims;

          let startingDepth = GetDepth(uv);
          let normal = textureSampleLevel(normalTexture, linearSampler, uv, 0).xyz;
          var fluence = vec3(0.0);

          let objectID = textureLoad(objectIDTexture, vec2<u32>(dims * uv), 0).r;
          if (objectID == 0xFFFF) {
            textureStore(fluenceWriteTexture, id.xy, vec4(0.0));
            return;
          }



          // let rayCount = 8.0;
          // let angleStep = TAU / (rayCount+1);
          // let thickness = 0.5;
          // var hits = 0.0;
          // for (var angle=0.0; angle<TAU; angle+=angleStep) {
          //   var steps = 32;
          //   var sampleUV = uv + halfInvDims;

          //   var direction = vec2f(cos(angle), sin(angle));

          //   // scale the direction so it steps through uv coords
          //   direction *= invDims;

          //   var horizonSlope = 1.0;
          //   var t = 0.0;
          //   while(steps > 0) {
          //     steps--;
          //     t += max(1.0, t * 1.5);

          //     sampleUV = uv + direction * t;
          //     let depth = GetDepth(sampleUV);

          //     let horizonAtT = startingDepth + horizonSlope * t;
          //     let depthDelta = depth - horizonAtT;
          //     if (depthDelta < 0.0) {
          //       horizonSlope = min(horizonSlope, (depth - startingDepth) / t);
          //       let objectID = textureLoad(objectIDTexture, vec2<u32>(dims * sampleUV), 0).r;
          //       if (objectID < 0xFFFF) {
          //         let radiance = objectData[objectID].emission.rgb;
          //         let ratio = LinearizeDepth(-depthDelta);
          //         fluence += radiance * ratio;
          //         if (radiance.x > 0.0 || radiance.y > 0.0 || radiance.z >= 0.0) {
          //           hits = hits + 1.0;
          //         }
          //       }
          //     }
          //   }
          // }

          {
            let rayCount = ubo.raysPerPixelPerFrame;
            let thickness = 0.5;
            var hits = 0.0;
            let maxSteps = 200;
            let angleStart = ubo.percent * TAU / rayCount;
            for (var rayIndex=0.0; rayIndex<rayCount; rayIndex+=1.0) {
              let angle = rayIndex * TAU / rayCount + angleStart;
              var step = 0;
              var sampleUV = uv + halfInvDims;
              // let angle = ubo.percent * TAU;
              var direction = vec2f(cos(angle), sin(angle));

              // scale the direction so it steps through uv coords
              direction *= invDims;

              var horizonSlope = 0.05;//(GetDepth(uv + direction) - startingDepth) / length(direction);
              var t = 0.1;
              while(step < maxSteps) {
                t += 8.0;//max(1.0, t * 1.5);

                sampleUV = uv + direction * t;
                let depth = GetDepth(sampleUV);

                let horizonAtT = startingDepth + horizonSlope * t;
                let depthDelta = depth - horizonAtT;
                if (depthDelta < 0.0 || step == 0) {
                  horizonSlope = min(horizonSlope, (depth - startingDepth) / t);
                  let objectID = textureLoad(objectIDTexture, vec2<u32>(dims * sampleUV), 0).r;
                  if (objectID < 0xFFFF) {
                    let radiance = objectData[objectID].emission.rgb;
                    let ratio = LinearizeDepth(-depthDelta);
                    let attenuation = 1.0 / (1.0 + t);
                    fluence += radiance * ratio * attenuation;
                  }
                }

                step++;
              }
            }
          }

          let previousFluence = textureLoad(fluenceReadTexture, vec2<i32>(id.xy), 0).xyz;
          fluence = (previousFluence + fluence);

          // Albedo colored output
          if (false) {
            textureStore(fluenceWriteTexture, id.xy, vec4(max(vec3(0.05), fluence) * objectData[objectID].albedo.rgb, 1.0));
            return;
          }

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


    return function ScreenSpaceBruteForce(commandEncoder, screenToWorld, percent, raysPerPixelPerFrame) {
      // update the uniform buffer
      {
        let byteOffset = 0

        // percent
        uboData.setFloat32(byteOffset, percent, true)
        byteOffset += 4;

        // raysPerPixelPerFrame
        uboData.setFloat32(byteOffset, raysPerPixelPerFrame, true)
        byteOffset += 4;

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
      pendingFrames -= Params.data.bruteForceRaysPerPixelPerFrame

      program(
        commandEncoder,
        state.camera.state.screenToWorld,
        pendingFrames / 360,
        Params.data.bruteForceRaysPerPixelPerFrame,
      )
    },
  }
}