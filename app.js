import { makeProgram, interweaveNormals } from './util.js';
// import * from 'assets';

// set up WebGL on our canvas and compile our shaders (src in document script tags)

let canvas = document.querySelector('#main-canvas');
let gl = canvas.getContext('webgl2');

const vertShaderSrc = document.getElementById('vertex_shader').innerText;
const fragShaderSrc = document.getElementById('fragment_shader').innerText;
const shaderProgram = makeProgram(gl, vertShaderSrc, fragShaderSrc);
if (shaderProgram === null) throw new Error("Shader program could not be created.");

const locations = {
  a_position : gl.getAttribLocation(shaderProgram, 'a_position'),
  a_normal : gl.getAttribLocation(shaderProgram, 'a_normal'),

  u_projection : gl.getUniformLocation(shaderProgram, 'u_projection'),
  u_view : gl.getUniformLocation(shaderProgram, 'u_view'),
  u_model : gl.getUniformLocation(shaderProgram, 'u_model'),

  u_color : gl.getUniformLocation(shaderProgram, 'u_color'),
  u_globallight_dir : gl.getUniformLocation(shaderProgram, 'u_globallight_dir'),
  u_globallight_color : gl.getUniformLocation(shaderProgram, 'u_globallight_color'),
  u_camera_position : gl.getUniformLocation(shaderProgram, 'u_camera_position'),
  u_ambient : gl.getUniformLocation(shaderProgram, 'u_ambient'),
};

// Geometry buffer stuff

let vao = null, vbo = null;
let octahedron = new Float32Array([
  0,0,1,    1,0,0,    0,1,0,
  -1,0,0,   0,0,1,    0,1,0,
  -1,0,0,   0,-1,0,   0,0,1,
  0,0,1,    0,-1,0,   1,0,0,
  0,0,-1,   -1,0,0,   0,1,0,
  1,0,0,    0,0,-1,   0,1,0,
  1,0,0,    0,-1,0,   0,0,-1,
  0,0,-1,   0,-1,0,   -1,0,0,
]);
octahedron = interweaveNormals(octahedron, 3, 0); // adds the normal for each triangle to vertices

// scene state

let scene = {
  vr_mode : false,
  camera_position : [0.0, 0.3, 3],
  rotationDivisor : 2000.0,
  // vr data
  vrDisplay : null,
  frameData : null,
  leftEye : null,
  leftViewMatrix : mat4.create(),
  rightEye : null,
  rightViewMatrix : mat4.create(),
  // matrices
  projectionMatrix : mat4.create(),
  viewMatrix : mat4.create(),
  modelMatrix : mat4.create()
};


function drawNormalFrame(lifetime) {
  if (scene.vr_mode) return;

  requestAnimationFrame(drawNormalFrame);
  mat4.lookAt(scene.viewMatrix, scene.camera_position, [0,0,0], [0,1,0]);
  mat4.perspective(scene.projectionMatrix, Math.PI * .33, canvas.width / canvas.height, 0.01, Infinity);
  mat4.fromRotation(scene.modelMatrix, lifetime / scene.rotationDivisor, [0,1,0]);

  gl.enable(gl.CULL_FACE);
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0,0,0,1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.viewport(0, 0, canvas.width, canvas.height);

  drawScene(scene.projectionMatrix, scene.viewMatrix, scene.modelMatrix);
}



function drawVRFrame(lifetime) {
  if (!scene.vr_mode) return;

  scene.vrDisplay.requestAnimationFrame(drawVRFrame);

  gl.enable(gl.CULL_FACE);
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0,0,0,1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  scene.vrDisplay.getFrameData(scene.frameData);

  mat4.fromRotation(scene.modelMatrix, lifetime / scene.rotationDivisor, [0,1,0]);
  mat4.lookAt(scene.viewMatrix, scene.camera_position, [0,0,0], [0,1,0]);

  // left eye
  gl.viewport(0,0,canvas.width * 0.5,canvas.height);
  mat4.multiply(scene.leftViewMatrix, scene.frameData.leftViewMatrix, scene.viewMatrix);
  drawScene(scene.frameData.leftProjectionMatrix, scene.leftViewMatrix, scene.modelMatrix);

  // right eye
  gl.viewport(canvas.width * 0.5,0,canvas.width * 0.5,canvas.height);
  mat4.multiply(scene.rightViewMatrix, scene.frameData.rightViewMatrix, scene.viewMatrix);
  drawScene(scene.frameData.rightProjectionMatrix, scene.rightViewMatrix, scene.modelMatrix);

  scene.vrDisplay.submitFrame();
}



function updateDisplayMode(isPresenting) {
  if (isPresenting) {
    scene.leftEye = scene.vrDisplay.getEyeParameters('left');
    scene.rightEye = scene.vrDisplay.getEyeParameters('right');

    canvas.width = Math.max(scene.leftEye.renderWidth, scene.rightEye.renderWidth) * 2;
    canvas.height = Math.max(scene.leftEye.renderHeight, scene.rightEye.renderHeight);

    scene.vr_mode = true;
    scene.vrDisplay.requestAnimationFrame(drawVRFrame);
  } else {
    canvas.width = 800;
    canvas.height = 600;

    scene.vr_mode = false;
    requestAnimationFrame(drawNormalFrame);
  }
}

async function detectVR() {
  if (!navigator.getVRDisplays) return false; // API availability test

  // try to enumerate displays
  let displays;
  try {
    displays = await navigator.getVRDisplays();
  } catch (err) {
    console.error(err); return false;
  }

  if (! (displays.length > 0)) return false;

  // populate these now that we know VR is available
  scene.vrDisplay = displays[0];
  scene.frameData = new VRFrameData();

  // add a vr mode button and hook it up to firing off "vr mode"
  let enableButton = document.getElementById('vr-mode');
  enableButton.className = 'has-vr';
  enableButton.addEventListener('click', enableVR);

  return true;
}


function enableVR(clickEvt) {
  let presentRequestData = [{
    source: canvas,
    attributes: { foveationLevel: 3, highRefreshRate: true } // oculus specific
  }];
  scene.vrDisplay.requestPresent(presentRequestData)
    .then(() => { updateDisplayMode(true); })
    .catch(err => { console.error(err); });
}


// we call this once for the main view and twice (1x per eye) for VR
function drawScene(projMatrix, viewMatrix, modelMatrix) {
  if (vao === null) {
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, octahedron, gl.STATIC_DRAW, 0);

    gl.vertexAttribPointer(locations.a_position, 3, gl.FLOAT, false, 4 * 6, 0);
    gl.enableVertexAttribArray(locations.a_position);

    gl.vertexAttribPointer(locations.a_normal, 3, gl.FLOAT, false, 4 * 6, 12);
    gl.enableVertexAttribArray(locations.a_normal);

    gl.bindVertexArray(null);
  }

  gl.useProgram(shaderProgram);

  gl.uniformMatrix4fv(locations.u_view, false, viewMatrix);
  gl.uniformMatrix4fv(locations.u_projection, false, projMatrix);
  gl.uniformMatrix4fv(locations.u_model, false, modelMatrix);

  gl.uniform4f(locations.u_color, 0.95, 0.1, 0.12, 1);
  gl.uniform4f(locations.u_globallight_dir, -1, -1, -1, 0);
  gl.uniform4f(locations.u_globallight_color, 1, 0.5, 1, 1);
  gl.uniform3fv(locations.u_camera_position, scene.camera_position);
  gl.uniform1f(locations.u_ambient, 0.05);

  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLES, 0, octahedron.length / 6);
  gl.bindVertexArray(null);
}

updateDisplayMode(false);

if (detectVR()) {
  window.addEventListener('vrdisplaypresentchange', evt => {
    updateDisplayMode(evt.display.isPresenting);
  });
}

