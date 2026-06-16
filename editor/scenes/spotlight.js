/* ================================================================
 * SpotlightScene - 光源マスクシーン
 *
 * 暗闘の中で光源がゆっくり動き回り文字が浮かび上がる。
 * リサージュ曲線で光源を移動、テキストをマスクとして適用。
 * ================================================================ */
const SpotlightScene = (() => {
    // 光源定義（リサージュ曲線のパラメータと色温度）
    const LIGHT_DEFS = [
        {
            a: 3, b: 2,
            phaseOffset: 0,
            ampX: 0.38, ampY: 0.30,
            rgb: [255, 250, 235]
        },
        {
            a: 5, b: 4,
            phaseOffset: Math.PI * 0.72,
            ampX: 0.27, ampY: 0.24,
            rgb: [230, 242, 255]
        },
    ];

    let lightCanvas = null;
    let textCanvas = null;
    let curFontWeight = 100;
    let beatExpand = 0;
    let time = 0;
    let currentFontFamily = "'Noto Serif JP', serif";

    return {
        id: 'spotlight',
        label: 'SPOTLIGHT',

        setup(canvas, ctx, text) {
            lightCanvas = document.createElement('canvas');
            textCanvas = document.createElement('canvas');
            curFontWeight = 100;
            beatExpand = 0;
        },

        update(audioData, text, now) {
            if (this.fontFamily) currentFontFamily = this.fontFamily;
            const canvas = this._canvas;
            const ctx = this._ctx;
            const { volumeNorm, midNorm, highNorm, isBeat } = audioData;
            const w = canvas.width;
            const h = canvas.height;
            const cx = w / 2;
            const cy = h / 2;

            // リサイズ時にオフスクリーンを追従させる
            if (lightCanvas.width !== w || lightCanvas.height !== h) {
                lightCanvas.width = w; lightCanvas.height = h;
                textCanvas.width = w; textCanvas.height = h;
            }

            // ビート時に光源が一瞬広がる
            if (isBeat) beatExpand = 1;
            beatExpand = lerp(beatExpand, 0, 0.06);

            // フォントウェイト: midNorm → 100〜900
            const targetWeight = mapRange(midNorm, 0, 1, 100, 900);
            curFontWeight = lerp(curFontWeight, targetWeight, targetWeight > curFontWeight ? 0.04 : 0.02);

            // テキストをオフスクリーンに描画
            const tctx = textCanvas.getContext('2d');
            const fontSize = Math.round(w * 0.18);
            tctx.clearRect(0, 0, w, h);
            tctx.fillStyle = '#FFFFFF';
            tctx.font = `${Math.round(curFontWeight)} ${fontSize}px ${currentFontFamily}`;
            tctx.textAlign = 'center';
            tctx.textBaseline = 'middle';
            tctx.fillText(text || 'SOUND', cx, cy);

            // 光源の移動速度を midNorm に連動
            const moveSpeed = lerp(0.0003, 0.0018, midNorm);
            time += moveSpeed;

            // 光源キャンバスを更新
            const lctx = lightCanvas.getContext('2d');
            lctx.clearRect(0, 0, w, h);

            LIGHT_DEFS.forEach(def => {
                const lx = cx + w * def.ampX * Math.sin(def.a * time + def.phaseOffset);
                const ly = cy + h * def.ampY * Math.sin(def.b * time);

                // High が高いとき光源がちらつく
                const flicker = highNorm > 0.25 ? 1 + (Math.random() - 0.5) * highNorm * 0.22 : 1;

                const baseRadius = mapRange(volumeNorm, 0, 1, 80, 250);
                const radius = Math.max(1, baseRadius * flicker * (1 + beatExpand * 0.55));

                const brightness = mapRange(volumeNorm, 0, 1, 0.18, 1.0);

                const [r, g, b] = def.rgb;
                const grad = lctx.createRadialGradient(lx, ly, 0, lx, ly, radius);
                grad.addColorStop(0, `rgba(${r},${g},${b},${brightness.toFixed(3)})`);
                grad.addColorStop(0.35, `rgba(${r},${g},${b},${(brightness * 0.42).toFixed(3)})`);
                grad.addColorStop(1, 'rgba(0,0,0,0)');

                lctx.globalCompositeOperation = 'lighter';
                lctx.fillStyle = grad;
                lctx.fillRect(0, 0, w, h);
            });

            // テキスト形状をマスクとして適用
            lctx.globalCompositeOperation = 'destination-in';
            lctx.drawImage(textCanvas, 0, 0);
            lctx.globalCompositeOperation = 'source-over';

            // メインcanvasに描画
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(lightCanvas, 0, 0);
        },

        cleanup() {
            lightCanvas = null;
            textCanvas = null;
        },

        onBeat(audioData, now) {}
    };
})();
