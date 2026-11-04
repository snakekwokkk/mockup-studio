import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

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
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
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
  const defaultEnvironment = pmrem.fromScene(room, .04);
  let currentEnvironment = defaultEnvironment;
  scene.environment = currentEnvironment.texture;
  room.dispose();
  const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x797775, 3);
  scene.add(hemisphereLight);
  const light = new THREE.DirectionalLight(0xffffff, 4);
  light.position.set(-3, 5, 6);
  scene.add(light);
  const fillLightInput = document.querySelector('#fill-light');
  const fillLightValue = document.querySelector('#fill-light-value');
  const environmentRotationInput = document.querySelector('#environment-rotation');
  const environmentRotationValue = document.querySelector('#environment-rotation-value');

  function setFillLight(percent) {
    const value = THREE.MathUtils.clamp(Number(percent) || 0, 0, 200);
    const strength = value / 100;
    hemisphereLight.intensity = 3 * strength;
    light.intensity = 4 * strength;
    fillLightInput.value = String(value);
    fillLightValue.textContent = `${Math.round(value)}%`;
  }

  function setEnvironmentRotation(degrees) {
    const value = THREE.MathUtils.clamp(Number(degrees) || 0, -180, 180);
    scene.environmentRotation.set(0, THREE.MathUtils.degToRad(value), 0);
    environmentRotationInput.value = String(value);
    environmentRotationValue.textContent = `${Math.round(value)}°`;
  }

  fillLightInput.addEventListener('input', () => setFillLight(fillLightInput.value));
  environmentRotationInput.addEventListener('input', () => setEnvironmentRotation(environmentRotationInput.value));

  function useEnvironmentTexture(texture) {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    const nextEnvironment = pmrem.fromEquirectangular(texture);
    if (currentEnvironment !== defaultEnvironment) currentEnvironment.dispose();
    currentEnvironment = nextEnvironment;
    scene.environment = currentEnvironment.texture;
    setFillLight(35);
    setEnvironmentRotation(0);
    environmentRotationInput.disabled = false;
    texture.dispose();
  }

  async function loadEnvironmentFile(file) {
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase();
    const isHdr = extension === 'hdr';
    const isExr = extension === 'exr';
    const isImage = file.type.startsWith('image/');
    if (!isHdr && !isExr && !isImage) {
      status.textContent = '请选择 HDR、EXR 或 2:1 全景图片。';
      return;
    }
    const url = URL.createObjectURL(file);
    status.textContent = '正在生成环境光…';
    try {
      const loader = isHdr ? new RGBELoader() : isExr ? new EXRLoader() : new THREE.TextureLoader();
      const environmentTexture = await loader.loadAsync(url);
      if (!isHdr && !isExr) environmentTexture.colorSpace = THREE.SRGBColorSpace;
      useEnvironmentTexture(environmentTexture);
      status.textContent = `${file.name} · 已设为环境光`;
    } catch (error) {
      status.textContent = '无法读取这张环境光图片，请尝试 2:1 全景 JPG、PNG、HDR 或 EXR。';
      console.error(error);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  document.querySelector('#environment-file').addEventListener('change', (event) => loadEnvironmentFile(event.target.files[0]));
  document.querySelector('#reset-environment').addEventListener('click', () => {
    if (currentEnvironment !== defaultEnvironment) currentEnvironment.dispose();
    currentEnvironment = defaultEnvironment;
    scene.environment = currentEnvironment.texture;
    setFillLight(100);
    setEnvironmentRotation(0);
    environmentRotationInput.disabled = true;
    document.querySelector('#environment-file').value = '';
    status.textContent = '已恢复默认摄影棚环境光。';
  });
  const phoneRig = new THREE.Group();
  scene.add(phoneRig);

  const screenW = .066718;
  const screenH = .144816;
  const screenCenterY = .074992;
  const phones = [];
  let selectedPhoneId = null;
  let nextPhoneId = 1;
  let modelTemplate = null;
  const finishes = {
    silver: { label: 'Silver', frame: '#b8b6b0', back: '#a7a59f', detail: '#d1cfc8' },
    black: { label: 'Black', frame: '#2b2c2e', back: '#1f2022', detail: '#4b4c4e' },
    blue: { label: 'Mist Blue', frame: '#94a4b9', back: '#a4b2c3', detail: '#c2cad4' },
    burgundy: { label: 'Burgundy', frame: '#5a2029', back: '#682832', detail: '#8b4b54' },
  };
  let selectedFinish = 'silver';

  function applyFinish(name) {
    const finish = finishes[name];
    if (!finish) return;
    selectedFinish = name;
    for (const phone of phones) {
      for (const material of phone.finishMaterials) {
        const materialName = material.name || '';
        const color = materialName.includes('Backpanel') ? finish.back : materialName.includes('Apple') || materialName.includes('Screws') ? finish.detail : finish.frame;
        material.color.set(color);
        material.needsUpdate = true;
      }
    }
    for (const button of document.querySelectorAll('[data-finish]')) {
      const selected = button.dataset.finish === name;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
  }

  function selectedPhone() {
    return phones.find((phone) => phone.id === selectedPhoneId) || phones[0] || null;
  }

  function fitPhoneTexture(phone) {
    if (!phone?.texture || !phone.screen) return;
    const ratio = (phone.mediaW / phone.mediaH) / (screenW / screenH);
    const cover = document.querySelector('#fit').value === 'cover';
    const scaleX = cover ? 1 : Math.min(1, ratio);
    const scaleY = cover ? 1 : Math.min(1, 1 / ratio);
    phone.screen.scale.set(scaleX, scaleY, 1);
    phone.screen.position.set(0, screenCenterY * (1 - scaleY), 0);
    const x = cover ? Math.min(1, 1 / ratio) : 1;
    const y = cover ? Math.min(1, ratio) : 1;
    phone.texture.repeat.set(x, y);
    phone.texture.offset.set((1 - x) / 2, (1 - y) / 2);
  }

  function fitAllTextures() {
    phones.forEach(fitPhoneTexture);
  }

  function usePhoneTexture(phone, next, width, height, media = null, objectUrl = null, sourceName = '默认画面') {
    phone.media?.pause?.();
    if (phone.objectUrl) URL.revokeObjectURL(phone.objectUrl);
    phone.texture?.dispose();
    phone.texture = next;
    phone.media = media;
    phone.objectUrl = objectUrl;
    phone.mediaW = width;
    phone.mediaH = height;
    phone.sourceName = sourceName;
    next.colorSpace = THREE.SRGBColorSpace;
    next.flipY = false;
    next.wrapS = next.wrapT = THREE.ClampToEdgeWrapping;
    phone.screenMaterial.map = next;
    phone.screenMaterial.needsUpdate = true;
    fitPhoneTexture(phone);
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
  function createScreenSnapshot(sourcePhone = null) {
    const canvas = document.createElement('canvas');
    canvas.width = sourcePhone?.mediaW || demo.width;
    canvas.height = sourcePhone?.mediaH || demo.height;
    const snapshotContext = canvas.getContext('2d');
    const source = sourcePhone?.texture?.image || demo;
    try {
      snapshotContext.drawImage(source, 0, 0, canvas.width, canvas.height);
    } catch {
      snapshotContext.drawImage(demo, 0, 0, canvas.width, canvas.height);
    }
    return { texture: new THREE.CanvasTexture(canvas), width: canvas.width, height: canvas.height };
  }

  const modelScale = 36.67;

  function createPhoneModel() {
    const holder = new THREE.Group();
    const model = modelTemplate.clone(true);
    const screenMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const finishMaterials = new Set();
    let screen = null;
    model.scale.setScalar(modelScale);
    model.position.y = -.075 * modelScale;
    model.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = false;
      node.receiveShadow = false;
      const sourceMaterials = Array.isArray(node.material) ? node.material : [node.material];
      const materials = sourceMaterials.map((material) => material.clone());
      node.material = Array.isArray(node.material) ? materials : materials[0];
      for (const material of materials) {
        if (material?.name?.startsWith('COLOUR_Silver_') && !material.name.includes('Screen')) finishMaterials.add(material);
      }
      if (node.name === 'Front_Screen') {
        screen = node;
        screen.material = screenMaterial;
        screen.renderOrder = 1;
      }
    });
    holder.add(model);
    return { holder, model, screen, screenMaterial, finishMaterials };
  }

  function layoutPhones() {
    const count = phones.length;
    if (!count) return;
    const columns = count <= 2 ? count : count <= 9 ? 3 : 4;
    const rows = Math.ceil(count / columns);
    const layoutScale = count === 1 ? 1 : count === 2 ? .68 : count === 3 ? .55 : count === 4 ? .48 : count <= 6 ? .42 : count <= 9 ? .34 : .3;
    phones.forEach((phone, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const rowCount = Math.min(columns, count - row * columns);
      phone.holder.position.set((column - (rowCount - 1) / 2) * 3.65, ((rows - 1) / 2 - row) * 6.15, 0);
    });
    phoneRig.scale.setScalar(layoutScale);
  }

  function syncPhoneVisibility() {
    const motionMode = document.body.classList.contains('motion-mode');
    if (motionMode) {
      for (const phone of phones) {
        phone.holder.visible = phone.id === selectedPhoneId;
        if (phone.id === selectedPhoneId) phone.holder.position.set(0, 0, 0);
      }
      phoneRig.scale.setScalar(1);
    } else {
      for (const phone of phones) phone.holder.visible = true;
      layoutPhones();
    }
  }

  function renderPhoneList() {
    const list = document.querySelector('#phone-list');
    list.replaceChildren();
    phones.forEach((phone, index) => {
      const item = document.createElement('div');
      item.className = `phone-item${phone.id === selectedPhoneId ? ' is-selected' : ''}`;
      const select = document.createElement('button');
      select.type = 'button';
      select.className = 'phone-item-select';
      select.textContent = `手机 ${index + 1}`;
      select.addEventListener('click', () => {
        selectedPhoneId = phone.id;
        renderPhoneList();
        syncPhoneVisibility();
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'phone-item-remove';
      remove.textContent = '×';
      remove.disabled = phones.length === 1;
      remove.setAttribute('aria-label', `删除手机 ${index + 1}`);
      remove.addEventListener('click', () => removePhone(phone.id));
      item.append(select, remove);
      list.append(item);
    });
    const selectedIndex = Math.max(0, phones.findIndex((phone) => phone.id === selectedPhoneId));
    document.querySelector('#upload-target-label').textContent = `为手机 ${selectedIndex + 1} 选择截图或录屏`;
    const duplicateButton = document.querySelector('#duplicate-phone');
    duplicateButton.disabled = phones.length >= 10;
    document.querySelector('#phone-limit').textContent = `${phones.length} / 10 · Static 中统一移动与旋转`;
  }

  function addPhone(sourcePhone = null) {
    if (!modelTemplate || phones.length >= 10) return null;
    const parts = createPhoneModel();
    if (!parts.screen) {
      status.textContent = '模型缺少可替换的屏幕区域。';
      return null;
    }
    const phone = {
      id: nextPhoneId++,
      ...parts,
      texture: null,
      media: null,
      objectUrl: null,
      mediaW: 720,
      mediaH: 1588,
      loadVersion: 0,
      sourceName: '默认画面',
    };
    const snapshot = createScreenSnapshot(sourcePhone);
    usePhoneTexture(phone, snapshot.texture, snapshot.width, snapshot.height, null, null, sourcePhone ? '复制画面' : '默认画面');
    phones.push(phone);
    phoneRig.add(phone.holder);
    selectedPhoneId = phone.id;
    layoutPhones();
    applyFinish(selectedFinish);
    renderPhoneList();
    syncPhoneVisibility();
    return phone;
  }

  function removePhone(id) {
    if (phones.length <= 1) return;
    const index = phones.findIndex((phone) => phone.id === id);
    if (index < 0) return;
    const [phone] = phones.splice(index, 1);
    phone.media?.pause?.();
    if (phone.objectUrl) URL.revokeObjectURL(phone.objectUrl);
    phone.texture?.dispose();
    phone.holder.traverse((node) => {
      if (!node.isMesh) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => material?.dispose?.());
    });
    phoneRig.remove(phone.holder);
    if (selectedPhoneId === id) selectedPhoneId = phones[Math.min(index, phones.length - 1)].id;
    layoutPhones();
    renderPhoneList();
    syncPhoneVisibility();
  }

  function playAllMedia() {
    for (const phone of phones) phone.media?.play?.().catch(() => {});
  }

  function pauseAllMedia() {
    for (const phone of phones) phone.media?.pause?.();
  }

  new GLTFLoader().load(
    '/assets/models/iphone-18-pro-silver.glb',
    (gltf) => {
      modelTemplate = gltf.scene;
      addPhone();
    },
    undefined,
    (error) => {
      status.textContent = '精细手机模型加载失败，请刷新页面重试。';
      console.error(error);
    },
  );

  async function loadFile(file, phone = selectedPhone()) {
    if (!file) return;
    if (!phone) {
      status.textContent = '手机模型仍在加载，请稍后再试。';
      return;
    }
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      status.textContent = '请选择图片或浏览器支持的视频文件。';
      return;
    }
    const version = ++phone.loadVersion;
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
      if (version !== phone.loadVersion) {
        if (next instanceof HTMLVideoElement) {
          next.removeAttribute('src');
          next.load();
        }
        URL.revokeObjectURL(url);
        return;
      }
      if (next instanceof HTMLVideoElement) {
        usePhoneTexture(phone, new THREE.VideoTexture(next), next.videoWidth, next.videoHeight, next, url, file.name);
        await next.play().catch(() => {});
      } else {
        usePhoneTexture(phone, new THREE.Texture(next), next.naturalWidth, next.naturalHeight, next, url, file.name);
      }
      phone.texture.needsUpdate = true;
      const index = phones.indexOf(phone) + 1;
      status.textContent = `手机 ${index} · ${file.name} · ${phone.mediaW} × ${phone.mediaH}${next instanceof HTMLVideoElement && next.paused ? ' · 点击手机画面播放' : ''}`;
    } catch {
      URL.revokeObjectURL(url);
      if (version === phone.loadVersion) status.textContent = '无法读取这个文件，请换一张图片或一个浏览器支持的视频。';
    }
  }

  document.querySelector('#duplicate-phone').addEventListener('click', () => {
    if (document.body.classList.contains('motion-mode')) return;
    const phone = addPhone(selectedPhone());
    if (phone) status.textContent = `已复制为手机 ${phones.length}，可为它单独上传画面。`;
  });
  document.querySelector('#media').addEventListener('change', (event) => {
    loadFile(event.target.files[0]);
    event.target.value = '';
  });
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
  document.querySelector('#fit').addEventListener('change', fitAllTextures);

  const backgroundModeInput = document.querySelector('#background-mode');
  const backgroundColorInput = document.querySelector('#background');
  const gradientStartInput = document.querySelector('#gradient-start');
  const gradientEndInput = document.querySelector('#gradient-end');
  const gradientAngleInput = document.querySelector('#gradient-angle');
  const gradientAngleValue = document.querySelector('#gradient-angle-value');
  const backgroundCanvas = document.createElement('canvas');
  const backgroundContext = backgroundCanvas.getContext('2d');
  const backgroundTexture = new THREE.CanvasTexture(backgroundCanvas);
  backgroundTexture.colorSpace = THREE.SRGBColorSpace;
  let backgroundImage = null;

  function updateBackgroundControls() {
    const mode = backgroundModeInput.value;
    document.querySelector('#background-solid').hidden = mode !== 'solid';
    document.querySelector('#background-gradient').hidden = mode !== 'gradient';
    document.querySelector('#background-image').hidden = mode !== 'image';
  }

  function drawBackground() {
    const mode = backgroundModeInput.value;
    updateBackgroundControls();
    stage.classList.toggle('is-transparent', mode === 'transparent');
    if (mode !== 'solid') stage.style.background = '';
    if (mode === 'transparent') {
      scene.background = null;
      renderer.setClearColor(0x000000, 0);
      return;
    }
    if (mode === 'solid' || (mode === 'image' && !backgroundImage)) {
      scene.background = null;
      renderer.setClearColor(backgroundColorInput.value, 1);
      stage.style.background = backgroundColorInput.value;
      return;
    }
    const bounds = viewport.getBoundingClientRect();
    const width = Math.max(2, Math.min(2048, Math.round(bounds.width || 1024)));
    const height = Math.max(2, Math.min(2048, Math.round(bounds.height || 768)));
    if (backgroundCanvas.width !== width || backgroundCanvas.height !== height) {
      backgroundCanvas.width = width;
      backgroundCanvas.height = height;
    }
    backgroundContext.clearRect(0, 0, width, height);
    if (mode === 'gradient') {
      const radians = THREE.MathUtils.degToRad(Number(gradientAngleInput.value));
      const halfLength = (Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians))) / 2;
      const centerX = width / 2;
      const centerY = height / 2;
      const offsetX = Math.cos(radians) * halfLength;
      const offsetY = Math.sin(radians) * halfLength;
      const gradient = backgroundContext.createLinearGradient(centerX - offsetX, centerY - offsetY, centerX + offsetX, centerY + offsetY);
      gradient.addColorStop(0, gradientStartInput.value);
      gradient.addColorStop(1, gradientEndInput.value);
      backgroundContext.fillStyle = gradient;
      backgroundContext.fillRect(0, 0, width, height);
    } else if (backgroundImage) {
      const scale = Math.max(width / backgroundImage.naturalWidth, height / backgroundImage.naturalHeight);
      const imageWidth = backgroundImage.naturalWidth * scale;
      const imageHeight = backgroundImage.naturalHeight * scale;
      backgroundContext.drawImage(backgroundImage, (width - imageWidth) / 2, (height - imageHeight) / 2, imageWidth, imageHeight);
    }
    backgroundTexture.needsUpdate = true;
    scene.background = backgroundTexture;
    renderer.setClearColor(0x000000, 1);
  }

  backgroundModeInput.addEventListener('change', drawBackground);
  backgroundColorInput.addEventListener('input', () => {
    document.querySelector('.color-control code').textContent = backgroundColorInput.value.toUpperCase();
    drawBackground();
  });
  gradientStartInput.addEventListener('input', drawBackground);
  gradientEndInput.addEventListener('input', drawBackground);
  gradientAngleInput.addEventListener('input', () => {
    gradientAngleValue.textContent = `${gradientAngleInput.value}°`;
    drawBackground();
  });
  document.querySelector('#background-file').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.addEventListener('load', () => {
      URL.revokeObjectURL(url);
      backgroundImage = image;
      backgroundModeInput.value = 'image';
      drawBackground();
      status.textContent = `${file.name} · 已设为背景图片`;
    }, { once: true });
    image.addEventListener('error', () => {
      URL.revokeObjectURL(url);
      status.textContent = '无法读取这张背景图片，请尝试 JPG、PNG 或 WebP。';
    }, { once: true });
    image.src = url;
  });
  drawBackground();
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
    syncPhoneVisibility();
    renderPhoneList();
    requestAnimationFrame(resizeStage);
  }
  document.querySelector('#static-mode').addEventListener('click', () => setWorkspaceMode('static'));
  document.querySelector('#motion-mode').addEventListener('click', () => setWorkspaceMode('motion'));

  let auto = !reducedMotion.matches;
  let yaw = -.36;
  let pitch = .08;
  let roll = 0;
  let panX = 0;
  let panY = 0;
  let perspectiveBaseZ = 13;
  let drag = null;

  function setPerspectiveLens(fov, distance) {
    perspectiveCamera.fov = fov;
    perspectiveCamera.position.z = distance;
    perspectiveCamera.updateProjectionMatrix();
    perspectiveBaseZ = distance;
  }

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
      roll,
      panX,
      panY,
      camera: activeCamera === orthographicCamera ? 'orthographic' : 'perspective',
      perspectiveZ: perspectiveCamera.position.z,
      perspectiveFov: perspectiveCamera.fov,
      perspectiveBaseZ,
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
    playAllMedia();
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
    roll = THREE.MathUtils.lerp(from.roll ?? 0, to.roll ?? 0, mix);
    panX = THREE.MathUtils.lerp(from.panX ?? 0, to.panX ?? 0, mix);
    panY = THREE.MathUtils.lerp(from.panY ?? 0, to.panY ?? 0, mix);
    perspectiveCamera.position.z = THREE.MathUtils.lerp(from.perspectiveZ, to.perspectiveZ, mix);
    perspectiveCamera.fov = THREE.MathUtils.lerp(from.perspectiveFov ?? 32, to.perspectiveFov ?? 32, mix);
    perspectiveBaseZ = THREE.MathUtils.lerp(from.perspectiveBaseZ ?? 13, to.perspectiveBaseZ ?? 13, mix);
    perspectiveCamera.updateProjectionMatrix();
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
    timelineStatus.textContent = '正在记录旋转、位置与缩放…';
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
    roll = 0;
    setPerspectiveLens(32, 13);
    selectView('front');
  });
  document.querySelector('#angle').addEventListener('click', () => {
    setAuto(false);
    activeCamera = perspectiveCamera;
    yaw = -.48;
    pitch = .13;
    roll = 0;
    setPerspectiveLens(32, 13);
    selectView('angle');
  });
  document.querySelector('#product').addEventListener('click', () => {
    setAuto(false);
    activeCamera = perspectiveCamera;
    yaw = -.3;
    pitch = -.12;
    roll = -.1;
    setPerspectiveLens(18, 23.5);
    selectView('product');
  });
  document.querySelector('#isometric').addEventListener('click', () => {
    setAuto(false);
    activeCamera = orthographicCamera;
    yaw = -.22;
    pitch = .045;
    roll = 0;
    orthographicCamera.zoom = 1.06;
    orthographicCamera.updateProjectionMatrix();
    selectView('isometric');
  });
  renderer.domElement.addEventListener('pointerdown', (event) => {
    if (playing) stopPlayback(false);
    if (event.pointerType === 'touch') renderer.domElement.style.touchAction = 'none';
    const mode = event.button === 2 ? 'pan' : 'rotate';
    drag = { x: event.clientX, y: event.clientY, mode };
    renderer.domElement.classList.toggle('is-panning', mode === 'pan');
    setAuto(false);
    renderer.domElement.setPointerCapture(event.pointerId);
    playAllMedia();
  });
  renderer.domElement.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;
    if (drag.mode === 'pan') {
      const scale = activeCamera === orthographicCamera ? .009 / orthographicCamera.zoom : .009 * perspectiveCamera.position.z / 13;
      panX += deltaX * scale;
      panY -= deltaY * scale;
    } else {
      yaw += deltaX * .008;
      pitch = THREE.MathUtils.clamp(pitch + deltaY * .005, -.65, .65);
    }
    drag = { x: event.clientX, y: event.clientY, mode: drag.mode };
  });
  renderer.domElement.addEventListener('lostpointercapture', () => {
    drag = null;
    renderer.domElement.classList.remove('is-panning');
    renderer.domElement.style.touchAction = 'pan-y';
  });
  renderer.domElement.addEventListener('pointerup', (event) => {
    drag = null;
    renderer.domElement.classList.remove('is-panning');
    if (renderer.domElement.hasPointerCapture(event.pointerId)) {
      renderer.domElement.releasePointerCapture(event.pointerId);
    }
  });
  renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());
  renderer.domElement.addEventListener('wheel', (event) => {
    event.preventDefault();
    if (activeCamera === orthographicCamera) {
      orthographicCamera.zoom = THREE.MathUtils.clamp(orthographicCamera.zoom * Math.exp(-event.deltaY * .0012), .45, 6);
      orthographicCamera.updateProjectionMatrix();
    } else {
      perspectiveCamera.position.z = THREE.MathUtils.clamp(perspectiveCamera.position.z * Math.exp(event.deltaY * .0012), perspectiveBaseZ / 6, perspectiveBaseZ * 2.3);
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
    drawBackground();
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
    if (!visible) pauseAllMedia();
    else playAllMedia();
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
    phoneRig.rotation.set(
      pitch + (auto ? Math.sin(t * .65) * .045 : 0),
      yaw + (auto ? Math.sin(t * .45) * .34 : 0),
      roll + (auto ? Math.sin(t * .4) * .025 : 0),
    );
    phoneRig.position.set(panX, panY + (auto ? Math.sin(t * .8) * .07 : 0), 0);
    renderer.render(scene, activeCamera);
  });
}

try {
  start();
} catch (error) {
  status.textContent = '三维预览启动失败，请使用支持 WebGL 的浏览器重试。';
  console.error(error);
}
