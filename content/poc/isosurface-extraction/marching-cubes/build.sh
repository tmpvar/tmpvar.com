#!/usr/bin/env bash

# watchexec -e .c,.h,.cpp -w . marching-cubes/build.sh

BASE=$(dirname "$0")
# clang --target=wasm32 --no-standard-libraries -Wl,--export-all -Wl,--no-entry -o $BASE/lookup-table.wasm -x c++ $BASE/lookup-table.h && \
clang -DMC_GENERATE_LOOKUP_TABLE -o $BASE/lookup-table -x c++ $BASE/lookup-table.h && $BASE/lookup-table && rm $BASE/lookup-table && \
echo "built"
