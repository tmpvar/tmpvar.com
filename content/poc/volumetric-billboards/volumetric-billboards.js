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


    state.volumes.push(volume)
  })

  const quadProgram = GLCreateRasterProgram(gl, {
    uniforms: ['projection', 'view', 'eye', 'occupancy', 'material', 'dims']
  },
    /* glsl */`#version 300 es

      uniform mat4 projection;
      uniform mat4 view;
      uniform vec3 eye;
      uniform vec3 dims;

      out vec3 uvw;
      flat out int quadIndex;

      // billboard approach inspired by
      // https://github.com/superdump/bevy-vertex-pulling/blob/main/examples/quads/quads.wgsl
      // MIT/Apache license

      const vec2 verts[6] = vec2[6](
        vec2(0.0, 0.0), // b00
        vec2(1.0, 1.0), // b11
        vec2(0.0, 1.0), // b10

        vec2(0.0, 0.0), // b00
        vec2(1.0, 0.0), // b01
        vec2(1.0, 1.0)  // b11
      );

      int
      MinIndex(vec3 v) {
        bvec3 mask = lessThanEqual(v.xyz, max(v.yzx, v.zxy));
        if (mask.x) {
          return 0;
        } else if (mask.y) {
          return 1;
        } else {
          return 2;
        }
      }

      int
      MaxIndex(vec3 v) {
        bvec3 mask = greaterThanEqual(v.xyz, max(v.yzx, v.zxy));
        if (mask.x) {
          return 0;
        } else if (mask.y) {
          return 1;
        } else {
          return 2;
        }
      }

      void main() {
        quadIndex = gl_VertexID / 6;
        int vertexIndex = gl_VertexID % 6;

        vec3 right = normalize(vec3(view[0].x, view[1].x, view[2].x));
        vec3 up = normalize(vec3(view[0].y, view[1].y, view[2].y));
        vec3 forward = normalize(vec3(view[0].z, view[1].z, view[2].z));

        vec3 objectCenter = vec3(0.0);
        vec3 diff = normalize(objectCenter - eye);

        vec3 orthogonal = vec3(
          dot(forward, vec3(1.0, 0.0, 0.0)),
          dot(forward, vec3(0.0, 1.0, 0.0)),
          dot(forward, vec3(0.0, 0.0, 1.0))
        );

        int closestIndex = MaxIndex(abs(orthogonal));

        vec3 vertPosition;

        vec2 vert = verts[vertexIndex] * 2.0 - 1.0;
        float sliceDir = sign(orthogonal[closestIndex]);
        float sliceStart = -sliceDir;
        float SliceCount = max(dims.x, max(dims.y, dims.z)) * 256.0 * 2.0;
        float InvSliceCount = 1.0 / SliceCount;

        float sliceOffset = sliceStart + sliceDir * (float(quadIndex) + 0.5) * InvSliceCount * 2.0;

        if (closestIndex == 0) {
          vertPosition = vec3(sliceOffset, vert.x, vert.y);
        } else if (closestIndex == 1) {
          vertPosition = vec3(vert.x, sliceOffset, vert.y);
        } else {
          vertPosition = vec3(vert.x, vert.y, sliceOffset);
        }

        uvw = vertPosition / dims;

        #if 0
          // actual billboards
          vec3 vpos = vec3(vert.x, vert.y, sliceOffset);
          vec3 pos = vpos.x * right + vpos.y * up + vpos.z * forward;
          uvw = pos * 0.5 + 0.5;
          uvw.z = 1.0 - uvw.z;
          // uvw = uvw * 2.0 - 0.5;
          gl_Position = (projection * view) * vec4(pos * 0.5, 1.0);
        #else
          // orthogonal slices
          uvw = vertPosition * 0.5 + 0.5;
          gl_Position = (projection * view) * vec4(vertPosition * 0.5 * dims, 1.0);
        #endif

        // quadIndex = closestIndex;
      }
    `,
    /* glsl */ `#version 300 es
      precision highp float;
      precision highp int;
      precision highp sampler3D;

      uniform sampler3D occupancy;
      uniform sampler2D material;

      in vec3 uvw;
      flat in int quadIndex;

      out vec4 outColor;

      void main() {
        outColor = vec4(uvw, 1.0);

        ivec3 col = (quadIndex + 1) * ivec3(158, 2 * 156, 3 * 159);
        outColor = vec4(vec3(col % ivec3(255, 253, 127)) / 255.0, 1.0);
        // return;
        vec4 color = vec4(0.0, 0.0, 0.0, 1.0);
        color[quadIndex] = 1.0;
        outColor = color;
        // return;

        if (any(lessThan(uvw, vec3(0.0))) || any(greaterThanEqual(uvw, vec3(1.0)))) {
          //outColor = vec4(0.0)
          discard;
          return;
        }

        int materialIndex = int(texture(occupancy, uvw).r * 255.0);
        if (materialIndex != 0) {
          // ivec3 col = (materialIndex + 1) * ivec3(158, 2 * 156, 3 * 159);
          // outColor = vec4(vec3(col % ivec3(255, 253, 127)) / 255.0, 1.0);

          outColor = texelFetch(material, ivec2(materialIndex, 0), 0) * vec4(1.0, 1.0, 1.0, 0.75);
        } else {
          discard;
          // ivec3 col = (quadIndex + 1) * ivec3(158, 2 * 156, 3 * 159);
          // outColor = vec4(vec3(col % ivec3(255, 253, 127)) / 255.0, 1.0);
        }

      }
    `
  )

  const screenDims = new Float32Array(2)
  function Render() {
    screenDims[0] = gl.canvas.width
    screenDims[1] = gl.canvas.height
    const now = Now()
    const deltaTime = (now - state.lastFrameTime) / 1000.0
    state.lastFrameTime = now

    state.orbitCamera.tick(screenDims[0], screenDims[1], deltaTime)
    gl.viewport(0, 0, screenDims[0], screenDims[1]);
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0.2, 0.2, .2, 1)


    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    if (quadProgram) {
      gl.useProgram(quadProgram.handle);
      const volume = state.volumes[0]

      gl.uniformMatrix4fv(quadProgram.uniforms.projection, false, state.orbitCamera.state.projection);
      gl.uniformMatrix4fv(quadProgram.uniforms.view, false, state.orbitCamera.state.view);

      gl.uniform3f(quadProgram.uniforms.eye,
        state.orbitCamera.state.eye[0],
        state.orbitCamera.state.eye[1],
        state.orbitCamera.state.eye[2]
      )

      gl.uniform3f(quadProgram.uniforms.dims,
        volume.dims[0] / 256.0,
        volume.dims[1] / 256.0,
        volume.dims[2] / 256.0
      )

      console.log(volume.dims[0] / 256.0,
      volume.dims[1] / 256.0,
      volume.dims[2] / 256.0)

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_3D, volume.occupancy)
      gl.uniform1i(quadProgram.uniforms.occupancy, 0)

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, volume.material)
      gl.uniform1i(quadProgram.uniforms.material, 1)
      const slices = Math.max(volume.dims[0], Math.max(volume.dims[1], volume.dims[2])) * 2.0
      gl.drawArrays(gl.TRIANGLES, 0, 6 * slices)
    }

    requestAnimationFrame(Render)
  }

  requestAnimationFrame(Render)
}
