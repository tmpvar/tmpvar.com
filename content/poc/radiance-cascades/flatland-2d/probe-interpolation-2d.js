// License: MIT https://tmpvar.mit-license.org/

import CreateParamReader from "./params.js";

ProbeInterpolation2DBegin(
  document.getElementById('probe-interpolation-2d-content')
)

function ProbeInterpolation2DBegin(rootEl) {
  // Setup
  let canvas = rootEl.querySelector('canvas');
  let controlEl = rootEl.querySelector('.controls');
  let state = {
    canvas: canvas,
    ctx: canvas.getContext('2d'),
    params: {},
    dirty: true,
  }

  state.ctx.lineWidth = 2;

  const Param = CreateParamReader(state, controlEl)

  function ReadParams() {
    Param('minLevel', 'i32')
    Param('maxLevel', 'i32')
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

  function DrawRayDistributions2D() {
    ReadParams()
    window.requestAnimationFrame(DrawRayDistributions2D)
    if (!state.dirty) {
      return;
    }
    state.dirty = false

    // clear the canvas
    state.ctx.fillStyle = '#111';
    state.ctx.fillRect(0, 0, canvas.width, canvas.height);

    let levelColors = [
      '#f3a833',
      '#9de64e',
      '#36c5f4',
      '#ffa2ac',
      '#cc99ff',
      '#ec273f',
      '#de5d3a'
    ]

    // Draw the actual cascades
    let startingProbeRadius = 64;
    let baseAngularSteps = state.params.level0RayCount
    let TAU = Math.PI * 2.0

    let diameter = startingProbeRadius * 2
    let levelPadding = 0
    for (let level = state.params.minLevel; level <= state.params.maxLevel; level++) {
      let angularSteps = baseAngularSteps << (level * state.params.branchingFactor)
      let radius = (startingProbeRadius << (level * state.params.branchingFactor)) - levelPadding
      let prevRadius = level > 0
        ? (startingProbeRadius << ((level - 1) * state.params.branchingFactor)) - levelPadding
        : 0;

      state.ctx.strokeStyle = levelColors[level]
      state.ctx.fillStyle = '#f0f'
      let cascadeRayCount = 0;
      for (let x = 0; x < state.canvas.width; x += diameter) {
        for (let y = 0; y < state.canvas.height; y += diameter) {
          state.ctx.beginPath()
          let centerX = x + startingProbeRadius
          let centerY = y + startingProbeRadius
          for (let step = 0; step < angularSteps; step++) {
            let angle = TAU * (step + 0.5) / angularSteps;
            let dirX = Math.sin(angle)
            let dirY = Math.cos(angle)

            state.ctx.moveTo(centerX + dirX * prevRadius, centerY + dirY * prevRadius);

            state.ctx.lineTo(centerX + dirX * radius, centerY + dirY * radius)
            cascadeRayCount++;
          }
          state.ctx.stroke();
        }
      }
    }
  }

  DrawRayDistributions2D()
}