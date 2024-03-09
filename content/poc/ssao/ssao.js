import CreateOrbitCamera from "./camera-orbit.js"

Init(document.getElementById('ssao-content'))

function CompileShader(gl, type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    return shader
  }

  console.warn(gl.getShaderInfoLog(shader))
  gl.deleteShader(shader)
}
function GLCreateRasterProgram(gl, vertSource, fragSource) {
  const vertShader = CompileShader(gl, gl.VERTEX_SHADER, vertSource)
  const fragShader = CompileShader(gl, gl.FRAGMENT_SHADER, fragSource)

  if (!vertShader || !fragShader) {
    return
  }
  const program = {
    handle: gl.createProgram(),
    uniforms: {},
    attributes: {},
    uniformLocation(name) {
      if (!this.uniforms[name]) {
        this.uniforms[name] = gl.getUniformLocation(this.handle, name)
      }
      return this.uniforms[name]
    },
    attributeLocation(name) {
      if (this.attributes[name] == undefined) {
        this.attributes[name] = gl.getAttribLocation(this.handle, name)
        if (this.attributes[name] == -1) {
          console.warn("attribute location not found", name)
        }
      }
      return this.attributes[name]
    },
  }
  gl.attachShader(program.handle, vertShader)
  gl.attachShader(program.handle, fragShader)

  gl.linkProgram(program.handle)
  if (!gl.getProgramParameter(program.handle, gl.LINK_STATUS)) {
    console.log(gl.getProgramInfoLog(program.handle))
    return
  }

  return program
}


function GLHasExtension(gl, name, manualDisables) {
  let result = null
  if (gl instanceof WebGL2RenderingContext) {
    const SupersededExtensionsInWebGL2 = {
      'OES_element_index_uint': true
    }

    if (SupersededExtensionsInWebGL2[name]) {
      result = true
    }
  } else if (!manualDisables || !manualDisables[name]) {
    result = gl.getExtension(name)
  }
  // console.log('extention: %s = %s', name, result)
  return result
}

function CreateBoxRasterizer(gl, maxBoxes, config) {
  if (!gl) {
    throw new Error('no webgl available')
  }
  const BoxIndexCount = 36
  const BoxVertexCount = 8
  config = config || {}
  const rasterizer = {
    batchSize: 0,

    indexBufferType: gl.UNSIGNED_INT,
    indexBuffer: gl.createBuffer(),
    boxes: {
      count: 0,
      center: new Float32Array(maxBoxes * 3),
      radius: new Float32Array(maxBoxes * 3),
    },
    render() {
      const totalIndices = this.boxes.count * BoxIndexCount
      if (!totalIndices) {
        return
      }
      const batchCount = (totalIndices / this.batchSize + 1) | 0
      console.log(
        'boxCount', this.boxes.count,
        'indexCount', this.boxes.count * BoxIndexCount,
        'batchCount', batchCount,
        'batchSize', this.batchSize
      )

      if (!this.program) {
        return
      }

      gl.useProgram(this.program.handle)
      for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
        const vertexIndexOffset = batchIndex * batchSize
        console.log('vertexIndexOffset', vertexIndexOffset)
        gl.uniform1ui(this.program.uniformLocation('vertexIndexOffset'), vertexIndexOffset)
        gl.drawElements(gl.TRIANGLES, this.boxes.count * BoxIndexCount, this.indexBufferType, 0)
      }
    }
  }

  // Build index buffer for a bunch of boxes
  {
    const CubeIndicesLUT = [
      0, 2, 1, 2, 3, 1,
      5, 4, 1, 1, 4, 0,
      0, 4, 6, 0, 6, 2,
      6, 5, 7, 6, 4, 5,
      2, 6, 3, 6, 7, 3,
      7, 1, 3, 7, 5, 1,
    ];

    let indices = null;
    if (maxBoxes > 0xFFFF / BoxIndexCount) {
      if (GLHasExtension(gl, 'OES_element_index_uint', config.disable)) {
        indices = new Uint32Array(CubeIndicesLUT.length * BoxIndexCount)
        rasterizer.batchSize = maxBoxes
      } else {
        indices = new Uint16Array(CubeIndicesLUT.length * BoxIndexCount)
        rasterizer.batchSize = 0xFFFF
        rasterizer.indexBufferType = gl.UNSIGNED_SHORT
      }
    } else {
      indices = new Uint16Array(CubeIndicesLUT.length * BoxIndexCount)
      rasterizer.batchSize = 0xFFFF
      rasterizer.indexBufferType = gl.UNSIGNED_SHORT
    }

    for (let index = 0; index < rasterizer.batchSize; index++) {
      let boxIndex = (index / BoxIndexCount) | 0
      let lutIndex = index % BoxIndexCount
      indices[index] = CubeIndicesLUT[lutIndex] + boxIndex * BoxVertexCount
    }

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, rasterizer.indexBuffer)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null)
  }

  return rasterizer

}

function Init(rootEl) {
  // Read in a bunch of disables from the search part of the url
  const disable = {}
  {
    const params = new URLSearchParams(window.location.search)
    const disableStr = 'disable:'
    for (const [key, value] of params) {
      if (key.startsWith(disableStr)) {
        disable[key.substring(disableStr.length)] = true
      }
    }
  }

  console.log('disable', disable)

  const canvas = rootEl.querySelector('canvas')
  let webglVersion = 2
  let gl = !disable.webgl2 && canvas.getContext('webgl2')
  if (!gl) {
    webglVersion = 1
    gl = canvas.getContext('webgl')
    if (!gl) {
      throw new Error('webgl not available')
    }
  }

  const state = {}
  const camera = CreateOrbitCamera(canvas)
  const boxRasterizer = CreateBoxRasterizer(gl, 1024 * 1024, {
    disable
  })

  console.log(boxRasterizer)
  boxRasterizer.boxes.count = (1 << 16) + (1 << 13);
  function Render() {
    gl.clearColor(1.0, 0.0, 1.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT)

    boxRasterizer.render()

    requestAnimationFrame(Render)
  }

  requestAnimationFrame(Render)
}
