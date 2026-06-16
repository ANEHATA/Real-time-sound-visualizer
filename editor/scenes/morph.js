/* ================================================================
 * MorphScene - 縦棒パーティクルMORPHシーン
 *
 * 縦棒パーティクルが文字の形を保ちながら
 * ビートで崩れて戻る。
 * ================================================================ */
const MorphScene = {
    id: 'morph',
    label: 'MORPH',

    // 状態変数
    _particles: null,
    _lastText: '',
    _lastBeatApplied: 0,

    setup(canvas, ctx, text) {
        this._sampleTargets(canvas, text);
    },

    update(audioData, text, now) {
        const canvas = this._canvas;
        const ctx = this._ctx;

        if (!this._particles) return;

        // テキスト変更検出 → パーティクル再生成
        if (text !== this._lastText) {
            this._sampleTargets(canvas, text);
            if (!this._particles) return;
        }

        const t = now / 1000;
        const midNorm = audioData.midNorm ?? Math.min(1, (audioData.mid ?? 0) / 134.89);
        const volumeNorm = audioData.volumeNorm ?? Math.min(1, (audioData.volume ?? 0) / 78.66);
        const isBeat = audioData.isBeat ?? false;
        const beatStrength = audioData.beatStrength ?? 0;

        // 幅（Midに連動・ビート時にブースト）
        const baseWidth = 1 + midNorm * 1;
        const barWidth = baseWidth + beatStrength * 1;

        ctx.globalAlpha = 1;
        ctx.fillStyle = '#FFFFFF';
        ctx.globalAlpha = 0.85;

        // 400ms以上経過したビートのみ発動（間引き）
        const canApplyBeat = isBeat && (now - this._lastBeatApplied) >= 400;
        if (canApplyBeat) this._lastBeatApplied = now;

        for (const p of this._particles) {
            // ビートで各縦棒にランダム方向の瞬間的な力を加える
            if (canApplyBeat) {
                p.offsetY += beatStrength * 50 * p.randomDirection;
            }
            // 毎フレーム減衰
            p.offsetY *= 0.94;
            // 音量による常時の小さな揺らぎ
            p.offsetY += Math.sin(t * p.speed + p.randomPhase) * volumeNorm * 8;

            // 非対称クランプ（文字の中心から外側へ大きく・内側へ小さく）
            const maxOut = beatStrength * 50;
            const maxIn = beatStrength * 20;
            if (p.isAboveCenter) {
                p.offsetY = Math.max(-maxOut, Math.min(maxIn, p.offsetY));
            } else {
                p.offsetY = Math.max(-maxIn, Math.min(maxOut, p.offsetY));
            }

            // 縦棒描画（固定10px高さ）
            ctx.fillRect(
                Math.round(p.baseX - barWidth / 2),
                Math.round(p.baseY + p.offsetY - 5),
                Math.max(1, Math.round(barWidth)),
                10
            );
        }

        ctx.globalAlpha = 1;
    },

    cleanup() {
        this._particles = null;
        this._lastText = '';
    },

    onBeat(audioData, now) {},

    // テキストピクセルからパーティクルを生成
    _sampleTargets(canvas, text) {
        const rawText = text || 'SOUND';
        const off = document.createElement('canvas');
        off.width = canvas.width;
        off.height = canvas.height;
        const oc = off.getContext('2d');
        const fontSize = Math.round(canvas.width * 0.20);

        oc.fillStyle = '#000000';
        oc.fillRect(0, 0, off.width, off.height);
        oc.fillStyle = '#FFFFFF';
        const fontFamily = this.fontFamily || "'Noto Sans JP', sans-serif";
        oc.font = `900 ${fontSize}px ${fontFamily}`;
        oc.textAlign = 'center';
        oc.textBaseline = 'middle';
        oc.fillText(rawText, off.width / 2, off.height / 2);

        const idata = oc.getImageData(0, 0, off.width, off.height).data;
        const GRID = 6;
        const result = [];

        for (let x = 0; x < off.width; x += GRID) {
            for (let y = 0; y < off.height; y += GRID) {
                if (idata[(y * off.width + x) * 4] >= 128) {
                    result.push({
                        baseX: x,
                        baseY: y,
                        offsetY: 0,
                        speed: 2 + Math.random() * 4,
                        randomPhase: Math.random() * Math.PI,
                        randomDirection: Math.random() < 0.5 ? -1 : 1,
                    });
                }
            }
        }

        // 全縦棒のY座標の中央値を基準に上下判定
        const sortedY = result.map(p => p.baseY).sort((a, b) => a - b);
        const textCenterY = sortedY[Math.floor(sortedY.length / 2)];
        for (const p of result) {
            p.isAboveCenter = p.baseY < textCenterY;
        }

        this._particles = result;
        this._lastText = rawText;
    }
};
