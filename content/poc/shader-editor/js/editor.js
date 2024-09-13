
import * as yaml from 'https://unpkg.com/yaml@2.5.1/browser/dist/index.js'

const LocalStorageVersion = '7'
const EditorStateLocalStorageKey = 'shader-editor'

// Syntax additions
const PassDefinition = 'PassCreate'
const PassStore = 'PassStore'
const PassGetSampler = 'PassGetSampler'
const PassSetSize = 'PassSetSize'

const DemoShader = `in vec2 uv;
uniform float time;
uniform vec4 mouse;

vec4 Background() {
  vec3 col = 0.5 + 0.5 * cos(time + uv.xyx + vec3(0, 2, 4));
  return vec4(col, 1.0);
}

vec4 Pass0() {
  float v = step(
    1.0 - length(fract((gl_FragCoord + mouse) / 30.0) - 0.5),
    0.1
  );
  return vec4(v);
}

vec4 MainImage(sampler2D backgroundSampler, sampler2D pass0Sampler) {
  vec4 background = texture(backgroundSampler, uv);
  vec4 grid = texelFetch(pass0Sampler, ivec2(gl_FragCoord.xy), 0);
  return mix(background, grid, 0.5);
}

/* @framegraph
  MainImage:
    inputs:
      - Background
      - Pass0
*/
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
  // a reusable fbo
  const fbo = gl.createFramebuffer()
  const container = canvas.parentElement

  return {
    container,
    canvas,
    dims: [0, 0],
    gl: gl,
    fbo,
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
    automaticLayout: true,
    theme: 'vs-dark'
  })
  editor.focus()
  return editor
}

function ParseYaml(source, raiseError) {
  let indentation = '';
  let first = true

  const lines = source.split(/\r?\n/).map(line => {
    if (!line.trim()) {
      return
    }

    const match = line.match(/^(\s+)?([\/\*][\/\*]+)?(\s+)?([\w\d_\-:\s]+)$/)

    if (!match) {
      return
    }

    let prefix = ''
    // if there are comment characters
    if (match[2]) {
      prefix = match[3] || ''
    } else {
      prefix = match[1] || ''
    }
    if (first) {
      first = false
      indentation = prefix
    }

    if (!match[4]) {
      return
    }
    return prefix.replace(indentation, '') +  match[4]
  }).filter(Boolean)

  try {
    const cleaned = lines.join('\n')
    return yaml.parse(cleaned)
  } catch (e) {
    raiseError(e)
  }
}

function PreprocessShaderSource(source, raiseError) {
  const [glsl, wiringSource] = source.split(/\/[\/\*]+\s*@framegraph/)

  const framegraph = ParseYaml(wiringSource, raiseError)
  console.log(JSON.stringify(framegraph, null, 2))

  function AddNode(name) {
    const node = {
      name,
      dependencies: []
    }
    framegraph[name] = node
    return node
  }

  for (const passName of Object.keys(framegraph)) {
    const obj = framegraph[passName]
    const node = AddNode(passName)
    if (Array.isArray(obj.inputs)) {
      for (const inputName of obj.inputs) {
        node.dependencies.push(inputName)
        if (!framegraph[inputName]) {
          AddNode(inputName)
        }
      }
    }
  }

  return {
    strippedSource: glsl,
    framegraph
  }
}

function UpdateSource(gpu, passes, source, raiseError) {
  const { strippedSource, framegraph } = PreprocessShaderSource(source, raiseError)

  const header = `#version 300 es
precision highp float;
out vec4 _PassOutput;
\n`

  console.log(JSON.stringify(framegraph, null, 2))
  const gl = gpu.gl
  for (const [name, node] of Object.entries(framegraph)) {
    let passSource = header
    for (const inputName of node.dependencies) {
      passSource += `uniform sampler2D PassInput_${inputName};\n`
    }
    passSource += `\n`

    passSource += strippedSource

    const depArgs = node.dependencies.map(inputName => `PassInput_${inputName}`)
    passSource += `void main() {
  _PassOutput = ${name}(${depArgs.join(', ')});
}
    `

    // TODO: hash the source to determine if we should rebuild the program
    console.group('compile pass \'%s\'', name)
    console.log(passSource)

    const program = CreateRasterProgram(gl, passSource);
    if (program) {
      if (passes[name]) {
        if (passes[name].program) {
          gl.deleteProgram(passes[name].program)
        }
      } else {
        passes[name] = { name: name }
      }

      passes[name].dependencies = node ? node.dependencies : []
      passes[name].uniformLocations = {}
      passes[name].program = program

      passes[name].size = framegraph[name].size

      if (!passes[name].texture) {
        if (name !== 'MainImage') {
          passes[name].texture = gl.createTexture()

          gl.bindTexture(gl.TEXTURE_2D, passes[name].texture)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 0);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

        } else {
          passes[name].texture = null
        }
      }

      const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS)
      for (let i = 0; i < uniformCount; i++) {
        const uniform = gl.getActiveUniform(program, i);
        passes[name].uniformLocations[uniform.name] = gl.getUniformLocation(program, uniform.name)
      }
    } else {
      console.log('invalid program')
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

    const program = passes[programName]
    for (const passName of program.dependencies) {
      if (!visited[passName]) {
        visit(passName)
      }
    }
    executionOrder.push(programName)
  }

  for (const programName of Object.keys(passes)) {
    visit(programName)
  }

  // Setup program inputs
  for (const programName of Object.keys(passes)) {
    const pass = passes[programName]
    gl.useProgram(pass.program)
    let textureIndex = 0
    for (const passName of pass.dependencies) {
      const uniformName = `PassInput_${passName}`
      const dep = passes[passName]
      const textureId = textureIndex++
      console.log(programName, 'binds', passName, 'to', uniformName)
      gl.activeTexture(gl.TEXTURE0 + textureId);
      gl.bindTexture(gl.TEXTURE_2D, dep.texture);
      gl.uniform1i(pass.uniformLocations[uniformName], textureId);
    }
  }
  gl.bindTexture(gl.TEXTURE_2D, null);
  console.log(executionOrder)
  return {
    executionOrder
  }
}

function TryUpdateSource(state, content) {

  function RaiseError(e) {
    console.error(e)
  }

  try {
    state.framegraph = UpdateSource(state.gpu, state.passes, content, RaiseError)
    return true
  } catch (e) {
    console.error('UpdateSource threw:\n%s', e.stack)
    return false
  }
}

function PersistEditorState(content, editor) {
  const viewState = editor.saveViewState()
  // DEBUG: wire up persistence via local storage
  window.localStorage.setItem(EditorStateLocalStorageKey, JSON.stringify({
    viewState,
    content: content
  }))
}

async function Init() {
  const gpu = InitWebGL(document.querySelector('#output'))

  const savedVersion = window.localStorage.getItem('shader-editor-version')
  window.localStorage.setItem('shader-editor-version', LocalStorageVersion)

  let initialContent = DemoShader
  let initialViewState = null
  if (savedVersion === LocalStorageVersion) {
    const storedStateStr = window.localStorage.getItem(EditorStateLocalStorageKey)
    if (storedStateStr) {
      try {
        const storedState = JSON.parse(storedStateStr)
        if (storedState.content) {
          initialContent = storedState.content
        }
        initialViewState = storedState.viewState
      } catch (e) {
        console.warn('invalid persistent state, ignoring')
      }
    }
  }

  const editor = await InitEditor(document.querySelector('#editor'), initialContent)
  initialViewState && editor.restoreViewState(initialViewState)

  const state = {
    gpu,
    editor,
    passes: {},
    framegraph: {
      executionOrder: []
    },
    rawMouse: [0, 0]
  }

  TryUpdateSource(state, initialContent)
  console.log(state.passes)
  window.model = editor.getModel()
  let latestContent = initialContent
  editor.getModel().onDidChangeContent((event) => {
    latestContent = editor.getModel().createSnapshot().read() || ''
    console.clear()
    TryUpdateSource(state, latestContent)
    PersistEditorState(latestContent, editor)
  })

  addEventListener("visibilitychange", (event) => {
    PersistEditorState(latestContent, editor)
  });

  addEventListener("mousemove", (event) => {
    state.rawMouse[0] = event.clientX
    state.rawMouse[1] = event.clientY
  })


  requestAnimationFrame((dt) => ExecuteFrame(dt, state))
}

const v2scratch = [0, 0]
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
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.viewport(0, 0, gpu.canvas.width, gpu.canvas.height)
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  for (const passName of state.framegraph.executionOrder) {
    const pass = state.passes[passName]
    gl.useProgram(pass.program)
    gl.uniform1f(gl.getUniformLocation(pass.program, 'time'), dt * 0.001)

    const mouseLoc = gl.getUniformLocation(pass.program, 'mouse')
    if (mouseLoc) {
      const x = rect.width - (state.rawMouse[0] - rect.left)
      const y = state.rawMouse[1] - rect.top
      gl.uniform4f(mouseLoc, x, y, 0.0, 0.0);
    }

    if (pass.texture) {
      v2scratch[0] = gpu.canvas.width
      v2scratch[1] = gpu.canvas.height
      if (pass.size) {
        pass.size(v2scratch, v2scratch)
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, state.gpu.fbo)
      gl.viewport(0, 0, v2scratch[0], v2scratch[1])
      gl.bindTexture(gl.TEXTURE_2D, pass.texture)
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        v2scratch[0],
        v2scratch[1],
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
        pass.texture,
        0
      )
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, gpu.canvas.width, gpu.canvas.height)
    }
    gpu.fullscreenRenderer()
  }
  requestAnimationFrame((dt) => ExecuteFrame(dt, state))
}

