function IsosurfaceExtraction2DBegin() {

  const rootEl = document.getElementById('isosurface-extraction-2d-content')
  const controlEl = rootEl.querySelector('.controls')
  const canvas = rootEl.querySelector('canvas')
  const ctx = canvas.getContext('2d')
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

  function RenderFrame() {
    ctx.reset()
    ctx.scale(1, -1)
    ctx.translate(0, -canvas.height)
    console.log(imageData)

    // fill the canvas with sdf coloring
    for (let y=0; y<canvas.height; y++) {
      let yoff = (canvas.height - y) * canvas.width * 4;
      for (let x=0; x<canvas.width; x++) {
        let offset = yoff + x * 4
        imageData.data[offset + 0] = x / canvas.width * 255.0
        imageData.data[offset + 1] = y / canvas.width * 255.0
        imageData.data[offset + 2] = 0x00
        imageData.data[offset + 3] = 0xFF
      }
    }
    ctx.putImageData(imageData, 0, 0)
    ctx.fillStyle = "orange"
    ctx.fillRect(0, 0, 10, 100)
  }

  RenderFrame()
}

IsosurfaceExtraction2DBegin()