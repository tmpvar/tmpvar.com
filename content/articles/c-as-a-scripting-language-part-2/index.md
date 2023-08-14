+++
title = "Using C/C++ as a scripting language (Part 2)"
date = 2020-03-01
+++

Continuing on the [previous article](@/articles/c-as-a-scripting-language-part-1/index.md), we consider what it would mean to persist state
across hot reloads.

<!-- more -->

## Goals

### Persist state across reloads

One of the biggest issues with the previous approach is the inability to retrieve the persistent state of the application.
Since the new code is being launched as a new program, we either need to:

1. provide a mechanism to signal the application so that it can load and store persistent state.
2. instead of launching the code as a new process, find a different way to replace the executable code.

Signaling the process with lifecycle events seems quite unixy and it gives the application freedom to decide how it wants to store state. For instance, the process could get an event (signal or otherwise) and flush all of its persistent data to an SQLite database. When `watchexec`, or something similar, launches a new process in its place, it can simply load the previous state. This would work on disk, network, ram, etc...

Unfortunately, my goals go further than what the process level can provide. Take for instance a network tool that is mid-transfer when the developer causes a hot reload. We would like the transfer to continue after the reload completes.
Or another example is a win32 `hwnd` and its associated message pump - can that be transferred to a new process? Seems unlikely.

In the process model, all OS allocations are freed when the process exits - this includes things like file descriptors or window handles. Now you might say, "Hey, can't you transfer file descriptors between processes?" and of course you can, in some cases, but now you must either do that manually for every type of resource you hold or hide it away behind an abstraction.

So without some major hoop jumping this seems like a no-go.

We will focus on option two then. If we want to avoid dropping all of these carefully created resources on the floor, we are going to need a long-running thread that holds all of the OS-allocated resources. On hot-reload, this thread can provide the persistent state. What this means in practice is some way of "swapping" out functions. This can be implemented in a bunch of really complicated ways (see: [Executable Memory Patching](#executable-memory-patching) ) or a really simple way: DLL/SO loading.

DLL/SO loading is not without its issues though, especially on Windows:

- any allocation made inside of a DLL will be freed when the DLL unloads
- constant strings (`const char *`) will likely point to stale/freed memory on DLL unload
- vtables (read: C++ virtual functions) will likely point to stale/freed memory on DLL unload
- callbacks are also likely to be relocated on DLL reload

Generally, these will manifest as a crash on reload but in some cases, this can cause instability and hard-to-debug behavior. Fortunately, most of these have one thing in common: unloading the DLL. If we can avoid that, then we can avoid a whole class of problems at the risk of running stale code (e.g., functions that live in the memory space of an old DLL). One other issue is that this will leak memory a bit but in practice, this has not been an issue.

So the last remaining issue is how do we avoid running stale code for callbacks and similar? I believe the simplest thing here is to have the DLL register its callbacks on load. In general, it is up to the DLL to decide how to manage these registrations although sometimes integration with libs/systems make this a bit more challenging.

### Allocate all memory up-front

This little trick comes from game development where using the system allocator is generally frowned upon. The idea is to preallocate a large slab of memory and perform allocations out of this memory ourselves.

There is a great introduction to this and where I first learned of this approach, in [Handmade Hero](https://handmadehero.org/) specifically [Day 4](https://guide.handmadehero.org/code/day004/#477).

Using [VirtualAlloc](https://learn.microsoft.com/en-us/windows/win32/api/memoryapi/nf-memoryapi-virtualalloc) on Windows is a great way to get a large slab of memory that will not be released when the DLL is unloaded.


## Remaining Issues and Recommendations

### Data

So let's assume we're using a large allocation and are using it as a backing for our datatypes (structs/classes/sub-allocations). With hot-reloading, we can reorder fields, change the size of structs, etc... This can be problematic as it can result in memory corruption.

Thankfully this is a development-time concern and can be fixed by simply restarting the application. There is an escape hatch however, the DLL *could* do data migrations if a developer put enough effort into it. In practice, I haven't found the need, but that could be because I haven't found (or looked too hard for) a good approach to solve it!

### Static Variables

These will reset to their default value when the DLL loads. Old DLLs will have the old static values, but they will be inaccessible from the new DLL.

I typically avoid using local static variables and only use global static variables when I'm sure their value will be reset on every DLL load sourced from persistent memory.

## Example

Having an article without code seems like a crime, but covering all of the above concepts in a single snippet would be quite challenging. So Instead I'll show an example of a platform I've been working on that wraps all of this up into nice little packages.

`hotcart/examples/hello-world.cpp`

```cpp
#include <hotcart/hotcart.h>
#include <stdio.h>

struct State {
  bool initialized;
  u32 counter;
  u32 reloadCount;

  // Adding fields here will cause the memory requirement to grow.
  // Because we don't know where the field was added, the new State
  // will be zero filled.
};

// Called when the DLL loads
CartSetup() {
  // A singleton that reserves space to cover the size of State
  State *state = CartState<State>();

  if (!state->initialized) {
    printf("initializing\n");
    state->initialized = true;
  }

  state->counter = 0;
  state->reloadCount++;
}

// Called repeatedly
CartLoop() {
  State *state = CartState<State>();
  printf("count: %u reloads: %u\n", state->counter++, state->reloadCount);

  // Sleep for 1 second
  CartContext()->SleepMs(1000);
}
```

<div class="video-embed" style="position: relative; padding-top: 56.25%;">
  <iframe
    src="https://customer-vv39d21derhw1phl.cloudflarestream.com/51522bfed7a98fd43ef9f022316a698a/iframe?preload=true&poster=https%3A%2F%2Fcustomer-vv39d21derhw1phl.cloudflarestream.com%2F51522bfed7a98fd43ef9f022316a698a%2Fthumbnails%2Fthumbnail.jpg%3Ftime%3D%26height%3D600&letterboxColor=transparent"
    style="border: none; position: absolute; top: 0; left: 0; height: 100%; width: 100%;"
    allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
    allowfullscreen="true"
  ></iframe>
</div>


You may have noticed that `reloadCount` is reset to 0 when adding `anotherField`. This is my way of avoiding the data migration issue by simply allocating a new slab of zero-filled memory. This means that you can
add/remove fields from `State` as long as you keep in mind that the previous memory may be cleared on the next `CartSetup()`. If you are not using `new`/`malloc`, this shouldn't be too big of an issue!

## References
### Executable Memory Patching
- [https://github.com/davidgraeff/userspace-runtime-patching-cpp](https://github.com/davidgraeff/userspace-runtime-patching-cpp)
- [https://github.com/ddovod/jet-live](https://github.com/ddovod/jet-live) - x64 only on Linux + MacOS < 10.14
- [https://github.com/crosire/blink](https://github.com/crosire/blink) - Windows only
- [http://codefromthe70s.org/mhook24.aspx](https://web.archive.org/web/20220525190702/http://codefromthe70s.org/mhook24.aspx) - Provides a mechanism on Windows that *could* be used to patch function call sites.
- [https://github.com/Zeex/subhook](https://github.com/Zeex/subhook) - Cross-platform trampoline/hooking library

### DLL/SO Reloading

- [https://github.com/fungos/cr](https://github.com/fungos/cr) - a simple cross-platform hot reloading library
