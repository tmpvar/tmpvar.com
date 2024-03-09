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
        const r = gl.getUniformLocation(this.handle, name)
        if (!r) {
          if (this.uniforms[name] === undefined) {
            this.uniforms[name] = null
            console.warn('Uniform location not found: %s', name)
          }
        } else {
          this.uniforms[name] = r
        }
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

function CreateBoxRasterizer(gl, maxBoxes, config, fragmentBody) {
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
    vertexIDBuffer: null,
    vao: null,
    boxes: {
      count: 0,
      center: new Float32Array(maxBoxes * 3),
      centerBuffer: gl.createBuffer(),
      radius: new Float32Array(maxBoxes * 3),
      radiusBuffer: gl.createBuffer()
    },
    render(worldToScreen, eye) {
      const totalIndices = this.boxes.count * BoxIndexCount
      if (!totalIndices) {
        return
      }
      const batchCount = (totalIndices / this.batchSize + 1) | 0
      if (!this.program) {
        return
      }

      gl.useProgram(this.program.handle)

      if (this.vao) {
        gl.bindVertexArray(this.vao)
      } else {
        if (this.vertexIDBuffer) {
          gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexIDBuffer);
          gl.enableVertexAttribArray(this.program.attributeLocation('vertexID'))
          gl.vertexAttribPointer(this.program.attributeLocation('vertexID'), 1, gl.FLOAT, false, 0, 0)
        }
      }

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer)
      gl.uniformMatrix4fv(this.program.uniformLocation('worldToScreen'), false, worldToScreen)
      gl.uniform3f(this.program.uniformLocation('eye'),
        eye[0],
        eye[1],
        eye[2]
      )

      let remaining = this.boxes.count * BoxIndexCount
      let batchIndex = 0
      while (remaining > 0) {
        const vertexIndexOffset = batchIndex * this.batchSize
        gl.uniform1f(this.program.uniformLocation('vertexIndexOffset'), vertexIndexOffset)
        gl.drawElements(gl.TRIANGLES, remaining, this.indexBufferType, 0)

        remaining -= this.batchSize
        batchIndex++
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
    const MaxShortBatchCount = Math.floor(0xFFFF / BoxIndexCount) * BoxIndexCount
    if (maxBoxes * BoxIndexCount > 0xFFFF) {
      if (GLHasExtension(gl, 'OES_element_index_uint', config.disable)) {
        indices = new Uint32Array(maxBoxes * BoxIndexCount)
        rasterizer.indexBufferType = gl.UNSIGNED_INT
      } else {
        indices = new Uint16Array(MaxShortBatchCount)
        rasterizer.indexBufferType = gl.UNSIGNED_SHORT
      }
    } else {
      indices = new Uint16Array(maxBoxes * BoxIndexCount)
      rasterizer.indexBufferType = gl.UNSIGNED_SHORT
    }
    rasterizer.batchSize = indices.length


    for (let index = 0; index < rasterizer.batchSize; index++) {
      let boxIndex = (index / BoxIndexCount) | 0
      let lutIndex = index % BoxIndexCount
      indices[index] = CubeIndicesLUT[lutIndex] + boxIndex * BoxVertexCount
    }

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, rasterizer.indexBuffer)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null)
  }

  // Build the program
  {
    let vertexSource = ''
    let fragmentSource = ''

    fragmentBody = fragmentBody || `
      outColor = vec4(uvw, 1.0);
      // outColor = vec4(1.0);
    `

    if (gl instanceof WebGL2RenderingContext) {
      rasterizer.vao = gl.createVertexArray()
      gl.bindVertexArray(rasterizer.vao)


      vertexSource = `#version 300 es
        precision highp float;
        uniform mat4 worldToScreen;
        uniform vec3 eye;
        uniform float vertexIndexOffset;

        uniform sampler2D boxCenter;

        out vec3 uvw;
        out vec3 eyeRelativePos;

        void
        main() {
          int vertexIndex = gl_VertexID + int(vertexIndexOffset);
          int boxIndex = (vertexIndex >> 3);

          ivec3 vertPosition = ivec3((vertexIndex & 1) >> 0,
                                     (vertexIndex & 2) >> 1,
                                     (vertexIndex & 4) >> 2);

          uvw = vec3(vertPosition);

          // vec3 pos = (boxCorner + uvw * boxes[boxIndex].radius * 2.0) * boxes[boxIndex].scale;
          vec3 pos = (uvw * 2.0 - 1.0) * 0.1;
          eyeRelativePos = pos - eye;
          gl_Position = worldToScreen * vec4(pos, 1.0);
        }
      `
      fragmentSource = `#version 300 es
        precision highp float;
        out vec4 outColor;

        in vec3 uvw;
        in vec3 eyeRelativePos;

        void main() {
          ${fragmentBody}
        }
      `
    }

    if (gl instanceof WebGLRenderingContext) {
      // There is no gl_VertexID in webgl 1.0, so we build a vertex attribute buffer
      // that can fill in the gaps
      rasterizer.vertexIDBuffer = gl.createBuffer()
      const vertexID = new Float32Array(rasterizer.batchSize)
      for (let i = 0; i < rasterizer.batchSize; i++) {
        vertexID[i] = i;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, rasterizer.vertexIDBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, vertexID, gl.STATIC_DRAW)
      gl.bindBuffer(gl.ARRAY_BUFFER, null)

      vertexSource = `
        precision highp float;

        attribute float vertexID;

        uniform sampler2D boxCenter;
        uniform sampler2D boxRadius;

        uniform mat4 worldToScreen;
        uniform vec3 eye;
        uniform float vertexIndexOffset;

        varying vec3 uvw;
        varying vec3 normal;
        varying vec3 eyeRelativePos;

        void
        main() {
          float vertexIndex = vertexID + vertexIndexOffset;
          float boxIndex = vertexIndex / 8.0;
          float boxVertIndex = mod(vertexIndex, 8.0);
          vec3 vertPosition = vec3(0.0);

          vertPosition.x = mod(boxVertIndex, 2.0);
          boxVertIndex /= 2.0;
          vertPosition.y = mod(boxVertIndex, 2.0);
          boxVertIndex /= 2.0;
          vertPosition.z = mod(boxVertIndex, 2.0);

          uvw = floor(vertPosition);
          vec3 boxRadius = vec3(1.0, 2.0, 3.0);
          // vec3 pos = boxCenter + boxRadius * (uvw * 2.0 - 1.0);
          vec3 pos = (uvw * 2.0 - 1.0) * 0.1;
          eyeRelativePos = pos - eye;
          gl_Position = worldToScreen * vec4(pos, 1.0);
        }
      `

      fragmentSource = `
        precision highp float;
        #define outColor gl_FragColor

        varying vec3 uvw;
        void main() {
          ${fragmentBody}
        }
      `
    }

    rasterizer.program = GLCreateRasterProgram(gl, vertexSource, fragmentSource)
  }

  return rasterizer

}

function Now() {
  if (window.performance && window.performance.now) {
    return window.performance.now() / 1000.0
  } else {
    return Date.now() / 1000.0
  }
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

  const state = {
    lastFrameTime: Now()
  }
  const camera = CreateOrbitCamera(canvas)
  const boxRasterizer = CreateBoxRasterizer(gl, 1024, {
    disable
  })

  boxRasterizer.boxes.count = 1

  for (let i = 0; i < boxRasterizer.boxes.count; i++) {
    boxRasterizer.boxes.center[i * 3 + 0] = 0.0 // Math.random() * 5.0;
    boxRasterizer.boxes.center[i * 3 + 1] = 0.0 // Math.random() * 5.0;
    boxRasterizer.boxes.center[i * 3 + 2] = 0.0 // Math.random() * 5.0;
  }

  // TODO: upload the center texture

  function Render() {
    const now = Now()
    const deltaTime = (now - state.lastFrameTime)
    state.lastFrameTime = now

    camera.tick(gl.drawingBufferWidth, gl.drawingBufferHeight, deltaTime)
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    gl.clearColor(0.1, 0.1, 0.1, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.DEPTH_TEST)
    boxRasterizer.render(camera.state.worldToScreen, camera.state.eye)

    requestAnimationFrame(Render)
  }

  requestAnimationFrame(Render)
}
