/* ================================================================
 * TileScene - グリッド状タイポグラフィシーン
 *
 * 1文字ずつグリッド状に敷き詰め、上スクロール。
 * ビート時にグリッチ表現（反転・逆さ・アウトライン）。
 * ================================================================ */
const TileScene = {
    id: 'tile',
    label: 'TILE',

    // 状態変数
    _offsetY: 0,
    _fontWeight: 100,
    _opacity: 0.4,
    _fontSize: 80,
    _beatPulseTime: 0,
    _cellSkews: {},
    _cellGlitch: {},
    _cellGlitchEnd: {},

    setup(canvas, ctx, text) {
        this._offsetY = 0;
        this._fontWeight = 100;
        this._opacity = 0.4;
        this._fontSize = 80;
        this._beatPulseTime = 0;
        this._cellSkews = {};
        this._cellGlitch = {};
        this._cellGlitchEnd = {};
    },

    update(audioData, text, now) {
        const canvas = this._canvas;
        const ctx = this._ctx;
        const { bass, mid, high, volume, isBeat } = audioData;

        // 上方向スクロール速度: Volumeに比例（最低値0.9）
        const speed = mapRange(volume, 0, 70, 0.9, 2.5);
        this._offsetY = (this._offsetY + speed * 0.5 + 100) % 100;

        // font-weight: Mid → 100〜900
        const tFontWeight = mapRange(mid, 0, 175, 100, 900);
        this._fontWeight = lerp(this._fontWeight, tFontWeight, 0.15);

        // font-size: Mid → 80〜96px
        const tFontSize = mapRange(mid, 0, 175, 80, 96);
        this._fontSize = lerp(this._fontSize, tFontSize, 0.15);

        // opacity: Volume → 0.4〜1.0
        const tOpacity = mapRange(volume, 0, 70, 0.4, 1.0);
        this._opacity = lerp(this._opacity, tOpacity, 0.1);

        // ビートパルス（0.95→1.05→1.0）
        const pulse = this._getBeatPulse(now);

        // scaleY: Bass → 0.8〜1.3
        const scaleY = mapRange(bass, 0, 200, 0.8, 1.3);

        const CELL_SIZE = 100;
        const cols = Math.ceil(canvas.width / CELL_SIZE) + 2;
        const rows = Math.ceil(canvas.height / CELL_SIZE) + 2;

        // High > 30 のとき一部のセルがランダムにskew
        if (high > 30) {
            const skewCount = Math.floor(Math.random() * 4) + 1;
            for (let i = 0; i < skewCount; i++) {
                const col = Math.floor(Math.random() * cols);
                const row = Math.floor(Math.random() * rows);
                this._cellSkews[`${col},${row}`] = (Math.random() - 0.5) * 30;
            }
        }
        for (const key in this._cellSkews) {
            this._cellSkews[key] *= 0.85;
            if (Math.abs(this._cellSkews[key]) < 0.1) delete this._cellSkews[key];
        }

        // グリッチ状態の期限切れをクリア
        for (const key in this._cellGlitch) {
            if (now >= this._cellGlitchEnd[key]) {
                delete this._cellGlitch[key];
                delete this._cellGlitchEnd[key];
            }
        }

        // ビート時に20〜30%のセルにランダムなグリッチを設定
        if (isBeat) {
            const totalCells = cols * rows;
            const ratio = 0.20 + Math.random() * 0.10;
            const glitchCount = Math.round(totalCells * ratio);
            for (let i = 0; i < glitchCount; i++) {
                const col = Math.floor(Math.random() * cols);
                const row = Math.floor(Math.random() * rows);
                const key = `${col},${row}`;
                this._cellGlitch[key] = Math.floor(Math.random() * 3) + 1;
                this._cellGlitchEnd[key] = now + 200 + Math.random() * 200;
            }
        }

        const characters = [...(text || 'SOUND')];

        ctx.globalAlpha = this._opacity;
        ctx.fillStyle = '#FFFFFF';
        const fontFamily = this.fontFamily || "'Noto Sans JP', sans-serif";
        ctx.font = `${Math.round(this._fontWeight)} ${Math.round(this._fontSize)}px ${fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const startX = -CELL_SIZE;
        const startY = -this._offsetY - CELL_SIZE;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const cellIndex = row * cols + col;
                const ch = characters[cellIndex % characters.length];
                const cellX = startX + col * CELL_SIZE + CELL_SIZE / 2;
                const cellY = startY + row * CELL_SIZE + CELL_SIZE / 2;
                const skew = this._cellSkews[`${col},${row}`] || 0;
                const glitchState = this._cellGlitch[`${col},${row}`] || 0;

                ctx.save();
                ctx.translate(cellX, cellY);
                ctx.scale(pulse, scaleY * pulse);
                if (Math.abs(skew) > 0.01) {
                    ctx.transform(1, 0, Math.tan(skew * Math.PI / 180), 1, 0, 0);
                }
                if (glitchState === 1) {
                    ctx.scale(-1, 1);
                    ctx.fillText(ch, 0, 0);
                } else if (glitchState === 2) {
                    ctx.scale(1, -1);
                    ctx.fillText(ch, 0, 0);
                } else if (glitchState === 3) {
                    ctx.strokeStyle = '#FFFFFF';
                    ctx.lineWidth = 1.5;
                    ctx.strokeText(ch, 0, 0);
                } else {
                    ctx.fillText(ch, 0, 0);
                }
                ctx.restore();
            }
        }

        ctx.globalAlpha = 1;
    },

    cleanup() {
        this._cellSkews = {};
        this._cellGlitch = {};
        this._cellGlitchEnd = {};
    },

    onBeat(audioData, now) {
        this._beatPulseTime = now;
    },

    // ビートパルスの計算（0.95→1.05→1.0）
    _getBeatPulse(now) {
        if (this._beatPulseTime === 0) return 1.0;
        const elapsed = now - this._beatPulseTime;
        if (elapsed < 100) return lerp(1.0, 0.95, elapsed / 100);
        if (elapsed < 200) return lerp(0.95, 1.05, (elapsed - 100) / 100);
        if (elapsed < 400) return lerp(1.05, 1.0, (elapsed - 200) / 200);
        return 1.0;
    }
};
