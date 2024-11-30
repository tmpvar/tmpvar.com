// License: MIT https://tmpvar.mit-license.org/

import CreateParamReader from "./params.js";

function ProbeRayDistributions2DBegin(rootEl) {
  // Setup
  let controlEl = rootEl.querySelector('.controls')
  let canvas = rootEl.querySelector('canvas');
  let state = {
    canvas: canvas,
    ctx: canvas.getContext('2d'),
    dirty: true,
    params: {
      levelSlider: -1,
      colorLowerLevels: -1,
      showCascadeRayCounts: -1,
      i: 4,
    },
  }

  state.ctx.lineWidth = 2;
  state.ctx.imageSmoothingEnabled = true;

  const Param = CreateParamReader(state, controlEl)

  const DrawRayDistributions2D = () => {
    window.requestAnimationFrame(DrawRayDistributions2D)

    // html sliders/checkboxes
    Param('maxLevel', 'i32')
    Param('probeRayCount', 'i32', (parentEl, value) => {
      let newValue = Math.pow(2, value)
      parentEl.querySelector('output').innerHTML = `2<sup>${value}</sup> = <span class="highlight-orange">${newValue}</span>`
      return newValue
    })
    Param('probeDiameter', 'f32', (parentEl, value, prevValue) => {
      let exponent = value
      value = Math.pow(2, exponent)
      parentEl.querySelector('output').innerHTML = `2<sup>${exponent}</sup> = ${value}`
      return value;
    })

    Param('intervalRadius', 'i32', (parentEl, value) => {
      parentEl.querySelector('output').innerHTML = `${value}`
      return value
    })

    Param('branchingFactor', 'i32', (parentEl, value, prevValue) => {
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
    Param('colorLowerLevels', 'bool')
    Param('showCascadeRayCounts', 'bool')

    if (!state.dirty) {
      return;
    }
    state.dirty = false

    // clear the canvas
    state.ctx.fillStyle = '#111';
    state.ctx.fillRect(0, 0, canvas.width, canvas.height);

    let levelColors = ([
      '#f3a833',
      '#9de64e',
      '#36c5f4',
      '#ffa2ac',
      '#cc99ff',
      '#ec273f',
      '#de5d3a'
    ]).map((v, i) => {
      if (i == state.params.maxLevel || (i < state.params.maxLevel && state.params.colorLowerLevels)) {
        return v
      } else {
        return '#222'
      }
    });

    // Draw the actual cascades

    const TAU = Math.PI * 2.0
    state.ctx.save()

    let cascadeRayCounts = [];
    for (let level = 0; level <= state.params.maxLevel; level++) {
      let currentProbeDiameter = state.params.probeDiameter << level;
      let currentProbeRadius = currentProbeDiameter / 2
      let currentProbeRayCount = state.params.probeRayCount << (level * state.params.branchingFactor);

      let intervalStartRadius = level == 0
        ? 0
        : state.params.intervalRadius << ((level - 1) * state.params.branchingFactor)
      let intervalEndRadius = state.params.intervalRadius << (level * state.params.branchingFactor)

      state.ctx.strokeStyle = levelColors[level]
      let cascadeRayCount = 0;

      for (let x = 0; x < state.canvas.width; x += currentProbeDiameter) {
        let centerX = x + currentProbeRadius
        for (let y = 0; y < state.canvas.height; y += currentProbeDiameter) {
          let centerY = y + currentProbeRadius
          state.ctx.beginPath()
          for (let step = 0; step < currentProbeRayCount; step++) {
            let angle = TAU * (step + 0.5) / currentProbeRayCount;
            let dirX = Math.sin(angle)
            let dirY = Math.cos(angle)

            state.ctx.moveTo(centerX + dirX * intervalStartRadius, centerY + dirY * intervalStartRadius);
            state.ctx.lineTo(centerX + dirX * intervalEndRadius, centerY + dirY * intervalEndRadius)
            cascadeRayCount++
          }
          state.ctx.stroke();
        }
      }
      cascadeRayCounts.push(cascadeRayCount)
    }

    state.ctx.restore()
    if (state.params.showCascadeRayCounts) {
      let totalRays = 0;
      state.ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
      state.ctx.fillRect(0, 0, 230, 20 + 30 * (cascadeRayCounts.length + 1))
      state.ctx.fillStyle = 'white'
      state.ctx.font = '20px monospace'
      cascadeRayCounts.forEach((count, level) => {
        state.ctx.fillText(`level:${level} rays:${count}`, 20, 30 + level * 30)
        totalRays += count;
      })

      state.ctx.fillText(`total rays:${totalRays}`, 20, 30 + cascadeRayCounts.length * 30)
    }
  }

  DrawRayDistributions2D()
}

ProbeRayDistributions2DBegin(
  document.querySelector('#ray-distributions-2d-content')
)