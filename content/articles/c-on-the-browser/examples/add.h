// Avoid c++ name mangling for exported functions. This is the
// same sort of thing you'd do for dll/so exports.
#if __cplusplus
  #define EXPORT extern "C"
#else
  #define EXPORT
#endif

EXPORT int Add(int a, int b) {
  return a + b;
}

// compile with -D Add_TEST to include this entry point
// Note: under clang you'll want to add the `-x c++` to compile as c++
#ifdef Add_TEST
  #include <stdio.h>

  int main() {
    int result = Add(4, 9);
    printf("result: %i\n", result);
    return 0;
  }
#endif