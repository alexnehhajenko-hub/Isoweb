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
  domElement.addEventListener('wheel', handleWheel);
};