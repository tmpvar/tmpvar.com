Init(document.getElementById('webgl-accumulation-buffer-content'))


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

function Now() {
  if (window.performance && window.performance.now) {
    return window.performance.now()
  } else {
    return Date.now()
  }
}

function Init(rootEl) {
  const canvas = rootEl.querySelector('canvas')
  const gl = canvas.getContext('webgl')

  const pointProgram = GLCreateRasterProgram(gl,
    `
    attribute vec2 aPosition;
    void main() {
      gl_Position = vec4(aPosition, 0.0, 1.0);
      gl_PointSize = 2.0;
    }
    `,
    `
    void main() {
      gl_FragColor = vec4(1.0);
    }
    `
  )

  const points = new Float32Array(1000)
  const pointBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer)
  gl.vertexAttribPointer(pointProgram.attributeLocation('aPosition'), 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(pointProgram.attributeLocation('aPosition'));
  window.gl = gl
  function Render() {

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    gl.clearColor(0.1, 0.1, 0.1, 1.0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    // update the points
    {
      const l = points.length
      for (let i = 0; i < l; i += 2) {
        points[i + 0] = Math.random() * 2.0 - 1.0
        points[i + 1] = Math.random() * 2.0 - 1.0
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, points, gl.DYNAMIC_DRAW)
      gl.enableVertexAttribArray(pointProgram.attributeLocation('aPosition'));
    }


    gl.useProgram(pointProgram.handle)
    gl.drawArrays(gl.POINTS, 0, points.length / 2)
    requestAnimationFrame(Render)
  }

  requestAnimationFrame(Render)
}