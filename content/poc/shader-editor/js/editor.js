InitEditor(document.querySelector('#editor'))

async function InitEditor(editorEl) {
  require.config({ paths: { vs: 'js/monaco-editor/min/vs' } });
  const monaco = await new Promise((resolve) => {
    require(['vs/editor/editor.main'], resolve)
  })

  monaco.editor.setTheme('vs-dark')

  const editor = monaco.editor.create(editorEl, {
    value: window.localStorage.getItem('shader-editor') || ' ',
    language: 'c',
    minimap: {
      enabled: false
    },
  })

  editor.getModel().onDidChangeContent((event) => {
    const latestContent = editor.getModel().createSnapshot().read() || ''
    window.localStorage.setItem('shader-editor', latestContent)
  })

  editor.focus()
}

