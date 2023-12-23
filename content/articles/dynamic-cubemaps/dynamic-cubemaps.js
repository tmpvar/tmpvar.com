import * as mat4 from "./gl-matrix/mat4.js"

DynamicCubemapsInit(document.getElementById("dynamic-cubemaps-content"))

function ToggleFullScreen(el) {
  if (!document.fullscreenElement) {
    el.requestFullscreen();
  } else if (document.exitFullscreen) {
    document.exitFullscreen();
  }
}

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

      uniform mat4 screenToWorld;
      uniform samplerCube cubemap;

      vec3
      ComputeRayDirection(vec2 uv, mat4 inv) {
        uv = uv * 2.0 - 1.0;
        vec4 farPlane = inv * vec4(uv.x, uv.y, 10.0, 1.0);
        vec4 nearPlane = inv * vec4(uv.x, uv.y, 0.1, 1.0);
        return normalize(farPlane.xyz / farPlane.w - nearPlane.xyz / nearPlane.w);
      }

      void main() {
        outColor = vec4(uv, 0.0, 1.0);
        vec3 dir = ComputeRayDirection(uv, screenToWorld);
        outColor = vec4(dir * 0.5 + 0.5, 1.0);
        outColor = texture(cubemap, dir);
      }
  `
  })
}

function CreateCubemapFaceProgram(gl) {
  return CreateProgram(gl, {
    vert: /* glsl */`#version 300 es
      precision highp float;

      uniform mat4 worldToScreen;
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
        boxIndex = (vertexIndex >> 3) + offset;
        // vertex pulling of cubes via Sebbbi's trick
        // https://twitter.com/SebAaltonen/status/1315982782439591938
        ivec3 vertPosition = ivec3((gl_VertexID & 0x1) >> 0,
                                   (gl_VertexID & 0x2) >> 1,
                                   (gl_VertexID & 0x4) >> 2);

        vec4 random = vec4(pcg4d(uvec4(boxIndex + offset, offset + 10, offset * 20, offset * 40))) /
                      float(0xffffffffu);
        random.xyz = random.xyz * 2.0 - 1.0;
        vec3 dir = normalize(random.xyz);
        center = dir * 100.0;

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
        radius = vec3(random.w * 10.0);
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

      // https://www.pcg-random.org/
      uint
      pcg(uint v) {
        uint state = v * 747796405u + 2891336453u;
        uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
        return (word >> 22u) ^ word;
      }

      vec2
      sphIntersect(in vec3 ro, in vec3 rd, in vec3 ce, float ra) {
        vec3 oc = ro - ce;
        float b = dot(oc, rd);
        float c = dot(oc, oc) - ra * ra;
        float h = b * b - c;
        if (h < 0.0) {
          return vec2(-1.0); // no intersection
        }
        h = sqrt(h);
        return vec2(-b - h, -b + h);
      }

      void main() {
        outColor = vec4(uvw, 0.5);

        vec3 origin = -center;
        vec3 dir = normalize(origin - (uvw * 2.0 - 1.0) * radius);

        vec2 hit = sphIntersect(origin, dir, vec3(0.0), radius.x);
        if (hit.x == -1.0) {
          outColor = vec4(0.0);
          return;
        }

        float colorOffset = float(pcg(uint(boxIndex))) / float(0xffffffffu) * 2.0 - 1.0;

        vec3 color = mix(
          vec3(0.1, 0.2, 0.3),
          vec3(0.3, 0.1, 0.3),
          dot(normalize(center.xy), vec2(0.2, 0.7)) + colorOffset
        );

        float opacity = float(pcg(uint(boxIndex))) / float(0xffffffffu);
        outColor = vec4(color, opacity * 0.125);

      }
  `
  })
}

function DynamicCubemapsInit(rootEl) {
  // TODO: this could be a slider - requires an upper bound for the index buffer
  //       pre-allocation
  const CubesPerFrame = 100;

  const canvas = rootEl.querySelector("canvas")
  const gl = canvas.getContext("webgl2")

  rootEl.querySelector(".go-fullscreen").addEventListener('click', _ => ToggleFullScreen(canvas))


  const fullscreenProgram = CreateFullscreenProgram(gl)
  const fullscreenUniformLocations = {
    screenToWorld: gl.getUniformLocation(fullscreenProgram, "screenToWorld"),
    cubemap: gl.getUniformLocation(fullscreenProgram, "cubemap"),
  }

  const cubemapFramebuffer = gl.createFramebuffer()
  const cubemapTexture = gl.createTexture()
  const cubemapFaceProgram = CreateCubemapFaceProgram(gl);
  const cubemapFaceUniformLocations = {
    worldToScreen: gl.getUniformLocation(cubemapFaceProgram, "worldToScreen"),
    offset: gl.getUniformLocation(cubemapFaceProgram, "offset"),
  }

  gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubemapTexture)
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_BASE_LEVEL, 0);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAX_LEVEL, 0);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

  const CubemapFaceDiameter = 512
  const BoxIndexCount = 18
  const TotalIndexCount = CubesPerFrame * BoxIndexCount

  const cubeIndexBuffer = gl.createBuffer()
  {
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeIndexBuffer)

    const CubeIndicesLUT = [
      0, 2, 1, 2, 3, 1,
      5, 4, 1, 1, 4, 0,
      0, 4, 6, 0, 6, 2,
      6, 5, 7, 6, 4, 5,
      2, 6, 3, 6, 7, 3,
      7, 1, 3, 7, 5, 1,
    ]
    let indices = [];
    for (let index = 0; index < TotalIndexCount; index++) {
      let cube = Math.floor(index / BoxIndexCount);
      let lutIndex = index % BoxIndexCount;
      indices[index] = CubeIndicesLUT[lutIndex] + cube * 8;
    }

    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);
  }

  const cubemapFaceDirs = [
    [+1.0, +0.0, +0.0], // GL_TEXTURE_CUBE_MAP_POSITIVE_X
    [-1.0, +0.0, +0.0], // GL_TEXTURE_CUBE_MAP_NEGATIVE_X
    [+0.0, +1.0, +0.0], // GL_TEXTURE_CUBE_MAP_POSITIVE_Y
    [+0.0, -1.0, +0.0], // GL_TEXTURE_CUBE_MAP_NEGATIVE_Y
    [+0.0, +0.0, +1.0], // GL_TEXTURE_CUBE_MAP_POSITIVE_Z
    [+0.0, +0.0, -1.0], // GL_TEXTURE_CUBE_MAP_NEGATIVE_Z
  ];

  const cubemapFaceUpDirs = [
    [+0.0, -1.0, +0.0],
    [+0.0, -1.0, +0.0],
    [+0.0, +0.0, +1.0],
    [+0.0, +0.0, -1.0],
    [+0.0, -1.0, +0.0],
    [+0.0, -1.0, -0.0],
  ];

  const Eye = [0, 0, 0]
  const Up = [0, 1, 0]

  let worldToCubeFace = []
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

    const proj = mat4.perspectiveNO(mat4.create(), Math.PI / 2.0, 1.0, 0.01, null);
    const view = mat4.lookAt(
      mat4.create(),
      Eye,
      cubemapFaceDirs[faceIndex],
      cubemapFaceUpDirs[faceIndex]
    )
    const vp = mat4.multiply(mat4.create(), proj, view);
    worldToCubeFace.push(vp);
  }

  let cubeOffset = 0;

  let worldProjection = mat4.create()
  let worldView = mat4.create()
  let worldToScreen = mat4.create()
  let screenToWorld = mat4.create()



  function RenderFrame() {
    const time = Date.now() / 1000.0
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, cubemapFramebuffer)
    gl.viewport(0, 0, CubemapFaceDiameter, CubemapFaceDiameter)
    gl.useProgram(cubemapFaceProgram)
    gl.disable(gl.CULL_FACE)
    gl.enable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.uniform1f(cubemapFaceUniformLocations.time, time)
    gl.uniform1i(cubemapFaceUniformLocations.offset, cubeOffset);

    for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_CUBE_MAP_POSITIVE_X + faceIndex,
        cubemapTexture,
        0
      )

      gl.uniformMatrix4fv(cubemapFaceUniformLocations.worldToScreen, false, worldToCubeFace[faceIndex]);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeIndexBuffer);
      gl.drawElements(gl.TRIANGLES, BoxIndexCount * CubesPerFrame, gl.UNSIGNED_INT, 0);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)

    mat4.perspectiveNO(worldProjection, Math.PI / 2.0, canvas.width / canvas.height, 0.1, 100.0);
    let dir = [Math.sin(time * 0.1), Math.sin(time * 0.1) * 0.1, Math.cos(time * 0.1)];
    mat4.lookAt(worldView, Eye, dir, Up)
    mat4.multiply(worldToScreen, worldProjection, worldView)
    mat4.invert(screenToWorld, worldToScreen)

    // Render the Cubemap
    {
      gl.useProgram(fullscreenProgram);
      gl.enable(gl.CULL_FACE);
      gl.disable(gl.DEPTH_TEST)
      gl.disable(gl.BLEND)

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubemapTexture);
      gl.uniform1i(fullscreenUniformLocations.cubemap, 0);

      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniformMatrix4fv(fullscreenUniformLocations.screenToWorld, false, screenToWorld);

      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    cubeOffset += CubesPerFrame;
    requestAnimationFrame(RenderFrame)
  }

  requestAnimationFrame(RenderFrame)
}
