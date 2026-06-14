/* ================================================================
 * BinaryRainScene - バイナリレインシーン
 *
 * 文字がグリッド状に固定配置され、
 * 中心から外側に広がる波紋でopacityが変化する。
 * ================================================================ */
const BinaryRainScene = (() => {
    const COL_SPACING = 25;
    const ROW_SPACING = 30;

    let grid = [];
    let lastW = 0;
    let lastH = 0;
    let waveTime = 0;
    let curFontWeight = 200;
    let maxDist = 0;
    let currentFontFamily = "'Noto Serif JP', serif";

    // 固定グリッドを生成
    function initGrid(w, h) {
        grid = [];
        const cx = w / 2;
        const cy = h / 2;
        const cols = Math.ceil(w / COL_SPACING) + 1;
        const rows = Math.ceil(h / ROW_SPACING) + 1;
        maxDist = Math.sqrt(cx * cx + cy * cy);
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const x = col * COL_SPACING;
                const y = row * ROW_SPACING;
                const dx = x - cx;
                const dy = y - cy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const distNorm = Math.min(1, dist / maxDist);
                const sizeBase = mapRange(distNorm, 0, 1, 20, 10);
                grid.push({ x, y, dist, sizeBase });
            }
        }
    }

    return {
        id: 'binary_rain',
        label: 'BINARY RAIN',

        setup(canvas, ctx, text) {
            const w = canvas.width;
            const h = canvas.height;
            curFontWeight = 200;
            waveTime = 0;
            lastW = w; lastH = h;
            initGrid(w, h);
        },

        update(audioData, text, now) {
            if (this.fontFamily) currentFontFamily = this.fontFamily;
            const canvas = this._canvas;
            const ctx = this._ctx;
            const { volumeNorm, bassNorm, midNorm } = audioData;
            const w = canvas.width;
            const h = canvas.height;

            if (w !== lastW || h !== lastH) {
                initGrid(w, h);
                lastW = w; lastH = h;
            }

            // フォントウェイト: Mid → 200〜700
            const targetWeight = mapRange(midNorm, 0, 1, 200, 700);
            curFontWeight = lerp(curFontWeight, targetWeight, targetWeight > curFontWeight ? 0.04 : 0.02);

            // 波紋パラメータ: Bass → 速度・強さ・幅
            const waveSpeed = mapRange(bassNorm, 0, 1, 1.0, 4.5);
            const waveIntensity = 0.2 + bassNorm * 0.8;
            const waveWidth = 70 + bassNorm * 110;
            waveTime += waveSpeed;

            // 波紋リング半径
            const waveRadius = waveTime % (maxDist + waveWidth + 50);

            // 背景クリア
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, w, h);

            const displayText = text || 'SOUND';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#FFFFFF';

            grid.forEach((cell, i) => {
                const fontSize = Math.round(Math.min(26, cell.sizeBase + volumeNorm * 6));

                // 波紋による不透明度
                const d = Math.abs(cell.dist - waveRadius);
                const waveAlpha = d < waveWidth ? (1 - d / waveWidth) * waveIntensity : 0;
                const opacity = Math.min(1, 0.15 + waveAlpha);

                ctx.globalAlpha = opacity;
                ctx.font = `${Math.round(curFontWeight)} ${fontSize}px ${currentFontFamily}`;
                ctx.fillText(displayText[i % displayText.length], cell.x, cell.y);
            });

            ctx.globalAlpha = 1;
        },

        cleanup() {
            grid = [];
        },

        onBeat(audioData, now) {}
    };
})();
