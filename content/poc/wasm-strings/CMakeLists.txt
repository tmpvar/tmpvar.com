cmake_minimum_required(VERSION 3.20)
project(wasm-strings)

add_library(wasm-strings STATIC strings.cpp)

target_compile_features(wasm-strings
  PRIVATE
    cxx_std_20
)

