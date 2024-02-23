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
    return window.performance.now() / 1000.0
  } else {
    return Date.now() / 1000.0
  }
}

function CreateFBO(gl, width, height) {
  const obj = {
    handle: gl.createFramebuffer(),
    texture: gl.createTexture()
  }

  gl.bindTexture(gl.TEXTURE_2D, obj.texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.bindFramebuffer(gl.FRAMEBUFFER, obj.handle)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, obj.texture, 0)

  return obj
}

function Init(rootEl) {
  const canvas = rootEl.querySelector('canvas')
  const gl = canvas.getContext('webgl')

  const fullscreenProgram = GLCreateRasterProgram(gl,
    `
    precision mediump float;
    attribute vec2 aPosition;

    varying vec2 uv;
    void main() {
      uv = aPosition * 0.5 + 0.5;
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
    `,
    `
    precision mediump float;
    uniform sampler2D tex;
    varying vec2 uv;

    void main() {
      gl_FragColor = texture2D(tex, uv);
      // gl_FragColor = vec4(uv, 0.0, 1.0);
    }
    `
  )

  const bigTriangleBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, bigTriangleBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 4, 4, -1]), gl.STATIC_DRAW)

  const fadeProgram = GLCreateRasterProgram(gl,
    `
    precision mediump float;
    attribute vec2 aPosition;

    varying vec2 uv;
    void main() {
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
    `,
    `
    precision mediump float;
    varying vec2 uv;
    void main() {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 0.05);
    }
    `
  )

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

  const pointCenters = new Float32Array(10000)
  for (let i = 0; i < pointCenters.length; i += 2) {
    pointCenters[i + 0] = Math.random() * 2.0 - 1.0
    pointCenters[i + 1] = Math.random() * 2.0 - 1.0
  }
  const points = new Float32Array(pointCenters.length)

  const pointRNG = new Float32Array(pointCenters.length)
  for (let i = 0; i < pointCenters.length; i += 2) {
    pointRNG[i + 0] = Math.random()
    pointRNG[i + 1] = Math.random() * 2.0 - 1.0
  }


  const pointBuffer = gl.createBuffer()

  const accBuffer = CreateFBO(gl, gl.canvas.width, gl.canvas.height)

  function Render() {

    // draw into the acc buffer
    {
      gl.bindFramebuffer(gl.FRAMEBUFFER, accBuffer.handle)
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)

      // fade the buffer a bit
      {
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(fadeProgram.handle)
        gl.bindBuffer(gl.ARRAY_BUFFER, bigTriangleBuffer)
        gl.vertexAttribPointer(pointProgram.attributeLocation('aPosition'), 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(pointProgram.attributeLocation('aPosition'));
        gl.drawArrays(gl.TRIANGLES, 0, 3)
        gl.disable(gl.BLEND)
      }


      // update the points
      {
        const t = Now()
        const l = points.length
        for (let i = 0; i < l; i += 2) {
          points[i + 0] = pointCenters[i + 0] + Math.sin(0.75 * t * pointRNG[i + 1]) * pointRNG[i + 0]* 0.25
          points[i + 1] = pointCenters[i + 1] + Math.cos(0.75 * t * pointRNG[i + 1]) * pointRNG[i + 1]* 0.25
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer)
        gl.bufferData(gl.ARRAY_BUFFER, points, gl.DYNAMIC_DRAW)


        gl.useProgram(pointProgram.handle)
        gl.vertexAttribPointer(pointProgram.attributeLocation('aPosition'), 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(pointProgram.attributeLocation('aPosition'));
        gl.drawArrays(gl.POINTS, 0, l/2)
      }
    }

    // Output the acc buffer
    {
      gl.useProgram(fullscreenProgram.handle)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
      gl.bindBuffer(gl.ARRAY_BUFFER, bigTriangleBuffer)
      gl.vertexAttribPointer(fullscreenProgram.attributeLocation('aPosition'), 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(fullscreenProgram.attributeLocation('aPosition'))
      gl.bindTexture(gl.TEXTURE_2D, accBuffer.texture);
      gl.uniform1i(fullscreenProgram.uniformLocation('tex'), 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    requestAnimationFrame(Render)
  }

  requestAnimationFrame(Render)
}