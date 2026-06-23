/* ================================================================
 * UIManager - サイドバーUI管理クラス
 * ================================================================ */
class UIManager {
    constructor(sidebarElement) {
        this.sidebar = sidebarElement;
        this.sidebarVisible = true;
        this.toggleBtn = null;
        this.dbg = {};

        // コールバック
        this.onTextChange = null;
        this.onMicToggle = null;
        this.onSpeechToggle = null;
        this.onSpeechLanguageChange = null;
        this.onAutoModeChange = null;
        this.onIntervalChange = null;
        this.onSidebarToggle = null;
        this.onFontChange = null;
        this.onMidiDeviceChange = null;

        // 内部参照
        this.sceneManager = null;
        this.effectManager = null;
        this.audioMapping = null;
        this.textInput = null;
        this.btnMic = null;
        this.btnSpeech = null;
        this.btnLangJa = null;
        this.btnLangEn = null;
        this.speechStatus = null;

        // フォント
        this.japaneseFontSelect = null;
        this.latinFontSelect = null;

        // MIDI
        this.midiDeviceSelect = null;
        this.midiStatusText = null;
        this.midiDot = null;
        this.midiMonitor = null;

        // マッピングUI参照
        this.mappingSceneName = null;
        this.mappingSliders = {};

        // シーンマッピングドロップダウン参照
        this.sceneMappingDropdowns = {};

        // シーンリスト参照
        this.sceneListEl = null;
    }

    /* ================================================================
     * buildSection ヘルパー
     * 新しいセクションを追加するときはこれを1回呼ぶだけでよい
     * ================================================================ */

    /**
     * アコーディオンセクションを生成して返す
     * @param {string} title セクション名
     * @param {function} contentFn sec-bodyのDOM要素に中身を追加する関数
     * @param {object} [opts] オプション
     * @param {boolean} [opts.open=false] 初期状態で開くか
     * @returns {HTMLElement} セクション要素
     */
    buildSection(title, contentFn, opts = {}) {
        const section = document.createElement('div');
        section.className = 'section' + (opts.open ? ' open' : '');

        const header = document.createElement('div');
        header.className = 'sec-header';
        header.innerHTML = `<span class="sec-arrow">▶</span><span>${title}</span>`;
        header.addEventListener('click', () => section.classList.toggle('open'));

        const body = document.createElement('div');
        body.className = 'sec-body';
        contentFn(body);

        section.appendChild(header);
        section.appendChild(body);
        return section;
    }

    /** サイドバーUIを構築する */
    buildSidebar(sceneManager, effectManager, analyzer, audioMapping) {
        this.sceneManager = sceneManager;
        this.effectManager = effectManager;
        this.audioMapping = audioMapping || null;

        const content = document.createElement('div');
        content.id = 'sidebar-content';

        content.appendChild(this._buildDebugSection());
        content.appendChild(this._buildSceneSection());
        content.appendChild(this._buildSceneMappingSection());
        content.appendChild(this._buildAudioMappingSection());
        content.appendChild(this._buildModeSection());
        content.appendChild(this._buildEffectsSection());
        content.appendChild(this._buildInputSection());
        content.appendChild(this._buildMidiSection());
        content.appendChild(this._buildCaptureSection());
        content.appendChild(this._buildFullscreenSection());

        this.sidebar.appendChild(content);

        // DOM参照を取得
        this.dbg = {
            vol:    content.querySelector('#dbgVol'),
            bass:   content.querySelector('#dbgBass'),
            mid:    content.querySelector('#dbgMid'),
            high:   content.querySelector('#dbgHigh'),
            flux:   content.querySelector('#dbgFlux'),
            beat:   content.querySelector('#dbgBeat'),
            beatDot: content.querySelector('#beatDot'),
            energy: content.querySelector('#dbgEnergy'),
            fps:    content.querySelector('#dbgFps'),
        };

        this.textInput = content.querySelector('#textInput');
        this.btnMic = content.querySelector('#btnMic');
        this.btnSpeech = content.querySelector('#btnSpeech');
        this.btnLangJa = content.querySelector('#btnLangJa');
        this.btnLangEn = content.querySelector('#btnLangEn');
        this.speechStatus = content.querySelector('#speechStatus');

        // MIDI参照
        this.midiDeviceSelect = content.querySelector('#midiDeviceSelect');
        this.midiStatusText = content.querySelector('#midiStatusText');
        this.midiDot = content.querySelector('#midiDot');
        this.midiMonitor = content.querySelector('#midiMonitor');

        // シーンリスト構築（チェックボックス＋ドラッグ対応）
        this._buildSceneList(content);

        // エフェクトボタン＋強度スライダーを生成
        const effectGrid = content.querySelector('#effectGrid');
        effectManager.effects.forEach(def => {
            const row = document.createElement('div');
            row.className = 'eff-row';

            const btn = document.createElement('button');
            btn.className = 'eff-btn';
            btn.id = `effBtn-${def.key}`;
            btn.innerHTML = `${def.label}<span class="eff-key">${def.key}</span>`;
            btn.addEventListener('click', () => {
                effectManager.toggleEffect(def.key);
                btn.classList.toggle('active', effectManager.isActive(def.key));
            });

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.className = 'eff-intensity st-range';
            slider.id = `effIntensity-${def.id}`;
            slider.min = '0';
            slider.max = '100';
            slider.value = '100';

            const valSpan = document.createElement('span');
            valSpan.className = 'eff-intensity-val';
            valSpan.id = `effIntensityVal-${def.id}`;
            valSpan.textContent = '100';

            slider.addEventListener('input', () => {
                const val = parseInt(slider.value) / 100;
                effectManager.setIntensity(def.id, val);
                valSpan.textContent = slider.value;
            });

            row.appendChild(btn);
            row.appendChild(slider);
            row.appendChild(valSpan);
            effectGrid.appendChild(row);
        });

        // AUTO/MANUALボタン
        const btnAuto = content.querySelector('#btnAuto');
        const btnManual = content.querySelector('#btnManual');
        btnAuto.addEventListener('click', () => {
            sceneManager.setAutoMode(true);
            btnAuto.classList.add('active');
            btnManual.classList.remove('active');
            if (this.onAutoModeChange) this.onAutoModeChange(true);
        });
        btnManual.addEventListener('click', () => {
            sceneManager.setAutoMode(false);
            btnManual.classList.add('active');
            btnAuto.classList.remove('active');
            if (this.onAutoModeChange) this.onAutoModeChange(false);
        });

        // INTERVALスライダー
        const intervalSlider = content.querySelector('#intervalSlider');
        const intervalVal = content.querySelector('#intervalVal');
        intervalSlider.addEventListener('input', () => {
            const sec = parseInt(intervalSlider.value);
            intervalVal.textContent = sec + 's';
            sceneManager.setAutoInterval(sec * 1000);
            if (sceneManager.isAutoMode) sceneManager._scheduleAutoSwitch();
            if (this.onIntervalChange) this.onIntervalChange(sec);
        });

        // テキスト入力
        this.textInput.addEventListener('input', () => {
            if (this.onTextChange) this.onTextChange(this.textInput.value);
        });
        this.textInput.addEventListener('click', e => e.stopPropagation());

        // SPEECHボタン
        this.btnSpeech.addEventListener('click', () => {
            if (this.onSpeechToggle) this.onSpeechToggle();
        });

        // 言語切り替えボタン
        this.btnLangJa.addEventListener('click', () => {
            this.btnLangJa.classList.add('active');
            this.btnLangEn.classList.remove('active');
            if (this.onSpeechLanguageChange) this.onSpeechLanguageChange('ja-JP');
        });
        this.btnLangEn.addEventListener('click', () => {
            this.btnLangEn.classList.add('active');
            this.btnLangJa.classList.remove('active');
            if (this.onSpeechLanguageChange) this.onSpeechLanguageChange('en-US');
        });

        // MICボタン
        this.btnMic.addEventListener('click', () => {
            if (this.onMicToggle) this.onMicToggle();
        });

        // MIDIデバイス選択
        this.midiDeviceSelect.addEventListener('change', () => {
            if (this.onMidiDeviceChange) this.onMidiDeviceChange(this.midiDeviceSelect.value);
        });

        // 全画面ボタン
        const btnFullscreen = content.querySelector('#btnFullscreen');
        btnFullscreen.addEventListener('click', () => this.setSidebarVisible(false));

        // サイドバートグルボタン
        this.toggleBtn = document.createElement('button');
        this.toggleBtn.id = 'sidebar-toggle';
        this.toggleBtn.textContent = '◀';
        this.toggleBtn.addEventListener('click', () => this.toggleSidebar());
        document.body.appendChild(this.toggleBtn);

        // フォントUI初期化
        this._initFontUI(content);

        // マッピングUI初期化
        this._initMappingUI(content);

        // シーン変更時のUI更新コールバック
        sceneManager.onSceneChange = (index) => {
            this.updateSceneButtons(index);
            this._updateMappingUI();
        };
    }

    /* ================================================================
     * 各セクションのビルダー（buildSectionを使用）
     * ================================================================ */

    _buildDebugSection() {
        return this.buildSection('DEBUG', body => {
            body.innerHTML = `
                <div class="dbg-row"><span class="dbg-lbl">Volume</span><span class="dbg-val" id="dbgVol">0</span></div>
                <div class="dbg-row"><span class="dbg-lbl">Bass</span><span class="dbg-val" id="dbgBass">0</span></div>
                <div class="dbg-row"><span class="dbg-lbl">Mid</span><span class="dbg-val" id="dbgMid">0</span></div>
                <div class="dbg-row"><span class="dbg-lbl">High</span><span class="dbg-val" id="dbgHigh">0</span></div>
                <div class="dbg-row"><span class="dbg-lbl">Flux</span><span class="dbg-val" id="dbgFlux">0</span></div>
                <div class="dbg-row">
                    <span class="dbg-lbl">Beat</span>
                    <span class="dbg-val"><span class="beat-dot" id="beatDot"></span><span id="dbgBeat">○</span></span>
                </div>
                <div class="dbg-row"><span class="dbg-lbl">Energy</span><span class="dbg-val" id="dbgEnergy">0</span></div>
                <div class="dbg-row"><span class="dbg-lbl">FPS</span><span class="dbg-val" id="dbgFps">0</span></div>
            `;
        }, { open: true });
    }

    _buildSceneSection() {
        return this.buildSection('SCENE', body => {
            body.innerHTML = `<div class="scene-list" id="sceneList"></div>`;
        }, { open: true });
    }

    _buildSceneMappingSection() {
        return this.buildSection('SCENE MAPPING', body => {
            body.innerHTML = `
                <div class="mapping-scene-name" id="sceneMappingName">CENTER</div>
                <div id="sceneMappingTargets"></div>
            `;
        });
    }

    _buildAudioMappingSection() {
        return this.buildSection('AUDIO MAPPING', body => {
            body.innerHTML = `
                <div class="mapping-scene-name" id="mappingSceneName">CENTER</div>
                <div class="slider-row">
                    <span class="slider-label">BASS</span>
                    <input type="range" class="st-range" id="mapSlider-bass" min="0" max="3" step="0.1" value="1.0">
                    <span class="slider-val" id="mapVal-bass">1.0</span>
                </div>
                <div class="slider-row">
                    <span class="slider-label">MID</span>
                    <input type="range" class="st-range" id="mapSlider-mid" min="0" max="3" step="0.1" value="1.0">
                    <span class="slider-val" id="mapVal-mid">1.0</span>
                </div>
                <div class="slider-row">
                    <span class="slider-label">HIGH</span>
                    <input type="range" class="st-range" id="mapSlider-high" min="0" max="3" step="0.1" value="1.0">
                    <span class="slider-val" id="mapVal-high">1.0</span>
                </div>
                <div class="slider-row">
                    <span class="slider-label">VOLUME</span>
                    <input type="range" class="st-range" id="mapSlider-volume" min="0" max="3" step="0.1" value="1.0">
                    <span class="slider-val" id="mapVal-volume">1.0</span>
                </div>
            `;
        });
    }

    _buildModeSection() {
        return this.buildSection('MODE', body => {
            body.innerHTML = `
                <div class="row2">
                    <button class="tog-btn active" id="btnAuto">AUTO</button>
                    <button class="tog-btn" id="btnManual">MANUAL</button>
                </div>
                <div class="slider-row">
                    <span class="slider-label">INTERVAL</span>
                    <input type="range" class="st-range" id="intervalSlider" min="5" max="60" step="1" value="25">
                    <span class="slider-val" id="intervalVal">25s</span>
                </div>
            `;
        }, { open: true });
    }

    _buildEffectsSection() {
        return this.buildSection('EFFECTS', body => {
            body.innerHTML = `<div class="effect-grid" id="effectGrid"></div>`;
        }, { open: true });
    }

    _buildInputSection() {
        return this.buildSection('INPUT', body => {
            body.innerHTML = `
                <label class="field-label">TEXT</label>
                <input type="text" class="field-text" id="textInput" placeholder="ENTER TEXT" value="SOUND">
                <div class="input-btn-row mt8">
                    <button class="tog-btn" id="btnMic">MIC ON</button>
                    <button class="tog-btn" id="btnSpeech">SPEECH</button>
                </div>
                <div class="input-btn-row mt4">
                    <button class="tog-btn active" id="btnLangJa" style="max-width:52px;">JA</button>
                    <button class="tog-btn" id="btnLangEn" style="max-width:52px;">EN</button>
                </div>
                <div id="speechStatus" style="font-size:10px;color:rgba(255,100,100,0.9);letter-spacing:0.1em;margin-top:4px;display:none;">● REC</div>
                <label class="field-label mt8">和文フォント</label>
                <select class="field-select" id="japaneseFontSelect">
                    <option value="Noto Sans JP" selected>Noto Sans JP</option>
                </select>
                <label class="field-label mt8">欧文フォント</label>
                <select class="field-select" id="latinFontSelect">
                    <option value="Noto Sans JP" selected>Noto Sans JP</option>
                </select>
            `;
        }, { open: true });
    }

    _buildMidiSection() {
        return this.buildSection('MIDI', body => {
            body.innerHTML = `
                <label class="field-label">DEVICE</label>
                <select class="field-select" id="midiDeviceSelect">
                    <option value="">デバイスなし</option>
                </select>
                <div class="midi-status mt4" id="midiStatus">
                    <span class="midi-dot" id="midiDot"></span>
                    <span id="midiStatusText">未接続</span>
                </div>
                <label class="field-label mt8">MONITOR</label>
                <div class="midi-monitor" id="midiMonitor">---</div>
            `;
        });
    }

    _buildCaptureSection() {
        const section = document.createElement('div');
        section.className = 'section section-capture';
        section.innerHTML = `
            <div class="section-title">キャプチャ</div>
            <button class="capture-button" id="captureBtn">📸 静止画キャプチャ</button>
            <button class="capture-button video-capture-button" id="videoCaptureBtn">🎬 動画キャプチャ（4秒）</button>
            <div id="captureStatus" class="capture-status"></div>
        `;
        return section;
    }

    _buildFullscreenSection() {
        const section = document.createElement('div');
        section.className = 'section section-fullscreen';
        section.innerHTML = `<button class="full-btn" id="btnFullscreen">全画面表示</button>`;
        return section;
    }

    /* ================================================================
     * シーンリスト（チェックボックス＋ドラッグ&ドロップ）
     * ================================================================ */

    /** シーンリストを構築する */
    _buildSceneList(content) {
        this.sceneListEl = content.querySelector('#sceneList');
        const sceneManager = this.sceneManager;

        sceneManager.scenes.forEach((scene, i) => {
            const item = document.createElement('div');
            item.className = 'scene-item' + (i === 0 ? ' active' : '');
            item.dataset.id = scene.id;
            item.draggable = true;

            const numSpan = document.createElement('span');
            numSpan.className = 'scene-num';
            numSpan.textContent = i + 1;

            const label = document.createElement('button');
            label.className = 'scene-label';
            label.textContent = scene.label;
            label.addEventListener('click', () => {
                const idx = sceneManager.scenes.indexOf(scene);
                sceneManager.switchScene(idx);
                if (sceneManager.isAutoMode) sceneManager._scheduleAutoSwitch();
            });

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'scene-checkbox';
            checkbox.checked = true;
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    sceneManager.enableScene(scene.id);
                } else {
                    const ok = sceneManager.disableScene(scene.id);
                    if (!ok) checkbox.checked = true;
                }
            });

            const dragHandle = document.createElement('span');
            dragHandle.className = 'scene-drag-handle';
            dragHandle.textContent = '⠿';

            item.appendChild(numSpan);
            item.appendChild(label);
            item.appendChild(checkbox);
            item.appendChild(dragHandle);
            this.sceneListEl.appendChild(item);
        });

        // ドラッグ&ドロップイベント
        this.sceneListEl.addEventListener('dragstart', (e) => {
            const item = e.target.closest('.scene-item');
            if (!item) return;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        this.sceneListEl.addEventListener('dragend', (e) => {
            const item = e.target.closest('.scene-item');
            if (item) item.classList.remove('dragging');
            this._applySceneOrder();
        });

        this.sceneListEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const dragging = this.sceneListEl.querySelector('.dragging');
            if (!dragging) return;
            const afterEl = this._getDragAfterElement(e.clientY);
            if (afterEl) {
                this.sceneListEl.insertBefore(dragging, afterEl);
            } else {
                this.sceneListEl.appendChild(dragging);
            }
        });
    }

    /** ドラッグ位置から挿入先要素を取得する */
    _getDragAfterElement(y) {
        const items = [...this.sceneListEl.querySelectorAll('.scene-item:not(.dragging)')];
        return items.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset, element: child };
            }
            return closest;
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    /** DOM順序からシーンオーダーを反映する */
    _applySceneOrder() {
        const items = this.sceneListEl.querySelectorAll('.scene-item');
        const order = [...items].map(item => item.dataset.id);
        this.sceneManager.setSceneOrder(order);
    }

    /* ================================================================
     * フォントUI
     * ================================================================ */

    /** フォントUIを初期化する */
    _initFontUI(content) {
        this.japaneseFontSelect = content.querySelector('#japaneseFontSelect');
        this.latinFontSelect = content.querySelector('#latinFontSelect');

        if (!this.japaneseFontSelect || !this.latinFontSelect) return;

        const onFontChange = () => {
            const latin = this.latinFontSelect.value;
            const japanese = this.japaneseFontSelect.value;
            const family = `'${latin}', '${japanese}', sans-serif`;
            if (this.onFontChange) this.onFontChange(family);
        };

        this.japaneseFontSelect.addEventListener('change', onFontChange);
        this.latinFontSelect.addEventListener('change', onFontChange);

        this._loadLocalFonts();
    }

    /** Local Font Access APIでPCフォントを取得する */
    async _loadLocalFonts() {
        if (!window.queryLocalFonts) {
            this._loadFallbackFonts();
            return;
        }

        try {
            const fonts = await window.queryLocalFonts();
            const familySet = new Set();
            fonts.forEach(f => familySet.add(f.family));

            const allFamilies = [...familySet].sort();

            const jpPattern = /[　-〿぀-ゟ゠-ヿ一-龯＀-ﾟ]|CJK|JP|Japanese|ゴシック|明朝|丸ゴ|角ゴ|教科書|行書|Hiragino|Kaku|Maru|Mincho|Yu Gothic|Yu Mincho|Meiryo|BIZ UD|UDデジタル|Noto.*JP|Noto.*CJK|Source Han|IPAex|IPA |MS UI|ＭＳ/i;

            const jpFonts = allFamilies.filter(f => jpPattern.test(f));
            const latinFonts = allFamilies.filter(f => !jpPattern.test(f));

            this._populateFontSelect(this.japaneseFontSelect, jpFonts, 'Noto Sans JP');
            this._populateFontSelect(this.latinFontSelect, latinFonts, 'Noto Sans JP');
        } catch (err) {
            console.warn('Local Font Access APIエラー:', err);
            this._loadFallbackFonts();
        }
    }

    /** フォールバックフォントリストを表示する */
    _loadFallbackFonts() {
        const jpFallback = [
            'Noto Sans JP', 'Noto Serif JP',
            'Hiragino Sans', 'Hiragino Mincho ProN',
            'Yu Gothic', 'Yu Mincho', 'Meiryo',
            'MS PGothic', 'MS PMincho',
        ];
        const latinFallback = [
            'Noto Sans JP', 'Arial', 'Helvetica', 'Helvetica Neue',
            'Georgia', 'Times New Roman', 'Courier New',
            'Verdana', 'Impact', 'Trebuchet MS',
        ];
        this._populateFontSelect(this.japaneseFontSelect, jpFallback, 'Noto Sans JP');
        this._populateFontSelect(this.latinFontSelect, latinFallback, 'Noto Sans JP');
    }

    /** セレクトにフォント選択肢を追加する */
    _populateFontSelect(select, fonts, defaultFont) {
        if (!select) return;
        select.innerHTML = '';
        fonts.forEach(font => {
            const opt = document.createElement('option');
            opt.value = font;
            opt.textContent = font;
            if (font === defaultFont) opt.selected = true;
            select.appendChild(opt);
        });
    }

    /* ================================================================
     * マッピングUI
     * ================================================================ */

    /** マッピングUIを初期化する */
    _initMappingUI(content) {
        if (!this.audioMapping) return;

        // シーンマッピング（ドロップダウン）
        this.sceneMappingName = content.querySelector('#sceneMappingName');
        this._buildSceneMappingDropdowns(content);

        // オーディオマッピング（感度スライダー）
        this.mappingSceneName = content.querySelector('#mappingSceneName');
        this.mappingSliders = {};

        const params = ['bass', 'mid', 'high', 'volume'];
        params.forEach(param => {
            const slider = content.querySelector(`#mapSlider-${param}`);
            const valSpan = content.querySelector(`#mapVal-${param}`);
            if (!slider || !valSpan) return;

            this.mappingSliders[param] = { slider, valSpan };

            slider.addEventListener('input', () => {
                const val = parseFloat(slider.value);
                valSpan.textContent = val.toFixed(1);
                const currentScene = this.sceneManager.getCurrentScene();
                if (currentScene) {
                    this.audioMapping.setMapping(currentScene.id, param, val);
                }
            });
        });

        this._updateMappingUI();
    }

    /** シーンマッピングのドロップダウンを構築する */
    _buildSceneMappingDropdowns(content) {
        const container = content.querySelector('#sceneMappingTargets');
        if (!container) return;

        container.innerHTML = '';
        this.sceneMappingDropdowns = {};

        const bands = ['bass', 'mid', 'high', 'volume'];
        const bandLabels = { bass: 'BASS', mid: 'MID', high: 'HIGH', volume: 'VOLUME' };

        bands.forEach(band => {
            const row = document.createElement('div');
            row.className = 'mapping-target-row';

            const label = document.createElement('span');
            label.className = 'slider-label';
            label.textContent = bandLabels[band];

            const select = document.createElement('select');
            select.className = 'mapping-target-select';
            select.id = `sceneMapSelect-${band}`;

            select.addEventListener('change', () => {
                const currentScene = this.sceneManager.getCurrentScene();
                if (!currentScene) return;
                this.audioMapping.setTargetAssignment(currentScene.id, band, select.value);
            });

            row.appendChild(label);
            row.appendChild(select);
            container.appendChild(row);

            this.sceneMappingDropdowns[band] = select;
        });
    }

    /** マッピングUIを現在のシーンに合わせて更新する */
    _updateMappingUI() {
        if (!this.audioMapping) return;

        const currentScene = this.sceneManager.getCurrentScene();
        if (!currentScene) return;

        // シーンマッピング（ドロップダウン）を更新
        if (this.sceneMappingName) {
            this.sceneMappingName.textContent = currentScene.label;
        }

        const params = this.audioMapping.getSceneParams(currentScene.id);
        const assignments = this.audioMapping.getTargetAssignments(currentScene.id);
        const bands = ['bass', 'mid', 'high', 'volume'];

        bands.forEach(band => {
            const select = this.sceneMappingDropdowns[band];
            if (!select) return;

            const currentVal = assignments ? assignments[band] : null;
            select.innerHTML = '';

            params.forEach(param => {
                const opt = document.createElement('option');
                opt.value = param;
                opt.textContent = param;
                if (param === currentVal) opt.selected = true;
                select.appendChild(opt);
            });
        });

        // オーディオマッピング（感度スライダー）を更新
        if (!this.mappingSceneName) return;
        this.mappingSceneName.textContent = currentScene.label;

        const mapping = this.audioMapping.getMapping(currentScene.id);
        if (!mapping) return;

        bands.forEach(param => {
            const ui = this.mappingSliders[param];
            if (!ui) return;
            const val = mapping[param] !== undefined ? mapping[param] : 1.0;
            ui.slider.value = val;
            ui.valSpan.textContent = val.toFixed(1);
        });
    }

    /* ================================================================
     * MIDI UI更新メソッド
     * ================================================================ */

    /** MIDIデバイス一覧を更新する */
    updateMidiDevices(devices, selectedId) {
        if (!this.midiDeviceSelect) return;
        this.midiDeviceSelect.innerHTML = '<option value="">デバイスなし</option>';
        devices.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.id;
            opt.textContent = d.name;
            if (d.id === selectedId) opt.selected = true;
            this.midiDeviceSelect.appendChild(opt);
        });
        this.updateMidiStatus(!!selectedId);
    }

    /** MIDI接続状態を更新する */
    updateMidiStatus(connected) {
        if (!this.midiStatusText || !this.midiDot) return;
        this.midiStatusText.textContent = connected ? '接続中' : '未接続';
        this.midiDot.classList.toggle('connected', connected);
    }

    /** MIDIモニターを更新する */
    updateMidiMonitor(msg) {
        if (!this.midiMonitor) return;
        if (msg.type === 'pad') {
            this.midiMonitor.textContent = `PAD ${msg.pad}  vel:${msg.velocity}`;
        } else if (msg.type === 'knob') {
            this.midiMonitor.textContent = `KNOB ${msg.knob}  val:${msg.value}`;
        }
    }

    /** エフェクト強度UIを更新する */
    updateEffectIntensity(effectId, value) {
        const slider = document.getElementById(`effIntensity-${effectId}`);
        const valSpan = document.getElementById(`effIntensityVal-${effectId}`);
        const pct = Math.round(value * 100);
        if (slider) slider.value = pct;
        if (valSpan) valSpan.textContent = pct;
    }

    /* ================================================================
     * 表示更新メソッド
     * ================================================================ */

    /** デバッグ表示を更新する */
    updateDebug(audioData, fps) {
        this.dbg.vol.textContent = Math.round(audioData.volume);
        this.dbg.bass.textContent = Math.round(audioData.bass);
        this.dbg.mid.textContent = Math.round(audioData.mid);
        this.dbg.high.textContent = Math.round(audioData.high);
        this.dbg.flux.textContent = Math.round(audioData.flux);
        this.dbg.energy.textContent = audioData.energyLevel;
        this.dbg.fps.textContent = fps;

        if (audioData.isBeat) {
            this.dbg.beatDot.classList.add('lit');
            this.dbg.beat.textContent = '●';
            setTimeout(() => {
                this.dbg.beatDot.classList.remove('lit');
                this.dbg.beat.textContent = '○';
            }, 80);
        }
    }

    /** シーンボタンのアクティブ状態を更新する */
    updateSceneButtons(currentIndex) {
        if (!this.sceneListEl) return;
        const currentScene = this.sceneManager.scenes[currentIndex];
        this.sceneListEl.querySelectorAll('.scene-item').forEach(item => {
            item.classList.toggle('active', item.dataset.id === currentScene.id);
        });
    }

    /** エフェクトボタンの表示を更新する */
    updateEffectButton(key, active) {
        const btn = document.getElementById(`effBtn-${key}`);
        if (btn) btn.classList.toggle('active', active);
    }

    /** MICボタンの表示を更新する */
    setMicState(active) {
        this.btnMic.textContent = active ? 'MIC OFF' : 'MIC ON';
        this.btnMic.classList.toggle('active', active);
    }

    /** 音声認識ボタン・状態表示を更新する */
    setSpeechState(active) {
        this.btnSpeech.textContent = active ? 'SPEECH ON' : 'SPEECH';
        this.btnSpeech.classList.toggle('active', active);
        this.speechStatus.style.display = active ? 'block' : 'none';
        this.textInput.disabled = active;
        this.textInput.style.opacity = active ? '0.3' : '1';
    }

    /** テキスト入力欄の値を外部から設定する */
    setTextInputValue(text) {
        this.textInput.value = text;
    }

    /** テキスト入力にフォーカスがあるか */
    isTextInputFocused() {
        return document.activeElement === this.textInput;
    }

    /** サイドバーの表示/非表示を切り替える */
    toggleSidebar() {
        this.setSidebarVisible(!this.sidebarVisible);
    }

    /** サイドバーの表示/非表示を設定する */
    setSidebarVisible(visible) {
        this.sidebarVisible = visible;
        this.sidebar.style.width = visible ? '280px' : '0px';
        this.sidebar.style.overflow = visible ? '' : 'hidden';
        this.toggleBtn.textContent = visible ? '◀' : '▶';
        this.toggleBtn.style.right = visible ? '280px' : '0px';
        if (this.onSidebarToggle) this.onSidebarToggle();
    }
}
