// Sophia's light as one fragment shader. Distances are in units of the light's radius, so the same light
// fills a room or sits in a video tile. It draws light only: the canvas is composited with `screen`, so
// where there is no light the page shows through and no edge is ever visible.

export const VERTEX_SHADER = 'attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }'

export const FRAGMENT_SHADER = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 u_center, u_dir;
uniform float u_time, u_radius, u_intensity, u_listen, u_think, u_speak, u_work, u_amp, u_swell, u_lean, u_reduced, u_flow, u_ignite;
uniform vec3 u_halo, u_core, u_cool, u_ember;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float hash3(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise3(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
float fbm3(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise3(p); p = p * 2.02 + vec3(1.3, 7.1, 3.7); a *= 0.5; }
  return v;
}
// Toward the person she attends to, the light stretches a little, like a head turning.
vec2 leaned(vec2 p, vec2 d, float amount) {
  float along = dot(p, d);
  return p - d * along * amount * smoothstep(-0.29, 2.06, along) * 0.42;
}
void main() {
  vec2 frag = gl_FragCoord.xy;
  float t = u_time * (1.0 - u_reduced);
  float dl = length(u_dir);
  vec2 d = dl > 0.001 ? u_dir / dl : vec2(1.0, 0.0);
  vec2 p = (frag - u_center) / u_radius;
  vec2 q = leaned(p, d, u_lean * min(dl, 1.0) * (u_listen + 0.45 * u_speak));
  float r = length(q);
  vec2 dir = q / max(r, 0.0001);

  // Matter flowing in log-polar space: inward while she thinks, outward with her voice.
  float haze = fbm3(vec3(dir * 1.7, log(max(r, 0.012)) * 1.3 + u_flow) + vec3(0.0, 0.0, t * 0.015));
  float iris = fbm3(vec3(dir * 2.6, t * 0.55)) - 0.5;

  float breath = 1.0 + 0.035 * sin(t * 0.85) * u_listen;
  float size = mix(1.0, 0.6, u_work) * breath * (1.0 + 0.24 * u_amp * u_speak) * (1.0 + 0.16 * u_swell) * u_ignite;
  float edge = 1.0 + iris * 0.6 * u_amp * u_speak;
  float energy = u_intensity * (1.0 - 0.7 * u_work) * (1.0 - 0.22 * u_think) * (1.0 + 0.4 * u_amp * u_speak + 0.55 * u_swell);

  float core = exp(-pow(r / (size * 0.16), 2.0));
  float bloom = exp(-pow(r / (size * 0.55 * edge), 1.35));
  float air = exp(-r / (size * 1.7 * edge)) * (0.3 + haze);

  float rr = length(p);
  float ang = atan(p.y, p.x);
  float sweepAng = mix(t * 0.5, 0.9, u_reduced);
  float da = abs(mod(ang - sweepAng + 3.14159265, 6.2831853) - 3.14159265);
  // The sweep stays inside the light: it turns within her, not across the room like a searchlight.
  float sweep = exp(-da * da * 3.2) * exp(-rr * 0.94) * smoothstep(0.12, 0.47, rr) * u_think;
  float cone = pow(max(dot(p / max(rr, 0.0001), d), 0.0), 11.0) * exp(-rr * 0.34) * smoothstep(0.18, 0.94, rr)
    * (u_listen * 0.5 + u_speak * 0.22) * min(dl, 1.0);

  // Depth by temperature: white core, violet bloom, cooler air.
  vec3 bloomCol = mix(mix(u_halo, u_cool, u_think * 0.5), u_ember, u_work * 0.65);
  vec3 airCol = mix(bloomCol, u_cool, 0.45);
  vec3 light = airCol * air * energy * 0.13 + bloomCol * bloom * energy * 0.62 + u_core * core * energy * 1.25
    + bloomCol * (sweep * 0.4 + cone * 0.6) * u_intensity;
  vec3 col = 1.0 - exp(-light * 1.3);
  col += (hash(frag + fract(u_time)) - 0.5) * (1.5 / 255.0);
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}`
