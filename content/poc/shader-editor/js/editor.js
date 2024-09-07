const LocalStorageVersion = '2'

const DemoShader = `in vec2 uv;
uniform float time;

PassCreate(Pass0, viewport.dims) {
  vec3 col = 0.5 + 0.5 * cos(time + uv.xyx + vec3(0, 2, 4));
  PassStore(rgba8, color, vec4(col, 1.0));
}

PassCreate(Pass1, viewport.dims) {
  PassStore(rgba8, color, vec4(uv, 0.0, 1.0));
}

PassCreate(
  Pass2,
  viewport.dims
) {
  vec3 r = texture(
    PassGetSampler(Pass1, color),
    uv
  ).xxx;

  PassStore(rgba8, color, vec4(r, 1.0));
}

PassCreate(Output, viewport.dims) {
  vec4 result = mix(
    texture(PassGetSampler(Pass0, color), uv),
    texture(PassGetSampler(Pass2, color), uv),
    sin(time) * 0.5 + 0.5
  );

  PassStore(rgba8, color, result);
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
const PassDefinition = 'PassCreate'
const PassStore = 'PassStore'
const PassGetSampler = 'PassGetSampler'

function ReadParams(source, cursor, raiseError) {
  const originalByteOffset = cursor.byteOffset
  let depth = 0
  let isCollecting = false
  let params = ''
  const len = source.length
  for (; cursor.byteOffset < len; cursor.byteOffset++) {
    const c = source[cursor.byteOffset]
    if (c === '(') {
      depth++;
      if (!isCollecting) {
        isCollecting = true
        continue
      }
    } else if (c === ')') {
      depth--
    }

    if (isCollecting && !depth) {
      if (c === ')') {
        cursor.byteOffset++
      }
      break
    }

    params += c
  }

  if (!isCollecting) {
    raiseError('invalid params, never found starting (', {
      cursor
    })

    // Reset the byte offset, but effectively skip the token
    cursor.byteOffset = originalByteOffset
    return
  }

  if (cursor.byteOffset >= len) {
    raiseError('invalid params, never found ending )', {
      cursor
    })

    // Reset the byte offset, but effectively skip the token
    cursor.byteOffset = originalByteOffset
    return
  }

  return params
}

function ReadScopeBody(source, cursor, raiseError) {
  const originalByteOffset = cursor.byteOffset
  let depth = 0
  let isCollecting = false
  let result = ''
  const len = source.length
  for (; cursor.byteOffset < len; cursor.byteOffset++) {

    const c = source[cursor.byteOffset]

    if (c === '{') {
      depth++;
      if (!isCollecting) {
        isCollecting = true
        continue
      }
    } else if (c === '}') {
      depth--
    }

    if (isCollecting && !depth) {
      if (c === ')') {
        // cursor.byteOffset++
      }
      break
    }

    result += c
  }

  if (!isCollecting) {
    raiseError('invalid scope, never found starting {', {
      cursor
    })

    // Reset the byte offset, but effectively skip the token
    cursor.byteOffset = originalByteOffset
    return
  }

  if (cursor.byteOffset >= len) {
    raiseError('invalid scope, never found ending }', {
      cursor
    })

    // Reset the byte offset, but effectively skip the token
    cursor.byteOffset = originalByteOffset
    return
  }

  return result
}

function TokenizeSource(source, framegraph, activePass, raiseError) {
  let identifierToken = ''
  const cursor = {
    byteOffset: 0
  }

  let strippedSource = ''
  for (; cursor.byteOffset < source.length; cursor.byteOffset++) {
    const char = source[cursor.byteOffset]
    const code = char.codePointAt(0)
    if (
      // A-Z
      (code >= 64 && code <= 90) ||
      // a-z
      (code >= 97 && code <= 122) ||
      // 0-9, but not first character
      (code >= 48 && code <= 57 && identifierToken != '') ||
      char === '_'
    ) {
      identifierToken += char
    } else {
      switch (identifierToken) {
        case PassDefinition: {
          const params = ReadParams(source, cursor, raiseError)
          // TODO: recurse instead of split
          const parts = params.split(',').map(p => p.trim())
          const name = parts[0]

          const body = ReadScopeBody(source, cursor, raiseError)
          framegraph[name] = {
            inputs: {},
            outputs: {},
            body: ''
          }
          framegraph[name].body = TokenizeSource(body, framegraph, name, raiseError)
          strippedSource += '// @stripped-pass: ' + name
          break
        }

        case PassStore: {
          if (!activePass) {
            return raiseError(`${PassStore} not allowed outside of a render pass. Utility functions should return color and let the pass handle attachment storage.`, {
              cursor
            })
          }

          const params = ReadParams(source, cursor)
          // TODO: recurse instead of split
          const parts = params.split(',').map(p => p.trim())
          const type = parts.shift().trim()
          const name = parts.shift().trim()
          const rest = parts.join(',')
          strippedSource += `PassOutput_${name} = ${rest}` + source[cursor.byteOffset]
          framegraph[activePass].outputs[name] = type
          break
        }

        case PassGetSampler: {
          if (!activePass) {
            return raiseError(`${GetSampler} not allowed outside of a render pass, you should pass sampler2D as an argument instead.`, {
              cursor
            })
          }
          const params = ReadParams(source, cursor, raiseError)
          // TODO: recurse instead of split
          const parts = params.split(',').map(p => p.trim())
          const passName = parts[0]
          const outputName = parts[1]

          const samplerName = `PassInput_${passName}_${outputName}`;
          strippedSource += samplerName + source[cursor.byteOffset]

          framegraph[activePass].inputs[samplerName] = {
            pass: passName,
            output: outputName
          }

          break
        }

        default: {
          strippedSource += identifierToken
          strippedSource += char
          break
        }
      }

      identifierToken = ''
    }
  }
  return strippedSource
}

function PreprocessShaderSource(source) {
  const framegraph = Object.create(null)
  const strippedSource = TokenizeSource(source, framegraph, '', (error, context) => {
    console.error(error, context)
  })
  console.log(strippedSource)
  console.log(JSON.stringify(framegraph, null, 2))
  return {
    strippedSource,
    framegraph
  }
}

function UpdateSource(gpu, programs, source) {
  const { strippedSource, framegraph } = PreprocessShaderSource(source)

  const header = `#version 300 es
precision highp float;\n`

  const gl = gpu.gl
  for (const [name, node] of Object.entries(framegraph)) {
    let passSource = header
    const dependencies = []
    const inputs = []
    for (const inputName of Object.keys(node.inputs)) {
      passSource += `uniform sampler2D ${inputName};\n`
      dependencies.push({
        passName: node.inputs[inputName].pass,
        uniformName: inputName
      })
    }
    passSource += `\n`


    for (const outputName of Object.keys(node.outputs)) {
      passSource += `out vec4 PassOutput_${outputName};\n`
    }

    passSource += `\n`

    passSource += strippedSource.replace(
      `// @stripped-pass: ${name}`,
      `void main() {${node.body}}\n`
    )

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

      programs[name].dependencies = dependencies
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
    for (const {passName} of program.dependencies) {
      if (!visited[passName]) {
        visit(passName)
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
    for (const {passName, uniformName} of program.dependencies) {
      const dep = programs[passName]
      const textureId = textureIndex++
      gl.activeTexture(gl.TEXTURE0 + textureId);
      gl.bindTexture(gl.TEXTURE_2D, dep.texture);
      gl.uniform1i(program.uniformLocations[uniformName], textureId);
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

