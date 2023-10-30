// using a namespace to avoid leaking typedefs and such
namespace MarchingCubes {

typedef unsigned char u8;
typedef unsigned int u32;
typedef float f32;

struct v3 {
  f32 x;
  f32 y;
  f32 z;
  v3() = default;
  constexpr v3(f32 x, f32 y, f32 z) : x(x), y(y), z(z) {
  }
};

/*
  vert numbering
    6----------7
    /|         /|
  / |        / |
  2----------3  |
  |  |       |  |
  |  4-------|--5
  | /        | /
  |/         |/
  0----------1

*/

struct CornerRotationMap {
  static constexpr u8 x[8] = {4, 5, 0, 1, 6, 7, 2, 3};
  static constexpr u8 y[8] = {1, 5, 3, 7, 0, 4, 2, 6};
  static constexpr u8 z[8] = {1, 3, 0, 2, 5, 7, 4, 6};
};

/*
  edge numbering
    o----6-----o
  11 |        10|
  / 7        / |
  o----2-----o  5
  |  |       |  |
  3  o---4---1--o
  | 8        | 9
  |/         |/
  o----0-----o
*/

struct EdgeNeighbors {
  u8 x;
  u8 y;
  u8 z;
};

struct EdgeRotationMap {
  static constexpr EdgeNeighbors rot[12] = {
    /*  0 */ {4, 9, 1},
    /*  1 */ {9, 5, 2},
    /*  2 */ {0, 10, 3},
    /*  3 */ {8, 1, 0},
    /*  4 */ {6, 8, 5},
    /*  5 */ {10, 7, 6},
    /*  6 */ {2, 11, 7},
    /*  7 */ {11, 3, 4},
    /*  8 */ {7, 0, 9},
    /*  9 */ {5, 4, 10},
    /* 10 */ {1, 6, 11},
    /* 11 */ {3, 2, 8},
  };
};

struct TriangleIndices {
  u8 a;
  u8 b;
  u8 c;

  u8
  at(u32 idx) {
    switch (idx) {
      case 0: return a;
      case 1: return b;
      case 2: return c;
      default: return 0xFF;
    }
  }
};

struct LookupTable {
  struct Triangles {
    u8 vertsCount;
    v3 verts[12];
    u8 indicesCount;
    u8 indices[12];
    bool inverted;
  };

  Triangles triangles[256];
  u8 masksToCases[256];
};

struct CubeCase;
typedef void (*CubeCaseAddCallback)(LookupTable *lookupTable,
                                    u8 bits,
                                    CubeCase *cubeCase,
                                    bool invert);
struct CubeCase {
  u8 caseIndex = 0;
  u32 cornersCount = 0;
  u8 corners[4];
  u32 edgesCount = 0;
  u8 edges[12];
  u32 trianglesCount = 0;
  TriangleIndices triangles[4];
  u32 seenCorners[256] = {0};

  // marks a bit, and returns the previous value
  constexpr bool
  markCornerSeen(u32 cornerMask) {
    u32 wordIndex = cornerMask >> 5;
    u32 bitIndex = cornerMask & 31;
    u32 mask = (1 << bitIndex);
    bool wasPreviouslySeen = (seenCorners[wordIndex] & mask) > 0;
    seenCorners[wordIndex] |= mask;
    return wasPreviouslySeen;
  }

  constexpr u8
  cornerMask() {
    u8 m = 0;
    for (u32 i = 0; i < cornersCount; i++) {
      m |= (1 << corners[i]);
    }
    return m;
  }

  void constexpr add(LookupTable *lookupTable, CubeCaseAddCallback cb = nullptr) {
    u8 m = cornerMask();
    if (!markCornerSeen(m) && cb) {
      cb(lookupTable, m, this, false);
    }

    m = ~m;
    if (!markCornerSeen(m) && cb) {
      cb(lookupTable, m, this, true);
    }

    lookupTable->masksToCases[m] = caseIndex;
  }

  constexpr void
  rotateX() {
    for (u32 i = 0; i < cornersCount; i++) {
      corners[i] = CornerRotationMap::x[corners[i]];
    }

    for (u32 i = 0; i < edgesCount; i++) {
      edges[i] = EdgeRotationMap::rot[edges[i]].x;
    }
  }

  constexpr void
  rotateY() {
    for (u32 i = 0; i < cornersCount; i++) {
      corners[i] = CornerRotationMap::y[corners[i]];
    }

    for (u32 i = 0; i < edgesCount; i++) {
      edges[i] = EdgeRotationMap::rot[edges[i]].y;
    }
  }

  constexpr void
  rotateZ() {
    for (u32 i = 0; i < cornersCount; i++) {
      corners[i] = CornerRotationMap::z[corners[i]];
    }

    for (u32 i = 0; i < edgesCount; i++) {
      edges[i] = EdgeRotationMap::rot[edges[i]].z;
    }
  }

  constexpr void
  bruteForce(LookupTable *lookupTable, CubeCaseAddCallback cb = nullptr) {
    //     face order
    //     o----------o
    //     /|   2     /|
    //   / |        / |
    //   o-------5--o  |
    //   | 3|       | 1|
    //   |  o--0----|--o
    //   | /        | /
    //   |/    4    |/
    //   o----------o

    // face 0: z+
    {
      add(lookupTable, cb);
      rotateZ();
      add(lookupTable, cb);
      rotateZ();
      add(lookupTable, cb);
      rotateZ();
      add(lookupTable, cb);
      rotateZ();
    }

    rotateY();

    // face 1: x+
    {
      add(lookupTable, cb);
      rotateX();
      add(lookupTable, cb);
      rotateX();
      add(lookupTable, cb);
      rotateX();
      add(lookupTable, cb);
      rotateX();
    }

    rotateZ();

    // fase 2: y+
    {
      add(lookupTable, cb);
      rotateY();
      add(lookupTable, cb);
      rotateY();
      add(lookupTable, cb);
      rotateY();
      add(lookupTable, cb);
      rotateY();
    }

    rotateZ();

    // face 3: x-
    {
      add(lookupTable, cb);
      rotateX();
      add(lookupTable, cb);
      rotateX();
      add(lookupTable, cb);
      rotateX();
      add(lookupTable, cb);
      rotateX();
    }

    rotateZ();

    // face 4: y-
    {
      add(lookupTable, cb);
      rotateY();
      add(lookupTable, cb);
      rotateY();
      add(lookupTable, cb);
      rotateY();
      add(lookupTable, cb);
      rotateY();
    }

    rotateX();

    // face 5: z-
    {
      add(lookupTable, cb);
      rotateZ();
      add(lookupTable, cb);
      rotateZ();
      add(lookupTable, cb);
      rotateZ();
      add(lookupTable, cb);
      rotateZ();
    }
  }
};

// clang-format off
static constexpr CubeCase cases[15] = {
  // caseIndex, corners, edges, triangles
  { 0                                                                                                                 },
  { 1, 1, {0}         ,  3,  {0, 3, 8}                             , 1, {{0, 2, 1}                                   }},
  { 2, 2, {0, 1}      ,  4,  {1, 3, 8, 9}                          , 2, {{0, 3, 1}, {1, 3, 2}                        }},
  { 3, 2, {0, 3}      ,  6,  {0, 3, 8, 1, 2, 10}                   , 2, {{0, 1, 2}, {3, 4, 5}                        }},
  { 4, 2, {0, 7}      ,  6,  {0, 3, 8, 5, 6, 10}                   , 2, {{0, 1, 2}, {3, 4, 5}                        }},
  { 5, 3, {1, 4, 5}   ,  5,  {0, 1, 5, 7, 8}                       , 3, {{0, 1, 4}, {4, 1, 3}, {3, 1, 2}             }},
  { 6, 3, {0, 1, 7}   ,  7,  {1, 3, 8, 9, 5, 6, 10}                , 3, {{0, 1, 2}, {2, 3, 0}, {4, 5, 6}             }},
  { 7, 3, {1, 2, 7}   ,  9,  {0, 1, 9, 2, 3, 11, 5, 6, 10}         , 3, {{0, 1, 2}, {3, 4, 5}, {6, 7, 8}             }},
  { 8, 4, {0, 1, 4, 5},  4,  {1, 3, 5, 7}                          , 2, {{0, 2, 1}, {1, 2, 3}                        }},
  { 9, 4, {0, 4, 5, 6},  6,  {0, 3, 5, 6, 9, 11}                   , 4, {{0, 4, 2}, {0, 2, 3}, {0, 3, 1}, {1, 3, 5}  }},
  {10, 4, {0, 2, 5, 7},  8,  {0, 2, 11, 8, 9, 10, 6, 4}            , 4, {{0, 1, 3}, {1, 2, 3}, {4, 5, 7}, {5, 6, 7}  }},
  {11, 4, {0, 4, 5, 7},  6,  {0, 3, 6, 7, 9, 10}                   , 4, {{0, 3, 1}, {0, 5, 3}, {0, 4, 5}, {3, 5, 2}  }},
  {12, 4, {1, 2, 4, 5},  8,  {0, 1, 2, 3, 5, 7, 8, 11}             , 4, {{0, 1, 6}, {6, 1, 5}, {5, 1, 4}, {2, 3, 7}  }},
  {13, 4, {0, 3, 5, 6}, 12,  {0, 3, 8, 4, 5, 9, 1, 2, 10, 6, 7, 11}, 4, {{0, 1, 2}, {3, 4, 5}, {6, 7, 8}, {9, 10, 11}}},
  {14, 4, {1, 4, 5, 6},  6,  {0, 1, 5, 6, 8, 11}                   , 4, {{0, 5, 4}, {0, 2, 5}, {0, 1, 2}, {2, 3, 5}  }}
};
// clang-format on

const v3 cornerPositions[8] = {
  v3(0.0f, 0.0f, 0.0f),
  v3(1.0f, 0.0f, 0.0f),
  v3(0.0f, 1.0f, 0.0f),
  v3(1.0f, 1.0f, 0.0f),
  v3(0.0f, 0.0f, 1.0f),
  v3(1.0f, 0.0f, 1.0f),
  v3(0.0f, 1.0f, 1.0f),
  v3(1.0f, 1.0f, 1.0f),
};

constexpr v3 edgeMidpoints[12] = {
  // front
  v3(0.5f, 0.0f, 0.0f),
  v3(1.0f, 0.5f, 0.0f),
  v3(0.5f, 1.0f, 0.0f),
  v3(0.0f, 0.5f, 0.0f),

  // back
  v3(0.5f, 0.0f, 1.0f),
  v3(1.0f, 0.5f, 1.0f),
  v3(0.5f, 1.0f, 1.0f),
  v3(0.0f, 0.5f, 1.0f),

  // middle
  v3(0.0f, 0.0f, 0.5f),
  v3(1.0f, 0.0f, 0.5f),
  v3(1.0f, 1.0f, 0.5f),
  v3(0.0f, 1.0f, 0.5f),
};

static constexpr LookupTable
ComputeLookupTable(CubeCaseAddCallback cb = nullptr) {
  LookupTable ret = {};

  for (u32 i = 0; i < 15; i++) {
    CubeCase v = cases[i];
    v.bruteForce(&ret, cb);
  }

  return ret;
}

constexpr static LookupTable lookupTable = ComputeLookupTable();

} // namespace MarchingCubes

#if defined(MC_GENERATE_LOOKUP_TABLE) || defined(BUILT_WITH_CLANGD)

  #include <stdio.h>

namespace MC = MarchingCubes;
static constexpr void
DebugCaseAddFN(MarchingCubes::LookupTable *lookupTable,
               MarchingCubes::u8 bits,
               MarchingCubes::CubeCase *cubeCase,
               bool invert) {

  printf("case: %u (0b", cubeCase->caseIndex);
  for (int i=7; i>=0; i--) {
    printf("%i", (bits & (1<<i)) != 0 ? 1 : 0);
  }
  printf(")\n");
}

int
main() {

  MC::LookupTable lookupTable = MC::ComputeLookupTable(DebugCaseAddFN);

  // for (int i=0; i<256; i++) {
  //   MarchingCubes::u8 caseIndex = MarchingCubes::lookupTable.masksToCases[i];
  //   printf("mask: %i = case: %u\n", i, caseIndex);
  // }
  return 0;
}

#endif