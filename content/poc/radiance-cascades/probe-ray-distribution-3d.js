async function ProbeRayDistribution3dBegin() {
  const rootEl = document.querySelector("#probe-ray-distribution-3d-content")
  const controlEl = rootEl.querySelector('.controls')
  const canvas = rootEl.querySelector('canvas')
  const ctx = canvas.getContext('webgpu')
  try {
    const gpu = InitGPU(ctx);
  } catch (e) {
    console.log(e)
    rootEl.className = rootEl.className.replace('has-webgpu', '')
    return;
  }

  const state = {
    dirty: true,
    params: {},
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

  function ReadParams() {

  }

  function RenderFrame() {
    ReadParams()

    if (!state.dirty) {
      window.requestAnimationFrame(RenderFrame)
      state.dirty = false
    }

    window.requestAnimationFrame(RenderFrame)
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