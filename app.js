import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const viewport = document.querySelector('#viewport');
const status = document.querySelector('#status');
const motionButton = document.querySelector('#motion');
const stage = document.querySelector('.stage');
const stageArea = document.querySelector('.stage-area');
const timelineStatus = document.querySelector('#timeline-status');
const timelineProgress = document.querySelector('#timeline-progress');
const timelinePlayhead = document.querySelector('#timeline-playhead');
const timelineMarkers = document.querySelector('#timeline-markers');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function start() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor('#e7e7e7');
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  viewport.append(renderer.domElement);

  const scene = new THREE.Scene();
  const perspectiveCamera = new THREE.PerspectiveCamera(32, 1, .1, 100);
  perspectiveCamera.position.set(0, 0, 13);
  const orthoHalfHeight = 3.5;
  const orthographicCamera = new THREE.OrthographicCamera(-orthoHalfHeight, orthoHalfHeight, orthoHalfHeight, -orthoHalfHeight, .1, 100);
  orthographicCamera.position.set(0, 0, 13);
  let activeCamera = perspectiveCamera;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .04);
  scene.environment = environment.texture;
  room.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x797775, 3));
  const light = new THREE.DirectionalLight(0xffffff, 4);
  light.position.set(-3, 5, 6);
  scene.add(light);
  const phone = new THREE.Group();
  scene.add(phone);

  const screenW = .066718;
  const screenH = .144816;
  const screenCenterY = .074992;
  const screenMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  let screen = null;
  const finishMaterials = new Set();
  const finishes = {
    silver: { label: 'Silver', frame: '#b8b6b0', back: '#a7a59f', detail: '#d1cfc8' },
    black: { label: 'Black', frame: '#2b2c2e', back: '#1f2022', detail: '#4b4c4e' },
    blue: { label: 'Mist Blue', frame: '#94a4b9', back: '#a4b2c3', detail: '#c2cad4' },
    titanium: { label: 'Titanium', frame: '#89867f', back: '#9b978f', detail: '#b9b5ad' },
  };
  let selectedFinish = 'silver';

  function applyFinish(name) {
    const finish = finishes[name];
    if (!finish) return;
    selectedFinish = name;
    for (const material of finishMaterials) {
      const materialName = material.name || '';
      const color = materialName.includes('Backpanel') ? finish.back : materialName.includes('Apple') || materialName.includes('Screws') ? finish.detail : finish.frame;
      material.color.set(color);
      material.needsUpdate = true;
    }
    document.querySelector('#model-finish-label').textContent = `iPhone 18 Pro · ${finish.label}`;
    for (const button of document.querySelectorAll('[data-finish]')) {
      const selected = button.dataset.finish === name;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
  }

  const modelScale = 36.67;
  new GLTFLoader().load(
    '/assets/models/iphone-18-pro-silver.glb',
    (gltf) => {
      const model = gltf.scene;
      model.scale.setScalar(modelScale);
      model.position.y = -.075 * modelScale;
      model.traverse((node) => {
        if (!node.isMesh) return;
        node.castShadow = false;
        node.receiveShadow = false;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) {
          if (material?.name?.startsWith('COLOUR_Silver_') && !material.name.includes('Screen')) finishMaterials.add(material);
        }
        if (node.name === 'Front_Screen') {
          screen = node;
          screen.material = screenMaterial;
          screen.renderOrder = 1;
        }
      });
      phone.add(model);
      applyFinish(selectedFinish);
      fitTexture();
    },
    undefined,
    (error) => {
      status.textContent = '精细手机模型加载失败，请刷新页面重试。';
      console.error(error);
    },
  );

  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 256;
  shadowCanvas.height = 256;
  const shadowContext = shadowCanvas.getContext('2d');
  const gradient = shadowContext.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, 'rgba(0,0,0,.2)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  shadowContext.fillStyle = gradient;
  shadowContext.fillRect(0, 0, 256, 256);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(5.7, 1.4),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(shadowCanvas),
      transparent: true,
      depthWrite: false,
    }),
  );
  shadow.position.set(0, -3.15, -.5);
  scene.add(shadow);

  let media = null;
  let objectUrl = null;
  let texture = null;
  let loadVersion = 0;
  let mediaW = 720;
  let mediaH = 1588;

  function fitTexture() {
    if (!texture || !screen) return;
    const ratio = (mediaW / mediaH) / (screenW / screenH);
    const cover = document.querySelector('#fit').value === 'cover';
    const scaleX = cover ? 1 : Math.min(1, ratio);
    const scaleY = cover ? 1 : Math.min(1, 1 / ratio);
    screen.scale.set(scaleX, scaleY, 1);
    screen.position.set(0, screenCenterY * (1 - scaleY), 0);
    const x = cover ? Math.min(1, 1 / ratio) : 1;
    const y = cover ? Math.min(1, ratio) : 1;
    texture.repeat.set(x, y);
    texture.offset.set((1 - x) / 2, (1 - y) / 2);
  }

  function useTexture(next, w, h) {
    texture?.dispose();
    texture = next;
    mediaW = w;
    mediaH = h;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    screenMaterial.map = texture;
    screenMaterial.needsUpdate = true;
    fitTexture();
  }

  const demo = document.createElement('canvas');
  demo.width = 720;
  demo.height = 1588;
  const context = demo.getContext('2d');
  context.fillStyle = '#f7f3eb';
  context.fillRect(0, 0, 720, 1588);
  context.fillStyle = '#222820';
  context.font = '28px sans-serif';
  context.fillText('9:41', 52, 62);
  context.font = '24px sans-serif';
  context.fillText('COFFEE JOURNAL', 52, 210);
  context.font = 'bold 64px sans-serif';
  context.fillText('记录一杯日常。', 52, 308);
  context.fillStyle = '#dce6d7';
  context.beginPath();
  context.roundRect(40, 380, 640, 630, 40);
  context.fill();
  context.fillStyle = '#f9f6ee';
  context.beginPath();
  context.ellipse(360, 692, 165, 165, 0, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#f9f6ee';
  context.lineWidth = 28;
  context.beginPath();
  context.arc(522, 692, 42, -Math.PI / 2, Math.PI / 2);
  context.stroke();
  context.fillStyle = '#684635';
  context.beginPath();
  context.arc(360, 692, 135, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#e2bb8f';
  context.beginPath();
  context.ellipse(350, 677, 73, 88, -.4, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#262b23';
  context.font = 'bold 36px sans-serif';
  context.fillText('留住今天的小美好', 52, 1120);
  context.fillStyle = '#797a70';
  context.font = '28px sans-serif';
  context.fillText('示意画面 · 替换为你的设计', 52, 1180);
  context.fillStyle = '#223c30';
  context.beginPath();
  context.roundRect(52, 1330, 616, 96, 48);
  context.fill();
  context.fillStyle = '#fff';
  context.font = '30px sans-serif';
  context.fillText('＋  记录一杯', 266, 1391);
  useTexture(new THREE.CanvasTexture(demo), 720, 1588);

  async function loadFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      status.textContent = '请选择图片或浏览器支持的视频文件。';
      return;
    }
    const version = ++loadVersion;
    const url = URL.createObjectURL(file);
    const next = file.type.startsWith('video/') ? document.createElement('video') : new Image();
    if (next instanceof HTMLVideoElement) {
      next.muted = true;
      next.loop = true;
      next.playsInline = true;
      next.preload = 'auto';
    }
    status.textContent = '正在加载…';
    try {
      await new Promise((resolveLoad, rejectLoad) => {
        next.addEventListener(next instanceof HTMLVideoElement ? 'loadeddata' : 'load', resolveLoad, { once: true });
        next.addEventListener('error', rejectLoad, { once: true });
        next.src = url;
      });
      if (version !== loadVersion) {
        if (next instanceof HTMLVideoElement) {
          next.removeAttribute('src');
          next.load();
        }
        URL.revokeObjectURL(url);
        return;
      }
      media?.pause?.();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      media = next;
      objectUrl = url;
      if (next instanceof HTMLVideoElement) {
        useTexture(new THREE.VideoTexture(next), next.videoWidth, next.videoHeight);
        await next.play().catch(() => {});
      } else {
        useTexture(new THREE.Texture(next), next.naturalWidth, next.naturalHeight);
      }
      texture.needsUpdate = true;
      status.textContent = `${file.name} · ${mediaW} × ${mediaH}${next instanceof HTMLVideoElement && next.paused ? ' · 点击手机画面播放' : ''}`;
    } catch {
      URL.revokeObjectURL(url);
      if (version === loadVersion) status.textContent = '无法读取这个文件，请换一张图片或一个浏览器支持的视频。';
    }
  }

  document.querySelector('#media').addEventListener('change', (event) => loadFile(event.target.files[0]));
  const dropzone = document.querySelector('#dropzone');
  dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('is-dragging');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-dragging'));
  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('is-dragging');
    loadFile(event.dataTransfer.files[0]);
  });
  document.querySelector('#fit').addEventListener('change', fitTexture);
  document.querySelector('#background').addEventListener('input', (event) => {
    renderer.setClearColor(event.target.value);
    stage.style.background = event.target.value;
    document.querySelector('.color-control code').textContent = event.target.value.toUpperCase();
  });
  for (const button of document.querySelectorAll('[data-finish]')) {
    button.addEventListener('click', () => applyFinish(button.dataset.finish));
  }

  let canvasAspect = 4 / 3;
  function resizeStage() {
    const { width, height } = stageArea.getBoundingClientRect();
    if (!width || !height) return;
    if (width / height > canvasAspect) {
      stage.style.width = `${height * canvasAspect}px`;
      stage.style.height = `${height}px`;
    } else {
      stage.style.width = `${width}px`;
      stage.style.height = `${width / canvasAspect}px`;
    }
  }
  for (const button of document.querySelectorAll('[data-aspect]')) {
    button.addEventListener('click', () => {
      const [width, height] = button.dataset.aspect.split(':').map(Number);
      canvasAspect = width / height;
      for (const option of document.querySelectorAll('[data-aspect]')) {
        const selected = option === button;
        option.classList.toggle('is-selected', selected);
        option.setAttribute('aria-pressed', String(selected));
      }
      resizeStage();
    });
  }
  new ResizeObserver(resizeStage).observe(stageArea);

  function setWorkspaceMode(mode) {
    const motionMode = mode === 'motion';
    document.body.classList.toggle('motion-mode', motionMode);
    document.querySelector('#static-mode').classList.toggle('is-active', !motionMode);
    document.querySelector('#motion-mode').classList.toggle('is-active', motionMode);
    document.querySelector('#static-mode').toggleAttribute('aria-current', !motionMode);
    document.querySelector('#motion-mode').toggleAttribute('aria-current', motionMode);
    requestAnimationFrame(resizeStage);
  }
  document.querySelector('#static-mode').addEventListener('click', () => setWorkspaceMode('static'));
  document.querySelector('#motion-mode').addEventListener('click', () => setWorkspaceMode('motion'));

  let auto = !reducedMotion.matches;
  let yaw = -.36;
  let pitch = .08;
  let drag = null;

  function setAuto(value) {
    auto = value;
    motionButton.textContent = auto ? '自动运镜 · 开' : '自动运镜 · 关';
    motionButton.setAttribute('aria-pressed', String(auto));
  }

  setAuto(auto);
  motionButton.addEventListener('click', () => setAuto(!auto));
  reducedMotion.addEventListener('change', (event) => {
    if (event.matches) setAuto(false);
  });
  function selectView(id) {
    for (const button of document.querySelectorAll('.tool-group button')) {
      button.classList.toggle('is-selected', button.id === id);
    }
  }

  const recordButton = document.querySelector('#record-motion');
  const playButton = document.querySelector('#play-motion');
  const clearButton = document.querySelector('#clear-motion');
  const exportVideoButton = document.querySelector('#export-video');
  const durationInput = document.querySelector('#motion-duration');
  let motionSamples = [];
  let recording = false;
  let playing = false;
  let recordingStartedAt = 0;
  let playbackStartedAt = 0;
  let lastRecordedAt = -Infinity;
  let playbackComplete = null;

  function requestedDuration() {
    const value = THREE.MathUtils.clamp(Number(durationInput.value) || 6, 2, 20);
    durationInput.value = String(value);
    return value;
  }

  function setTimelineProgress(value) {
    const percentage = THREE.MathUtils.clamp(value, 0, 1) * 100;
    timelineProgress.style.width = `${percentage}%`;
    timelinePlayhead.style.left = `${percentage}%`;
  }

  function captureMotionSample(t) {
    motionSamples.push({
      t,
      yaw,
      pitch,
      camera: activeCamera === orthographicCamera ? 'orthographic' : 'perspective',
      perspectiveZ: perspectiveCamera.position.z,
      orthoZoom: orthographicCamera.zoom,
    });
  }

  function renderMotionMarkers() {
    timelineMarkers.replaceChildren();
    if (motionSamples.length < 2) return;
    const duration = motionSamples.at(-1).t || 1;
    const count = Math.min(12, motionSamples.length);
    for (let i = 0; i < count; i += 1) {
      const sample = motionSamples[Math.round((motionSamples.length - 1) * i / (count - 1))];
      const marker = document.createElement('i');
      marker.style.left = `${sample.t / duration * 100}%`;
      timelineMarkers.append(marker);
    }
  }

  function stopRecording() {
    if (!recording) return;
    recording = false;
    recordButton.classList.remove('is-recording');
    recordButton.innerHTML = '<i></i> 录制动作';
    renderMotionMarkers();
    const duration = motionSamples.at(-1)?.t || 0;
    timelineStatus.textContent = duration > 0 ? `已记录 ${duration.toFixed(1)} 秒动作` : '未记录到动作';
  }

  function stopPlayback(completed = false) {
    if (!playing) return;
    playing = false;
    playButton.textContent = '▶ 回放';
    if (completed) timelineStatus.textContent = '回放完成';
    const callback = playbackComplete;
    playbackComplete = null;
    callback?.();
  }

  function startPlayback(onComplete = null) {
    if (motionSamples.length < 2) {
      timelineStatus.textContent = '请先录制一段动作';
      return false;
    }
    if (recording) stopRecording();
    stopPlayback(false);
    setAuto(false);
    playing = true;
    playbackStartedAt = performance.now();
    playbackComplete = onComplete;
    playButton.textContent = '■ 停止';
    timelineStatus.textContent = '正在回放…';
    media?.play?.().catch(() => {});
    return true;
  }

  function applyMotionAt(time) {
    let index = 0;
    while (index < motionSamples.length - 2 && motionSamples[index + 1].t < time) index += 1;
    const from = motionSamples[index];
    const to = motionSamples[Math.min(index + 1, motionSamples.length - 1)];
    const span = Math.max(.0001, to.t - from.t);
    const mix = THREE.MathUtils.clamp((time - from.t) / span, 0, 1);
    yaw = THREE.MathUtils.lerp(from.yaw, to.yaw, mix);
    pitch = THREE.MathUtils.lerp(from.pitch, to.pitch, mix);
    perspectiveCamera.position.z = THREE.MathUtils.lerp(from.perspectiveZ, to.perspectiveZ, mix);
    orthographicCamera.zoom = THREE.MathUtils.lerp(from.orthoZoom, to.orthoZoom, mix);
    orthographicCamera.updateProjectionMatrix();
    activeCamera = mix < .5 ? (from.camera === 'orthographic' ? orthographicCamera : perspectiveCamera) : (to.camera === 'orthographic' ? orthographicCamera : perspectiveCamera);
  }

  recordButton.addEventListener('click', () => {
    if (recording) {
      captureMotionSample((performance.now() - recordingStartedAt) / 1000);
      stopRecording();
      return;
    }
    stopPlayback(false);
    setAuto(false);
    motionSamples = [];
    timelineMarkers.replaceChildren();
    setTimelineProgress(0);
    recording = true;
    recordingStartedAt = performance.now();
    lastRecordedAt = -Infinity;
    captureMotionSample(0);
    recordButton.classList.add('is-recording');
    recordButton.innerHTML = '<i></i> 停止录制';
    timelineStatus.textContent = '正在记录旋转与缩放…';
  });
  playButton.addEventListener('click', () => {
    if (playing) stopPlayback(false);
    else startPlayback();
  });
  clearButton.addEventListener('click', () => {
    if (recording) stopRecording();
    stopPlayback(false);
    motionSamples = [];
    timelineMarkers.replaceChildren();
    setTimelineProgress(0);
    timelineStatus.textContent = '拖动手机并记录你的运镜';
  });
  exportVideoButton.addEventListener('click', async () => {
    if (motionSamples.length < 2) {
      timelineStatus.textContent = '请先录制一段动作';
      return;
    }
    if (!renderer.domElement.captureStream || typeof MediaRecorder === 'undefined') {
      timelineStatus.textContent = '当前浏览器不支持视频录制，请使用 Chromium 浏览器。';
      return;
    }
    const mimeTypes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    const mimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) || '';
    const stream = renderer.domElement.captureStream(30);
    const chunks = [];
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 8_000_000 } : undefined);
    recorder.addEventListener('dataavailable', (event) => { if (event.data.size) chunks.push(event.data); });
    const stopped = new Promise((resolve) => recorder.addEventListener('stop', resolve, { once: true }));
    exportVideoButton.disabled = true;
    exportVideoButton.textContent = '正在录制…';
    timelineStatus.textContent = '正在生成 WebM 视频…';
    recorder.start(100);
    if (!startPlayback(() => setTimeout(() => recorder.stop(), 120))) {
      recorder.stop();
    }
    await stopped;
    stream.getTracks().forEach((track) => track.stop());
    const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'phone-mockup-motion.webm';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    exportVideoButton.disabled = false;
    exportVideoButton.textContent = '导出 WebM';
    timelineStatus.textContent = '视频已导出';
  });
  document.querySelector('#front').addEventListener('click', () => {
    setAuto(false);
    activeCamera = perspectiveCamera;
    yaw = 0;
    pitch = 0;
    perspectiveCamera.position.z = 13;
    selectView('front');
  });
  document.querySelector('#angle').addEventListener('click', () => {
    setAuto(false);
    activeCamera = perspectiveCamera;
    yaw = -.48;
    pitch = .13;
    perspectiveCamera.position.z = 13;
    selectView('angle');
  });
  document.querySelector('#isometric').addEventListener('click', () => {
    setAuto(false);
    activeCamera = orthographicCamera;
    yaw = -.22;
    pitch = .045;
    orthographicCamera.zoom = 1.06;
    orthographicCamera.updateProjectionMatrix();
    selectView('isometric');
  });
  renderer.domElement.addEventListener('pointerdown', (event) => {
    if (playing) stopPlayback(false);
    if (event.pointerType === 'touch') renderer.domElement.style.touchAction = 'none';
    drag = { x: event.clientX, y: event.clientY };
    setAuto(false);
    renderer.domElement.setPointerCapture(event.pointerId);
    media?.play?.().catch(() => {});
  });
  renderer.domElement.addEventListener('pointermove', (event) => {
    if (!drag) return;
    yaw += (event.clientX - drag.x) * .008;
    pitch = THREE.MathUtils.clamp(pitch + (event.clientY - drag.y) * .005, -.65, .65);
    drag = { x: event.clientX, y: event.clientY };
  });
  renderer.domElement.addEventListener('lostpointercapture', () => {
    drag = null;
    renderer.domElement.style.touchAction = 'pan-y';
  });
  renderer.domElement.addEventListener('pointerup', (event) => {
    drag = null;
    if (renderer.domElement.hasPointerCapture(event.pointerId)) {
      renderer.domElement.releasePointerCapture(event.pointerId);
    }
  });
  renderer.domElement.addEventListener('wheel', (event) => {
    event.preventDefault();
    if (activeCamera === orthographicCamera) {
      orthographicCamera.zoom = THREE.MathUtils.clamp(orthographicCamera.zoom * Math.exp(-event.deltaY * .001), .65, 1.8);
      orthographicCamera.updateProjectionMatrix();
    } else {
      perspectiveCamera.position.z = THREE.MathUtils.clamp(perspectiveCamera.position.z + event.deltaY * .007, 9, 20);
    }
  }, { passive: false });
  document.querySelector('#export').addEventListener('click', () => {
    renderer.render(scene, activeCamera);
    renderer.domElement.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'phone-mockup.png';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  });

  new ResizeObserver(() => {
    const { width, height } = viewport.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height);
    const aspect = width / height;
    perspectiveCamera.aspect = aspect;
    perspectiveCamera.updateProjectionMatrix();
    orthographicCamera.left = -orthoHalfHeight * aspect;
    orthographicCamera.right = orthoHalfHeight * aspect;
    orthographicCamera.top = orthoHalfHeight;
    orthographicCamera.bottom = -orthoHalfHeight;
    orthographicCamera.updateProjectionMatrix();
  }).observe(viewport);

  let visible = true;
  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden;
    if (!visible) media?.pause?.();
    else media?.play?.().catch(() => {});
  });
  renderer.setAnimationLoop((time) => {
    if (!visible) return;
    if (recording) {
      const duration = requestedDuration();
      const elapsed = (time - recordingStartedAt) / 1000;
      if (elapsed >= duration) {
        captureMotionSample(duration);
        setTimelineProgress(1);
        stopRecording();
      } else {
        if (elapsed - lastRecordedAt >= 1 / 30) {
          captureMotionSample(elapsed);
          lastRecordedAt = elapsed;
        }
        setTimelineProgress(elapsed / duration);
      }
    }
    if (playing) {
      const duration = motionSamples.at(-1).t;
      const elapsed = (time - playbackStartedAt) / 1000;
      if (elapsed >= duration) {
        applyMotionAt(duration);
        setTimelineProgress(1);
        stopPlayback(true);
      } else {
        applyMotionAt(elapsed);
        setTimelineProgress(elapsed / duration);
      }
    }
    const t = time / 1000;
    phone.rotation.set(
      pitch + (auto ? Math.sin(t * .65) * .045 : 0),
      yaw + (auto ? Math.sin(t * .45) * .34 : 0),
      auto ? Math.sin(t * .4) * .025 : 0,
    );
    phone.position.y = auto ? Math.sin(t * .8) * .07 : 0;
    renderer.render(scene, activeCamera);
  });
}

try {
  start();
} catch (error) {
  status.textContent = '三维预览启动失败，请使用支持 WebGL 的浏览器重试。';
  console.error(error);
}
