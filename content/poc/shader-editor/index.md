+++
title = "Shader Editor"
date = 2023-11-10

[extra]
unlisted = true
+++

<section>
  <section id="output-container" style="position:relative; height: 256px; margin-bottom: 2em">
    <canvas id="output"></canvas>
  </section>
  <div id="editor" style="height:512px; width: 100%" ></div>

  <script src="js/monaco-editor/min/vs/loader.js"></script>
  <script type="module" src="js/editor.js"></script>
</section>

## Keywords

#### `PassCreate(passName)`
Add a pass with the _unique_ name `passName`, this creates a scope that allows other

#### `PassGetSampler(sourcePassName, sourcePassOutput)`
__Note:__ this is only allowed inside a `PassCreate` block

Fetch the output from another pass as a `sampler2D`

#### `PassStore(format, outputName, value)`
__Note:__ this is only allowed inside a `PassCreate` block

Store a value in the specified `outputName` at the thread's current. This is effectively writing to one of the global `out` variables
- formats: `rgba8`, `r32f`, etc..

## DEVLOG

### Future
- expand `PassGetSampler` to allow configuration (filtering, clamping mode, etc...)
- implement `PassSetInvocations(int)`
- implement `PassSetMipmapBuilder()`
- implement `PassParamF32(rangeStart, rangeEnd, initialValue, scale)`
  Add a pass specific float slider with the given range and initial value
  scales: linear
- add gltf loader/viewer

- consider persisting undo/redo snapshot

### Pending
- implement `PassSetSize(vec2)`
- actually resize render target based on `PassSetSize`

### 2024-09-08
- rename `programs` to `passes`
- persist editor state on reload (e.g., cursor position and viewport)
- make parser bugs not break the entire editing experience (try/catch)
