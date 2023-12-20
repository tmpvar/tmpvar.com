import * as mat4 from "./gl-matrix/mat4.js"

DynamicCubemapsInit(document.getElementById("dynamic-cubemaps-content"))

function CreateShader(gl, source, type) {
  var shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader))
    return null
  }

  return shader
}


function CreateProgram(gl, sources) {
  var vertexShader = CreateShader(gl, sources.vert, gl.VERTEX_SHADER)
  var fragmentShader = CreateShader(gl, sources.frag, gl.FRAGMENT_SHADER)

  var program = gl.createProgram()
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Could not initialise shaders", gl.getProgramInfoLog(program));
  }

  gl.useProgram(program)

  return program
}

function CreateFullscreenProgram(gl) {
  return CreateProgram(gl, {
    vert: /* glsl */`#version 300 es
    out vec2 uv;
    precision highp float;

    void
    main() {
      // vertex pulling of a fullscreen triangle
      //          0b00      0b01    0b10
      // verts: (-1, -1), (-1, 4), (4, -1)
      vec2 pos = vec2(gl_VertexID & 1, (gl_VertexID >> 1) & 1) * 5.0 - 1.0;
      gl_Position = vec4(pos, 0.0, 1.0);
      uv = pos * 0.5 + 0.5;
    }
  `,

    frag: /* glsl */`#version 300 es
      precision highp float;
      in vec2 uv;
      out vec4 outColor;
      void main() {
        outColor = vec4(uv, 0.0, 1.0);
      }
  `
  })
}

function CreateCubemapFaceProgram(gl) {
  return CreateProgram(gl, {
    vert: /* glsl */`#version 300 es
      precision highp float;

      uniform mat4 worldToScreen;
      uniform float time;
      uniform int offset;

      flat out int boxIndex;
      out vec3 uvw;
      flat out vec3 radius;
      flat out vec3 center;

      const vec3 eye = vec3(0.0);


      // http://www.jcgt.org/published/0009/03/02/
      uvec4
      pcg4d(uvec4 v) {
        v = v * 1664525u + 1013904223u;

        v.x += v.y * v.w;
        v.y += v.z * v.x;
        v.z += v.x * v.y;
        v.w += v.y * v.z;

        v ^= v >> 16u;

        v.x += v.y * v.w;
        v.y += v.z * v.x;
        v.z += v.x * v.y;
        v.w += v.y * v.z;

        return v;
      }

      void
      main() {
        int vertexIndex = gl_VertexID;
        boxIndex = (vertexIndex >> 3);

        ivec3 vertPosition = ivec3((gl_VertexID & 0x1) >> 0,
                                  (gl_VertexID & 0x2) >> 1,
                                  (gl_VertexID & 0x4) >> 2);

        vec4 random = vec4(pcg4d(uvec4(boxIndex + offset, offset + 10, offset * 20, offset * 40))) /
                      float(0xffffffffu);
        random.xyz = random.xyz * 2.0 - 1.0;
        vec3 dir = normalize(random.xyz);
        center = dir * 500.0;

        vec3 localCameraPosition = eye - center;
        if (localCameraPosition.x > 0.0) {
          vertPosition.x = 1 - vertPosition.x;
        }

        if (localCameraPosition.y > 0.0) {
          vertPosition.y = 1 - vertPosition.y;
        }

        if (localCameraPosition.z > 0.0) {
          vertPosition.z = 1 - vertPosition.z;
        }

        uvw = vec3(vertPosition);
        radius = vec3(random.w * 30.0);
        vec3 pos = center + (uvw * 2.0 - 1.0) * radius;
        gl_Position = worldToScreen * vec4(pos, 1.0);
      }
    `,

    frag: /* glsl */`#version 300 es
      precision highp float;

      flat in int boxIndex;
      in vec3 uvw;
      flat in vec3 radius;
      flat in vec3 center;

      out vec4 outColor;
      void main() {
        outColor = vec4(uvw, 1.0);
      }
  `
  })
}

function DynamicCubemapsInit(rootEl) {
  const canvas = rootEl.querySelector("canvas")
  const gl = canvas.getContext("webgl2")

  const fullscreenProgram = CreateFullscreenProgram(gl)

  const cubemapFramebuffer = gl.createFramebuffer()
  const cubemapTexture = gl.createTexture()
  const cubemapFaceProgram = CreateCubemapFaceProgram(gl);
  const cubemapFaceUniformLocations = {
    worldToScreen: gl.getUniformLocation(cubemapFaceProgram, "worldToScreen"),
    time: gl.getUniformLocation(cubemapFaceProgram, "time"),
    offset: gl.getUniformLocation(cubemapFaceProgram, "offset"),
  }

  gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubemapTexture)
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_BASE_LEVEL, 0);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAX_LEVEL, 0);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

  const CubemapFaceDiameter = 512

  const cubemapFaceDirs = [
    [+1.0, +0.0, +0.0], // GL_TEXTURE_CUBE_MAP_POSITIVE_X
    [-1.0, +0.0, +0.0], // GL_TEXTURE_CUBE_MAP_NEGATIVE_X
    [+0.0, +1.0, +0.0], // GL_TEXTURE_CUBE_MAP_POSITIVE_Y
    [+0.0, -1.0, +0.0], // GL_TEXTURE_CUBE_MAP_NEGATIVE_Y
    [+0.0, +0.0, +1.0], // GL_TEXTURE_CUBE_MAP_POSITIVE_Z
    [+0.0, +0.0, -1.0], // GL_TEXTURE_CUBE_MAP_NEGATIVE_Z
  ];

  const cubemapFaceUpDirs = [
    [+0.0, +1.0, +0.0],
    [+0.0, +1.0, +0.0],
    [+0.0, +0.0, -1.0],
    [+0.0, +0.0, +1.0],
    [+0.0, +1.0, +0.0],
    [+0.0, +1.0, -0.0],
  ];

  let worldToCubeFace = []
  let cubeProj = mat4.create()
  for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
    gl.texImage2D(
      gl.TEXTURE_CUBE_MAP_POSITIVE_X + faceIndex,
      0,
      gl.RGBA,
      CubemapFaceDiameter,
      CubemapFaceDiameter,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null);

    const proj = mat4.perspectiveNO(mat4.create(), Math.PI / 2.0, 1.0, 0.01, 100.0);
    const view = mat4.lookAt(mat4.create(), [0, 0, 0], cubemapFaceDirs[faceIndex], cubemapFaceUpDirs[faceIndex])
    const vp = mat4.multiply(mat4.create(), proj, view);
    worldToCubeFace.push(vp);
  }


  gl.disable(gl.DEPTH_TEST)
  gl.clearColor(1.0, 0.0, 1.0, 1.0)


  let cubeOffset = 0;


  function RenderFrame() {
    // TODO: make this a slider
    const CubesPerFrame = 100;

    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, cubemapFramebuffer);
    gl.viewport(0, 0, CubemapFaceDiameter, CubemapFaceDiameter)
    gl.useProgram(cubemapFaceProgram);
    gl.disable(gl.CULL_FACE);
    gl.uniform1f(cubemapFaceUniformLocations.time, Date.now() / 1000.0)
    gl.uniform1i(cubemapFaceUniformLocations.offset, cubeOffset);

    for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT2,
        gl.TEXTURE_CUBE_MAP_POSITIVE_X + faceIndex,
        cubemapTexture,
        0
      )

      gl.uniformMatrix4fv(cubemapFaceUniformLocations.worldToScreen, false, worldToCubeFace[faceIndex]);
      gl.drawArrays(gl.GL_TRIANGLES, 0, 18 * CubesPerFrame);
    }

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, cubemapFramebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);

    gl.useProgram(fullscreenProgram);
    gl.enable(gl.CULL_FACE);

    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    // Set up position stream
    // gl.vertexAttribPointer(fullscreenProgram.positionAttr, 3, gl.FLOAT, false, stride, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    cubeOffset += CubesPerFrame;

    requestAnimationFrame(RenderFrame)
  }

  RenderFrame()


}
