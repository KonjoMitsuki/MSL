#version 300 es
precision highp float;

// One fragment per angular sample. Each ray records only the first colour
// boundary distance, never a blended colour. 128 x 1 RGBA8 keeps this pass cheap.
uniform sampler2D uSurface;
uniform vec2 uCenter;
uniform float uStep;
uniform int uSteps;
in vec2 vUV;
out vec4 outColor;

vec3 pigment(vec2 p) {
  return texture(uSurface, vec2(p.x / 1024.0, 1.0 - p.y / 1024.0)).rgb;
}

vec4 pack16(float distance) {
  float value = floor(clamp(distance / 1024.0, 0.0, 1.0) * 65535.0 + 0.5);
  return vec4(floor(value / 256.0), mod(value, 256.0), 0.0, 1.0) / 255.0;
}

void main() {
  float angle = vUV.x * 6.28318530718 - 3.14159265359;
  vec2 direction = vec2(cos(angle), sin(angle));
  vec3 base = pigment(uCenter);
  float found = 1024.0;
  for (int i = 1; i <= 512; i++) {
    if (i > uSteps) break;
    float radius = float(i) * uStep;
    vec2 p = uCenter + direction * radius;
    if (p.x < 0.0 || p.y < 0.0 || p.x > 1023.999 || p.y > 1023.999) break;
    vec3 colour = pigment(p);
    // The simulation stores exact labels. Half a byte of tolerance absorbs only
    // RGBA8 quantisation, never a deliberate colour blend.
    if (abs(colour.r - base.r) + abs(colour.g - base.g) + abs(colour.b - base.b) > 0.5 / 255.0) {
      found = radius;
      break;
    }
  }
  outColor = pack16(found);
}
