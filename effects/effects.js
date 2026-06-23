/* ================================================================
 * effects.js - エフェクト定義
 *
 * 全シーン対応。
 * target: 'element' → シーンの描画結果（bgCanvas）にエフェクトを適用
 * target: 'screen'  → 画面全体に適用
 * 各エフェクトはsceneState.intensityで強度（0.0〜1.0）を受け取る
 * ================================================================ */

// Wエフェクト：グリッチスライスのキャッシュ
let _glitchSlices = [];
let _glitchUpdateTimer = 0;

const effects = [
    // Q: ハーフトーン（描画済みピクセルをドットパターンに変換）
    {
        id: 'halftone',
        label: 'Halftone',
        key: 'Q',
        target: 'element',
        apply(ctx, canvas, audioData, sceneState) {
            const srcCanvas = sceneState.sourceCanvas;
            if (!srcCanvas) return;
            const imgData = sceneState.sourceImageData;
            if (!imgData) return;
            const intensity = sceneState.intensity || 1.0;

            const spacing = 10;
            const maxDotSize = mapRange(audioData.volumeNorm, 0, 1, 1.5, spacing * 0.88) * intensity;
            const w = srcCanvas.width;
            const h = srcCanvas.height;

            ctx.fillStyle = '#FFFFFF';
            for (let y = 0; y < h; y += spacing) {
                for (let x = 0; x < w; x += spacing) {
                    const idx = (Math.floor(y) * w + Math.floor(x)) * 4;
                    const alpha = imgData.data[idx + 3] / 255;
                    if (alpha > 0.05) {
                        const r = alpha * maxDotSize;
                        ctx.beginPath();
                        ctx.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }
        },
        cleanup(ctx) {}
    },

    // W: グリッチ（水平スライスをX方向にランダムにずらす）
    {
        id: 'glitch',
        label: 'Glitch',
        key: 'W',
        target: 'element',
        apply(ctx, canvas, audioData, sceneState) {
            const srcCanvas = sceneState.sourceCanvas;
            if (!srcCanvas) return;
            const intensity = sceneState.intensity || 1.0;

            const now = performance.now();
            const glitchBeatBoost = sceneState.glitchBeatBoost || 0;

            // 50ms間隔でスライス定義を更新
            if (now - _glitchUpdateTimer > 50) {
                const maxShift = mapRange(audioData.bassNorm, 0, 1, 8, 40) * intensity * (1 + glitchBeatBoost * 1.5);
                _glitchSlices = [];
                let y = 0;
                const h = canvas.height;
                while (y < h) {
                    const sliceH = 8 + Math.floor(Math.random() * 35);
                    const shift = Math.random() < 0.28 ? (Math.random() - 0.5) * 2 * maxShift : 0;
                    _glitchSlices.push({ y, h: sliceH, shift });
                    y += sliceH;
                }
                _glitchUpdateTimer = now;
            }
            const w = canvas.width;
            _glitchSlices.forEach(s => {
                ctx.drawImage(srcCanvas, 0, s.y, w, s.h, s.shift, s.y, w, s.h);
            });
        },
        cleanup(ctx) {}
    },

    // E: ぼかし（blur強度を音量に連動）
    {
        id: 'blur',
        label: 'Blur',
        key: 'E',
        target: 'element',
        apply(ctx, canvas, audioData, sceneState) {
            const srcCanvas = sceneState.sourceCanvas;
            if (!srcCanvas) return;
            const intensity = sceneState.intensity || 1.0;

            const blurAmt = mapRange(audioData.volumeNorm, 0, 1, 2, 8) * intensity;
            ctx.save();
            ctx.filter = `blur(${blurAmt.toFixed(1)}px)`;
            ctx.drawImage(srcCanvas, 0, 0);
            ctx.restore();
        },
        cleanup(ctx) {}
    },

    // R: ドット分解（ピクセルをランダムな方向に散らばらせる）
    {
        id: 'dissolve',
        label: 'Dissolve',
        key: 'R',
        target: 'element',
        apply(ctx, canvas, audioData, sceneState) {
            const srcCanvas = sceneState.sourceCanvas;
            if (!srcCanvas) return;
            const imgData = sceneState.sourceImageData;
            if (!imgData) return;
            const intensity = sceneState.intensity || 1.0;

            const scatter = mapRange(audioData.volumeNorm, 0, 1, 5, 70) * intensity;
            const step = 5;
            const w = srcCanvas.width;
            const h = srcCanvas.height;
            let count = 0;
            const MAX_DOTS = 5000;

            ctx.fillStyle = '#FFFFFF';
            for (let y = 0; y < h && count < MAX_DOTS; y += step) {
                for (let x = 0; x < w && count < MAX_DOTS; x += step) {
                    const idx = (y * w + x) * 4;
                    if (imgData.data[idx + 3] > 64) {
                        const angle = Math.random() * Math.PI * 2;
                        const dist = Math.random() * scatter;
                        ctx.fillRect(
                            x + Math.cos(angle) * dist,
                            y + Math.sin(angle) * dist,
                            2, 2
                        );
                        count++;
                    }
                }
            }
        },
        cleanup(ctx) {}
    },

    // A: 歪み（sin波による水平スライスの横方向ずらし）
    {
        id: 'distortion',
        label: 'Distortion',
        key: 'A',
        target: 'element',
        apply(ctx, canvas, audioData, sceneState) {
            const srcCanvas = sceneState.sourceCanvas;
            if (!srcCanvas) return;
            const intensity = sceneState.intensity || 1.0;

            const now = performance.now();
            const amplitude = mapRange(audioData.volumeNorm, 0, 1, 2, 25) * intensity;
            const freq = 0.035;
            const speed = 0.0025;
            const w = canvas.width;
            const h = canvas.height;
            const sliceH = 4;

            for (let y = 0; y < h; y += sliceH) {
                const offsetX = Math.sin(y * freq + now * speed) * amplitude;
                ctx.drawImage(srcCanvas, 0, y, w, sliceH, offsetX, y, w, sliceH);
            }
        },
        cleanup(ctx) {}
    },

    // S: スキャンライン
    {
        id: 'scanline',
        label: 'Scanline',
        key: 'S',
        target: 'screen',
        apply(ctx, canvas, audioData, sceneState) {
            const intensity = sceneState.intensity || 1.0;
            const w = canvas.width;
            const h = canvas.height;
            const scanlineBeatBoost = sceneState.scanlineBeatBoost || 0;
            const lineH = Math.max(1, Math.round((1 + scanlineBeatBoost * 2) * intensity));
            const opacity = (0.15 + scanlineBeatBoost * 0.2) * intensity;
            ctx.fillStyle = `rgba(0,0,0,${opacity.toFixed(3)})`;
            for (let y = 2; y < h; y += 4) {
                ctx.fillRect(0, y, w, lineH);
            }
        },
        cleanup(ctx) {}
    },

    // D: グリッドオーバーレイ
    {
        id: 'grid',
        label: 'Grid',
        key: 'D',
        target: 'screen',
        apply(ctx, canvas, audioData, sceneState) {
            const intensity = sceneState.intensity || 1.0;
            const w = canvas.width;
            const h = canvas.height;
            const gridSize = 60;
            const now = performance.now();
            const bassDistort = audioData.bassNorm * 8;
            const opacity = (0.06 * intensity).toFixed(3);
            ctx.strokeStyle = `rgba(255,255,255,${opacity})`;
            ctx.lineWidth = 1;

            for (let x = 0; x <= w + gridSize; x += gridSize) {
                const distort = Math.sin((x * 0.04) + now * 0.0008) * bassDistort;
                ctx.beginPath();
                ctx.moveTo(x + distort, 0);
                ctx.lineTo(x + distort, h);
                ctx.stroke();
            }
            for (let y = 0; y <= h + gridSize; y += gridSize) {
                const distort = Math.sin((y * 0.04) + now * 0.0008) * bassDistort;
                ctx.beginPath();
                ctx.moveTo(0, y + distort);
                ctx.lineTo(w, y + distort);
                ctx.stroke();
            }
        },
        cleanup(ctx) {}
    },

    // F: ネガ反転（CSSフィルターで実装・intensityはEffectManagerで処理）
    {
        id: 'invert',
        label: 'Invert',
        key: 'F',
        target: 'screen',
        apply(ctx, canvas, audioData, sceneState) {},
        cleanup(ctx) {}
    },

    // G: ノイズテクスチャ
    {
        id: 'noise',
        label: 'Noise',
        key: 'G',
        target: 'screen',
        apply(ctx, canvas, audioData, sceneState) {
            const intensity = sceneState.intensity || 1.0;
            const w = canvas.width;
            const h = canvas.height;
            const density = mapRange(audioData.volumeNorm, 0, 1, 0.01, 0.06) * intensity;
            const count = Math.min(3000, Math.floor(w * h * density));
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            for (let i = 0; i < count; i++) {
                ctx.fillRect(
                    Math.floor(Math.random() * w),
                    Math.floor(Math.random() * h),
                    2, 2
                );
            }
        },
        cleanup(ctx) {}
    },

    // H: アナライザー波形（背景レイヤー・時間領域波形を左端から右端まで描画）
    {
        id: 'analyzer',
        label: 'Analyzer',
        key: 'H',
        target: 'background',
        apply(ctx, canvas, audioData, sceneState) {
            const freqData = sceneState.frequencyData;
            if (!freqData) return;

            const w = canvas.width;
            const h = canvas.height;
            const centerY = h / 2;
            const maxAmp = h * 0.35;

            const useBins = Math.floor(freqData.length / 2);
            const barWidth = 1.5;
            const totalBars = Math.floor(w / (barWidth + 0.5));

            ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';

            for (let i = 0; i < totalBars; i++) {
                // 各棒に対応するFFTビンを計算する
                // 中央に近いほど低周波（エネルギー大）、端に近いほど高周波（エネルギー小）
                // 中央からの距離を計算
                const centerPos = totalBars / 2;
                const distFromCenter = Math.abs(i - centerPos) / centerPos; // 0〜1

                // distFromCenterをFFTビンのインデックスにマッピング
                // 中央(0) → ビン0(低周波)、端(1) → ビンuseBins(高周波)
                const binIndex = Math.floor(distFromCenter * (useBins - 1));

                // 左右で異なるビンを参照して非対称にする
                // 左側は偶数フレームオフセット、右側は奇数フレームオフセット
                let actualBin;
                if (i < centerPos) {
                    actualBin = Math.min(binIndex * 2, useBins - 1);
                } else {
                    actualBin = Math.min(binIndex * 2 + 1, useBins - 1);
                }

                const amp = (freqData[actualBin] / 255) * maxAmp;

                // 端に近いほど振幅を少し減衰させて自然なフェードアウトにする
                const edgeFade = 1.0 - distFromCenter * 0.3;
                const finalAmp = amp * edgeFade;

                const x = i * (barWidth + 0.5);

                // 上側の棒
                ctx.fillRect(x, centerY - finalAmp, barWidth, finalAmp);
                // 下側の棒（ミラー）
                ctx.fillRect(x, centerY, barWidth, finalAmp);
            }
        },
        cleanup(ctx) {}
    },
];
