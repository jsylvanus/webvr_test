
function array_get(a, i, c) {
  return a.subarray(i, i+c);
};

function emitError() {
  if (typeof console === 'object' && typeof console.error === 'function')
    console.error.apply(null, arguments);
};


export function makeShader(gl, type, src) {
  let shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);

  let status = gl.getShaderInfoLog(shader);
  if (status.length) {
    RenderUtilities.emitError(status);
    gl.deleteShader(shader);
    return null;
  }

  return shader;
};


export function makeProgram(gl, vertSrc, fragSrc) {
  let vs = makeShader(gl, gl.VERTEX_SHADER, vertSrc);
  let fs = makeShader(gl, gl.FRAGMENT_SHADER, fragSrc);

  if (vs === null || fs === null) {
    return null;
  }

  let program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  let status = gl.getProgramInfoLog(program);
  if (status.length) {
    RenderUtilities.emitError(status);
    gl.deleteProgram(program);
    program = null;
  }

  gl.deleteShader(vs);
  gl.deleteShader(fs);

  return program;
};


export function interweaveNormals(data, stride, offset) {
  var num_vertices, new_stride, new_array_len, num_triangles, output,
    i, t_offset, o_offset, normal, point_0, point_1, point_2, tmp0, tmp1;

  num_vertices = data.length / stride;
  new_stride = stride + 3;
  num_triangles = num_vertices / 3;
  new_array_len = num_vertices * new_stride; // add 3 values to each vertex

  point_0 = vec3.create();
  point_1 = vec3.create();
  point_2 = vec3.create();
  normal = vec3.create();
  tmp0 = vec3.create();
  tmp1 = vec3.create();

  output = new Float32Array(new_array_len);
  for (i = 0; i < num_triangles; i++) {
    // load points
    t_offset = (stride * 3) * i;
    vec3.copy(point_0, array_get(data, t_offset + offset, 3));
    vec3.copy(point_1, array_get(data, t_offset + stride + offset, 3));
    vec3.copy(point_2, array_get(data, t_offset + (stride * 2) + offset, 3));
    // calc normal
    // normalize((p2-p1) cross (p0-p1))
    vec3.subtract(tmp0, point_2, point_1);
    vec3.subtract(tmp1, point_0, point_1);
    vec3.cross(normal, tmp0, tmp1);
    vec3.normalize(normal, normal);
    // write points
    o_offset = (new_stride * 3) * i;
    output.set(array_get(data, t_offset, stride), o_offset);
    output.set(normal, o_offset + stride)
    output.set(array_get(data, t_offset + stride, stride), o_offset + new_stride);
    output.set(normal, o_offset + new_stride + stride)
    output.set(array_get(data, t_offset + (stride * 2), stride), o_offset + (new_stride * 2));
    output.set(normal, o_offset + (new_stride * 2) + stride)
  }
  return output;
};

