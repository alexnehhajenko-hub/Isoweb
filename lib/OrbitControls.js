// OrbitControls.js из three.js r160
THREE.OrbitControls = function (object, domElement) {
  this.object = object;
  this.domElement = domElement;

  // параметры управления
  this.enabled = true;
  this.target = new THREE.Vector3();
  this.minDistance = 0;
  this.maxDistance = Infinity;
  this.minPolarAngle = 0; // radians
  this.maxPolarAngle = Math.PI; // radians
  this.enableDamping = false;
  this.dampingFactor = 0.05;

  const scope = this;
  const STATE = { NONE:-1, ROTATE:0, DOLLY:1, PAN:2 };
  let state = STATE.NONE;

  const spherical = new THREE.Spherical();
  const sphericalDelta = new THREE.Spherical();

  const panOffset = new THREE.Vector3();
  let scale = 1;

  function handleMouseDownRotate(event) {
    state = STATE.ROTATE;
  }

  function handleMouseMoveRotate(event) {
    const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
    const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;
    sphericalDelta.theta -= movementX * 0.005;
    sphericalDelta.phi   -= movementY * 0.005;
  }

  function handleWheel(event) {
    if (event.deltaY < 0) scale /= 0.95;
    else scale *= 0.95;
  }

  this.update = function () {
    const offset = new THREE.Vector3();
    offset.copy(scope.object.position).sub(scope.target);
    spherical.setFromVector3(offset);

    spherical.theta += sphericalDelta.theta;
    spherical.phi += sphericalDelta.phi;
    spherical.phi = Math.max(0.01, Math.min(Math.PI-0.01, spherical.phi));
    spherical.radius *= scale;

    offset.setFromSpherical(spherical);
    scope.object.position.copy(scope.target).add(offset);
    scope.object.lookAt(scope.target);

    if (scope.enableDamping) {
      sphericalDelta.theta *= (1 - scope.dampingFactor);
      sphericalDelta.phi *= (1 - scope.dampingFactor);
    } else {
      sphericalDelta.set(0,0,0);
    }
    scale = 1;
  };

  domElement.addEventListener('mousedown', handleMouseDownRotate);
  domElement.addEventListener('mousemove', handleMouseMoveRotate);
  domElement.addEventListener('wheel', handleWheel);function handleMouseUp() {
  state = STATE.NONE;
}

function handleMouseWheel(event) {
  event.preventDefault();
  if (event.deltaY < 0) {
    dollyIn();
  } else {
    dollyOut();
  }
}

function dollyIn() {
  scale /= Math.pow(0.95, scope.zoomSpeed);
}

function dollyOut() {
  scale *= Math.pow(0.95, scope.zoomSpeed);
}

function handleMouseMovePan(event) {
  const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
  const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

  pan(new THREE.Vector2(-movementX, movementY));
}

function pan(delta) {
  const element = scope.domElement === document ? scope.domElement.body : scope.domElement;

  if (scope.object.isPerspectiveCamera) {
    const offset = new THREE.Vector3();
    offset.copy(scope.object.position).sub(scope.target);
    let targetDistance = offset.length();

    targetDistance *= Math.tan((scope.object.fov / 2) * Math.PI / 180.0);

    panLeft(2 * delta.x * targetDistance / element.clientHeight, scope.object.matrix);
    panUp(2 * delta.y * targetDistance / element.clientHeight, scope.object.matrix);

  } else if (scope.object.isOrthographicCamera) {
    panLeft(delta.x * (scope.object.right - scope.object.left) / scope.object.zoom / element.clientWidth, scope.object.matrix);
    panUp(delta.y * (scope.object.top - scope.object.bottom) / scope.object.zoom / element.clientHeight, scope.object.matrix);
  }
}
};