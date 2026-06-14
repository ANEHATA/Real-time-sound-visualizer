/* ================================================================
 * EffectManager - エフェクト管理クラス
 *
 * 全シーンの描画結果に対してエフェクトを適用する。
 * target: 'element' → bgCanvasの描画結果を取得してeffectCanvasに描画
 * target: 'screen'  → screenCanvasに描画
 * ================================================================ */
class EffectManager {
    constructor(screenCanvas, screenCtx, analyzer) {
        this.screenCanvas = screenCanvas;
        this.screenCtx = screenCtx;
        this.effectCanvas = null;
        this.effectCtx = null;
        this.bgCanvas = null;
        this.container = null;

        this.effects = [];
        this.active = {};
        this.intensity = {};

        // audio_analyzer.jsのインスタンス（FFTデータ取得用）
        this.analyzer = analyzer || null;

        // ビートブースト値
        this.glitchBeatBoost = 0;
        this.scanlineBeatBoost = 0;
    }

    /** エフェクトを登録する */
    registerEffect(effectObj) {
        this.effects.push(effectObj);
        this.active[effectObj.key] = false;
        this.intensity[effectObj.id] = 1.0;
    }

    /** エフェクトのON/OFFを切り替える（keyまたはidで指定可能） */
    toggleEffect(keyOrId) {
        if (keyOrId in this.active) {
            this.active[keyOrId] = !this.active[keyOrId];
            return keyOrId;
        }
        const effect = this.effects.find(e => e.id === keyOrId);
        if (effect && effect.key in this.active) {
            this.active[effect.key] = !this.active[effect.key];
            return effect.key;
        }
        return null;
    }

    /** 指定キーのエフェクトがアクティブか（keyまたはidで指定可能） */
    isActive(keyOrId) {
        if (keyOrId in this.active) return this.active[keyOrId] === true;
        const effect = this.effects.find(e => e.id === keyOrId);
        return effect ? this.active[effect.key] === true : false;
    }

    /** キーに対応するエフェクトが存在するか（keyまたはidで指定可能） */
    hasEffect(keyOrId) {
        if (keyOrId in this.active) return true;
        return this.effects.some(e => e.id === keyOrId);
    }

    /** エフェクトの強度を設定する（0.0〜1.0） */
    setIntensity(id, value) {
        if (this.effects.some(e => e.id === id)) {
            this.intensity[id] = Math.max(0, Math.min(1, value));
        }
    }

    /** エフェクトの強度を取得する */
    getIntensity(id) {
        return this.intensity[id] !== undefined ? this.intensity[id] : 1.0;
    }

    /** ビート発生時 */
    onBeat(audioData, now) {
        this.glitchBeatBoost = 1;
        this.scanlineBeatBoost = 1;
    }

    /** elementエフェクトがアクティブか */
    hasActiveElementEffect() {
        return this.effects.some(e => e.target === 'element' && this.active[e.key]);
    }

    /** target が 'background' のアクティブなエフェクトを返す */
    getBackgroundEffects() {
        return this.effects.filter(e => e.target === 'background' && this.active[e.key]);
    }

    /** target が 'background' 以外のアクティブなエフェクトを返す */
    getForegroundEffects() {
        return this.effects.filter(e => e.target !== 'background' && this.active[e.key]);
    }

    /** 背景エフェクトを描画する（シーンの前に呼ぶ） */
    renderBackground(audioData, now) {
        const bgEffects = this.getBackgroundEffects();
        if (bgEffects.length === 0) return;

        const sceneState = {
            frequencyData: this.analyzer ? this.analyzer.getRawFrequencyData() : null,
            timeDomainData: this.analyzer ? this.analyzer.getRawTimeDomainData() : null,
        };
        bgEffects.forEach(e => {
            if (e.apply) {
                sceneState.intensity = this.intensity[e.id] !== undefined ? this.intensity[e.id] : 1.0;
                e.apply(this.bgCtx, this.bgCanvas, audioData, sceneState);
            }
        });
    }

    /** bgCanvasへの参照を取得するゲッター */
    get bgCtx() {
        return this.bgCanvas ? this.bgCanvas.getContext('2d') : null;
    }

    /** 毎フレーム呼ぶ - フォアグラウンドエフェクトのみ描画 */
    update(audioData, now) {
        // ビートブーストをlerp
        this.glitchBeatBoost = lerp(this.glitchBeatBoost, 0, 0.15);
        this.scanlineBeatBoost = lerp(this.scanlineBeatBoost, 0, 0.2);

        // elementエフェクト描画（bgCanvasの描画結果に対して適用）
        this._renderElementEffects(audioData, now);

        // screenエフェクト描画（backgroundを除く）
        this.screenCtx.clearRect(0, 0, this.screenCanvas.width, this.screenCanvas.height);
        const sceneState = {
            glitchBeatBoost: this.glitchBeatBoost,
            scanlineBeatBoost: this.scanlineBeatBoost,
            frequencyData: this.analyzer ? this.analyzer.getRawFrequencyData() : null,
            timeDomainData: this.analyzer ? this.analyzer.getRawTimeDomainData() : null,
        };
        this.effects.forEach(e => {
            if (!this.active[e.key]) return;
            if (e.target === 'screen' && e.apply) {
                sceneState.intensity = this.intensity[e.id] !== undefined ? this.intensity[e.id] : 1.0;
                e.apply(this.screenCtx, this.screenCanvas, audioData, sceneState);
            }
        });

        // F: ネガ反転（CSSフィルター・intensityで強さを変える）
        if (this.container) {
            if (this.active.F) {
                const inv = this.intensity['invert'] !== undefined ? this.intensity['invert'] : 1.0;
                this.container.style.filter = `invert(${inv})`;
            } else {
                this.container.style.filter = '';
            }
        }
    }

    /** bgCanvasの描画結果にelementエフェクトを適用 */
    _renderElementEffects(audioData, now) {
        if (!this.effectCanvas || !this.effectCtx || !this.bgCanvas) return;

        const hasElementEffect = this.hasActiveElementEffect();

        if (!hasElementEffect) {
            this.effectCtx.clearRect(0, 0, this.effectCanvas.width, this.effectCanvas.height);
            return;
        }

        // bgCanvasの描画結果をソースとして使用
        const w = this.bgCanvas.width;
        const h = this.bgCanvas.height;

        // Q, R はimageDataが必要
        let sourceImageData = null;
        if (this.active.Q || this.active.R) {
            const bgCtx = this.bgCanvas.getContext('2d');
            sourceImageData = bgCtx.getImageData(0, 0, w, h);
        }

        const sceneState = {
            sourceCanvas: this.bgCanvas,
            sourceImageData: sourceImageData,
            glitchBeatBoost: this.glitchBeatBoost,
            scanlineBeatBoost: this.scanlineBeatBoost,
        };

        this.effectCtx.clearRect(0, 0, this.effectCanvas.width, this.effectCanvas.height);

        // 適用順：A（歪み）→ E（ぼかし）→ Q（ハーフトーン）→ R（ドット分解）→ W（グリッチ）
        const order = ['A', 'E', 'Q', 'R', 'W'];
        order.forEach(key => {
            const e = this.effects.find(ef => ef.key === key);
            if (e && this.active[key] && e.apply) {
                sceneState.intensity = this.intensity[e.id] !== undefined ? this.intensity[e.id] : 1.0;
                e.apply(this.effectCtx, this.effectCanvas, audioData, sceneState);
            }
        });
    }

    /** アクティブなエフェクト一覧を返す */
    getActiveEffects() {
        return this.effects.filter(e => this.active[e.key]);
    }
}
