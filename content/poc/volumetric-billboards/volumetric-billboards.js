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

function Length(x, y, z) {
  return Math.sqrt(x * x + y * y + z * z)
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

        const x = ReadI32()
        // flip z/y
        const z = ReadI32()
        const y = ReadI32()

        const dims = [x, y, z]
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
          // flip y / z
          let z = ReadU8()
          let y = ReadU8()
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
  // const filename = "./assets/monu2.vox"
  const request = await fetch(filename)
  const blob = await request.blob()
  const arrayBuffer = await blob.arrayBuffer()
  LoadVox(filename, arrayBuffer, (model) => {
    const transaction = state.db.transaction("models", "readwrite")
    const store = transaction.objectStore("models")
    store.put(model, model.name)

    const volume = {
      dims: new Float32Array([model.dims[0], model.dims[1], model.dims[2]]),
      occupancy: gl.createTexture(),
      material: gl.createTexture(),
      color: gl.createTexture()
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

    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_BASE_LEVEL, 0);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    // TODO: add mips
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAX_LEVEL, 0);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

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
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 0);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    // setup color
    const color = new Uint8Array(volume.dims[0] * volume.dims[1] * volume.dims[1] * 4)
    const w = volume.dims[0] * 4
    const h = volume.dims[1]
    for (let z = 0; z < volume.dims[2]; z++) {
      let zoff = z * volume.dims[0] * volume.dims[1]
      for (let y = 0; y < volume.dims[1]; y++) {
        let yoff = zoff + y * volume.dims[0]
        for (let x = 0; x < volume.dims[0]; x++) {
          const material = model.data[x + yoff]

          const idx = x * 4 + y * w + z * w * h;
          const alpha = 0.5
          if (material) {

            const materialIndex = material * 4;
            color[idx + 0] = model.palette[materialIndex + 0]
            color[idx + 1] = model.palette[materialIndex + 1]
            color[idx + 2] = model.palette[materialIndex + 2]
            // color[idx + 3] = model.palette[materialIndex + 3]
            color[idx + 3] = 256 * alpha
          } else {
            color[idx + 0] = 1.0
            color[idx + 1] = 1.0
            color[idx + 2] = 1.0
            color[idx + 3] = 0 * alpha
          }
        }
      }
    }


    gl.bindTexture(gl.TEXTURE_3D, volume.color)
    gl.texImage3D(
      gl.TEXTURE_3D,
      0,
      gl.RGBA,
      volume.dims[0],
      volume.dims[1],
      volume.dims[2],
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      color
    )
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_BASE_LEVEL, 0);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAX_LEVEL, 0);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    state.volumes.push(volume)
  })

  const quadProgram = GLCreateRasterProgram(gl,
    await (await fetch('./quad.vert')).text(),
    /* glsl */ `#version 300 es
      precision highp float;
      precision highp int;
      precision highp sampler3D;

      uniform sampler3D occupancy;
      uniform sampler2D material;
      // full color volume
      uniform sampler3D color;

      in vec3 uvw;
      flat in int quadIndex;

      out vec4 outColor;

      vec4
      Lerp3D(vec4 c000,
             vec4 c100,
             vec4 c010,
             vec4 c110,

             vec4 c001,
             vec4 c101,
             vec4 c011,
             vec4 c111,

             vec3 t) {

        // front face
        vec4 c00 = c000 * (1.0 - t.x) + c100 * t.x;
        vec4 c01 = c010 * (1.0 - t.x) + c110 * t.x;

        // back face
        vec4 c10 = c001 * (1.0 - t.x) + c101 * t.x;
        vec4 c11 = c011 * (1.0 - t.x) + c111 * t.x;

        vec4 c0 = c00 * (1.0 - t.z) + c10 * t.z;
        vec4 c1 = c01 * (1.0 - t.z) + c11 * t.z;

        return c0 * (1.0 - t.y) + c1 * t.y;
      }


      vec4 GetMaterial(vec3 uvw) {
        int materialIndex = int(texture(occupancy, uvw).r * 255.0);
        if (materialIndex != 0) {
          return texelFetch(material, ivec2(materialIndex, 0), 0);
        }
        return vec4(0.0);
      }

      void main() {
        ivec3 col = (quadIndex + 1) * ivec3(158, 2 * 156, 3 * 159);
        outColor = vec4(vec3(col % ivec3(255, 253, 127)) / 255.0, 1.0);
        // return;

        outColor = vec4(uvw, 1.0);
        // return;

        if (any(lessThan(uvw, vec3(0.0))) || any(greaterThanEqual(uvw, vec3(1.0)))) {
          //outColor = vec4(0.0)
          discard;
          return;
        }

        outColor = texture(color, uvw);
        return;

        vec3 id = 1.0 / vec3(textureSize(occupancy, 0)) * 0.1;
        outColor = Lerp3D(
          GetMaterial(uvw + vec3(0.0, 0.0, 0.0)),
          GetMaterial(uvw + vec3(id.x, 0.0, 0.0)),
          GetMaterial(uvw + vec3(0.0, id.y, 0.0)),
          GetMaterial(uvw + vec3(id.x, id.y, 0.0)),

          GetMaterial(uvw + vec3(0.0, 0.0,   id.z)),
          GetMaterial(uvw + vec3(id.x, 0.0,  id.z)),
          GetMaterial(uvw + vec3(0.0, id.y,  id.z)),
          GetMaterial(uvw + vec3(id.x, id.y, id.z)),
          vec3(.5)
        );

        // int materialIndex = int(texture(occupancy, uvw).r * 255.0);
        // if (materialIndex != 0) {
        //   outColor = texture(occupancy, uvw).rrrr;
        //   return;
        //   ivec3 col = (materialIndex + 1) * ivec3(158, 2 * 156, 3 * 159);
        //   outColor = vec4(vec3(col % ivec3(255, 253, 127)) / 255.0, 1.0);

        //   outColor = texelFetch(material, ivec2(materialIndex, 0), 0) * vec4(1.0, 1.0, 1.0, 1.0);
        // } else {
        //   discard;
        //   // ivec3 col = (quadIndex + 1) * ivec3(158, 2 * 156, 3 * 159);
        //   // outColor = vec4(vec3(col % ivec3(255, 253, 127)) / 255.0, 1.0);
        // }

      }
    `
  )

  const boxProgram = GLCreateRasterProgram(gl,
    /* glsl */`#version 300 es
       precision highp float;

      uniform mat4 projection;
      uniform mat4 view;
      uniform vec3 eye;
      uniform vec3 dims;
      uniform float sliceCount;

      out vec3 uvw;
      flat out int quadIndex;

      // billboard approach inspired by
      // https://github.com/superdump/bevy-vertex-pulling/blob/main/examples/quads/quads.wgsl
      // MIT/Apache license

      const vec3 verts[8] = vec3[8](
        vec3(0.0, 0.0, 0.0),
        vec3(1.0, 0.0, 0.0),
        vec3(0.0, 1.0, 0.0),
        vec3(1.0, 1.0, 0.0),

        vec3(0.0, 0.0, 1.0),
        vec3(1.0, 0.0, 1.0),
        vec3(0.0, 1.0, 1.0),
        vec3(1.0, 1.0, 1.0)
      );

      void main() {
        vec3 vert = verts[gl_VertexID] * 2.0 - 1.0;
        gl_Position = (projection * view) * vec4(vert, 1.0);
      }
    `,
    `#version 300 es
    precision highp float;

    out vec4 outColor;
    void main() {
      outColor = vec4(1.0, 1.0, 1.0, 0.25);
    }

    `
  )

  const boxIndexBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, boxIndexBuffer)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint8Array([
    0, 2, 1, 2, 3, 1,
    5, 4, 1, 1, 4, 0,
    0, 4, 6, 0, 6, 2,
    6, 5, 7, 6, 4, 5,
    2, 6, 3, 6, 7, 3,
    7, 1, 3, 7, 5, 1
  ]), gl.STATIC_DRAW)


  const pointProgram = GLCreateRasterProgram(gl,
    /* glsl */`#version 300 es
       precision highp float;

      in vec4 aPosition;

      uniform mat4 projection;
      uniform mat4 view;

      uniform vec3 dims;

      out vec4 color;
      void main() {
        vec3 col = (aPosition.w) * vec3(158, 2 * 156, 3 * 159);
        color = vec4(mod(col, vec3(255, 253, 127)) / 255.0, 0.7);

        gl_Position = (projection * view) * vec4(aPosition.xyz, 1.0);
        gl_PointSize = 10.0;
      }
    `,
    `#version 300 es
    precision highp float;
    in vec4 color;
    out vec4 outColor;
    void main() {
      outColor = color;
    }
    `
  )
  const pointBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer)
  const pointData = new Float32Array([
    -1.0, -1.0, -1.0, 1.0,
    +1.0, -1.0, -1.0, 1.0,
    -1.0, +1.0, -1.0, 1.0,
    +1.0, +1.0, -1.0, 1.0,

    -1.0, -1.0, +1.0, 1.0,
    +1.0, -1.0, +1.0, 1.0,
    -1.0, +1.0, +1.0, 1.0,
    +1.0, +1.0, +1.0, 1.0,


    0.0, 0.0, 0.0, 2.0
  ])

  gl.bufferData(gl.ARRAY_BUFFER, pointData, gl.DYNAMIC_DRAW)

  gl.useProgram(pointProgram.handle)
  const pointCount = 9
  const pointVAO = gl.createVertexArray()
  gl.bindVertexArray(pointVAO)
  gl.enableVertexAttribArray(pointProgram.attributeLocation('aPosition'))
  gl.vertexAttribPointer(pointProgram.attributeLocation('aPosition'), 4, gl.FLOAT, false, 0, 0)
  gl.bindVertexArray(null)

  const lineProgram = GLCreateRasterProgram(gl,
    /* glsl */`#version 300 es
       precision highp float;

      in vec4 aPosition;

      uniform mat4 projection;
      uniform mat4 view;

      uniform vec3 dims;

      out vec4 color;
      void main() {
        color = vec4(1.0);
        gl_Position = (projection * view) * vec4(aPosition.xyz, 1.0);
      }
    `,
    `#version 300 es
    precision highp float;
    in vec4 color;
    out vec4 outColor;
    void main() {
      outColor = vec4(1.0);
    }
    `
  )

  const maxLines = 1 << 8
  let lineCount = 0
  const lineBuffer = gl.createBuffer()
  const lineData = new Float32Array(maxLines * 2 * 4 * 4)
  gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, lineData, gl.DYNAMIC_DRAW)

  gl.useProgram(lineProgram.handle)
  const lineVAO = gl.createVertexArray()
  gl.bindVertexArray(lineVAO)
  gl.enableVertexAttribArray(lineProgram.attributeLocation('aPosition'))
  gl.vertexAttribPointer(lineProgram.attributeLocation('aPosition'), 4, gl.FLOAT, false, 0, 0)
  gl.bindVertexArray(null)

  function AddLine(ax, ay, az, bx, by, bz) {
    const lineIndex = lineCount++
    const offset = lineIndex * 8

    lineData[offset + 0] = ax
    lineData[offset + 1] = ay
    lineData[offset + 2] = az
    lineData[offset + 3] = 0.0

    lineData[offset + 4] = bx
    lineData[offset + 5] = by
    lineData[offset + 6] = bz
    lineData[offset + 7] = 0.0
  }

  const screenDims = new Float32Array(2)
  const furthestPoint = new Float32Array(3)
  const closestPoint = new Float32Array(3)
  const sliceDir = new Float32Array(3)
  const perpDir = new Float32Array(2)
  function Render() {
    lineCount = 0;

    screenDims[0] = gl.canvas.width
    screenDims[1] = gl.canvas.height
    const now = Now()
    const deltaTime = (now - state.lastFrameTime) / 1000.0
    state.lastFrameTime = now

    state.orbitCamera.tick(screenDims[0], screenDims[1], deltaTime)
    gl.viewport(0, 0, screenDims[0], screenDims[1]);
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0.1, 0.1, .1, 1)

    // compute the most distant corner
    {
      let md = -Number.MAX_VALUE
      let lod = Number.MAX_VALUE
      for (let corner = 0; corner < 8; corner++) {
        let x = (corner & 1) === 1 ? 1 : -1.0
        let y = (corner & 2) === 2 ? 1 : -1.0
        let z = (corner & 4) === 4 ? 1 : -1.0

        let d = Length(
          x - state.orbitCamera.state.eye[0],
          y - state.orbitCamera.state.eye[1],
          z - state.orbitCamera.state.eye[2],
        )

        if (d > md) {
          furthestPoint[0] = x;
          furthestPoint[1] = y;
          furthestPoint[2] = z;
          md = d;
        }

        if (d < lod) {
          closestPoint[0] = x;
          closestPoint[1] = y;
          closestPoint[2] = z;
          lod = d;
        }
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer)
      gl.bufferSubData(gl.ARRAY_BUFFER, 8 * 4 * 4, furthestPoint)
    }

    // compute slice dir
    {
      let x = state.orbitCamera.state.eye[0]
      let y = state.orbitCamera.state.eye[1]
      let z = state.orbitCamera.state.eye[2]

      let ax = Math.abs(x)
      let ay = Math.abs(y)
      let az = Math.abs(z)

      if (ax > ay && ax > az) {
        sliceDir[0] = Math.sign(x)
        sliceDir[1] = 0
        sliceDir[2] = 0

        perpDir[0] = Math.sign(y) || 1
        perpDir[1] = Math.sign(z) || 1
      } else if (ay > ax && ay > az) {
        sliceDir[0] = 0
        sliceDir[1] = Math.sign(y)
        sliceDir[2] = 0

        perpDir[0] = Math.sign(x) || 1
        perpDir[1] = Math.sign(z) || 1
      } else {
        sliceDir[0] = 0
        sliceDir[1] = 0
        sliceDir[2] = Math.sign(z)

        perpDir[0] = Math.sign(x) || 1
        perpDir[1] = Math.sign(y) || 1
      }

      AddLine(
        furthestPoint[0],
        furthestPoint[1],
        furthestPoint[2],

        furthestPoint[0] + sliceDir[0] * 2.0,
        furthestPoint[1] + sliceDir[1] * 2.0,
        furthestPoint[2] + sliceDir[2] * 2.0,
      )

      gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, lineData, gl.DYNAMIC_DRAW)
    }

    const slices = Math.max(state.volumes[0].dims[0], Math.max(state.volumes[0].dims[1], state.volumes[0].dims[2])) * 10.0



    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    if (quadProgram) {
      gl.disable(gl.DEPTH_TEST)
      gl.useProgram(quadProgram.handle);
      const volume = state.volumes[0]

      gl.uniformMatrix4fv(quadProgram.uniformLocation('projection'), false, state.orbitCamera.state.projection);
      gl.uniformMatrix4fv(quadProgram.uniformLocation('view'), false, state.orbitCamera.state.view);

      gl.uniform3f(quadProgram.uniformLocation('eye'),
        state.orbitCamera.state.eye[0],
        state.orbitCamera.state.eye[1],
        state.orbitCamera.state.eye[2]
      )

      gl.uniform3f(quadProgram.uniformLocation('dims'),
        volume.dims[0] / 256.0,
        volume.dims[1] / 256.0,
        volume.dims[2] / 256.0
      )
      gl.uniform3f(quadProgram.uniformLocation('furthestPoint'),
        furthestPoint[0],
        furthestPoint[1],
        furthestPoint[2]
      )

      gl.uniform3f(quadProgram.uniformLocation('closestPoint'),
        closestPoint[0],
        closestPoint[1],
        closestPoint[2]
      )

      gl.uniform3f(quadProgram.uniformLocation('sliceDir'),
        sliceDir[0],
        sliceDir[1],
        sliceDir[2]
      )


      gl.uniform2f(quadProgram.uniformLocation('perpDir'),
        perpDir[0],
        perpDir[1]
      )

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_3D, volume.occupancy)
      gl.uniform1i(quadProgram.uniformLocation('occupancy'), 0)

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, volume.material)
      gl.uniform1i(quadProgram.uniformLocation('material'), 1)

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_3D, volume.color)
      gl.uniform1i(quadProgram.uniformLocation('color'), 2)

      gl.uniform1f(quadProgram.uniformLocation('sliceCount'), slices)
      gl.drawArrays(gl.TRIANGLES, 0, 6 * (slices + 1))
      gl.disable(gl.DEPTH_TEST)
    }

    if (false && boxProgram) {
      const volume = state.volumes[0]
      gl.useProgram(boxProgram.handle)
      gl.uniformMatrix4fv(
        boxProgram.uniformLocation('projection'),
        false,
        state.orbitCamera.state.projection
      );
      gl.uniformMatrix4fv(
        boxProgram.uniformLocation('view'),
        false,
        state.orbitCamera.state.view
      );

      gl.uniform3f(boxProgram.uniformLocation('dims'),
        volume.dims[0] / 256.0,
        volume.dims[1] / 256.0,
        volume.dims[2] / 256.0
      )

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, boxIndexBuffer)
      gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_BYTE, 0)
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null)
    }

    if (false && lineProgram) {
      const volume = state.volumes[0]
      gl.useProgram(lineProgram.handle)
      gl.uniformMatrix4fv(
        lineProgram.uniformLocation('projection'),
        false,
        state.orbitCamera.state.projection
      );
      gl.uniformMatrix4fv(
        lineProgram.uniformLocation('view'),
        false,
        state.orbitCamera.state.view
      );

      gl.uniform3f(
        lineProgram.uniformLocation('dims'),
        volume.dims[0] / 256.0,
        volume.dims[1] / 256.0,
        volume.dims[2] / 256.0
      )

      gl.bindVertexArray(lineVAO);
      gl.drawArrays(gl.LINES, 0, lineCount * 2);
      gl.bindVertexArray(null);
    }

    if (false && pointProgram) {
      const volume = state.volumes[0]
      gl.useProgram(pointProgram.handle)
      gl.uniformMatrix4fv(
        pointProgram.uniformLocation('projection'),
        false,
        state.orbitCamera.state.projection
      );
      gl.uniformMatrix4fv(
        pointProgram.uniformLocation('view'),
        false,
        state.orbitCamera.state.view
      );

      gl.uniform3f(
        pointProgram.uniformLocation('dims'),
        volume.dims[0] / 256.0,
        volume.dims[1] / 256.0,
        volume.dims[2] / 256.0
      )

      gl.bindVertexArray(pointVAO);
      gl.drawArrays(gl.POINTS, 0, pointCount);
      gl.bindVertexArray(null);
    }

    requestAnimationFrame(Render)
  }

  requestAnimationFrame(Render)
}
