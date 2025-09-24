// OrbitControls.js из three.js r160

THREE.OrbitControls = function (object, domElement) {
  this.object = object;
  this.domElement = domElement;

  // параметры управления
  this.enabled = true;
  this.target = new THREE.Vector3();
  this.minDistance = 0;
  this.maxDistance = Infinity;
  this.minPolarAngle = 0; // радианы
  this.maxPolarAngle = Math.PI; // радианы
  this.enableDamping = false;
  this.dampingFactor = 0.05;

  const scope = this;
  const STATE = { NONE: -1, ROTATE: 0, DOLLY: 1, PAN: 2 };
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
    sphericalDelta.phi -= movementY * 0.005;
  }

  function handleMouseDownDolly(event) {
    state = STATE.DOLLY;
  }

  function handleMouseMoveDolly(event) {
    const dollyScale = getZoomScale();
    if (event.deltaY < 0) {
      scale /= dollyScale;
    } else if (event.deltaY > 0) {
      scale *= dollyScale;
    }
  }

  function getZoomScale() {
    return Math.pow(0.95, 1.0);
  }

  function handleMouseDownPan(event) {
    state = STATE.PAN;
  }

  function handleMouseMovePan(event) {
    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;

    pan(new THREE.Vector3(-movementX, movementY, 0));
  }

  function pan(delta) {
    const offset = new THREE.Vector3();
    offset.copy(scope.object.position).sub(scope.target);
    let targetDistance = offset.length();

    targetDistance *= Math.tan((scope.object.fov / 2) * Math.PI / 180.0);

    panOffset.addScaledVector(delta, targetDistance / 500);
  }

  this.update = function () {
    const offset = new THREE.Vector3();

    offset.copy(this.object.position).sub(this.target);
    spherical.setFromVector3(offset);

    spherical.theta += sphericalDelta.theta;
    spherical.phi += sphericalDelta.phi;

    spherical.phi = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, spherical.phi));
    spherical.makeSafe();

    spherical.radius *= scale;
    spherical.radius = Math.max(this.minDistance, Math.min(this.maxDistance, spherical.radius));

    this.target.add(panOffset);
    offset.setFromSpherical(spherical);

    this.object.position.copy(this.target).add(offset);
    this.object.lookAt(this.target);

    if (this.enableDamping === true) {
      sphericalDelta.theta *= (1 - this.dampingFactor);
      sphericalDelta.phi *= (1 - this.dampingFactor);
    } else {
      sphericalDelta.set(0, 0, 0);
    }

    scale = 1;
    panOffset.set(0, 0, 0);
  };   this.dispose = function () {
    this.domElement.removeEventListener('mousedown', onMouseDown, false);
    this.domElement.removeEventListener('wheel', onMouseWheel, false);
    this.domElement.removeEventListener('mousemove', onMouseMove, false);
    this.domElement.removeEventListener('mouseup', onMouseUp, false);
  };

  function onMouseDown(event) {
    if (scope.enabled === false) return;

    event.preventDefault();

    switch (event.button) {
      case 0: // левая кнопка
        handleMouseDownRotate(event);
        break;
      case 1: // средняя кнопка
        handleMouseDownDolly(event);
        break;
      case 2: // правая кнопка
        handleMouseDownPan(event);
        break;
    }

    scope.domElement.addEventListener('mousemove', onMouseMove, false);
    scope.domElement.addEventListener('mouseup', onMouseUp, false);
  }

  function onMouseMove(event) {
    if (scope.enabled === false) return;

    event.preventDefault();

    switch (state) {
      case STATE.ROTATE:
        handleMouseMoveRotate(event);
        break;
      case STATE.DOLLY:
        handleMouseMoveDolly(event);
        break;
      case STATE.PAN:
        handleMouseMovePan(event);
        break;
    }
  }

  function onMouseUp(event) {
    scope.domElement.removeEventListener('mousemove', onMouseMove, false);
    scope.domElement.removeEventListener('mouseup', onMouseUp, false);

    state = STATE.NONE;
  }

  function onMouseWheel(event) {
    if (scope.enabled === false || scope.noZoom === true) return;

    event.preventDefault();
    event.stopPropagation();

    handleMouseMoveDolly(event);
  }

  this.domElement.addEventListener('contextmenu', function (event) { event.preventDefault(); }, false);
  this.domElement.addEventListener('mousedown', onMouseDown, false);
  this.domElement.addEventListener('wheel', onMouseWheel, { passive: false });
};