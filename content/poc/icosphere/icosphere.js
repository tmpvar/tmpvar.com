/*
  NOTE: my assumption going into this was that these spheres could be generated using a single
        strut length which would simplify manufacture.

        Unfortunately this is not true because the constraint to pull verts onto the surface of
        the sphere breaks the equilateral triangle constraint. 

        refs
        - https://discourse.mcneel.com/t/can-you-model-a-sphere-from-identical-equilateral-triangles/75685/15
        - https://simplydifferently.org/Geodesic_Dome_Notes?page=3#4V%20Icosahedron%20Dome
  
  A potential solution is to soften the constraints on the node positions
*/

import CreateOrbitCamera from "./orbit-camera.js"
import { GenerateIcosphere, mergeVertices } from "./icosphere-fast.js"
import * as vec3 from "./gl-matrix/vec3.js"

Init(document.getElementById('icosphere-content'))


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
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  gl.bindFramebuffer(gl.FRAMEBUFFER, obj.handle)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, obj.texture, 0)

  return obj
}

function CreateFullScreener(clickToFullscreenElement, elementToFullscreen) {
  const initialDims = [
    elementToFullscreen.width,
    elementToFullscreen.height
  ]
  clickToFullscreenElement.addEventListener('click', _ => {
    if (!document.fullscreenElement) {
      elementToFullscreen.requestFullscreen({
        navigationUI: 'hide'
      })
    } else if (document.exitFullscreen) {
      elementToFullscreen.width = initialDims[0]
      elementToFullscreen.height = initialDims[1]
      document.exitFullscreen()
    }
  })
}

function CreateFrameTimer(gl, maxHistoricalFrames, config) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 100
  canvas.style = "border:none; border-radius: 0"
  const ctx = canvas.getContext('2d', {
    desynchronized: true,
    alpha: false
  })

  gl.canvas.parentElement.appendChild(canvas)

  return {
    frameHead: maxHistoricalFrames,
    frames: new Float32Array(maxHistoricalFrames),
    lastTime: 0,

    render(now, boxCount) {
      const dt = (now - this.lastTime) * 1000.0
      this.lastTime = now

      const id = this.frameHead++
      const index = id % maxHistoricalFrames
      this.frames[index] = dt

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const start = Math.max(0, this.frameHead - maxHistoricalFrames)
      const end = start + maxHistoricalFrames

      let x = 0
      let y = 50
      let yscale = 1.0
      let xstep = Math.floor(canvas.width / maxHistoricalFrames)

      ctx.font = "16px monospace"
      ctx.fillStyle = "white"

      const texty = canvas.height - 10
      ctx.fillText(`${dt.toFixed(2)}`, 10, texty)
      ctx.fillText(`boxes: ${boxCount}`, 100, texty)
      ctx.fillText(`webgl2: ${gl instanceof WebGL2RenderingContext}`, 250, texty)
      // ctx.fillText(`f16: ${!!HasFeature(gl, 'OES_texture_half_float', config.disable)}`, 400, texty)

      for (let i = start; i < end; i++) {
        const sample = this.frames[i % maxHistoricalFrames]
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x, y - sample * yscale)
        ctx.strokeStyle = sample <= 17.0 ? '#5ab552' : '#fa6e79'
        ctx.stroke()
        x += xstep
      }

      ctx.strokeStyle = '#fa6e79'
      ctx.beginPath()
      ctx.moveTo(0, y - 16 * yscale)
      ctx.lineTo(canvas.width, y - 16 * yscale)
      ctx.stroke()
    }
  }
}

function CreateMesh(gl, program) {
  const vao = gl.createVertexArray()

  return {
    vao,
    indexBuffer: null,
    vertexBuffer: null,
    elementCount: 0,
    update(indices, positions) {
      gl.bindVertexArray(vao)
      const vertexBuffer = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)
      if (this.vertexBuffer) {
        gl.deleteBuffer(this.vertexBuffer)
      }
      this.vertexBuffer = vertexBuffer

      const indexBuffer = gl.createBuffer()
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW)
      if (this.indexBuffer) {
        gl.deleteBuffer(this.indexBuffer)
      }

      this.indexBuffer = indexBuffer
      this.elementCount = indices.length
      const positionAttributeLocation = program.attributeLocation('aPosition')
      gl.enableVertexAttribArray(positionAttributeLocation)
      gl.vertexAttribPointer(positionAttributeLocation, 3, gl.FLOAT, false, 0, 0)
    },
    render() {
      if (this.indexBuffer) {
        gl.bindVertexArray(this.vao)
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer)
        gl.drawElements(gl.TRIANGLES, this.elementCount, gl.UNSIGNED_INT, 0)
        // gl.drawElements(gl.LINES, this.elementCount, gl.UNSIGNED_INT, 0)
      }
    }
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
  const config = {
    antialias: false,
    stencil: false,
    desynchronized: true,
    powerPreference: "high-performance"
  }

  let gl = !disable.webgl2 && canvas.getContext('webgl2', config)
  if (!gl) {
    console.log('using webgl1')
    gl = canvas.getContext('webgl', config)
    if (!gl) {
      throw new Error('webgl not available')
    }
  } else {
    console.log('using webgl2')
  }

  const icosphereRasterizer = GLCreateRasterProgram(gl,
    /* glsl */`#version 300 es
      precision highp float;

      in vec4 aPosition;

      vec3
      IndexToColor(int i) {
        return vec3((int(i + 1) * ivec3(158, 2 * 110, 3 * 159)) % ivec3(255, 253, 230)) / 255.0;
      }

      uniform mat4 worldToScreen;
      out vec3 normal;
      flat out vec4 color;
      void main() {
        color = vec4(IndexToColor(gl_VertexID), 1.0);
        normal = normalize(aPosition.xyz);
        color = vec4(normal * 0.5 + 0.5 , 1.0);
        gl_Position = worldToScreen * vec4(aPosition.xyz, 1.0);
      }
    `,
    `#version 300 es
    precision highp float;
    flat in vec4 color;
    in vec3 normal;
    out vec4 outColor;
    void main() {
      outColor = vec4(normal * 0.5 + 0.5, 1.0);
      outColor = color;
    }
    `
  )

  const frameTimer = CreateFrameTimer(gl, 256, {
    disable
  })

  const state = {
    lastFrameTime: Now(),
    camera: CreateOrbitCamera(canvas),
    mesh: CreateMesh(gl, icosphereRasterizer)
  }

  const targetLength = 0.4

  function GenerateGeometry(targetRadius) {
    const icoGeometry = mergeVertices(GenerateIcosphere(3), 4)
    const diff = vec3.create()
    const normal = vec3.create()
    const corr = vec3.create()
    const iterations = 1000
    const factor = 1 / iterations
    for (let iteration = 0; iteration < iterations; iteration++) {
      for (let i = 0; i < icoGeometry.cells.length; i++) {
        const a = icoGeometry.cells[i + 0]

        for (let c = 0; c < 3; c++) {
          const n = (c + 1) % 3

          const pa = icoGeometry.positions[a[c]]
          const pb = icoGeometry.positions[a[n]]

          vec3.sub(diff, pb, pa)
          const l = vec3.length(diff)
          vec3.scale(normal, diff, 1.0 / l)

          vec3.scale(corr, normal, (targetLength - l) * factor)

          vec3.sub(pa, pa, corr)
          vec3.add(pb, pb, corr)
        }

        // Push towards sphere surface
        for (let c = 0; c < 3; c++) {
          const pa = icoGeometry.positions[a[c]]
          const l = vec3.length(pa)
          vec3.scale(pa, pa, 1.0 + (targetRadius - l) * factor)
        }
      }
    }

    // Relax on-sphere constraint while making all triangle edges equal
    {
      // Diff + MSE
      let mse = 0
      let count = 0
      for (let i = 0; i < icoGeometry.cells.length; i++) {
        const a = icoGeometry.cells[i + 0]

        for (let c = 0; c < 3; c++) {
          const n = (c + 1) % 3

          const pa = icoGeometry.positions[a[c]]
          const pb = icoGeometry.positions[a[n]]
          vec3.sub(diff, pb, pa)
          const l = vec3.length(diff)
          const err = l - targetLength
          const err2 = err * err
          mse += err2
          count++
        }
      }
      // mse /= count
      console.log('MSE', mse)
      icoGeometry.mse = mse
    }
    icoGeometry.targetRadius = targetRadius
    return icoGeometry
  }

  const radiusInterval = [GenerateGeometry(0.5), GenerateGeometry(5.0)]
  let finalGeo = radiusInterval[0]
  let sentinel = 5000
  while (sentinel--) {
    const targetRadius = (radiusInterval[0].targetRadius + radiusInterval[1].targetRadius) * 0.5
    const geo = GenerateGeometry(targetRadius)
    console.log("radius(%s) geo(%s) lo(%s) hi(%s)", targetRadius, geo.mse, radiusInterval[0].mse, radiusInterval[1].mse)
    if (geo.mse < radiusInterval[0].mse) {
      radiusInterval[0] = geo
    } else if (geo.mse < radiusInterval[1].mse) {
      radiusInterval[1] = geo
    } else {
      if (radiusInterval[0].mse < finalGeo.mse) {
        finalGeo = radiusInterval[0]
      } else if (radiusInterval[1].mse < finalGeo.mse) {
        finalGeo = radiusInterval[1]
      }
      break
    }
    finalGeo = geo
    console.log(targetRadius, finalGeo.mse)
    if (finalGeo.mse < 0.0000001) {
      break
    }
  }


  for (let i = 0; i < finalGeo.cells.length; i++) {
    const a = finalGeo.cells[i + 0]

    for (let c = 0; c < 3; c++) {
      const n = (c + 1) % 3
      const pa = finalGeo.positions[a[c]]
      const pb = finalGeo.positions[a[n]]
      const l = vec3.distance(pa, pb)
      console.log(l - targetLength)
    }
  }

  state.mesh.update(new Uint32Array(finalGeo.cells.flat()), new Float32Array(finalGeo.positions.flat()))

  CreateFullScreener(
    rootEl.querySelector(".go-fullscreen"),
    canvas
  )

  function Render() {
    const now = Now()
    const deltaTime = (now - state.lastFrameTime)
    state.lastFrameTime = now

    frameTimer.render(now, 1)

    state.camera.tick(gl.drawingBufferWidth, gl.drawingBufferHeight, deltaTime)
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    gl.clearColor(0.1, 0.1, 0.1, 1.0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.enable(gl.DEPTH_TEST)
    gl.depthMask(true)
    gl.disable(gl.CULL_FACE)

    gl.useProgram(icosphereRasterizer.handle)
    gl.uniformMatrix4fv(icosphereRasterizer.uniformLocation('worldToScreen'), false, state.camera.state.worldToScreen)
    state.mesh.render()

    requestAnimationFrame(Render)
  }
  requestAnimationFrame(Render)
}

