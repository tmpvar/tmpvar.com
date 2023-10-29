(async function ExampleAdd() {
  const response = await fetch('examples/add.wasm')
  const bytes = await response.arrayBuffer()
  const { instance } = await WebAssembly.instantiate(bytes)

  let el = document.getElementById('example-add-output')
  el.innerText = 'result: ' + instance.exports.Add(2, 8)
})();