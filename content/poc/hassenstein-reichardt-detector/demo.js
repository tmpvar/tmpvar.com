Init(document.getElementById('demo-content'))

function CreateReceptor(x, y) {
  const MaxSamples = 1 << 10
  const SampleRate = 100
  const LPCutoff = 1

  return {
    pos: [x, y],
    head: 0,
    ring: new Float32Array(MaxSamples),

    add(sample) {
      const id = this.head++
      const index = id % MaxSamples
      this.ring[index] = sample;
    },
    getRawValue() {
      const index = Math.max(0, this.head - 1) % MaxSamples
      return this.ring[index]
    },
    getFilteredValue() {
      let rc = 1.0 / LPCutoff * TAU;
      let dt = 1.0 / SampleRate;
      let alpha = dt / (rc + dt);
      let value = this.ring[0];

      const start = Math.max(0, this.head - MaxSamples) % MaxSamples
      for (let i = 0; i < MaxSamples; i++) {
        const index = start + i
        value = last + alpha * (this.ring[index] - last);
      }
      return value;
    },
    render(ctx) {
      ctx.save()
      const value = this.getRawValue()
      console.log(value)
      ctx.fillStyle = value > 0 ? "green" : "red"
      ctx.beginPath()
      ctx.arc(this.pos[0], this.pos[1], 10, 0, TAU)
      ctx.fill()
      ctx.restore()
    }
  }

}

const TAU = Math.PI * 2.0


function Init(rootElement) {
  const canvas = rootElement.querySelector('canvas')
  const ctx = canvas.getContext('2d')
  const mouse = {
    pos: [0, 0]
  }
  canvas.addEventListener('mousemove', (e) => {
    let ratioX = canvas.width / canvas.clientWidth
    let ratioY = canvas.height / canvas.clientHeight
    mouse.pos[0] = e.offsetX * ratioX
    mouse.pos[1] = e.offsetY * ratioY
  })

  const receptors = [
    CreateReceptor(512, 512)
  ]

  const LightRadius = 50

  function Render() {
    ctx.fillStyle = "#222"
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.fillStyle = "white"
    ctx.beginPath()
    ctx.arc(mouse.pos[0], LightRadius * 3, LightRadius, 0, TAU)
    ctx.fill()

    // draw the receptors
    for (let i = 0; i < receptors.length; i++) {
      const value = Math.max(0, LightRadius - Math.abs(receptors[i].pos[0] - mouse.pos[0])) / LightRadius
      receptors[i].add(value)
      receptors[i].render(ctx);
    }



    requestAnimationFrame(Render)
  }

  requestAnimationFrame(Render)

}