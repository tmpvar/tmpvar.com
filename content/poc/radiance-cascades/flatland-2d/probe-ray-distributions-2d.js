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
    let scale = 2.0;
    state.ctx.scale(scale, scale);
    state.ctx.lineWidth = 1.0 / scale;

    let cascadeRayCounts = [];
    let index = 0
    console.clear()
    for (let level = 0; level <= state.params.maxLevel; level++) {
      let currentProbeDiameter = state.params.probeDiameter << level;
      let currentProbeRadius = currentProbeDiameter / 2
      let currentProbeRayCount = state.params.probeRayCount << (level * state.params.branchingFactor);

      let intervalStartRadius = level == 0
        ? 0
        : state.params.intervalRadius << ((level - 1) * state.params.branchingFactor)
      let intervalEndRadius = state.params.intervalRadius << (level * state.params.branchingFactor)


      console.log(intervalStartRadius, intervalEndRadius, { currentProbeDiameter, r: intervalEndRadius - intervalStartRadius})
      state.ctx.strokeStyle = levelColors[level]

      let cascadeRayCount = 0;

      for (let x = 0; x < state.canvas.width; x += currentProbeDiameter) {
        for (let y = 0; y < state.canvas.height; y += currentProbeDiameter) {
          let centerX = x + currentProbeRadius
          let centerY = y + currentProbeRadius

          // let r = ((index + 1) * 190) % 255
          // let g = ((index + 1) * 2 * 156) % 255
          // let b = ((index + 1) * 3 * 159) % 127
          // index++;
          // state.ctx.strokeStyle = `rgb(${r},${g},${b})`

          state.ctx.beginPath()
          for (let step = 0; step < currentProbeRayCount; step++) {
            let angle = TAU * (step + 0.5) / currentProbeRayCount;
            let dirX = Math.sin(angle)
            let dirY = Math.cos(angle)
            // state.ctx.moveTo(centerX, centerY);
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

    // let i = state.params.i;
    // let startingProbeRadius = Math.pow(2, i);
    // let baseAngularSteps = Math.max(4, Math.pow(2, i));
    // let radianceIntervalStart = 0;
    // let cascadeRayCounts = [];
    // for (let level = 0; level <= state.params.levelSlider; level++) {
    //   let angularSteps = baseAngularSteps << (level * state.params.branchingFactor)
    //   let radius = startingProbeRadius << (level * state.params.branchingFactor)
    //   let diameter = radius * 2
    //   let prevRadius = level > 0
    //     ? startingProbeRadius << ((level - 1) * state.params.branchingFactor)
    //     : 0;

    //   state.ctx.strokeStyle = levelColors[level]
    //   state.ctx.fillStyle = '#f0f'
    //   let cascadeRayCount = 0;
    //   for (let x = 0; x < state.canvas.width; x += diameter) {
    //     for (let y = 0; y < state.canvas.height; y += diameter) {
    //       state.ctx.beginPath()
    //       let centerX = x + radius
    //       let centerY = y + radius
    //       for (let step = 0; step < angularSteps; step++) {
    //         let angle = TAU * (step + 0.5) / angularSteps;
    //         let dirX = Math.sin(angle)
    //         let dirY = Math.cos(angle)

    //         state.ctx.moveTo(centerX + dirX * prevRadius, centerY + dirY * prevRadius);
    //         state.ctx.lineTo(centerX + dirX * radius, centerY + dirY * radius)
    //         cascadeRayCount++;
    //       }
    //       state.ctx.stroke();
    //     }
    //   }
    //   cascadeRayCounts.push(cascadeRayCount);
    //   radianceIntervalStart = radius;
    // }
    // state.ctx.restore()
    // if (state.params.showCascadeRayCounts) {
    //   let totalRays = 0;
    //   state.ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
    //   state.ctx.fillRect(0, 0, 230, 20 + 30 * (cascadeRayCounts.length + 1))
    //   state.ctx.fillStyle = 'white'
    //   state.ctx.font = '20px monospace'
    //   cascadeRayCounts.forEach((count, level) => {
    //     state.ctx.fillText(`level:${level} rays:${count}`, 20, 30 + level * 30)
    //     totalRays += count;
    //   })

    //   state.ctx.fillText(`total rays:${totalRays}`, 20, 30 + cascadeRayCounts.length * 30)
    // }
  }

  DrawRayDistributions2D()
}

ProbeRayDistributions2DBegin(
  document.querySelector('#ray-distributions-2d-content')
)