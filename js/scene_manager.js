/* ================================================================
 * 共有ユーティリティ関数（全モジュールで使用）
 * ================================================================ */
function lerp(a, b, t) { return a + (b - a) * t; }

function mapRange(value, inMin, inMax, outMin, outMax) {
    const t = Math.max(0, Math.min(1, (value - inMin) / (inMax - inMin)));
    return outMin + (outMax - outMin) * t;
}

function mulberry32(seed) {
    return function() {
        seed |= 0;
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* ================================================================
 * SceneManager - シーン管理クラス
 * ================================================================ */
class SceneManager {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.scenes = [];
        this.currentIndex = 0;
        this.displayText = 'SOUND';

        // フォント
        this.fontFamily = "'Noto Sans JP', sans-serif";

        // 自動切り替え
        this.isAutoMode = true;
        this.autoTimer = null;
        this.autoIntervalMin = 20000;
        this.autoIntervalMax = 30000;

        // ビートによる自動切り替え
        this.strongBeatCount = 0;
        this.lastStrongBeatTime = 0;

        // シーン有効/無効・順序管理
        this.enabledSceneIds = new Set();
        this.sceneOrder = [];

        // コールバック
        this.onSceneChange = null;
    }

    registerScene(sceneObj) {
        this.scenes.push(sceneObj);
        this.enabledSceneIds.add(sceneObj.id);
        this.sceneOrder.push(sceneObj.id);
    }

    /** 最初のシーンを起動する */
    init() {
        if (this.scenes.length === 0) return;
        this.scenes.forEach(s => { s._canvas = this.canvas; s._ctx = this.ctx; });
        this.scenes[0].setup(this.canvas, this.ctx, this.displayText);
        if (this.isAutoMode) this._scheduleAutoSwitch();
    }

    /** シーンを有効にする */
    enableScene(id) {
        this.enabledSceneIds.add(id);
    }

    /** シーンを無効にする（最低1つは維持） */
    disableScene(id) {
        if (this.enabledSceneIds.size <= 1) return false;
        this.enabledSceneIds.delete(id);
        const current = this.getCurrentScene();
        if (current && !this.enabledSceneIds.has(current.id)) {
            this.nextScene();
        }
        return true;
    }

    /** シーンが有効か */
    isSceneEnabled(id) {
        return this.enabledSceneIds.has(id);
    }

    /** シーンの順序を設定する */
    setSceneOrder(orderedIds) {
        this.sceneOrder = orderedIds;
    }

    /** 有効なシーンを順序通りに返す */
    getEnabledOrderedScenes() {
        return this.sceneOrder
            .map(id => this.scenes.find(s => s.id === id))
            .filter(s => s && this.enabledSceneIds.has(s.id));
    }

    /** シーン切り替え（インデックスまたはID） */
    switchScene(id) {
        const index = typeof id === 'number'
            ? id
            : this.scenes.findIndex(s => s.id === id);
        if (index < 0 || index >= this.scenes.length) return;
        if (index === this.currentIndex) return;

        this.scenes[this.currentIndex].cleanup();
        this.currentIndex = index;
        this.scenes[this.currentIndex].setup(this.canvas, this.ctx, this.displayText);

        if (this.onSceneChange) this.onSceneChange(this.currentIndex);
        if (this.isAutoMode) this._scheduleAutoSwitch();
    }

    /** 有効なシーンリストの中で次のシーンに切り替え */
    nextScene() {
        const enabled = this.getEnabledOrderedScenes();
        if (enabled.length <= 1) return;
        const current = this.getCurrentScene();
        const idx = enabled.findIndex(s => s.id === current.id);
        const nextIdx = (idx + 1) % enabled.length;
        const sceneIndex = this.scenes.indexOf(enabled[nextIdx]);
        this.switchScene(sceneIndex);
    }

    /** 有効なシーンリストの中で前のシーンに切り替え */
    prevScene() {
        const enabled = this.getEnabledOrderedScenes();
        if (enabled.length <= 1) return;
        const current = this.getCurrentScene();
        const idx = enabled.findIndex(s => s.id === current.id);
        const prevIdx = (idx - 1 + enabled.length) % enabled.length;
        const sceneIndex = this.scenes.indexOf(enabled[prevIdx]);
        this.switchScene(sceneIndex);
    }

    setAutoMode(enabled) {
        this.isAutoMode = enabled;
        if (enabled) {
            this._scheduleAutoSwitch();
        } else {
            clearTimeout(this.autoTimer);
            this.strongBeatCount = 0;
        }
    }

    /** 自動切り替え間隔を設定（ミリ秒） */
    setAutoInterval(min, max) {
        this.autoIntervalMin = min;
        this.autoIntervalMax = max !== undefined ? max : min;
    }

    setDisplayText(text) {
        this.displayText = text.trim() || 'SOUND';
    }

    /** フォントファミリーを設定する */
    setFontFamily(family) {
        this.fontFamily = family;
    }

    /** 毎フレーム呼ぶ */
    update(audioData, now) {
        if (this.scenes.length === 0) return;
        const scene = this.scenes[this.currentIndex];
        scene.fontFamily = this.fontFamily;
        scene.update(audioData, this.displayText, now);
    }

    /** ビート発生時に呼ぶ */
    onBeat(audioData, now) {
        if (this.isAutoMode && audioData.bassNorm > 0.5) {
            if (now - this.lastStrongBeatTime < 2000) {
                this.strongBeatCount++;
            } else {
                this.strongBeatCount = 1;
            }
            this.lastStrongBeatTime = now;
            if (this.strongBeatCount >= 3) {
                this.strongBeatCount = 0;
                this.nextScene();
            }
        }

        const scene = this.scenes[this.currentIndex];
        if (scene.onBeat) scene.onBeat(audioData, now);
    }

    getCurrentScene() {
        return this.scenes[this.currentIndex] || null;
    }

    _scheduleAutoSwitch() {
        clearTimeout(this.autoTimer);
        if (!this.isAutoMode) return;
        const interval = this.autoIntervalMin +
            Math.random() * (this.autoIntervalMax - this.autoIntervalMin);
        this.autoTimer = setTimeout(() => this.nextScene(), interval);
    }
}
