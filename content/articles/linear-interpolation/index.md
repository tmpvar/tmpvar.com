+++
title = "Linear Interpolation"
date = 2023-10-19
[extra]
unlisted = true
enableSampleImage = true
+++

Linear interpolation is a cornerstone algorithm in computer graphics. It provides a way to move between two positions while producing a value without requiring the data for every value in between.

<!-- more -->

<div id="Lerp1D">

```c++
f32 Lerp1D(f32 start, f32 end, f32 t) {
  f32 v = start * (1.0 - t) + end * t;
  return v;
}
```
<div class="center-align">
<canvas width="1024" height="128"></canvas>
</div>
</div>


<script type="module">
  let rootEl = document.getElementById('Lerp1D')
  let canvas = rootEl.querySelector('canvas')
  let ctx = canvas.getContext('2d')
  const vars = {}

  function AddVar(name, color, rangeLo, rangeHi, params = {}) {
    let regexString = `(\\W*\\b${name})(\\b[^\\w]*)`
    let matcher = new RegExp(regexString)
    let width = Math.max(rangeLo.toFixed(2).length, rangeHi.toFixed(2).length)
    let variable = {
      value: 0.0,
      name: name,
      color: color,
      computedColor: '',
      refs: Array.from(rootEl.querySelectorAll('span')).map(el => {
        let original = el.innerText
        if (original.match(matcher) == null) {
          return false
        }

        return {
          el,
          original,
        }
      }).filter(Boolean),

      update(value) {
        this.displayValue = value.toFixed(2).padStart(width, ' ')
        let className = `highlight-${this.color}`
        this.refs.forEach((ref, i) => {
          if (i == 0) {
            if (!params.skipFirst) {
              ref.el.innerHTML = ref.original.replace(
                matcher,
                `$1<span class="${className}"> = ${this.displayValue}</span>$2`
              )
              this.computedColor = window.getComputedStyle(ref.el.querySelector('.' + className), null).getPropertyValue('color')
            }
          } else {
            ref.el.innerHTML = ref.original.replace(
              matcher,
              `$1<span class="${className}">(${this.displayValue})</span>$2`
            )

            if (params.skipFirst) {
              this.computedColor = window.getComputedStyle(ref.el.querySelector('.' + className), null).getPropertyValue('color')
            }
          }
        })

        this.value = value;
      },
    }

    vars[name] = variable
    return variable
  }

  const state = {
    dirty: true,
    mouse: {
      pos: [0, 0],
      downPos: [0, 0],
      down: false
    },
  }

  const MoveMouse = (x, y) => {
    let ratioX = canvas.width / canvas.clientWidth
    let ratioY = canvas.height / canvas.clientHeight
    state.mouse.pos[0] = x * ratioX
    state.mouse.pos[1] = y * ratioY
    state.dirty = true;
  }

  canvas.addEventListener("mousedown", (e) => {
    state.mouse.down = true
    MoveMouse(e.offsetX, e.offsetY);
    state.mouse.lastPos[0] = state.mouse.pos[0]
    state.mouse.lastPos[1] = state.mouse.pos[1]

    e.preventDefault()
  }, { passive: false })

  canvas.addEventListener("mousemove", e => {
    MoveMouse(e.offsetX, e.offsetY)
    e.preventDefault()

    if (state.mouse.down) {
      let dx = state.mouse.pos[0] - state.mouse.lastPos[0]
      let dy = state.mouse.pos[1] - state.mouse.lastPos[1]

      state.mouse.downPos[0] = state.mouse.pos[0]
      state.mouse.downPos[1] = state.mouse.pos[1]

      if (Math.abs(dx) < 1.0 && Math.abs(dy) < 1.0) {
        return;
      }
    }
  }, { passive: false })


  let t = AddVar('t', 'green', 0.0, 1.0);
  let v = AddVar('v', 'blue', 0.0, 1.0, {
    skipFirst: true,
  });
  let start = AddVar('start', 'pink', 0.0, 1.0);
  let end = AddVar('end', 'salmon', 0.0, 1.0);

  state.mouse.pos[0] = 100.0;

  start.update(-10.0)
  end.update(50.0)

  function RenderFrame() {
    if (!state.dirty) {
      requestAnimationFrame(RenderFrame)
      return
    }
    // state.dirty = false
    t.update(Math.round((state.mouse.pos[0] / canvas.width) * 100.0) / 100.0)
    v.update(start.value * (1.0 - t.value) + end.value * t.value)

    ctx.reset();
    let gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
    gradient.addColorStop(0.0, start.computedColor)
    gradient.addColorStop(1.0, end.computedColor)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 64, canvas.width, canvas.height - 96)

    // draw the x
    {
      let x = canvas.width * t.value

      ctx.lineWidth = 3.0
      ctx.strokeStyle = t.computedColor
      ctx.beginPath()
      ctx.moveTo(x, 64)
      ctx.lineTo(x, 96)
      ctx.stroke()


      ctx.font = "18px Hack,monospace"

      let tText = `t(${t.displayValue})`
      let vText = `v(${v.displayValue})`

      let textWidth = Math.max(
        ctx.measureText(tText).width,
        ctx.measureText(vText).width
      )

      let textStart = x - textWidth / 2.0
      let textEnd =  x + textWidth / 2.0

      if (textStart < 0.0) {
        textStart = 0.0
        textEnd = textWidth
      }

      if (textEnd >= canvas.width) {
        textEnd = canvas.width
        textStart = textEnd - textWidth
      }

      ctx.fillStyle = t.computedColor
      ctx.fillText(tText, textStart, 20)

      ctx.fillStyle = v.computedColor
      ctx.fillText(vText, textStart, 48)

      ctx.fillStyle = start.computedColor;
      ctx.fillText(`start(${start.displayValue})`, 0, 96 + 14 + 8)

      let endText = `end(${end.displayValue})`
      ctx.fillStyle = end.computedColor;
      ctx.fillText(endText, canvas.width - ctx.measureText(endText).width, 96 + 14 + 8)
    }
    requestAnimationFrame(RenderFrame)
  }

  RenderFrame()

</script>

## Bilinear Interpolation (2D)

```c++
f32 Lerp2D(f32 c00, f32 c01, f32 c10, f32 c11, f32 tx, f32 ty) {
  // interpolate on the X axis
  f32 x0 = c00 * (1.0 - tx) + c01 * tx; // Lerp1D(c00, c01, tx);
  f32 x1 = c10 * (1.0 - tx) + c11 * tx; // Lerp1D(c10, c11, tx);

  // interpolate on the Y axis
  return = x0 * (1.0 - ty) + x1 * ty;    // Lerp1D(x0, x1, ty);
}
```

## Trilinear Interpolation (3D)

```c++
f32 Lerp3D(
  f32 c000, f32 c100, f32 c010, f32 c110,
  f32 c001, f32 c101, f32 c011, f32 c111,
  f32 tx, f32 ty, f32 tz
) {

  f32 c00 = c000 * (1.0 - tx) + c100 * tx; // Lerp1D(c000, c100, tx)
  f32 c01 = c010 * (1.0 - tx) + c110 * tx; // Lerp1D(c100, c110, tx)
  f32 c10 = c001 * (1.0 - tx) + c101 * tx; // Lerp1D(c001, c101, tx)
  f32 c11 = c011 * (1.0 - tx) + c111 * tx; // Lerp1D(c011, c111, tx)

  f32 c0 = c00 * (1.0 - ty) + c10 * ty;    // Lerp1D(c00, c01, tx)
  f32 c1 = c01 * (1.0 - ty) + c11 * ty;    // Lerp1D(c00, c01, tx)

  return c0 * (1.0 - z) + c1 * tz;         // Lerp1D(c0, c1, tx)
}
```
