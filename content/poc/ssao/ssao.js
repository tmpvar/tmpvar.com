import CreateOrbitCamera from "./camera-orbit.js"

Init(document.getElementById('ssao-content'), [1024, 1024])

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

  const boxTextureDiameter = Math.pow(2, Math.ceil(Math.log2(Math.sqrt(maxBoxes))))
  const boxBufferEntryCount = Math.pow(boxTextureDiameter, 2)

  const rasterizer = {
    batchSize: 0,
    indexBufferType: gl.UNSIGNED_INT,
    indexBuffer: gl.createBuffer(),
    vertexIDBuffer: null,
    vao: null,
    boxes: {
      count: 0,
      center: new Float32Array(boxBufferEntryCount * 3),
      radius: new Float32Array(boxBufferEntryCount * 3),

      textureDiameter: boxTextureDiameter,
      centerTexture: gl.createTexture(),
      radiusTexture: gl.createTexture()
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
      }

      if (this.vertexIDBuffer) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexIDBuffer);
        gl.enableVertexAttribArray(this.program.attributeLocation('vertexID'))
        gl.vertexAttribPointer(this.program.attributeLocation('vertexID'), 1, gl.FLOAT, false, 0, 0)
      }

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer)
      gl.uniformMatrix4fv(this.program.uniformLocation('worldToScreen'), false, worldToScreen)
      gl.uniform3f(this.program.uniformLocation('eye'),
        eye[0],
        eye[1],
        eye[2]
      )

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.boxes.centerTexture)
      gl.uniform1i(this.program.uniformLocation('boxCenterTexture'), 0)

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.boxes.radiusTexture)
      gl.uniform1i(this.program.uniformLocation('boxRadiusTexture'), 1)

      gl.uniform1f(this.program.uniformLocation('boxTextureDiameter'), this.boxes.textureDiameter)

      let remaining = this.boxes.count * BoxIndexCount
      let batchIndex = 0
      while (remaining > 0) {
        let vertexIndexOffset = batchIndex * this.batchSize
        gl.uniform1f(this.program.uniformLocation('vertexIndexOffset'), vertexIndexOffset)
        gl.drawElements(gl.TRIANGLES, remaining % this.batchSize, this.indexBufferType, 0)

        remaining -= this.batchSize
        batchIndex++
      }
    }
  }

  // Build index buffer for a bunch of boxes
  {
    const CubeIndicesLUT = [
      0, 2, 1, 2, 3, 1, // front
      5, 4, 1, 1, 4, 0, // bottom
      0, 4, 6, 0, 6, 2, // left
      6, 5, 7, 6, 4, 5, // back
      2, 6, 3, 6, 7, 3, // top
      7, 1, 3, 7, 5, 1, // right
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

  // Create the center and radius textures
  {
    gl.bindTexture(gl.TEXTURE_2D, rasterizer.boxes.centerTexture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    gl.bindTexture(gl.TEXTURE_2D, rasterizer.boxes.radiusTexture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }

  // Build the program
  {
    let vertexSource = ''
    let fragmentSource = ''

    fragmentBody = fragmentBody || `
      outColor = vec4(uvw, 1.0);
      // outColor = vec4(1.0);
      outColor = vec4(normal * 0.5 + 0.5, 1.0);
    `

    if (gl instanceof WebGL2RenderingContext) {
      rasterizer.vao = gl.createVertexArray()
      gl.bindVertexArray(rasterizer.vao)


      vertexSource = `#version 300 es
        precision highp float;

        in float vertexID;

        uniform mat4 worldToScreen;
        uniform vec3 eye;
        uniform float vertexIndexOffset;
        uniform sampler2D boxCenterTexture;
        uniform sampler2D boxRadiusTexture;

        out vec3 uvw;
        out vec3 eyeRelativePos;
        out vec3 boxRelativePos;

        void
        main() {
          int vertexIndex = gl_VertexID + int(vertexIndexOffset);
          int boxIndex = (vertexIndex >> 3);

          ivec3 vertPosition = ivec3((vertexIndex & 1) >> 0,
                                     (vertexIndex & 2) >> 1,
                                     (vertexIndex & 4) >> 2);

          uvw = vec3(vertPosition);

          vec3 pos = (uvw * 2.0 - 1.0) * 0.1;
          eyeRelativePos = pos - eye;

          // TODO: look this up in boxCenterTexture
          boxRelativePos = pos;
          gl_Position = worldToScreen * vec4(pos, 1.0);
        }
      `
      fragmentSource = `#version 300 es
        precision highp float;
        out vec4 outColor;

        in vec3 uvw;
        in vec3 eyeRelativePos;
        in vec3 boxRelativePos;

        vec3 ComputeFaceNormal(vec3 v) {
          vec3 vabs = abs(v);
          return v * vec3(
            greaterThanEqual(
              vabs,
              vec3(max(vabs.x, max(vabs.y, vabs.z)))
            )
          );
        }

        void main() {
          vec3 normal = normalize(ComputeFaceNormal(boxRelativePos));
          ${fragmentBody}
        }
      `
    }


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


    if (gl instanceof WebGLRenderingContext) {
      vertexSource = `
        precision highp float;

        attribute float vertexID;

        uniform sampler2D boxCenterTexture;
        uniform sampler2D boxRadiusTexture;
        uniform float boxTextureDiameter;

        uniform mat4 worldToScreen;
        uniform vec3 eye;
        uniform float vertexIndexOffset;


        varying vec3 uvw;
        varying vec3 eyeRelativePos;
        varying vec3 boxRelativePos;
        varying vec3 boxRadius;

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
          vec2 uv = vec2(
            mod(boxIndex, boxTextureDiameter),
            (boxIndex / boxTextureDiameter)
          ) / boxTextureDiameter;

          vec3 boxCenter = texture2DLod(boxCenterTexture, uv, 0.0).xyz;
          boxRadius = texture2DLod(boxRadiusTexture, uv, 0.0).xyz;
          // boxRadius = vec3(0.1, 0.2, 0.3);

          vec3 pos = boxCenter + boxRadius * (uvw * 2.0 - 1.0);
          // vec3 pos = (uvw * 2.0 - 1.0) * 0.1;
          eyeRelativePos = pos - eye;
          boxRelativePos = pos - boxCenter;
          gl_Position = worldToScreen * vec4(pos, 1.0);
        }
      `

      fragmentSource = `
        precision highp float;
        #define outColor gl_FragColor

        varying vec3 uvw;
        varying vec3 boxRelativePos;
        varying vec3 eyeRelativePos;
        varying vec3 boxRadius;

        vec3 ComputeFaceNormal(vec3 v) {

          vec3 vabs = abs(v);
          return v * vec3(
            greaterThanEqual(
              vabs,
              vec3(max(vabs.x, max(vabs.y, vabs.z)))
            )
          );
        }

        void main() {
          vec3 normal = normalize(ComputeFaceNormal(boxRelativePos / boxRadius));
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

function CreateFullScreener(clickToFullscreenElement, elementToFullscreen, initialDims) {
  clickToFullscreenElement.addEventListener('click', _ => {
    if (!document.fullscreenElement) {
      elementToFullscreen.requestFullscreen({
        navigationUI: 'hide'
      })
    } else if (document.exitFullscreen) {
      elementToFullscreen.width = initialDims[0]
      elementToFullscreen.height = initialDims[1]
      document.exitFullscreen();
    }
  })

  return {
    tick() {
      // TODO: this assumes a canvas element type
      if (document.fullscreenElement === elementToFullscreen) {
        if (elementToFullscreen.height != window.innerHeight) {
          elementToFullscreen.height = window.innerHeight
        }
        if (elementToFullscreen.width != window.innerWidth) {
          elementToFullscreen.width = window.innerWidth
        }
      } else {
        if (elementToFullscreen.height !== initialDims[1]) {
          elementToFullscreen.height = initialDims[1]
        }
        if (elementToFullscreen.width !== initialDims[0]) {
          elementToFullscreen.width = initialDims[0]
        }
      }
    }
  }
}

function Init(rootEl, dimensions) {
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
  const fullscreener = CreateFullScreener(
    rootEl.querySelector(".go-fullscreen"),
    canvas,
    dimensions
  )

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
  const boxRasterizer = CreateBoxRasterizer(gl, 1024 * 1024, {
    disable
  })

  boxRasterizer.boxes.count = 400000

  for (let i = 0; i < boxRasterizer.boxes.count; i++) {
    const offset = i * 3
    boxRasterizer.boxes.center[offset + 1] = (Math.random() * 2.0 - 1.0) * 5.0;
    boxRasterizer.boxes.center[offset + 0] = (Math.random() * 2.0 - 1.0) * 5.0;
    boxRasterizer.boxes.center[offset + 2] = (Math.random() * 2.0 - 1.0) * 5.0;
  }

  for (let i = 0; i < boxRasterizer.boxes.count; i++) {
    const offset = i * 3
    boxRasterizer.boxes.radius[offset + 0] = (Math.random() + 0.1) * 0.2;
    boxRasterizer.boxes.radius[offset + 1] = (Math.random() + 0.1) * 0.2;
    boxRasterizer.boxes.radius[offset + 2] = (Math.random() + 0.1) * 0.2;
  }

  if (GLHasExtension(gl, 'OES_texture_float', disable)) {
    gl.bindTexture(gl.TEXTURE_2D, boxRasterizer.boxes.centerTexture)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGB,
      boxRasterizer.boxes.textureDiameter,
      boxRasterizer.boxes.textureDiameter,
      0,
      gl.RGB,
      gl.FLOAT,
      boxRasterizer.boxes.center
    )

    gl.bindTexture(gl.TEXTURE_2D, boxRasterizer.boxes.radiusTexture)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGB,
      boxRasterizer.boxes.textureDiameter,
      boxRasterizer.boxes.textureDiameter,
      0,
      gl.RGB,
      gl.FLOAT,
      boxRasterizer.boxes.radius
    )
  }

  function Render() {
    const now = Now()
    const deltaTime = (now - state.lastFrameTime)
    state.lastFrameTime = now

    fullscreener.tick()
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
