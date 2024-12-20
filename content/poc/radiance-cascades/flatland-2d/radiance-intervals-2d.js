// License: MIT https://tmpvar.mit-license.org/

import CreateParamReader from "./params.js"

RadianceIntervals2DBegin(
  document.getElementById('radiance-intervals-2d-content')
)

function RadianceIntervals2DBegin(rootEl) {
  // Setup
  let controlEl = rootEl.querySelector('.controls')

  let canvas = rootEl.querySelector('canvas')
  let state = {
    canvas: canvas,
    ctx: canvas.getContext('2d'),
    params: {}
  }

  const Param = CreateParamReader(state, controlEl)

  // clear the canvas
  state.ctx.fillStyle = '#111';
  state.ctx.fillRect(0, 0, canvas.width, canvas.height);
  let levelCount = 6;
  let levelColors = [
    '#f3a833',
    '#9de64e',
    '#36c5f4',
    '#ffa2ac',
    '#cc99ff',
    '#ec273f',
    '#de5d3a'
  ]

  function ReadParams() {
    Param('level0RayCount', 'i32', (parentEl, value) => {
      parentEl.querySelector('output').innerHTML = `<span class="highlight-orange">${value}</span>`
      return value
    })
    Param('branchingFactor', 'i32', (parentEl, value) => {
      let probeRayCount = state.params.level0RayCount;
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

  }

  function DrawRadianceIntervals() {
    ReadParams()
    window.requestAnimationFrame(DrawRadianceIntervals)

    if (!state.dirty) {
      return
    }
    state.dirty = false

    // clear the canvas
    state.ctx.fillStyle = '#111';
    state.ctx.fillRect(0, 0, canvas.width, canvas.height);
    state.ctx.lineWidth = 2;

    let centerX = Math.floor(state.canvas.width / 2.0)
    let centerY = Math.floor(state.canvas.height / 2.0)
    let startingProbeRadius = 16
    let levelPadding = 0
    // the number of rays cast at level 0
    let baseAngularSteps = state.params.level0RayCount;
    let TAU = Math.PI * 2.0

    for (var level = 0; level <= levelCount; level++) {
      state.ctx.strokeStyle = levelColors[level];

      let radius = (startingProbeRadius << (level * state.params.branchingFactor)) - levelPadding;
      let prevRadius = level > 0
        ? (startingProbeRadius << ((level - 1) * state.params.branchingFactor)) - levelPadding
        : 0;

      if (prevRadius * 2.0 > canvas.width) {
        break
      }

      state.ctx.beginPath()
      state.ctx.moveTo(centerX + radius, centerY)
      state.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2.0)
      state.ctx.stroke();

      let angularSteps = baseAngularSteps << (level * state.params.branchingFactor)
      state.ctx.beginPath()
      for (let step = 0; step < angularSteps; step++) {
        let angle = TAU * (step + 0.5) / angularSteps;

        state.ctx.moveTo(centerX + Math.sin(angle) * prevRadius, centerY + Math.cos(angle) * prevRadius)
        state.ctx.lineTo(centerX + Math.sin(angle) * radius, centerY + Math.cos(angle) * radius)
      }
      state.ctx.stroke();
    }
  }
  DrawRadianceIntervals()
}
