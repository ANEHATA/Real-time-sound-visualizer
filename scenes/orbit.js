/* ================================================================
 * OrbitScene - Three.js 3D楕円軌道シーン
 *
 * Three.jsによる3D楕円軌道上の文字回転。
 * シード値ベースのランダム配置。
 * ================================================================ */
const OrbitScene = (() => {
    const CHAR_SPACING = 1.2;
    const RING_COUNT = 5;
    const favoriteSeeds = [263763, 422926, 977307, 907306, 994986];

    let renderer = null;
    let scene3d = null;
    let camera = null;
    let rings = [];
    let angle = 0;
    let ryFactor = 1.0;
    let orbitMid = 100;
    let beatTime = 0;
    let inited = false;
    let lastSeedIndex = -1;
    let currentSeed = 0;
    let currentFontFamily = "'Noto Sans JP', sans-serif";

    function initThree(container) {
        if (inited) return;
        inited = true;

        renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x0A0A0A, 1);
        renderer.domElement.style.cssText =
            'position:absolute;top:0;left:0;width:100%;height:100%;z-index:2;display:none;';
        container.appendChild(renderer.domElement);

        scene3d = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(
            50, container.clientWidth / container.clientHeight, 0.1, 100
        );
        camera.position.set(0, 4, 12);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();

        // リサイズ対応
        window.addEventListener('resize', () => {
            if (!renderer) return;
            const c = renderer.domElement.parentElement;
            if (!c) return;
            renderer.setSize(c.clientWidth, c.clientHeight);
            camera.aspect = c.clientWidth / c.clientHeight;
            camera.updateProjectionMatrix();
        });
    }

    function buildRingSprites(ring, N) {
        ring.charData.forEach(d => {
            d.texture.dispose();
            d.sprite.material.dispose();
            ring.group.remove(d.sprite);
        });
        ring.charData = [];

        for (let i = 0; i < N; i++) {
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            const ctx2d = canvas.getContext('2d');
            const texture = new THREE.CanvasTexture(canvas);
            const mat = new THREE.SpriteMaterial({
                map: texture, transparent: true, depthWrite: false
            });
            const sprite = new THREE.Sprite(mat);
            ring.group.add(sprite);
            ring.charData.push({ canvas, ctx2d, texture, sprite });
        }
        ring.currentN = N;
    }

    function drawChar(d, ch, fontWeight) {
        const { ctx2d, canvas, texture } = d;
        ctx2d.clearRect(0, 0, canvas.width, canvas.height);
        ctx2d.fillStyle = '#FFFFFF';
        ctx2d.font = `${Math.round(fontWeight)} 80px ${currentFontFamily}`;
        ctx2d.textAlign = 'center';
        ctx2d.textBaseline = 'middle';
        ctx2d.fillText(ch, canvas.width / 2, canvas.height / 2);
        texture.needsUpdate = true;
    }

    function pickSeed() {
        let idx;
        do {
            idx = Math.floor(Math.random() * favoriteSeeds.length);
        } while (idx === lastSeedIndex && favoriteSeeds.length > 1);
        lastSeedIndex = idx;
        return favoriteSeeds[idx];
    }

    function buildRingsFromSeed(seed) {
        rings.forEach(r => {
            r.charData.forEach(d => {
                d.texture.dispose();
                d.sprite.material.dispose();
            });
            scene3d.remove(r.group);
        });
        rings = [];

        const rng = mulberry32(seed);
        const SX = 10.49;
        const SY = 6.21;

        for (let i = 0; i < RING_COUNT; i++) {
            const offsetX = (rng() * 2 - 1) * 0.60 * (SX * 2);
            const offsetY = (rng() * 2 - 1) * 0.60 * (SY * 2);
            const rx = rng() * (16.78 - 5.25) + 5.25;
            const ryBase = rng() * (3.73 - 0.99) + 0.99;
            const tiltDeg = rng() * 120 - 60;
            const dir = i % 2 === 0 ? -1 : +1;

            const group = new THREE.Group();
            group.position.set(offsetX, offsetY, 0);
            const circumference = Math.PI * Math.sqrt(2 * (rx * rx + 4.0));
            scene3d.add(group);

            rings.push({
                offsetX, offsetY,
                rx, ryBase, rz: 2.0,
                tilt: tiltDeg * Math.PI / 180,
                dir,
                depthOffset: -45 * Math.PI / 180,
                circumference,
                charData: [], currentN: 0, group
            });
        }
        currentSeed = seed;
    }

    return {
        id: 'orbit',
        label: 'ORBIT',

        setup(canvas, ctx, text) {
            if (this.fontFamily) currentFontFamily = this.fontFamily;
            const container = canvas.parentElement;
            initThree(container);
            renderer.domElement.style.display = 'block';
            buildRingsFromSeed(pickSeed());
            const characters = [...(text || 'SOUND')];
            rings.forEach(ring => {
                const N = Math.max(characters.length,
                    Math.round(ring.circumference / CHAR_SPACING));
                buildRingSprites(ring, N);
            });
        },

        update(audioData, text, now) {
            if (!renderer || !scene3d) return;

            if (this.fontFamily) currentFontFamily = this.fontFamily;
            const { bass, mid, volume } = audioData;
            const characters = [...(text || 'SOUND')];

            // ビート逆回転判定（500ms間）
            const beatElapsed = now - beatTime;
            if (beatElapsed < 500) {
                angle -= 0.0045;
            } else {
                angle += mapRange(volume, 0, 70, 0.006, 0.04);
            }

            // 縦半径乗数: Bassに比例（1.0〜2.5）
            const targetRyFactor = mapRange(bass, 0, 200, 1.0, 2.5);
            ryFactor = lerp(ryFactor, targetRyFactor, 0.08);

            // font-weight基準値: Mid → 100〜900
            const targetMid = mapRange(mid, 0, 175, 100, 900);
            orbitMid = lerp(orbitMid, targetMid, targetMid > orbitMid ? 0.25 : 0.06);

            // スプライト数の再構築が必要か確認
            rings.forEach(ring => {
                const N = Math.max(characters.length,
                    Math.round(ring.circumference / CHAR_SPACING));
                if (N !== ring.currentN) buildRingSprites(ring, N);
            });

            rings.forEach(ring => {
                const cosTilt = Math.cos(ring.tilt);
                const sinTilt = Math.sin(ring.tilt);
                const ringAngle = ring.dir * angle;
                const currentRY = ring.ryBase * ryFactor;

                for (let i = 0; i < ring.currentN; i++) {
                    const theta = -ring.dir * (i / ring.currentN) * Math.PI * 2 + ringAngle;
                    const ch = characters[i % characters.length];

                    const baseX = ring.rx * Math.cos(theta);
                    const baseY = currentRY * Math.sin(theta);
                    const z = ring.rz * Math.sin(theta);

                    const localX = baseX * cosTilt - baseY * sinTilt;
                    const localY = baseX * sinTilt + baseY * cosTilt;

                    const depth = (Math.sin(theta + ring.depthOffset) + 1) / 2;

                    const fontWeight = Math.min(900, Math.max(100,
                        Math.round(mapRange(depth, 0, 1, 100, orbitMid))
                    ));
                    const spriteScale = mapRange(depth, 0, 1, 0.54, 3.6);

                    drawChar(ring.charData[i], ch, fontWeight);
                    ring.charData[i].sprite.position.set(localX, localY, z);
                    ring.charData[i].sprite.scale.setScalar(spriteScale);
                }
            });

            renderer.render(scene3d, camera);
        },

        cleanup() {
            if (renderer) {
                renderer.domElement.style.display = 'none';
            }
        },

        onBeat(audioData, now) {
            if (now - beatTime >= 700) {
                beatTime = now;
            }
        }
    };
})();
