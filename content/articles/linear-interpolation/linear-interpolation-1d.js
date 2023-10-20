let rootEl = document.getElementById('LinearInterpolation1D-content')
let canvas = rootEl.querySelector('canvas')
let ctx = canvas.getContext('2d')
const vars = {}

function ParseColorFloat(value) {
  if (value.startsWith('#')) {
    let v = parseInt(value.replace("#", ""), 16)

    let r = (v >> 16) & 0xFF
    let g = (v >> 8) & 0xFF
    let b = (v >> 0) & 0xFF
    return [r, g, b]
  } else if (value.startsWith('rgb(')) {
    value = value.replace('rgb(', '')
    value = value.replace(')', '')
    return value.split(',').map(v => parseFloat(v.trim()))
  }
}

function WrapCodeLines() {
  const el = rootEl.querySelector('pre code')
  window.el = el;
  // the spans have line breaks inside of them
  let node = el.firstElementChild
  let line = document.createElement('div')
  line.className = 'line';
  el.prepend(line)
  while (node) {
    let currentNode = node;
    node = node.nextSibling
    if (currentNode.nodeType == document.ELEMENT_NODE) {
      let content = currentNode.innerHTML.replaceAll('\r', '')
      if (content[content.length - 1] == '\n') {
        currentNode.innerHTML = content.substring(0, content.length - 1)
        line.append(currentNode)
        let lastLine = line
        line = document.createElement('div')
        line.className = 'line'
        lastLine.after(line)
      } else {
        line.append(currentNode);
      }
    } else {
      line.append(currentNode);
    }
  }
  if (!line.childNodes.length) {
    line.remove()
  }
}

WrapCodeLines()

function AddVar(name, color, rangeLo, rangeHi, params) {

  params = Object.assign({
    skipFirst: false,
    precision: 2
  }, params || {})

  let regexString = `(.*\\b\\s*)(${name})(\\s*\\b[^\\w]*)`
  let matcher = new RegExp(regexString)
  let width = Math.max(
    rangeLo.toFixed(params.precision).length,
    rangeHi.toFixed(params.precision).length
  )

  let refs = Array.from(rootEl.querySelectorAll('span')).map(el => {
    let original = el.innerText
    let matches = original.match(matcher)
    if (matches == null) {
      return false
    }
    let a = Array.from(matches)
    a.shift()

    el.parentElement.classList.add('inflated')
    let output = document.createElement('div')
    output.classList.add('variable-output')
    el.parentElement.append(output)

    let parentElement = el.parentElement
    let prevElement = el.previousElementSibling;
    el.remove()

    let source = null;
    let clones = a.filter(v => v !== '').map(v => {
      let clone = el.cloneNode()
      clone.innerText = v
      if (v === name) {
        source = clone
      }
      return clone
    })

    if (prevElement) {
      prevElement.after.apply(prevElement, clones)
    } else {
      parentElement.prepend.apply(parentElement, clones)
    }

    return {
      el: source,
      output,
      original,
    }
  }).filter(Boolean)

  let variable = {
    value: 0.0,
    name: name,
    color: color,
    computedColor: '',
    refs: refs,

    update(value, rgbColor) {
      let style = rgbColor ? `style="color:${rgbColor}"` : ''

      // move this thing into the correct position
      {
        refs.forEach((ref, i) => {

          // if (i === 0 && name == 'v') {
          console.log(name, 'offset', ref.el.offsetLeft, ref.el.offsetTop)
          ref.output.style.left = ref.el.offsetLeft + 'px';
          ref.output.style.top = '0px';//(ref.el.offsetTop - 20) + 'px';
          // ref.output.style.width = ref.el.offsetWidth + 'px';
          // ref.output.style.backgroundColor = 'red'
          // }
        })
      }


      this.displayValue = value.toFixed(params.precision).padStart(width, ' ')

      this.refs.forEach((ref, i) => {
        if (i == 0) {
          // ref.el.classList.add(className)
          ref.el.style.color = this.color;
          // ref.el.innerHTML = ref.original.replace(
            //   matcher,
            //   `$1<span ${style} class="${className}"> = ${this.displayValue}</span>$2`
            // )
            // this.computedColor = window.getComputedStyle(ref.el.querySelector('.' + className), null).getPropertyValue('color')
          this.computedColor = window.getComputedStyle(ref.el, null).getPropertyValue('color')
          if (!params.skipFirst) {
            ref.output.style.color = this.color;
            ref.output.innerText = `${this.displayValue}`
            ref.output.style.width = (`${this.displayValue}`.length * 12.0) + 'px'
          } else {
            ref.output.remove()
          }
        } else {
          ref.el.style.color = this.color;
          // ref.el.classList.add(className)ref.el.style.color = this.color;
          // ref.el.innerHTML = ref.original.replace(
          //   matcher,
          //   `$1<span ${style} class="${className}">(${this.displayValue})</span>$2`
          // )

          // this.computedColor = window.getComputedStyle(ref.el.querySelector('.' + className), null).getPropertyValue('color')
          this.computedColor = window.getComputedStyle(ref.el, null).getPropertyValue('color')
          ref.output.style.color = this.color;
          ref.output.innerText = `${this.displayValue}`
          ref.output.style.width = (`${this.displayValue}`.length * 12.0) + 'px'
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
    lastPos: [0, 0],
    down: false
  },
  inDemo: false,
  paddingWidth: 8,
}

state.demo = {
  start: Math.random(),
  end: Math.random(),
  t: 0.0,
}

const MoveMouse = (x, y) => {
  let ratioX = canvas.width / canvas.clientWidth
  let ratioY = canvas.height / canvas.clientHeight
  state.mouse.lastPos[0] = state.mouse.pos[0]
  state.mouse.lastPos[1] = state.mouse.pos[1]

  state.mouse.pos[0] = x * ratioX
  state.mouse.pos[1] = y * ratioY
  state.dirty = true;
}

canvas.addEventListener("mousemove", e => {
  MoveMouse(e.offsetX, e.offsetY)

  let dx = state.mouse.pos[0] - state.mouse.lastPos[0]
  let dy = state.mouse.pos[1] - state.mouse.lastPos[1]

  state.inDemo = false
  if (Math.abs(dx) < 1.0 && Math.abs(dy) < 1.0) {
    return;
  }
  state.dirty = true
})


let t = AddVar('t', '#5ab552', 0.0, 1.0, { precision: 3 });
let v = AddVar('v', '#3388de', 0.0, 1.0, {
  skipFirst: true,
});
let start = AddVar('start', '#cc99ff', 0.0, 1.0);
let end = AddVar('end', '#fa6e79', 0.0, 1.0);

state.mouse.pos[0] = 100.0;

start.update(-10.0)
end.update(50.0)

function Lerp(a, b, t) {
  return a * (1.0 - t) + b * t
}

function LerpColor(start, end, t) {
  let r = Lerp(start[0], end[0], t).toFixed(3)
  let g = Lerp(start[1], end[1], t).toFixed(3)
  let b = Lerp(start[2], end[2], t).toFixed(3)
  return `rgb(${r}, ${g}, ${b})`
}

function RenderFrame() {
  if (!state.dirty) {
    requestAnimationFrame(RenderFrame)
    return
  }

  if (!state.inDemo) {
    state.dirty = false
    let width = canvas.width - state.paddingWidth * 2.0;
    let ratio = (state.mouse.pos[0] - state.paddingWidth) / (width)
    ratio = Math.max(0.0, Math.min(1.0, ratio))
    let localT = Math.round(ratio * 100.0) / 100.0
    t.update(localT)
  } else {
    // lerp to the next t
    if (false) {
      let demoT = state.demo.start * (1.0 - state.demo.t) + state.demo.end * state.demo.t
      t.update(demoT)
      if (state.demo.t >= 1.0) {
        let maxValue = Math.max(state.demo.start, state.demo.end)
        state.demo.start = state.demo.end
        state.demo.end = Math.random();
        state.demo.t = 0.0;
      }
      state.demo.t += Math.abs(state.demo.start - state.demo.end) * 0.01;
    }

    if (true) {
      let localT = Math.sin(state.demo.t) * Math.cos(state.demo.t * 0.1)
      localT = Math.max(-1.0, Math.min(1.0, localT))
      t.update(localT * 0.5 + 0.5)
      state.demo.t += 0.01;
    }
  }

  let vColor = LerpColor(
    ParseColorFloat(start.computedColor),
    ParseColorFloat(end.computedColor),
    t.value
  )

  v.update(start.value * (1.0 - t.value) + end.value * t.value, vColor)

  ctx.reset();
  ctx.translate(state.paddingWidth, 0)
  let width = canvas.width - state.paddingWidth * 2.0;
  let gradient = ctx.createLinearGradient(0, 0, width, canvas.height)

  gradient.addColorStop(0.0, start.computedColor)
  gradient.addColorStop(1.0, end.computedColor)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 64, width, canvas.height - 96)

  // draw the x
  {
    let x = Math.floor(width * t.value)

    ctx.lineWidth = 2.0
    ctx.strokeStyle = '#fff'
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.moveTo(x, 96)
    ctx.lineTo(x, 64)
    ctx.stroke()
    let sideLength = 8
    let sideRadius = sideLength / 2.0;
    ctx.moveTo(x + 1, 65)
    ctx.lineTo(x + sideRadius, 66 - sideLength)
    ctx.lineTo(x - sideRadius, 66 - sideLength)
    ctx.lineTo(x - 1, 65)

    ctx.moveTo(x + 1, 95)
    ctx.lineTo(x + sideRadius, 94 + sideLength)
    ctx.lineTo(x - sideRadius, 94 + sideLength)
    ctx.lineTo(x - 1, 95)
    ctx.fill()

    ctx.font = "18px Hack,monospace"

    let tText = `t(${t.displayValue})`
    let vText = `v(${v.displayValue})`

    let textWidth = Math.max(
      ctx.measureText(tText).width,
      ctx.measureText(vText).width
    )

    let textStart = x - textWidth / 2.0
    let textEnd = x + textWidth / 2.0

    if (textStart < 0.0) {
      textStart = 0.0
      textEnd = textWidth
    }

    if (textEnd >= width) {
      textEnd = width
      textStart = textEnd - textWidth
    }

    textStart = Math.floor(textStart)
    textEnd = Math.floor(textEnd)

    ctx.fillStyle = t.computedColor
    ctx.fillText(tText, textStart, 20)

    ctx.fillStyle = vColor
    ctx.fillText(vText, textStart, 48)

    ctx.fillStyle = start.computedColor;
    ctx.fillText(`start(${start.displayValue})`, 0, 96 + 14 + 12)

    let endText = `end(${end.displayValue})`
    ctx.fillStyle = end.computedColor;
    ctx.fillText(endText, width - ctx.measureText(endText).width, 96 + 14 + 12)
  }
  requestAnimationFrame(RenderFrame)
}

requestAnimationFrame(RenderFrame)
