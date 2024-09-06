const Floor = Math.floor

Init()

function CreateFullscreenRenderer(gl) {
  const vertexBuffer = new Float32Array([-1, -1, -1, 4, 4, -1])
  const vao = gl.createVertexArray()
  console.log('vao', vao)
  gl.bindVertexArray(vao)
  var buf = gl.createBuffer(gl)
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, vertexBuffer, gl.STATIC_DRAW)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.enableVertexAttribArray(0)
  gl.bindVertexArray(null)
  return function RenderFullscreenTriangle() {
    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(vao)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
}

function CreateRasterProgram(gl, frag) {
  const vert = `#version 300 es
    layout (location=0) in vec2 position;
    out vec2 uv;
    void main() {
      uv = position.xy * 0.5 + 0.5;
      gl_Position = vec4(position, 0, 1.0);
    }
  `

  const fragShader = gl.createShader(gl.FRAGMENT_SHADER)
  gl.shaderSource(fragShader, frag)
  gl.compileShader(fragShader)
  if (!gl.getShaderParameter(fragShader, gl.COMPILE_STATUS)) {
    console.error('FRAGMENT SHADER', gl.getShaderInfoLog(fragShader))
    return
  }

  const vertShader = gl.createShader(gl.VERTEX_SHADER)
  gl.shaderSource(vertShader, vert)
  gl.compileShader(vertShader)
  if (!gl.getShaderParameter(vertShader, gl.COMPILE_STATUS)) {
    console.error('VERTEX SHADER', gl.getShaderInfoLog(vertShader))
    return
  }

  const program = gl.createProgram()
  gl.attachShader(program, fragShader)
  gl.attachShader(program, vertShader)
  gl.linkProgram(program)

  gl.deleteShader(fragShader)
  gl.deleteShader(vertShader)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program))
    return
  }

  return program
}

function InitWebGL(canvas) {
  const options = {
    premultipliedAlpha: true,
    alpha: true,
    antialias: true
  }

  Object.assign(canvas.style, {
    left: 0,
    top: 0,
    margin: 0,
    padding: 0,
    'pointer-events': 'none',
    position: 'absolute'
  })

  const gl = canvas.getContext('webgl2', options)
  const container = canvas.parentElement

  return {
    container,
    canvas,
    dims: [0, 0],
    gl: gl,
    fullscreenRenderer: CreateFullscreenRenderer(gl)
  }
}

async function InitEditor(editorEl, initialContent) {
  require.config({ paths: { vs: 'js/monaco-editor/min/vs' } });
  const monaco = await new Promise(resolve => {
    require(['vs/editor/editor.main'], resolve)
  })

  const editor = monaco.editor.create(editorEl, {
    value: initialContent || '',
    language: 'c',
    minimap: {
      enabled: false
    },
    tabSize: 2,
    theme: 'vs-dark'
  })
  editor.focus()
  return editor
}

async function Init() {
  const gpu = InitWebGL(document.querySelector('#output'))

  const initialContent = window.localStorage.getItem('shader-editor') || `#version 300 es
precision highp float;

in vec2 uv;
out vec4 fragColor;

uniform float time;

void main() {
  vec3 col = 0.5 + 0.5*cos(time + uv.xyx + vec3(0,2,4));
  fragColor = vec4(col, 1.0);
}

  `
  const editor = await InitEditor(document.querySelector('#editor'), initialContent)

  const state = {
    gpu,
    editor,
    debugProgram: CreateRasterProgram(gpu.gl, initialContent)
  }

  // DEBUG: wire up persistence via local storage
  editor.getModel().onDidChangeContent((event) => {
    const latestContent = editor.getModel().createSnapshot().read() || ''
    window.localStorage.setItem('shader-editor', latestContent)
    console.clear()
    console.log('latestContent', latestContent)

    const newProgram = CreateRasterProgram(gpu.gl, latestContent);
    if (newProgram) {
      gpu.gl.deleteProgram(state.program)
      state.debugProgram = newProgram
    }
  })

  requestAnimationFrame((dt) => ExecuteFrame(dt, state))
}


function ExecuteFrame(dt, state) {
  const gpu = state.gpu
  // Ensure we're sized properly w.r.t. pixel ratio
  const rect = gpu.container.getBoundingClientRect()

  if (gpu.dims[0] !== rect.width || gpu.dims[1] !== rect.height) {
    gpu.dims[0] = rect.width
    gpu.dims[1] = rect.height

    const width = Floor(rect.width * window.devicePixelRatio)
    const height = Floor(rect.height * window.devicePixelRatio)

    gpu.canvas.width = width
    gpu.canvas.height = height

    gpu.canvas.style.width = `${rect.width}px`;
    gpu.canvas.style.height = `${rect.height}px`;
  }

  const gl = gpu.gl;
  gl.viewport(0, 0, gpu.canvas.width, gpu.canvas.height)
  gl.clearColor(1.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(state.debugProgram)
  gl.uniform1f(gl.getUniformLocation(state.debugProgram, 'time'), dt * 0.001)
  gpu.fullscreenRenderer()

  requestAnimationFrame((dt) => ExecuteFrame(dt, state))
}

