#version 300 es
precision highp float;
uniform sampler2D uSurface;
uniform vec2 uA;
uniform vec2 uB;
uniform float uSigma;
uniform float uStrength;
uniform float uMaxStep;
in vec2 vUV;
out vec4 outColor;
void main() {
  vec2 q = vec2(vUV.x, 1.0 - vUV.y) * 1024.0;
  vec2 segment = uB - uA;
  float travel = length(segment);
  if (travel < 0.00001) {
    outColor = texture(uSurface, vUV);
    return;
  }
  float t = clamp(dot(q - uA, segment) / dot(segment, segment), 0.0, 1.0);
  float distance = length(q - (uA + segment * t));
  float weight = distance <= 3.0 * uSigma ? exp(-0.5 * pow(distance / uSigma, 2.0)) : 0.0;
  vec2 delta = segment / travel * min(travel * uStrength * weight, uMaxStep);
  vec2 oldCoord = clamp((q - delta) / 1024.0, vec2(0.0), vec2(1.0));
  outColor = texture(uSurface, vec2(oldCoord.x, 1.0 - oldCoord.y));
}
