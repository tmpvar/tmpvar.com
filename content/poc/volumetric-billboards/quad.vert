#version 300 es

uniform mat4 projection;
uniform mat4 view;
uniform vec3 eye;
uniform vec3 dims;
uniform float sliceCount;

uniform vec3 furthestPoint;
uniform vec3 closestPoint;
uniform vec3 sliceDir;
uniform vec2 perpDir;

out vec3 uvw;
flat out int quadIndex;

// billboard approach inspired by
// https://github.com/superdump/bevy-vertex-pulling/blob/main/examples/quads/quads.wgsl
// MIT/Apache license

const vec2 verts[6] = vec2[6](vec2(0.0, 0.0), // b00
                              vec2(1.0, 1.0), // b11
                              vec2(0.0, 1.0), // b10

                              vec2(0.0, 0.0), // b00
                              vec2(1.0, 0.0), // b01
                              vec2(1.0, 1.0)  // b11
);

int
MinIndex(vec3 v) {
  bvec3 mask = lessThanEqual(v.xyz, max(v.yzx, v.zxy));
  if (mask.x) {
    return 0;
  } else if (mask.y) {
    return 1;
  } else {
    return 2;
  }
}

int
MaxIndex(vec3 v) {
  bvec3 mask = greaterThanEqual(v.xyz, max(v.yzx, v.zxy));
  if (mask.x) {
    return 0;
  } else if (mask.y) {
    return 1;
  } else {
    return 2;
  }
}

// plane degined by p (p.xyz must be normalized)
float
RayPlane(in vec3 ro, in vec3 rd, in vec4 p) {
  return -(dot(ro, p.xyz) + p.w) / dot(rd, p.xyz);
}

void
main() {
  quadIndex = gl_VertexID / 6;
  int vertexIndex = gl_VertexID % 6;

  mat4 invView = view; //inverse(view);

  vec3 right = normalize(vec3(invView[0].x, invView[1].x, invView[2].x));
  vec3 up = normalize(vec3(invView[0].y, invView[1].y, invView[2].y));
  vec3 forward = -normalize(eye);

  vec3 orthogonal = vec3(dot(forward, vec3(1.0, 0.0, 0.0)),
                         dot(forward, vec3(0.0, 1.0, 0.0)),
                         dot(forward, vec3(0.0, 0.0, 1.0)));

  int parallelIndex = MaxIndex(abs(orthogonal));
  int orthogonalIndex = MinIndex(abs(orthogonal));

  vec2 vert = verts[vertexIndex] * 2.0; // * 2.0 - 1.0;

  float InvSliceCount = 1.0 / sliceCount;

  vec3 v;
  if (false) {
    vert *= perpDir;
    vec3 offset;
    if (sliceDir.x != 0.0) {
      offset = vec3(0.0, vert.x, vert.y);
    } else if (sliceDir.y != 0.0) {
      offset = vec3(vert.x, 0.0, vert.y);
    } else {
      offset = vec3(vert.x, vert.y, 0.0);
    }

    v = offset + furthestPoint + (float(quadIndex) + 0.5) * InvSliceCount * sliceDir * 2.0;
  } else {
    float slicePlaneMaxT = RayPlane(furthestPoint,
                                    sliceDir,
                                    vec4(forward, 1.0));

    vec3 closestPos = furthestPoint + sliceDir * slicePlaneMaxT;
    vert *= perpDir;
    vec3 offset;
    if (sliceDir.x != 0.0) {
      offset = vec3(0.0, vert.x, vert.y);
    } else if (sliceDir.y != 0.0) {
      offset = vec3(vert.x, 0.0, vert.y);
    } else {
      offset = vec3(vert.x, vert.y, 0.0);
    }

    vec3 planePos = mix(furthestPoint, closestPos, float(quadIndex) / sliceCount);
    float t = RayPlane(furthestPoint + offset, sliceDir, vec4(forward, -dot(forward, planePos)));
    v = furthestPoint + offset + sliceDir * t;
  }

  uvw = v + 0.5;
  uvw.z = 1.0 - uvw.z;
  // uvw = 1.0 - uvw;

  gl_Position = (projection * view) * vec4(v, 1.0);
}