/*
TODO:
- basic calculation for Cascade[0]
- repeated calculation for other cascades
- doubled for min + max probes
- doubled for pre-merged and raw
*/

import CreateParamReader from "./params.js"

const Ceil = Math.ceil
const Floor = Math.floor
const Pow = Math.pow
const Log2 = Math.log2
const Min = Math.min
const resolutions = [[1920, 1080], [2560, 1440], [3840, 2160], [7680, 4320]]

Init(document.querySelector('#ssprobes-wsintervals-content'))


function Init(rootEl) {
  let controlEl = rootEl.querySelector('.controls')
  const resultsEl = rootEl.querySelector('.results')

  let state = {
    params: {}
  }

  const Param = CreateParamReader(state, controlEl)

  function ReadParams() {
    Param('WorldSpace_C0_Directions', 'i32', (parentEl, value) => {
      let displayValue = Math.pow(value, 2)
      parentEl.querySelector('output').innerHTML = `<span>${displayValue} (<span class="highlight-orange">${value}</span><sup>2</sup</span>)`
      return displayValue
    })
    Param('ScreenSpace_C0_ProbeSpacing', 'i32', (parentEl, value) => {
      let displayValue = Math.pow(value, 2)
      parentEl.querySelector('output').innerHTML = `<span>${displayValue} (<span class="highlight-orange">${value}</span><sup>2</sup</span>)`
      return displayValue
    })

    // General Params
    Param('General_Keep_Unmerged', 'bool', (parentEl, value) => value)
    Param('General_Use_Min_And_Max_Depth', 'bool', (parentEl, value) => value)
  }

  function NiceBytes(original) {
    const lookup = ['B', 'KB', 'MB', 'GB', 'TB']
    let v = original
    let index = 0
    while (v >= 1.0) {
      const nv = v / 1024
      if (nv <= 1.0) {
        break
      }
      v = nv
      index++
    }
    return Ceil(v) + lookup[index]
  }


  function Update() {
    ReadParams()
    if (state.dirty) {
      state.dirty = false
      let content = `<h3>Results</h3>assuming 32bit vec4f(rgb, throughput) <code><pre>`

      for (const [width, height] of resolutions) {
        content += `${width} x ${height}\n`
        const probeGrid = [
          Ceil(width / state.params.ScreenSpace_C0_ProbeSpacing),
          Ceil(height / state.params.ScreenSpace_C0_ProbeSpacing)
        ]
        const probeGridCellCount = probeGrid[0] * probeGrid[1]
        let bytesPerLevel = probeGridCellCount * state.params.WorldSpace_C0_Directions

        if (state.params.General_Keep_Unmerged) {
          bytesPerLevel *= 2
        }

        if (state.params.General_Use_Min_And_Max_Depth) {
          bytesPerLevel *= 2
        }

        content += `  ${NiceBytes(bytesPerLevel)} per cascade level\n`
        const cascadeLevels = Ceil(Log2(Min(probeGrid[0], probeGrid[1])))
        content += `  ~${cascadeLevels} cascade levels\n`

        const totalBytes = cascadeLevels * bytesPerLevel
        content += `  ${NiceBytes(totalBytes)} total\n`


        content += '\n'
      }
      content += `</code></pre>`

      resultsEl.innerHTML = content
    }
    requestAnimationFrame(Update)
  }

  Update()
}

