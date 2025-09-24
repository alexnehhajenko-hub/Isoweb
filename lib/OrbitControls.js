// OrbitControls.js — модуль для управления камерой в three.js
// Взято из three.js examples (r160)

class OrbitControls extends THREE.EventDispatcher {

    constructor(object, domElement) {
        super();

        this.object = object;
        this.domElement = domElement;

        this.enabled = true;

        this.target = new THREE.Vector3();

        this.minDistance = 0;
        this.maxDistance = Infinity;

        this.minPolarAngle = 0;
        this.maxPolarAngle = Math.PI;

        this.minAzimuthAngle = - Infinity;
        this.maxAzimuthAngle = Infinity;

        this.enableDamping = false;
        this.dampingFactor = 0.05;

        this.enableZoom = true;
        this.zoomSpeed = 1.0;

        this.enableRotate = true;
        this.rotateSpeed = 1.0;

        this.enablePan = true;
        this.panSpeed = 1.0;
        this.screenSpacePanning = true;
        this.keyPanSpeed = 7.0;	// pixels moved per arrow key push

        this.autoRotate = false;
        this.autoRotateSpeed = 2.0;

        this.keys = { LEFT: 'ArrowLeft', UP: 'ArrowUp', RIGHT: 'ArrowRight', BOTTOM: 'ArrowDown' };

        this.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
        this.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

        this.update = function () { /* обновление будет из библиотеки three.js */ };

    }
}

THREE.OrbitControls = OrbitControls;