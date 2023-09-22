async function ProbeRayDistribution3dBegin() {
  const rootEl = document.querySelector("#probe-ray-distribution-3d-content")
  const controlEl = rootEl.querySelector('.controls')
  const canvas = rootEl.querySelector('canvas')

  const state = {
    dirty: true,
    params: {}
  }

  const InitGPU = () => {

  }

  const ReadParams = () => {

  }

  const RenderFrame = () => {



  }

  window.requestAnimationFrame(RenderFrame)
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