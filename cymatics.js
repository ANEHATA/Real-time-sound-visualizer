/* ================================================================
 * CymaticsScene - キマティクスシーン
 *
 * 粒子が音に合わせて文字の形に集まる。
 * 静寂時は散乱、ビート時に外側へ弾かれる。
 * ================================================================ */
const CymaticsScene = (() => {
    const PARTICLE_COUNT = 1050;

    let particles = [];
    let textPixels = [];
    let lastText = '';
    let lastW = 0;
    let lastH = 0;
    let beatBoost = 0;
    let currentFontFamily = "'Noto Serif JP', serif";

    function sampleTextPixels(w, h, text) {
        const off = document.createElement('canvas');
        off.width = w;
        off.height = h;
        const oc = off.getContext('2d');
        const fs = Math.round(w * 0.18);
        oc.fillStyle = '#FFFFFF';
        oc.font = `400 ${fs}px ${currentFontFamily}`;
        oc.textAlign = 'center';
        oc.textBaseline = 'middle';
        oc.fillText(text, w / 2, h / 2);

        const idata = oc.getImageData(0, 0, w, h).data;
        const pixels = [];
        const step = 6;
        for (let y = 0; y < h; y += step) {
            for (let x = 0; x < w; x += step) {
                if (idata[(y * w + x) * 4 + 3] > 128) pixels.push({ x, y });
            }
        }
        // シャッフル
        for (let i = pixels.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pixels[i], pixels[j]] = [pixels[j], pixels[i]];
        }
        return pixels;
    }

    // 粒子をランダム位置で初期化
    function initParticles(w, h) {
        particles = [];
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            particles.push({
                x: Math.random() * w,
                y: Math.random() * h,
                rx: Math.random() * w,
                ry: Math.random() * h,
                tx: w / 2,
                ty: h / 2,
                r: 2 + Math.random() * 2,
                vx: 0,
                vy: 0,
            });
        }
    }

    // 各粒子にテキストのピクセル座標をターゲットとして割り当て
    function assignTargets() {
        if (textPixels.length === 0) return;
        particles.forEach((p, i) => {
            const px = textPixels[i % textPixels.length];
            p.tx = px.x + (Math.random() - 0.5) * 4;
            p.ty = px.y + (Math.random() - 0.5) * 4;
        });
    }

    return {
        id: 'cymatics',
        label: 'CYMATICS',

        setup(canvas, ctx, text) {
            const w = canvas.width, h = canvas.height;
            beatBoost = 0;
            initParticles(w, h);
            const displayText = text || 'SOUND';
            textPixels = sampleTextPixels(w, h, displayText);
            assignTargets();
            lastText = displayText;
            lastW = w; lastH = h;
        },

        update(audioData, text, now) {
            if (this.fontFamily) currentFontFamily = this.fontFamily;
            const canvas = this._canvas;
            const ctx = this._ctx;
            const { volumeNorm, bassNorm, midNorm, isBeat, isSilent } = audioData;
            const w = canvas.width, h = canvas.height;
            const displayText = text || 'SOUND';

            // テキスト変化時に再サンプリング
            if (displayText !== lastText) {
                textPixels = sampleTextPixels(w, h, displayText);
                assignTargets();
                lastText = displayText;
            }
            // リサイズ時に再初期化
            if (w !== lastW || h !== lastH) {
                initParticles(w, h);
                textPixels = sampleTextPixels(w, h, displayText);
                assignTargets();
                lastW = w; lastH = h;
            }

            // ビート: 各粒子を中心から外側に弾く
            if (isBeat) {
                beatBoost = 1;
                const cx = w / 2, cy = h / 2;
                particles.forEach(p => {
                    const dx = p.x - cx, dy = p.y - cy;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    p.vx = (dx / dist) * (12 + Math.random() * 18);
                    p.vy = (dy / dist) * (12 + Math.random() * 18);
                });
            }
            beatBoost = lerp(beatBoost, 0, 0.06);

            // 背景クリア
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, w, h);

            ctx.fillStyle = '#FFFFFF';
            particles.forEach(p => {
                // ビートブラスト速度を適用して減衰
                p.x += p.vx;
                p.y += p.vy;
                p.vx = lerp(p.vx, 0, 0.15);
                p.vy = lerp(p.vy, 0, 0.15);

                // Bassで微振動
                const buzz = 5 * bassNorm;
                const buzzX = (Math.random() - 0.5) * buzz;
                const buzzY = (Math.random() - 0.5) * buzz;

                if (!isSilent && volumeNorm > 0.05) {
                    // 音あり: テキスト座標にlerpで集まる
                    p.x = lerp(p.x, p.tx + buzzX, 0.08);
                    p.y = lerp(p.y, p.ty + buzzY, 0.08);
                } else {
                    // 静寂: ランダム位置にゆっくり戻る
                    p.x = lerp(p.x, p.rx + buzzX * 0.3, 0.002);
                    p.y = lerp(p.y, p.ry + buzzY * 0.3, 0.002);
                }

                // テキスト座標への距離に応じたopacity
                const dx = p.x - p.tx, dy = p.y - p.ty;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const proximityAlpha = Math.max(0.04, Math.min(1, 1 - dist / 90));

                ctx.globalAlpha = proximityAlpha;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fill();
            });

            ctx.globalAlpha = 1;
        },

        cleanup() {
            particles = [];
            textPixels = [];
        },

        onBeat(audioData, now) {}
    };
})();
