/* ================================================================
 * SOUND TYPO Editor - メインアプリケーション
 *
 * 初期化、メインループ、モジュール間の接続を行う。
 * ================================================================ */
document.addEventListener('DOMContentLoaded', () => {

    /* ================================================================
     * DOM参照・キャンバス作成
     * ================================================================ */
    const container = document.getElementById('main-canvas-container');
    const startScreen = document.getElementById('start-screen');
    const sidebar = document.getElementById('sidebar');

    function createCanvas(zIndex) {
        const c = document.createElement('canvas');
        c.className = 'layer-canvas';
        c.style.zIndex = zIndex;
        container.appendChild(c);
        return c;
    }

    const bgCanvas = createCanvas(1);
    const effectCanvas = createCanvas(6);
    const screenCanvas = createCanvas(7);

    const flashOverlay = document.createElement('div');
    flashOverlay.id = 'flash-overlay';
    container.appendChild(flashOverlay);

    const bgCtx = bgCanvas.getContext('2d');
    const effectCtx = effectCanvas.getContext('2d');
    const screenCtx = screenCanvas.getContext('2d');

    /* ================================================================
     * キャンバスリサイズ
     * ================================================================ */
    function resizeCanvases() {
        const w = container.clientWidth;
        const h = container.clientHeight;
        bgCanvas.width = w;      bgCanvas.height = h;
        effectCanvas.width = w;  effectCanvas.height = h;
        screenCanvas.width = w;  screenCanvas.height = h;
    }
    resizeCanvases();
    window.addEventListener('resize', resizeCanvases);

    /* ================================================================
     * モジュール初期化
     * ================================================================ */
    const analyzer = new AudioAnalyzer();
    let isMicActive = false;

    const sceneManager = new SceneManager(bgCanvas, bgCtx);

    const effectManager = new EffectManager(screenCanvas, screenCtx, analyzer);
    effectManager.effectCanvas = effectCanvas;
    effectManager.effectCtx = effectCtx;
    effectManager.bgCanvas = bgCanvas;
    effectManager.container = container;

    effects.forEach(e => effectManager.registerEffect(e));

    const audioMapping = new AudioMapping();

    sceneManager.registerScene(CenterScene);
    sceneManager.registerScene(TileScene);
    sceneManager.registerScene(MorphScene);
    sceneManager.registerScene(OrbitScene);
    sceneManager.registerScene(SpotlightScene);
    sceneManager.registerScene(CymaticsScene);
    sceneManager.registerScene(BinaryRainScene);

    const speechInput = new SpeechInput();

    const uiManager = new UIManager(sidebar);
    uiManager.buildSidebar(sceneManager, effectManager, analyzer, audioMapping);

    /* ================================================================
     * MIDI初期化
     * ================================================================ */
    const midiManager = new MIDIManager();

    const padEffectMap = {
        1: 'halftone', 2: 'glitch', 3: 'blur', 4: 'dissolve',
        5: 'distortion', 6: 'scanline', 7: 'grid', 8: 'invert'
    };

    const knobEffectMap = {
        1: 'halftone', 2: 'glitch', 3: 'blur', 4: 'dissolve',
        5: 'distortion', 6: 'scanline', 7: 'grid', 8: 'invert'
    };

    // パッド→エフェクトトグル
    midiManager.onPad((padNumber, velocity) => {
        if (velocity === 0) return;
        const effectId = padEffectMap[padNumber];
        if (!effectId) return;
        const key = effectManager.toggleEffect(effectId);
        if (key) uiManager.updateEffectButton(key, effectManager.isActive(key));
    });

    // ノブ→エフェクト強度
    midiManager.onKnob((knobNumber, value) => {
        const effectId = knobEffectMap[knobNumber];
        if (!effectId) return;
        const intensity = value / 127;
        effectManager.setIntensity(effectId, intensity);
        uiManager.updateEffectIntensity(effectId, intensity);
    });

    // デバイス変更通知
    midiManager.onDeviceChange = (devices) => {
        uiManager.updateMidiDevices(devices, midiManager.selectedDeviceId);
    };

    // MIDIメッセージ通知
    midiManager.onMessage = (msg) => {
        uiManager.updateMidiMonitor(msg);
    };

    // UIからのデバイス選択
    uiManager.onMidiDeviceChange = (deviceId) => {
        midiManager.selectDevice(deviceId);
        uiManager.updateMidiStatus(!!deviceId);
    };

    // MIDI開始
    midiManager.start().then(() => {
        const devices = midiManager.getDevices();
        uiManager.updateMidiDevices(devices, midiManager.selectedDeviceId);
    });

    /* ================================================================
     * UIコールバック接続
     * ================================================================ */
    uiManager.onTextChange = (text) => {
        sceneManager.setDisplayText(text);
    };

    // MICトグル: StreamとAudioContextは保持したまま、sourceの接続/切断だけ行う
    uiManager.onMicToggle = async () => {
        if (isMicActive) {
            analyzer.stop();
            isMicActive = false;
            uiManager.setMicState(false);
        } else {
            try {
                await analyzer.start();
                isMicActive = true;
                uiManager.setMicState(true);
            } catch (err) {
                console.error('マイクアクセス失敗:', err);
            }
        }
    };

    uiManager.onSpeechToggle = () => {
        if (speechInput.isActive()) {
            speechInput.stop();
            uiManager.setSpeechState(false);
        } else {
            const ok = speechInput.start();
            uiManager.setSpeechState(ok);
        }
    };

    uiManager.onSpeechLanguageChange = (lang) => {
        speechInput.setLanguage(lang);
    };

    uiManager.onFontChange = (family) => {
        sceneManager.setFontFamily(family);
        container.style.setProperty('--scene-font', family);
    };

    speechInput.onTextUpdate((text, isFinal) => {
        sceneManager.setDisplayText(text || 'SOUND');
        uiManager.setTextInputValue(text || 'SOUND');
    });

    uiManager.onSidebarToggle = () => resizeCanvases();

    /* ================================================================
     * CLICK TO START（getUserMediaは1回だけ呼ぶ）
     * ================================================================ */
    async function handleStart(e) {
        if (e) e.stopPropagation();
        const startBtn = startScreen.querySelector('.start-btn');
        const startError = startScreen.querySelector('.start-error');
        startBtn.textContent = '...';

        try {
            if (!isMicActive) {
                await analyzer.start();
                isMicActive = true;
                uiManager.setMicState(true);
            }
            startScreen.style.display = 'none';
        } catch (err) {
            console.error('handleStart失敗:', err);
            startBtn.textContent = 'CLICK TO START';
            startError.style.display = 'block';
            startError.textContent =
                'マイクにアクセスできません。ブラウザの許可設定を確認してください。';
        }
        if (startScreen.style.display !== 'none') {
            setTimeout(() => { startScreen.style.display = 'none'; }, 3000);
        }
    }

    startScreen.addEventListener('pointerdown', e => { e.preventDefault(); handleStart(e); });

    /* ================================================================
     * キーボードイベント
     * ================================================================ */
    window.addEventListener('keydown', e => {
        if (uiManager.isTextInputFocused()) return;

        const key = e.key.toUpperCase();

        if (effectManager.hasEffect(key)) {
            e.preventDefault();
            effectManager.toggleEffect(key);
            uiManager.updateEffectButton(key, effectManager.isActive(key));
            return;
        }

        if (e.key === 'ArrowRight') { e.preventDefault(); sceneManager.nextScene(); }
        if (e.key === 'ArrowLeft')  { e.preventDefault(); sceneManager.prevScene(); }

        if (e.key === 'Escape' && !uiManager.sidebarVisible) {
            uiManager.setSidebarVisible(true);
        }
    });

    /* ================================================================
     * タッチジェスチャー
     * ================================================================ */
    let touchStartX = 0, touchStartY = 0, touchStartTime = 0;

    container.addEventListener('touchstart', e => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
    }, { passive: true });

    container.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        const dt = Date.now() - touchStartTime;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 15 && dt < 250) return;

        if (dist > 50 && dt < 450) {
            if (Math.abs(dx) >= Math.abs(dy)) {
                if (dx < 0) sceneManager.nextScene();
                else sceneManager.prevScene();
            } else if (dy < -60) {
                uiManager.setSidebarVisible(false);
            } else if (dy > 60) {
                uiManager.setSidebarVisible(true);
            }
        }
    }, { passive: true });

    /* ================================================================
     * メインアニメーションループ
     * ================================================================ */
    let fpsFrameCount = 0;
    let fpsLastTime = performance.now();
    let currentFps = 0;
    let curFlashAlpha = 0;

    function animate() {
        requestAnimationFrame(animate);

        const now = performance.now();

        if (analyzer.audioContext && analyzer.audioContext.state === 'suspended') {
            analyzer.audioContext.resume();
        }

        analyzer.update();
        const rawData = analyzer.getData();

        fpsFrameCount++;
        if (now - fpsLastTime >= 1000) {
            currentFps = Math.round(fpsFrameCount * 1000 / (now - fpsLastTime));
            fpsFrameCount = 0;
            fpsLastTime = now;
        }

        const currentScene = sceneManager.getCurrentScene();
        const sceneId = currentScene ? currentScene.id : 'center';
        const data = audioMapping.applyMapping(sceneId, rawData);

        if (rawData.isBeat) {
            const flashTarget = mapRange(rawData.beatStrength, 0, 1, 0.03, 0.08);
            curFlashAlpha = Math.max(curFlashAlpha, flashTarget);
            effectManager.onBeat(rawData, now);
            sceneManager.onBeat(data, now);
        }

        curFlashAlpha = lerp(curFlashAlpha, 0, 0.55);

        // CENTERシーンのDOM表示制御とcanvasテキスト描画フラグ
        if (currentScene && currentScene.id === 'center' && currentScene.mainTextWrapper) {
            const hasElementEffect = effectManager.hasActiveElementEffect();
            currentScene.mainTextWrapper.style.visibility = hasElementEffect ? 'hidden' : 'visible';
            currentScene.drawCanvasText = hasElementEffect;
        }

        // 1. canvasを#0A0A0Aでクリア（sceneManager内でも行われるが、背景エフェクト用に先にクリア）
        bgCtx.fillStyle = '#0A0A0A';
        bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);

        // 2. 背景レイヤー: アナライザー波形等
        effectManager.renderBackground(data, now);

        // 3. メインレイヤー: シーン描画
        sceneManager.update(data, now);

        // 4. フォアグラウンドレイヤー: アナライザー以外のエフェクト
        effectManager.update(data, now);

        flashOverlay.style.backgroundColor = curFlashAlpha > 0.005
            ? `rgba(255,255,255,${curFlashAlpha.toFixed(3)})` : '';

        uiManager.updateDebug(rawData, currentFps);
    }

    /* ================================================================
     * 起動
     * ================================================================ */
    sceneManager.init();
    animate();
});
