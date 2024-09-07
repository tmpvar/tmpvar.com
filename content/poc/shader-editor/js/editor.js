const LocalStorageVersion = '1'

const DemoShader = `#version 300 es
precision highp float;
in vec2 uv;
uniform float time;
out vec4 fragColor;

#pass Pass0
void main() {
  vec3 col = 0.5 + 0.5*cos(time + uv.xyx + vec3(0,2,4));
  fragColor = vec4(col, 1.0);
  fragColor = vec4(1.0);
}

#pass Pass1
void main() {
  fragColor = vec4(uv, 0.0, 1.0);
}

#pass Pass2
uniform sampler2D pass_Pass1;
void main() {
  fragColor = vec4(uv, texture(pass_Pass1, uv).x, 1.0);
}

#pass Output
uniform sampler2D pass_Pass0;
uniform sampler2D pass_Pass2;
void main() {
  fragColor = mix(
    texture(pass_Pass0, uv),
    texture(pass_Pass2, uv),
    sin(time) * 0.5 + 0.5
  );
}
`

const Floor = Math.floor

Init()

function CreateFullscreenRenderer(gl) {
  const vertexBuffer = new Float32Array([-1, -1, -1, 4, 4, -1])
  const vao = gl.createVertexArray()

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

const passDelimiter = '#pass'
const passSamplerPrefix = 'pass_'
function PreprocessShaderSource(source) {
  const lines = source.split(/\r?\n/)

  let currentPassName = '_common_'

  const passSources = {
    '_common_': ''
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (line.startsWith(passDelimiter)) {
      currentPassName = line.slice(passDelimiter.length).trim()
      passSources[currentPassName] = `// #pass ${currentPassName}\n`
    } else {
      passSources[currentPassName] += `${line}\n`
    }
  }

  return passSources
}

function UpdateSource(gpu, programs, source) {
  const passes = PreprocessShaderSource(source)
  const gl = gpu.gl
  for (const [name, source] of Object.entries(passes)) {
    if (name === '_common_') {
      continue
    }
    const passSource = passes._common_ + source
    // TODO: hash the source to determine if we should rebuild the program
    console.group('compile pass \'%s\'', name)
    console.log(passSource)

    const handle = CreateRasterProgram(gl, passSource);
    if (handle) {
      if (programs[name]) {
        gl.deleteProgram(programs[name].handle)
      } else {
        programs[name] = { name: name }
      }

      programs[name].dependencies = []
      programs[name].uniformLocations = {}
      programs[name].handle = handle
      if (!programs[name].framebuffer) {
        if (name !== 'Output') {
          programs[name].framebuffer = gl.createFramebuffer()
          programs[name].texture = gl.createTexture()

          gl.bindTexture(gl.TEXTURE_2D, programs[name].texture)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 0);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

        } else {
          programs[name].framebuffer = null
        }
      }

      const uniformCount = gl.getProgramParameter(handle, gl.ACTIVE_UNIFORMS)
      for (let i = 0; i < uniformCount; i++) {
        const uniform = gl.getActiveUniform(handle, i);
        if (uniform.name.startsWith(passSamplerPrefix)) {
          programs[name].dependencies.push(uniform.name.slice(passSamplerPrefix.length))
        }

        programs[name].uniformLocations[uniform.name] = gl.getUniformLocation(handle, uniform.name)
      }
    } else {
      console.log('NO HANDLE')
    }
    console.groupEnd()
  }

  // linearize dependency tree
  const visited = {}
  const executionOrder = []
  function visit(programName) {
    if (visited[programName]) {
      return
    }

    visited[programName] = true

    const program = programs[programName]
    for (const dep of program.dependencies) {
      if (!visited[dep]) {
        visit(dep)
      }
    }
    executionOrder.push(programName)
  }

  for (const programName of Object.keys(programs)) {
    visit(programName)
  }

  // Setup program inputs
  for (const programName of Object.keys(programs)) {
    const program = programs[programName]
    gl.useProgram(program.handle)
    let textureIndex = 0
    for (const depName of program.dependencies) {
      const dep = programs[depName]
      const textureId = textureIndex++
      gl.activeTexture(gl.TEXTURE0 + textureId);
      gl.bindTexture(gl.TEXTURE_2D, dep.texture);
      gl.uniform1i(program.uniformLocations[passSamplerPrefix + depName], textureId);
    }
  }
  gl.bindTexture(gl.TEXTURE_2D, null);

  return {
    executionOrder
  }
}

async function Init() {
  const gpu = InitWebGL(document.querySelector('#output'))

  const savedVersion = window.localStorage.getItem('shader-editor-version')
  window.localStorage.setItem('shader-editor-version', LocalStorageVersion)

  const initialContent = savedVersion === LocalStorageVersion
    ? window.localStorage.getItem('shader-editor') || DemoShader
    : DemoShader

  const editor = await InitEditor(document.querySelector('#editor'), initialContent)

  const state = {
    gpu,
    editor,
    programs: {},
    framegraph: {
      executionOrder: []
    }
  }

  state.framegraph = UpdateSource(gpu, state.programs, initialContent)
  console.log(state.programs)

  // DEBUG: wire up persistence via local storage
  editor.getModel().onDidChangeContent((event) => {
    const latestContent = editor.getModel().createSnapshot().read() || ''
    window.localStorage.setItem('shader-editor', latestContent)
    console.clear()
    state.framegraph = UpdateSource(gpu, state.programs, latestContent)
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

  for (const passName of state.framegraph.executionOrder) {
    const program = state.programs[passName]
    gl.useProgram(program.handle)
    gl.uniform1f(gl.getUniformLocation(program.handle, 'time'), dt * 0.001)

    if (program.framebuffer) {
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, program.framebuffer)
      gl.viewport(0, 0, gpu.canvas.width, gpu.canvas.height)
      gl.bindTexture(gl.TEXTURE_2D, program.texture)
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        // TODO: allow size adjustments
        gpu.canvas.width,
        gpu.canvas.height,
        0,
        // TODO: allow format changes
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null);

      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        // TODO: pull this from the preprocessor, based on the number of outputs
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        program.texture,
        0
      )
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    }
    gpu.fullscreenRenderer()
  }
  requestAnimationFrame((dt) => ExecuteFrame(dt, state))
}

