import CreateOrbitCamera from './orbit-camera.js'
import CreateParamReader from './params.js'

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
  state.camera.state.targetDistance = 200
  state.camera.state.scrollSensitivity = 0.1;


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

  function RenderFrame() {
    ReadParams()
    if (!state.dirty) {
      requestAnimationFrame(RenderFrame)
      return
    }
    state.dirty = false
    requestAnimationFrame(RenderFrame)
  }

  RenderFrame()

}

ScreenSpace3DBegin(
  document.querySelector('#screen-space-3d-content')
)