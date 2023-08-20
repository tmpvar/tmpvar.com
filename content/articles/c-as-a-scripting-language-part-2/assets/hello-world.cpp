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
  printf("count: %u blah: %u\n", state->counter++, state->reloadCount);

  // Sleep for 1 second
  CartContext()->SleepMs(1000);
}

