/* ================================================================
 * AudioMapping - シーンごとのオーディオマッピング調整
 *
 * 各シーンの音声パラメータに対する感度を個別に設定し、
 * applyMapping()で調整済みのaudioDataを返す。
 * また、音声帯域→ビジュアルパラメータのリマッピングに対応。
 * ================================================================ */
class AudioMapping {
    constructor() {
        // 音声帯域キー（固定順序）
        this.bands = ['bass', 'mid', 'high', 'volume'];

        // シーンごとの利用可能パラメータとデフォルトマッピング
        this.defaults = {
            center: {
                bass:   { sensitivity: 1.0, target: 'fontSize / letterSpacing' },
                mid:    { sensitivity: 1.0, target: 'fontWeight' },
                high:   { sensitivity: 1.0, target: 'skew / scaleY / dissolve' },
                volume: { sensitivity: 1.0, target: 'opacity / lineLength' },
            },
            tile: {
                bass:   { sensitivity: 1.0, target: 'scaleY' },
                mid:    { sensitivity: 1.0, target: 'fontWeight / fontSize' },
                high:   { sensitivity: 1.0, target: 'cellSkew' },
                volume: { sensitivity: 1.0, target: 'scrollSpeed / opacity' },
            },
            morph: {
                bass:   { sensitivity: 1.0, target: '(unused)' },
                mid:    { sensitivity: 1.0, target: 'barWidth' },
                high:   { sensitivity: 1.0, target: '(unused)' },
                volume: { sensitivity: 1.0, target: 'oscillation' },
            },
            orbit: {
                bass:   { sensitivity: 1.0, target: 'ryFactor' },
                mid:    { sensitivity: 1.0, target: 'fontWeight' },
                high:   { sensitivity: 1.0, target: '(unused)' },
                volume: { sensitivity: 1.0, target: 'rotationSpeed' },
            },
            spotlight: {
                bass:   { sensitivity: 1.0, target: '(unused)' },
                mid:    { sensitivity: 1.0, target: 'fontWeight / moveSpeed' },
                high:   { sensitivity: 1.0, target: 'flicker' },
                volume: { sensitivity: 1.0, target: 'lightRadius / brightness' },
            },
            cymatics: {
                bass:   { sensitivity: 1.0, target: 'buzz' },
                mid:    { sensitivity: 1.0, target: '(unused)' },
                high:   { sensitivity: 1.0, target: '(unused)' },
                volume: { sensitivity: 1.0, target: 'gatherStrength' },
            },
            binary_rain: {
                bass:   { sensitivity: 1.0, target: 'waveSpeed / waveIntensity' },
                mid:    { sensitivity: 1.0, target: 'fontWeight' },
                high:   { sensitivity: 1.0, target: '(unused)' },
                volume: { sensitivity: 1.0, target: 'fontSize' },
            },
        };

        // シーンごとの選択可能パラメータ一覧（ドロップダウン用）
        this.sceneParams = {
            center:      ['fontSize / letterSpacing', 'fontWeight', 'skew / scaleY / dissolve', 'opacity / lineLength'],
            tile:        ['scaleY', 'fontWeight / fontSize', 'cellSkew', 'scrollSpeed / opacity'],
            morph:       ['barWidth', 'oscillation', '(unused)'],
            orbit:       ['ryFactor', 'fontWeight', 'rotationSpeed', '(unused)'],
            spotlight:   ['fontWeight / moveSpeed', 'flicker', 'lightRadius / brightness', '(unused)'],
            cymatics:    ['buzz', 'gatherStrength', '(unused)'],
            binary_rain: ['waveSpeed / waveIntensity', 'fontWeight', 'fontSize', '(unused)'],
        };

        // 実行時マッピング（ユーザー調整値を保持: sensitivity）
        this.mappings = {};
        for (const sceneId in this.defaults) {
            this.mappings[sceneId] = {};
            for (const param in this.defaults[sceneId]) {
                this.mappings[sceneId][param] = this.defaults[sceneId][param].sensitivity;
            }
        }

        // 音声帯域リマッピング: sceneId → { bass: 'bass', mid: 'mid', ... }
        // 値はデフォルトでは自分自身（変更なし）
        this.bandRemapping = {};
        for (const sceneId in this.defaults) {
            this.bandRemapping[sceneId] = {};
            this.bands.forEach(band => {
                this.bandRemapping[sceneId][band] = band;
            });
        }

        // 現在のターゲット割り当て: sceneId → { bass: 'target名', mid: 'target名', ... }
        this.targetAssignments = {};
        for (const sceneId in this.defaults) {
            this.targetAssignments[sceneId] = {};
            this.bands.forEach(band => {
                this.targetAssignments[sceneId][band] = this.defaults[sceneId][band].target;
            });
        }
    }

    /** 指定シーンの選択可能パラメータ一覧を返す */
    getSceneParams(sceneId) {
        return this.sceneParams[sceneId] || [];
    }

    /** 指定シーンの現在のターゲット割り当てを返す */
    getTargetAssignment(sceneId, band) {
        if (!this.targetAssignments[sceneId]) return null;
        return this.targetAssignments[sceneId][band] || null;
    }

    /** 指定シーンの全ターゲット割り当てを返す */
    getTargetAssignments(sceneId) {
        return this.targetAssignments[sceneId] || null;
    }

    /** 指定シーンで音声帯域のターゲットを変更する */
    setTargetAssignment(sceneId, band, target) {
        if (!this.targetAssignments[sceneId]) return;
        if (!this.defaults[sceneId]) return;

        this.targetAssignments[sceneId][band] = target;
        this._recalculateBandRemapping(sceneId);
    }

    /** ターゲット変更に基づいてバンドリマッピングを再計算する */
    _recalculateBandRemapping(sceneId) {
        const assignments = this.targetAssignments[sceneId];
        const defaults = this.defaults[sceneId];
        if (!assignments || !defaults) return;

        // デフォルトのターゲット→バンド対応を作成
        const defaultTargetToBand = {};
        this.bands.forEach(band => {
            defaultTargetToBand[defaults[band].target] = band;
        });

        // 新しいリマッピングを計算
        // 各バンドスロットに対して: そのスロットのデフォルトターゲットを今どのバンドが担当しているかを見つける
        const remapping = {};
        this.bands.forEach(slot => {
            const defaultTarget = defaults[slot].target;
            // 現在の割り当てでこのターゲットを持っているバンドを見つける
            let sourceBand = slot;
            for (const band of this.bands) {
                if (assignments[band] === defaultTarget) {
                    sourceBand = band;
                    break;
                }
            }
            remapping[slot] = sourceBand;
        });

        this.bandRemapping[sceneId] = remapping;
    }

    /** 指定シーンのマッピング設定を取得 */
    getMapping(sceneId) {
        return this.mappings[sceneId] || null;
    }

    /** 指定シーンの特定パラメータの感度を設定 */
    setMapping(sceneId, param, value) {
        if (!this.mappings[sceneId]) return;
        this.mappings[sceneId][param] = value;
    }

    /** audioDataの各値にsensitivityを乗算し、リマッピングを適用した新しいオブジェクトを返す */
    applyMapping(sceneId, audioData) {
        const mapping = this.mappings[sceneId];
        if (!mapping) return audioData;

        const remap = this.bandRemapping[sceneId];

        // リマッピング: 各スロットに対して、指定された実際のバンドのデータを使う
        const bassSource   = remap ? remap.bass   : 'bass';
        const midSource    = remap ? remap.mid    : 'mid';
        const highSource   = remap ? remap.high   : 'high';
        const volumeSource = remap ? remap.volume : 'volume';

        // 感度は元のスロットに対して適用（スロットの感度スライダーがそのまま効く）
        const bassSens   = mapping.bass;
        const midSens    = mapping.mid;
        const highSens   = mapping.high;
        const volSens    = mapping.volume;

        return {
            ...audioData,
            bass:        audioData[bassSource]               * bassSens,
            mid:         audioData[midSource]                 * midSens,
            high:        audioData[highSource]                * highSens,
            volume:      audioData[volumeSource]              * volSens,
            bassNorm:    Math.min(1, audioData[bassSource + 'Norm']   * bassSens),
            midNorm:     Math.min(1, audioData[midSource + 'Norm']    * midSens),
            highNorm:    Math.min(1, audioData[highSource + 'Norm']   * highSens),
            volumeNorm:  Math.min(1, audioData[volumeSource + 'Norm'] * volSens),
            bassSmooth:  audioData[bassSource + 'Smooth']    * bassSens,
            midSmooth:   audioData[midSource + 'Smooth']     * midSens,
            highSmooth:  audioData[highSource + 'Smooth']    * highSens,
            volumeSmooth:audioData[volumeSource + 'Smooth']  * volSens,
        };
    }
}
