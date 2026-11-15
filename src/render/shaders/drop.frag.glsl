#version 300 es
precision highp float;
uniform sampler2D uSurface;
uniform sampler2D uProfile;
uniform vec2 uCenter;
uniform float uRadius;
uniform vec3 uColor;
uniform float uResistance;
in vec2 vUV;
out vec4 outColor;

const float PROFILE_COUNT = 128.0;
const float PI = 3.14159265359;

float decodeDistance(vec4 encoded) {
  vec4 bytes = floor(encoded * 255.0 + 0.5);
  return (bytes.r * 256.0 + bytes.g) / 65535.0 * 1024.0;
}

float boundaryDistance(float angle) {
  float position = (angle + PI) / (2.0 * PI) * PROFILE_COUNT - 0.5;
  float lower = floor(position);
  float fraction = position - lower;
  float index0 = mod(lower, PROFILE_COUNT);
  float index1 = mod(lower + 1.0, PROFILE_COUNT);
  float a = decodeDistance(texelFetch(uProfile, ivec2(int(index0), 0), 0));
  float b = decodeDistance(texelFetch(uProfile, ivec2(int(index1), 0), 0));
  return mix(a, b, fraction);
}

void main() {
  vec2 q = vec2(vUV.x, 1.0 - vUV.y) * 1024.0;
  vec2 offset = q - uCenter;
  float d2 = dot(offset, offset);
  float rate = uRadius;

  // A foreign colour edge resists the front locally. The same reduced radius is
  // used for the fill and for the old-surface inverse map, so both sides press
  // against each other without ever mixing their pigments.
  if (uResistance > 0.0 && d2 > 0.000001) {
    float boundary = boundaryDistance(atan(offset.y, offset.x));
    float softness = max(8.0, rate * 0.35);
    float proximity = exp(-pow((rate - boundary) / softness, 2.0));
    rate *= 1.0 - uResistance * 0.45 * proximity;
  }

  float a2 = rate * rate;
  if (d2 < a2) {
    outColor = vec4(uColor, 1.0);
  } else {
    float scale = d2 > 0.0 ? sqrt(max(0.0, d2 - a2) / d2) : 1.0;
    vec2 oldCoord = (uCenter + offset * scale) / 1024.0;
    outColor = texture(uSurface, vec2(oldCoord.x, 1.0 - oldCoord.y));
  }
}
