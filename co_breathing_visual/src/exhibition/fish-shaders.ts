export const fishVertexShader = `
uniform sampler2D uControls;
uniform vec2 uControlSize;
uniform float uJoints;
uniform vec3 uRayCounts;
uniform float uPhase;
uniform float uSize;
varying vec2 vParam;
varying float vPatch;
varying float vFold;

vec3 control(float column, float row) {
  return texture2D(uControls, (vec2(column, row) + 0.5) / uControlSize).xyz;
}
vec3 cubic(vec3 a, vec3 b, vec3 c, vec3 d, float t) {
  return 0.5 * (2.0*b + (-a+c)*t + (2.0*a-5.0*b+4.0*c-d)*t*t + (-a+3.0*b-3.0*c+d)*t*t*t);
}
vec3 spine(float u) {
  float q = clamp(u, 0.0, 1.0) * (uJoints - 1.0), i = floor(q);
  return cubic(control(max(i-1.0,0.0),0.0), control(i,0.0),
    control(min(i+1.0,uJoints-1.0),0.0), control(min(i+2.0,uJoints-1.0),0.0), fract(q));
}
vec3 rayPair(float r, float j, float group, float blend, float count) {
  float row = 1.0 + group*9.0 + clamp(j,0.0,8.0);
  return mix(control(r,row),control(min(r+1.0,count-1.0),row),blend);
}
vec2 fin(vec2 uv, float group, float count) {
  float r = uv.x*(count-1.0), j = uv.y*8.0;
  float i = floor(j), ri = floor(r), blend = fract(r);
  return cubic(rayPair(ri,i-1.0,group,blend,count),rayPair(ri,i,group,blend,count),
    rayPair(ri,i+1.0,group,blend,count),rayPair(ri,i+2.0,group,blend,count),fract(j)).xy;
}
void main() {
  vParam = position.xy; vPatch = position.z;
  vec2 point;
  if (vPatch < 0.5) {
    vec3 p = spine(vParam.x);
    vec2 tangent = normalize(spine(min(1.0,vParam.x+0.007)).xy - spine(max(0.0,vParam.x-0.007)).xy + vec2(1e-9));
    vec2 normal = vec2(-tangent.y,tangent.x);
    float across = vParam.y*2.0-1.0;
    point = p.xy + normal * across * max(0.0,p.z);
    vFold = sqrt(max(0.0,1.0-across*across));
  } else {
    float group = vPatch-1.0;
    float count = group < 0.5 ? uRayCounts.x : group < 1.5 ? uRayCounts.y : uRayCounts.z;
    point = fin(vParam,group,count);
    vec2 tangent = normalize(point-fin(vec2(vParam.x,max(0.0,vParam.y-0.03)),group,count)+vec2(1e-9));
    float wave = sin(vParam.x*13.0-vParam.y*8.0-uPhase*1.1+group*1.7);
    float envelope = vParam.y*vParam.y * sin(vParam.x*3.14159265);
    // Bounded GPU ripples enrich the surface without leaving the CPU safety envelope.
    point += vec2(-tangent.y,tangent.x) * wave * envelope * 0.00065*uSize;
    vFold = wave*envelope;
  }
  gl_Position = projectionMatrix * modelViewMatrix * vec4(point,0.0,1.0);
}`;

export const fishFragmentShader = `
uniform vec3 uColor;
uniform float uMono;
uniform float uAlert;
uniform float uBrightness;
uniform float uMembrane;
uniform float uSkeleton;
uniform float uPhase;
uniform float uActivity;
uniform float uDetail;
uniform float uFan;
varying vec2 vParam;
varying float vPatch;
varying float vFold;
const float PI = 3.14159265;

// Analytic filaments keep subpixel strands from turning into solid white moire.
float thread(float coordinate, float pixels) {
  float derivative = max(fwidth(coordinate),0.0001);
  float distance = abs(fract(coordinate+0.5)-0.5)/derivative;
  return (1.0-smoothstep(pixels*0.3,pixels*0.3+0.85,distance)) *
    (1.0-smoothstep(0.55,1.25,derivative));
}
float edgeLine(float coordinate, float pixels) {
  float distance = abs(coordinate)/max(fwidth(coordinate),0.0001);
  return 1.0-smoothstep(pixels*0.25,pixels*0.25+0.9,distance);
}
void main() {
  float u = vParam.x, v = vParam.y;
  vec3 color;
  float opacity;
  if (vPatch < 0.5) {
    float across = abs(v*2.0-1.0);
    float contour = edgeLine(1.0-across,1.3);
    float threads = thread(v*mix(8.0,15.0,uDetail)+sin(u*PI)*cos(v*PI)*0.7,0.7);
    float ribs = thread(u*mix(15.0,30.0,uDetail)+pow(across,1.7)*1.2,0.52);
    float gill = edgeLine(u-0.19-0.055*(1.0-across*across),0.65) * smoothstep(0.12,0.6,across);
    float eye = exp(-pow((u-0.075)/0.012,2.0)-pow((across-0.60)/0.15,2.0));
    float skeleton = edgeLine(v-0.5,1.2)*uSkeleton;
    float fade = 1.0-u*0.40;
    float light = contour*0.67+threads*0.22+ribs*0.028+gill*0.28+eye*0.85+skeleton*0.7;
    opacity = light * fade * uBrightness + uMembrane*0.22*vFold;
    color = mix(uColor,vec3(0.71,0.96,1.0),clamp(0.10+vFold*0.16+eye*0.45,0.0,0.85));
  } else {
    float tail = step(2.5,vPatch);
    float count = mix(mix(18.0,33.0,uDetail),mix(23.0,43.0,uDetail),tail);
    float bend = sin(v*3.7+u*5.0-uPhase*0.2) * v*v * 0.16;
    float ribs = thread(u*count+bend,0.66);
    // Secondary branches emerge distally instead of a uniform wire-grid fan.
    float branches = thread(u*count*2.0+bend*2.0+0.22*sin(v*8.0),0.45)*smoothstep(0.42,0.85,v);
    float crossVeins = thread(v*17.0+u*2.0+sin(u*15.0)*0.18,0.42)*0.055;
    float rim = edgeLine(1.0-v,0.85)*0.27;
    float side = max(edgeLine(u,0.7),edgeLine(1.0-u,0.7))*0.18;
    float rootFade = smoothstep(0.015,0.14,v);
    float tipFade = 1.0-0.40*pow(v,3.0);
    float pleat = 0.6+0.4*cos(u*count*PI*2.0+bend);
    opacity = ((ribs*0.40+branches*0.12+crossVeins+rim+side)*uBrightness +
      uMembrane*(0.28+0.24*pleat+0.10*vFold))*rootFade*tipFade;
    vec3 tipColor = mix(vec3(0.23,0.42,0.95),vec3(0.70,0.35,0.92),uFan);
    color = mix(uColor,tipColor,smoothstep(0.22,1.0,v)*0.65);
    color = mix(color,vec3(0.57,0.93,0.98),0.12+0.12*vFold);
  }
  color = mix(color,vec3(dot(color,vec3(0.2126,0.7152,0.0722))),uMono);
  gl_FragColor = vec4(color*(1.0+0.16*uAlert+0.035*uActivity),clamp(opacity,0.0,0.85));
}`;
