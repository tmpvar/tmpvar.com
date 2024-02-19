/*
Pending
- draw quads
- add orbit camera
- draw billboard quads
- vertex pulling of quads

2024-02-19

*/

import CreateOrbitCamera from './camera-orbit.js'

Init(document.getElementById('volumetric-billboards-content'))

function CreateDataStore(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 3);
    request.onupgradeneeded = function (e) {
      const db = e.target.result
      const store = db.createObjectStore("models");
      resolve(db)
    }
    request.onsuccess = function (e) {
      const db = e.target.result
      resolve(db)
    }
    request.onerror = reject
  })
}

function LoadVox(name, arrayBuffer, onModelLoad) {
  const view = new DataView(arrayBuffer)
  let offset = 0
  function ReadHeader() {
    return String.fromCharCode(view.getInt8(offset++), view.getInt8(offset++), view.getInt8(offset++), view.getInt8(offset++))
  }

  function ReadI32() {
    let result = view.getInt32(offset, true)
    offset += 4
    return result
  }

  function ReadU8() {
    return view.getUint8(offset++, true)
  }

  if (ReadHeader() !== 'VOX ') {
    console.warn("invalid vox header")
    return
  }

  const version = ReadI32()

  if (ReadHeader() !== 'MAIN') {
    console.warn("no main")
    return
  }

  ReadI32()
  ReadI32()

  let currentModel;

  while (offset < view.byteLength) {
    const chunkID = ReadHeader()
    switch (chunkID) {
      case 'SIZE': {
        ReadI32()
        ReadI32()
        const dims = [ReadI32(), ReadI32(), ReadI32()]
        console.log(dims)
        currentModel = {
          name,
          dims,
          data: new Uint8Array(dims[0] * dims[1] * dims[2]),
          palette: new Uint8Array(4 * 256)
        }

        break;
      }

      case 'XYZI': {
        ReadI32()
        ReadI32()
        const TotalVoxels = ReadI32()
        const DimsX = currentModel.dims[0]
        const DimsXTimesY = DimsX * currentModel.dims[1]
        for (let i = 0; i < TotalVoxels; i++) {
          let x = ReadU8()
          let y = ReadU8()
          let z = ReadU8()
          let colorIndex = ReadU8()
          currentModel.data[x + y * DimsX + z * DimsXTimesY] = colorIndex
        }

        break;
      }

      case 'RGBA': {
        const expect = ReadI32() + offset + 4
        ReadI32()
        for (let i = 0; i < 256; i++) {
          currentModel.palette[(i + 1) * 4 + 0] = ReadU8()
          currentModel.palette[(i + 1) * 4 + 1] = ReadU8()
          currentModel.palette[(i + 1) * 4 + 2] = ReadU8()
          currentModel.palette[(i + 1) * 4 + 3] = ReadU8()
        }

        if (expect !== offset) {
          console.error("expected offset does not match actual")
        }
        break;
      }
      default: {
        const skipBytes = ReadI32() + ReadI32()
        // console.warn('unhandled %s, skipping %s bytes', chunkID, skipBytes)
        offset += skipBytes
        break;
      }
    }
  }

  if (currentModel && onModelLoad) {
    onModelLoad(currentModel)
  }
}

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

// props: { uniforms: [.. names ..] }
function GLCreateRasterProgram(gl, props, vertSource, fragSource) {
  const vertShader = CompileShader(gl, gl.VERTEX_SHADER, vertSource)
  const fragShader = CompileShader(gl, gl.FRAGMENT_SHADER, fragSource)

  if (!vertShader || !fragShader) {
    return
  }
  const program = {
    handle: gl.createProgram(),
    uniforms: {}
  }
  gl.attachShader(program.handle, vertShader)
  gl.attachShader(program.handle, fragShader)

  gl.linkProgram(program.handle)
  if (!gl.getProgramParameter(program.handle, gl.LINK_STATUS)) {
    console.log(gl.getPRogramInfoLog(program.handle))
    return
  }

  if (Array.isArray(props.uniforms)) {
    for (let uniform of props.uniforms) {
      program.uniforms[uniform] = gl.getUniformLocation(program.handle, uniform)
    }
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

async function Init(rootEl) {
  const canvas = rootEl.querySelector("canvas")
  const gl = canvas.getContext('webgl2')
  const state = {
    volumes: [],
    db: await CreateDataStore(rootEl.id),
    orbitCamera: CreateOrbitCamera(canvas),
    lastFrameTime: Now(),
  }

  // Load default model
  const filename = "./assets/default.vox"
  const request = await fetch(filename)
  const blob = await request.blob()
  const arrayBuffer = await blob.arrayBuffer()
  LoadVox(filename, arrayBuffer, (model) => {
    const transaction = state.db.transaction("models", "readwrite")
    const store = transaction.objectStore("models")
    store.put(model, model.name)

    const volume = {
      dims: model.dims.slice(),
      occupancy: gl.createTexture(),
      material: gl.createTexture()
    }

    // setup occupancy
    gl.bindTexture(gl.TEXTURE_3D, volume.occupancy)
    gl.texImage3D(
      gl.TEXTURE_3D,
      0,
      gl.R8,
      volume.dims[0],
      volume.dims[1],
      volume.dims[2],
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
      model.data
    )

    // setup material
    gl.bindTexture(gl.TEXTURE_2D, volume.material)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      256, // width
      1,   // height
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      model.palette
    )

    state.volumes.push(volume)
  })

  const quadProgram = GLCreateRasterProgram(gl, {
    uniforms: ['projection', 'view', 'worldToScreen']
  },
    /* glsl */`#version 300 es

      uniform mat4 projection;
      uniform mat4 view;
      uniform mat4 worldToScreen;

      out vec2 uv;

      // vertex pulling approach inspired by
      // https://github.com/superdump/bevy-vertex-pulling/blob/main/examples/quads/quads.wgsl
      // MIT/Apache license

      const vec2 verts[6] = vec2[6](
        vec2(0.0, 0.0),
        vec2(1.0, 1.0),
        vec2(0.0, 1.0),
        vec2(0.0, 0.0),
        vec2(1.0, 0.0),
        vec2(1.0, 1.0)
      );

      void main() {
        uv = verts[gl_VertexID];
        gl_Position = worldToScreen * vec4(uv * 2.0 - 1.0, 0.0, 1.0);
      }
    `,
    /* glsl */ `#version 300 es
      precision highp float;

      in vec2 uv;

      out vec4 outColor;

      void main() {
        outColor = vec4(uv, 0.0, 1.0);
        outColor = vec4(1.0);
      }
    `
  )
console.log(quadProgram)

  const screenDims = new Float32Array(2)
  function Render() {
    screenDims[0] = gl.canvas.width
    screenDims[1] = gl.canvas.height
    const now = Now()
    const deltaTime = (now - state.lastFrameTime) / 1000.0
    state.lastFrameTime = now

    state.orbitCamera.tick(screenDims[0], screenDims[1], deltaTime)
    gl.viewport(0, 0, screenDims[0], screenDims[1]);
    gl.clearColor(0.2, 0.2, .2, 1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    if (quadProgram) {
      gl.useProgram(quadProgram.handle)

      gl.uniformMatrix4fv(quadProgram.uniforms.projection, false, state.orbitCamera.state.projection);
      gl.uniformMatrix4fv(quadProgram.uniforms.view, false, state.orbitCamera.state.view);
      gl.uniformMatrix4fv(quadProgram.uniforms.worldToScreen, false, state.orbitCamera.state.worldToScreen);

      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }

    requestAnimationFrame(Render)
  }

  requestAnimationFrame(Render)
}
