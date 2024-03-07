Init(document.getElementById('demo-content'))

function CreateReceptor(x, y) {
  const MaxSamples = 1 << 3
  const SampleRate = 100
  const LPCutoff = 1
  const Radius = 10

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
        value = value + alpha * (this.ring[index] - value);
      }
      return value;
    },
    render(ctx) {
      ctx.save()
      const value = this.getRawValue()
      const grad = value * 255
      const gradColor = `rgb(${grad},${grad},${grad})`
      ctx.fillStyle = gradColor
      ctx.strokeStyle = gradColor
      ctx.beginPath()
      ctx.arc(this.pos[0], this.pos[1], Radius, 0, TAU)
      ctx.fill()

      const start = Math.max(0, this.head - MaxSamples)
      const end = this.head
      const width = 100
      const height = 50
      const xstep = width / MaxSamples
      let xoff = this.pos[0] - width / 2
      let yoff = this.pos[1] + height + Radius


      // ctx.fillStyle = "rgba(255, 255, 255, 0.2)"
      // ctx.strokeStyle = "#000"
      // ctx.fillRect(xoff, yoff - height, width, height)

      // for (let i = start; i < end; i++) {
      //   const value = this.ring[i % MaxSamples]
      //   const valueGrad = value * 255
      //   const valueColor = `rgb(${valueGrad},${valueGrad},${valueGrad})`
      //   ctx.beginPath()
      //   ctx.strokeStyle = valueColor
      //   ctx.moveTo(xoff, yoff)
      //   ctx.lineTo(xoff, yoff - value * (height - 5))
      //   ctx.stroke()
      //   xoff += xstep;
      // }

      ctx.restore()
    }
  }
}

function CreateReceptorPair(a, b) {
  const MaxSamples = 1 << 6
  return {
    head: 0,
    ring: new Float32Array(MaxSamples),

    tick() {
      const bside = a.getRawValue() * b.getFilteredValue()
      const aside = b.getRawValue() * a.getFilteredValue()
      const sample = aside - bside

      const id = this.head++
      const index = id % MaxSamples
      const phasor = id * 0.01
      const sine = Math.sin((phasor - Math.floor(phasor)) * TAU) * 0.2 + 0.2

      this.ring[index] = sample;
    },
    render(ctx) {
      const start = Math.max(0, this.head - MaxSamples)
      const end = this.head
      const height = 50
      const width = 100
      let xoff = Math.min(a.pos[0], b.pos[0])
      const yoff = Math.max(a.pos[0], b.pos[0]) + height + 10
      const xstep = width / MaxSamples

      ctx.fillStyle = "rgba(255, 255, 255, 0.2)"
      ctx.strokeStyle = "#fff"
      ctx.fillRect(xoff, yoff - height, width, height)

      ctx.beginPath()
      for (let i = start; i < end; i++) {
        let value = this.ring[i % MaxSamples]
        ctx.moveTo(xoff, yoff)
        ctx.lineTo(xoff, yoff - value * (height - 5))
        xoff += xstep;
      }
      ctx.stroke()

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
    CreateReceptor(490, 512),
    CreateReceptor(530, 512),
  ]

  const receptorPairs = [
    CreateReceptorPair(receptors[0], receptors[1])
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
      const value = Math.max(0, LightRadius - Math.abs(receptors[i].pos[0] - mouse.pos[0])) / LightRadius > 0 ? 1.0 : 0.0
      receptors[i].add(value)
      receptors[i].render(ctx);
    }

    receptorPairs.forEach(pair => {
      pair.tick()
      pair.render(ctx)
    })



    requestAnimationFrame(Render)
  }

  requestAnimationFrame(Render)

}