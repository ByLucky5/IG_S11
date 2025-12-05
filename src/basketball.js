import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { PlayerObject } from "skinview3d";
import * as TWEEN from "@tweenjs/tween.js";

// ESCENA Y CÁMARA
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

camera.position.set(0, 30, 40);
camera.lookAt(0, 0, 0);

const initialCameraPos = camera.position.clone();
const initialCameraRot = camera.rotation.clone();

let gtaCameraActive = false;
let gtaCameraMode = 0; // 0=default, 1=frontal jugador, 2=trasera jugador, 3=pelota

// -------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// LUCES
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(10, 15, 10);
scene.add(dirLight);
scene.add(new THREE.AmbientLight(0x404040));

// CONTROLES TECLADO
const keys = {};
window.addEventListener("keydown", (e) => {
  keys[e.key.toLowerCase()] = true;

  if (e.key === "1") activateDefaultCamera();
  if (e.key === "2") activateGTACameraFront();
  if (e.key === "3") activateGTACameraBack();
  if (e.key === "4") activateBallCamera();

  if (e.key.toLowerCase() === "r") rotateCharacter(1);
  if (e.key.toLowerCase() === "t") rotateCharacter(-1);
});
window.addEventListener("keyup", (e) => (keys[e.key.toLowerCase()] = false));

const speed = 0.3;

// CARGAR CANCHA
const loader = new GLTFLoader();
let courtMeshes = [];
let courtOverallBox = null;

loader.load(
  "/src/court.glb",
  (gltf) => {
    const court = gltf.scene;
    scene.add(court);

    const fullBox = new THREE.Box3();
    court.traverse((child) => {
      if (child.isMesh) {
        courtMeshes.push(child);
        fullBox.union(new THREE.Box3().setFromObject(child));
      }
    });
    courtOverallBox = fullBox;
  },
  undefined,
  (err) => console.error("Error loading court:", err)
);

// CREAR PERSONAJE
function createCharacter(params) {
  const player = new PlayerObject();
  player.position.copy(params.position || new THREE.Vector3(0, 7, 0));
  player.scale.copy(params.scale || new THREE.Vector3(0.25, 0.25, 0.25));

  const texLoader = new THREE.TextureLoader();
  texLoader.load(params.skinURL || "/src/skin1.png", (tex) => {
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.flipY = true;
    player.skin.map = tex;
    if (player.cape) player.cape.visible = false;
  });

  scene.add(player);
  return player;
}

const player = createCharacter({ skinURL: "/src/skin1.png" });

// COLISIONES
const playerBox = new THREE.Box3();

function canMove(dx, dz) {
  const next = player.position.clone().add(new THREE.Vector3(dx, 0, dz));
  playerBox.setFromCenterAndSize(next, new THREE.Vector3(2, 5, 2));

  for (const mesh of courtMeshes) {
    if (playerBox.intersectsBox(new THREE.Box3().setFromObject(mesh))) return false;
  }
  if (courtOverallBox && !courtOverallBox.containsBox(playerBox)) return false;
  return true;
}

// PELOTA
const ball = new THREE.Mesh(
  new THREE.SphereGeometry(1, 32, 32),
  new THREE.MeshStandardMaterial({ color: 0xff4500 })
);
scene.add(ball);

let ballThrown = false;
let ballStart = new THREE.Vector3();
let ballTarget = new THREE.Vector3();
let ballT = 0;
let ballDuration = 0.8;
let ballPeak = 5;

// ROTACIÓN PERSONAJE
let rotationY = 0;

function rotateCharacter(direction) {
  const from = { y: rotationY };
  rotationY += direction * (Math.PI / 4);
  const to = { y: rotationY };

  new TWEEN.Tween(from)
    .to(to, 250)
    .easing(TWEEN.Easing.Quadratic.Out)
    .onUpdate(() => (player.rotation.y = from.y))
    .start();
}

// CÁMARAS
function activateDefaultCamera() {
  gtaCameraActive = false;
  gtaCameraMode = 0;
  camera.position.copy(initialCameraPos);
  camera.rotation.copy(initialCameraRot);
}

function activateGTACameraFront() {
  gtaCameraActive = true;
  gtaCameraMode = 1;
}

function activateGTACameraBack() {
  gtaCameraActive = true;
  gtaCameraMode = 2;
}

function activateBallCamera() {
  gtaCameraActive = true;
  gtaCameraMode = 3;
}

// LANZAMIENTO PELOTA Y ANIMACIÓN BRAZOS
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener("click", (event) => {
  if (ballThrown) return;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObjects(courtMeshes, true);

  if (hit.length > 0) ballTarget.copy(hit[0].point);
  else {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    ballTarget.copy(camera.position).add(dir.multiplyScalar(15));
    ballTarget.y = 1;
  }

  ballStart.set(player.position.x, player.position.y + 2, player.position.z);
  ballT = 0;
  ballThrown = true;
  ballPeak = Math.max(ballStart.y, ballTarget.y) + 5;
  activateBallCamera(); // Cambia automáticamente a cámara de pelota al lanzar

  // ANIMACIÓN BRAZOS HACIA ARRIBA
  if (player.skin) {
    const armTween = new TWEEN.Tween({
      leftArm: player.skin.leftArm.rotation.x,
      rightArm: player.skin.rightArm.rotation.x
    })
      .to({ leftArm: -Math.PI / 2, rightArm: -Math.PI / 2 }, 200)
      .easing(TWEEN.Easing.Quadratic.Out)
      .onUpdate((coords) => {
        player.skin.leftArm.rotation.x = coords.leftArm;
        player.skin.rightArm.rotation.x = coords.rightArm;
      })
      .start();

    // Volver a la posición idle después del lanzamiento
    armTween.onComplete(() => {
      new TWEEN.Tween({
        leftArm: player.skin.leftArm.rotation.x,
        rightArm: player.skin.rightArm.rotation.x
      })
        .to({ leftArm: 0, rightArm: 0 }, 200)
        .easing(TWEEN.Easing.Quadratic.Out)
        .onUpdate((coords) => {
          player.skin.leftArm.rotation.x = coords.leftArm;
          player.skin.rightArm.rotation.x = coords.rightArm;
        })
        .start();
    });
  }
});

// LOOP PRINCIPAL
function animate() {
  requestAnimationFrame(animate);

  // MOVIMIENTO
  const moves = [
    { key: "w", dx: Math.sin(rotationY) * speed, dz: Math.cos(rotationY) * speed },
    { key: "s", dx: -Math.sin(rotationY) * speed, dz: -Math.cos(rotationY) * speed },
    { key: "a", dx: -Math.sin(rotationY - Math.PI / 2) * speed, dz: -Math.cos(rotationY - Math.PI / 2) * speed },
    { key: "d", dx: -Math.sin(rotationY + Math.PI / 2) * speed, dz: -Math.cos(rotationY + Math.PI / 2) * speed },
  ];

  let moving = false;
  for (const m of moves) {
    if (keys[m.key] && canMove(m.dx, m.dz)) {
      player.position.x += m.dx;
      player.position.z += m.dz;
      moving = true;
    }
  }

  // ANIMACIONES
  if (player.skin) {
    const t = Date.now() * 0.008;
    if (moving) {
      const step = Math.sin(t) * 0.8;
      player.skin.leftArm.rotation.x = step;
      player.skin.rightArm.rotation.x = -step;
      player.skin.leftLeg.rotation.x = -step * 0.7;
      player.skin.rightLeg.rotation.x = step * 0.7;
    } else if (!ballThrown) { // Idle solo si no está lanzando
      const idle = Math.sin(t * 0.3) * 0.15;
      player.skin.leftArm.rotation.x = idle;
      player.skin.rightArm.rotation.x = -idle;
      player.skin.leftLeg.rotation.x = 0;
      player.skin.rightLeg.rotation.x = 0;
    }
  }

  // CÁMARA
  if (gtaCameraActive) {
    let offset;
    if (gtaCameraMode === 2) offset = new THREE.Vector3(0, 6, -14); // trasera jugador
    else if (gtaCameraMode === 1) offset = new THREE.Vector3(0, 6, 14); // frontal jugador
    else if (gtaCameraMode === 3) offset = new THREE.Vector3(0, 3, -6); // seguimiento pelota

    if (gtaCameraMode === 3) {
      const camTarget = ball.position.clone().add(offset);
      camera.position.lerp(camTarget, 0.15);
      camera.lookAt(ball.position.clone());
    } else {
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);
      const camTarget = player.position.clone().add(offset);
      camera.position.lerp(camTarget, 0.08);
      camera.lookAt(player.position.clone().add(new THREE.Vector3(0, 4, 0)));
    }
  }

  // PELOTA
  if (ballThrown) {
    const dt = 1 / 60;
    ballT += dt / ballDuration;
    if (ballT >= 1) {
      ballT = 1;
      ballThrown = false;
      activateGTACameraFront(); // Vuelve automáticamente a cámara frontal jugador
    }

    ball.position.x = THREE.MathUtils.lerp(ballStart.x, ballTarget.x, ballT);
    ball.position.z = THREE.MathUtils.lerp(ballStart.z, ballTarget.z, ballT);
    ball.position.y =
      (1 - ballT) ** 2 * ballStart.y +
      2 * (1 - ballT) * ballT * ballPeak +
      ballT ** 2 * ballTarget.y;
  } else {
    const followOffset = new THREE.Vector3(1.4, -3, 1.4);
    followOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);

    ball.position.set(
      player.position.x + followOffset.x,
      player.position.y + followOffset.y + Math.abs(Math.sin(Date.now() * 0.01)) * 2,
      player.position.z + followOffset.z
    );
  }

  TWEEN.update();
  renderer.render(scene, camera);
}

animate();

// -------------------------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
