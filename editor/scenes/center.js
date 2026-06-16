/* ================================================================
 * CenterScene - 中央テキストシーン
 *
 * 中央に1つのテキストを表示し、音声に反応して
 * font-weight, size, spacing, skew, dissolve, bubble 等が変化する。
 * ================================================================ */
const CenterScene = {
    id: 'center',
    label: 'CENTER',

    // キャンバス参照
    canvas: null,
    ctx: null,
    container: null,

    // DOM要素
    mainTextWrapper: null,
    textTransformEl: null,
    mainTextEl: null,
    ghostElements: [],
    blastWrapper: null,
    blastTransformEl: null,
    blastTextEl: null,

    // テキスト
    displayText: 'SOUND',
    charSpans: [],
    curCharY: [],
    charMultipliers: [],
    prevBass: 0,

    // elementエフェクト用のcanvasテキスト描画フラグ
    drawCanvasText: false,

    // フォント・スタイル状態
    curFontSize: 160,
    curFontWeight: 100,
    curLetterSpacing: 0.3,
    curOpacity: 0.25,
    curSkewX: 0,
    curScaleY: 1.0,
    curOutlineAmount: 0,

    // ビート反応
    curExpandScale: 1.0,
    curGlitchX: 0,
    curBeatLineBoost: 1.0,

    // 背景ライン
    curLineLength: 30,
    curLineOpacity: 0.03,

    // ゴースト残像
    curGhostOpacity: 0,
    styleHistory: [],

    // Dissolve
    curDissolvePhase: 0,
    dissolveDots: [],
    prevDissolveMode: false,
    dissolveParticles: [],

    // Bubble
    bubbles: [],
    bubbleTextDots: [],
    prevBubbleMode: false,
    MAX_BUBBLES: 40,

    // Blast
    isBlastActive: false,
    blastStartTime: 0,
    BLAST_DURATION: 300,

    /* ================================================================
     * ライフサイクル
     * ================================================================ */

    setup(canvas, ctx, text) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.container = canvas.parentElement;
        this.displayText = text || 'SOUND';

        this._createDOMElements();
        this._resetState();
        this._updateTextDisplay();
    },

    update(audioData, text, now) {
        if (text !== this.displayText) {
            this.displayText = text;
            this._updateTextDisplay();
        }

        this.curExpandScale = lerp(this.curExpandScale, 1.0, 0.1);
        this.curGlitchX = lerp(this.curGlitchX, 0, 0.25);
        this.curBeatLineBoost = lerp(this.curBeatLineBoost, 1.0, 0.3);

        this._updateCenter(audioData, now);
    },

    cleanup() {
        this.mainTextWrapper?.remove();
        this.blastWrapper?.remove();
        this.ghostElements.forEach(g => g.remove());
        this.ghostElements = [];
        this.mainTextWrapper = null;
        this.blastWrapper = null;
    },

    onBeat(audioData, now) {
        const sign = Math.random() < 0.5 ? 1 : -1;

        if (audioData.bassNorm > 0.75) {
            this.curExpandScale = 1.2;
            this.curGlitchX = sign * (20 + Math.random() * 20);
            this.curBeatLineBoost = 1.8;
            if (!this.isBlastActive) this._triggerBlast(now);
        } else if (audioData.bassNorm > 0.5) {
            this.curExpandScale = 1.2;
            this.curGlitchX = sign * (20 + Math.random() * 20);
            this.curBeatLineBoost = 1.8;
        } else {
            this.curExpandScale = Math.max(this.curExpandScale, 1.08);
            this.curGlitchX = sign * (10 + Math.random() * 15);
            this.curBeatLineBoost = Math.max(this.curBeatLineBoost, 1.8);
        }
    },

    /* ================================================================
     * 内部メソッド
     * ================================================================ */

    _resetState() {
        this.curFontSize = 160;
        this.curFontWeight = 100;
        this.curLetterSpacing = 0.3;
        this.curOpacity = 0.25;
        this.curSkewX = 0;
        this.curScaleY = 1.0;
        this.curOutlineAmount = 0;
        this.curExpandScale = 1.0;
        this.curGlitchX = 0;
        this.curBeatLineBoost = 1.0;
        this.curLineLength = 30;
        this.curLineOpacity = 0.03;
        this.curGhostOpacity = 0;
        this.styleHistory = [];
        this.curDissolvePhase = 0;
        this.dissolveDots = [];
        this.prevDissolveMode = false;
        this.dissolveParticles = [];
        this.bubbles = [];
        this.bubbleTextDots = [];
        this.prevBubbleMode = false;
        this.isBlastActive = false;
        this.prevBass = 0;
    },

    _createDOMElements() {
        this.mainTextWrapper = document.createElement('div');
        this.mainTextWrapper.id = 'mainTextWrapper';

        this.textTransformEl = document.createElement('div');
        this.textTransformEl.id = 'textTransform';

        this.mainTextEl = document.createElement('span');
        this.mainTextEl.id = 'mainText';

        this.textTransformEl.appendChild(this.mainTextEl);
        this.mainTextWrapper.appendChild(this.textTransformEl);
        this.container.appendChild(this.mainTextWrapper);
        this.mainTextWrapper.style.display = 'block';

        this.ghostElements = [];
        for (let i = 0; i < 3; i++) {
            const ghost = document.createElement('div');
            ghost.className = 'ghost-el';
            ghost.style.display = 'block';
            this.container.appendChild(ghost);
            this.ghostElements.push(ghost);
        }

        this.blastWrapper = document.createElement('div');
        this.blastWrapper.id = 'blastWrapper';

        this.blastTransformEl = document.createElement('div');
        this.blastTransformEl.id = 'blastTransform';

        this.blastTextEl = document.createElement('span');
        this.blastTextEl.id = 'blastText';
        this.blastTextEl.textContent = this.displayText;

        this.blastTransformEl.appendChild(this.blastTextEl);
        this.blastWrapper.appendChild(this.blastTransformEl);
        this.container.appendChild(this.blastWrapper);
    },

    _updateTextDisplay() {
        this.mainTextEl.innerHTML = [...this.displayText]
            .map(ch => `<span style="display:inline-block;">${ch}</span>`)
            .join('');
        this.charSpans = [...this.mainTextEl.querySelectorAll('span')];
        this.curCharY = new Array(this.charSpans.length).fill(0);
        this.charMultipliers = this.charSpans.map((_, i) =>
            (i % 2 === 0 ? 1 : -1) * (0.7 + Math.random() * 0.6)
        );
        this.ghostElements.forEach(g => g.textContent = this.displayText);
        this.blastTextEl.textContent = this.displayText;
        this.dissolveDots = [];
        this.bubbles = [];
        this.bubbleTextDots = [];
        this.dissolveParticles = [];
    },

    /* ================================================================
     * メイン更新処理
     * ================================================================ */

    _updateCenter(audioData, now) {
        const { bass, mid, high, volume } = audioData;
        const fontFamily = this.fontFamily || "'Noto Sans JP', sans-serif";

        // Blast処理
        if (this.isBlastActive) {
            const elapsed = now - this.blastStartTime;
            const t = Math.min(1, elapsed / this.BLAST_DURATION);
            if (t >= 1) {
                this.isBlastActive = false;
                this.blastWrapper.style.display = 'none';
            } else {
                this.blastTransformEl.style.transform =
                    `translate(-50%, -50%) scale(${(1.0 + 1.5 * t).toFixed(4)})`;
                this.blastTextEl.style.opacity = (1.0 - t).toFixed(4);
            }
        }

        // フォントサイズ: Bass → 160〜300px
        const tFontSize = mapRange(bass, 0, 200, 160, 300);
        this.curFontSize = lerp(this.curFontSize, tFontSize,
            tFontSize > this.curFontSize ? 0.25 : 0.06);

        // フォントウェイト: Mid → 100〜900
        const tFontWeight = mapRange(mid, 0, 175, 100, 900);
        this.curFontWeight = lerp(this.curFontWeight, tFontWeight,
            tFontWeight > this.curFontWeight ? 0.25 : 0.06);

        // 字間: Bass → 0.3〜-0.05em
        const tLetterSpacing = mapRange(bass, 0, 200, 0.3, -0.05);
        this.curLetterSpacing = lerp(this.curLetterSpacing, tLetterSpacing,
            tLetterSpacing < this.curLetterSpacing ? 0.25 : 0.06);

        // 透明度: Volume → 0.25〜1.0
        const tOpacity = mapRange(volume, 0, 70, 0.25, 1.0);
        this.curOpacity = lerp(this.curOpacity, tOpacity,
            tOpacity > this.curOpacity ? 0.25 : 0.06);

        // skewX: High → 0〜8deg
        const tSkewX = mapRange(high, 0, 60, 0, 8);
        this.curSkewX = lerp(this.curSkewX, tSkewX,
            tSkewX > this.curSkewX ? 0.25 : 0.06);

        // scaleY: High → 0.85〜1.2
        const tScaleY = mapRange(high, 0, 60, 0.85, 1.2);
        this.curScaleY = lerp(this.curScaleY, tScaleY,
            tScaleY > this.curScaleY ? 0.2 : 0.06);

        // 各文字のY方向個別変位
        const bassRising = bass >= this.prevBass;
        this.prevBass = bass;
        this.charSpans.forEach((span, i) => {
            const targetY = mapRange(bass, 0, 200, 0, 22) * this.charMultipliers[i];
            this.curCharY[i] = lerp(this.curCharY[i], targetY, bassRising ? 0.3 : 0.08);
            span.style.transform = `translateY(${this.curCharY[i].toFixed(2)}px)`;
        });

        // Highモード分岐
        const isBubbleMode = high > 25 && high <= 40;
        const isDissolveMode = high > 40;

        if (isDissolveMode) {
            if (!this.prevDissolveMode) { this._sampleDissolveDots(); this.bubbles = []; }
            const tDP = mapRange(high, 40, 70, 0, 1);
            this.curDissolvePhase = lerp(this.curDissolvePhase, tDP,
                tDP > this.curDissolvePhase ? 0.08 : 0.04);
            this.curGhostOpacity = lerp(this.curGhostOpacity, 0, 0.15);
            this.curOutlineAmount = lerp(this.curOutlineAmount, 0, 0.15);
        } else {
            this.curDissolvePhase = lerp(this.curDissolvePhase, 0, 0.04);
            this.curGhostOpacity = lerp(this.curGhostOpacity, 0, 0.05);
            this.curOutlineAmount = lerp(this.curOutlineAmount, 0, 0.08);
        }

        if (isBubbleMode && !this.prevBubbleMode) this._sampleBubbleTextDots();
        this.prevDissolveMode = isDissolveMode;
        this.prevBubbleMode = isBubbleMode;

        if (high > 30) this.mainTextEl.classList.add('shaking');
        else this.mainTextEl.classList.remove('shaking');

        // DOMスタイル適用
        this.mainTextEl.style.fontSize = this.curFontSize + 'px';
        this.mainTextEl.style.fontWeight = Math.round(this.curFontWeight);
        this.mainTextEl.style.letterSpacing = this.curLetterSpacing.toFixed(4) + 'em';
        this.mainTextEl.style.opacity =
            (this.curOpacity * (1 - this.curDissolvePhase)).toFixed(4);
        this.mainTextEl.style.color =
            `rgba(255,255,255,${(1 - this.curOutlineAmount).toFixed(3)})`;
        this.mainTextEl.style.webkitTextStroke =
            `${(this.curOutlineAmount * 2).toFixed(2)}px #FFFFFF`;

        this.textTransformEl.style.transform = [
            'translate(-50%, -50%)',
            `translateX(${this.curGlitchX.toFixed(2)}px)`,
            `skewX(${this.curSkewX.toFixed(2)}deg)`,
            `scaleY(${this.curScaleY.toFixed(4)})`,
            `scale(${this.curExpandScale.toFixed(4)})`
        ].join(' ');

        // Ghost残像
        this.styleHistory.push({
            fontSize: this.curFontSize, fontWeight: this.curFontWeight,
            letterSpacing: this.curLetterSpacing, scaleY: this.curScaleY,
            skewX: this.curSkewX, glitchX: this.curGlitchX
        });
        if (this.styleHistory.length > 18) this.styleHistory.shift();

        const GHOST_DELAYS = [3, 7, 13];
        const GHOST_BASE_OPA = [0.5, 0.28, 0.10];
        this.ghostElements.forEach((g, i) => {
            const hist = this.styleHistory[
                Math.max(0, this.styleHistory.length - 1 - GHOST_DELAYS[i])
            ];
            if (hist) {
                g.style.fontSize = hist.fontSize + 'px';
                g.style.fontWeight = Math.round(hist.fontWeight);
                g.style.letterSpacing = hist.letterSpacing.toFixed(4) + 'em';
                g.style.transform = [
                    'translate(-50%, -50%)',
                    `translateX(${hist.glitchX.toFixed(2)}px)`,
                    `skewX(${hist.skewX.toFixed(2)}deg)`,
                    `scaleY(${hist.scaleY.toFixed(4)})`
                ].join(' ');
            }
            g.style.opacity = (this.curGhostOpacity * GHOST_BASE_OPA[i]).toFixed(3);
            g.textContent = this.mainTextEl.textContent;
        });

        // bgCanvas描画
        const ctx = this.ctx;
        const W = this.canvas.width;
        const H = this.canvas.height;
        const cx = W / 2, cy = H / 2;

        // 放射状ライン（24本）
        const tLineLength = mapRange(bass, 0, 200, 30, 250);
        const tLineOpacity = mapRange(volume, 0, 70, 0.03, 0.18);
        this.curLineLength = lerp(this.curLineLength, tLineLength, 0.1);
        this.curLineOpacity = lerp(this.curLineOpacity, tLineOpacity, 0.1);
        const boostedLen = this.curLineLength * this.curBeatLineBoost;
        ctx.strokeStyle = `rgba(255,255,255,${this.curLineOpacity.toFixed(4)})`;
        ctx.lineWidth = 1;
        for (let i = 0; i < 24; i++) {
            const angle = (i / 24) * Math.PI * 2 - Math.PI / 2;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(angle) * boostedLen, cy + Math.sin(angle) * boostedLen);
            ctx.stroke();
        }

        // テキストをbgCanvasに描画（elementエフェクトがアクティブな場合のみ）
        if (this.drawCanvasText) {
            const text = this.mainTextEl.textContent || this.displayText;
            const fontSize = Math.round(this.curFontSize);
            const fontWeight = Math.round(this.curFontWeight);
            ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
            ctx.fillStyle = '#FFFFFF';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            ctx.globalAlpha = this.curOpacity * (1 - this.curDissolvePhase);

            const chars = [...text];
            const letterSpacingPx = this.curLetterSpacing * fontSize;
            const charWidths = chars.map(ch => ctx.measureText(ch).width);
            const totalWidth = charWidths.reduce((s, cw) => s + cw, 0) +
                letterSpacingPx * (chars.length - 1);

            let x = W / 2 - totalWidth / 2;
            const textY = H / 2;
            chars.forEach((ch, i) => {
                ctx.fillText(ch, x, textY);
                x += charWidths[i] + letterSpacingPx;
            });
            ctx.globalAlpha = 1;
        }

        // バブル（High 25〜40）
        if (isBubbleMode && this.bubbleTextDots.length > 0) {
            const spawnRate = mapRange(high, 25, 40, 0.3, 2.0);
            const spawnCount = Math.floor(spawnRate) + (Math.random() < (spawnRate % 1) ? 1 : 0);
            for (let s = 0; s < spawnCount && this.bubbles.length < this.MAX_BUBBLES; s++) {
                const dot = this.bubbleTextDots[
                    Math.floor(Math.random() * this.bubbleTextDots.length)
                ];
                this.bubbles.push({
                    x: dot.x + (Math.random() - 0.5) * 24,
                    y: dot.y + (Math.random() - 0.5) * 24,
                    r: 5 + Math.random() * (mapRange(high, 25, 40, 10, 30) - 5),
                    opacity: 0.5 + Math.random() * 0.5,
                    vy: -(0.3 + Math.random() * 0.8)
                });
            }
        }
        if (this.bubbles.length > 0) {
            ctx.lineWidth = 1;
            this.bubbles = this.bubbles.filter(b => {
                b.y += b.vy;
                b.opacity -= 0.007;
                if (b.opacity <= 0) return false;
                ctx.strokeStyle = `rgba(255,255,255,${b.opacity.toFixed(3)})`;
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
                ctx.stroke();
                return true;
            });
        }

        // Dissolveドット（High > 40）
        if (this.curDissolvePhase > 0.005 && this.dissolveDots.length > 0) {
            const showCount = Math.floor((1 - this.curDissolvePhase) * this.dissolveDots.length);
            ctx.fillStyle = '#FFFFFF';
            ctx.globalAlpha = this.curOpacity;
            for (let i = 0; i < showCount; i++) {
                ctx.fillRect(this.dissolveDots[i].x, this.dissolveDots[i].y, 2, 2);
            }
            ctx.globalAlpha = 1;
            if (isDissolveMode) {
                const speed = mapRange(high, 40, 80, 0.5, 4.0);
                const spawnCount = Math.floor(mapRange(high, 40, 80, 1, 8));
                for (let s = 0; s < spawnCount && this.dissolveParticles.length < 300; s++) {
                    const dot = this.dissolveDots[
                        Math.floor(Math.random() * this.dissolveDots.length)
                    ];
                    const dx = dot.x - cx, dy = dot.y - cy;
                    const d = Math.sqrt(dx * dx + dy * dy) || 1;
                    this.dissolveParticles.push({
                        x: dot.x, y: dot.y,
                        vx: (dx / d) * speed * (0.5 + Math.random()),
                        vy: (dy / d) * speed * (0.5 + Math.random()),
                        opacity: 0.7 + Math.random() * 0.3,
                        size: 1 + Math.random() * 2
                    });
                }
            }
        }
        if (this.dissolveParticles.length > 0) {
            ctx.fillStyle = '#FFFFFF';
            this.dissolveParticles = this.dissolveParticles.filter(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.opacity -= 0.012;
                if (p.opacity <= 0) return false;
                ctx.globalAlpha = p.opacity;
                ctx.fillRect(p.x, p.y, p.size, p.size);
                return true;
            });
            ctx.globalAlpha = 1;
        }
    },

    /* ================================================================
     * ヘルパー
     * ================================================================ */

    _sampleDissolveDots() {
        const W = this.canvas.width;
        const H = this.canvas.height;
        const fontFamily = this.fontFamily || "'Noto Sans JP', sans-serif";
        const off = document.createElement('canvas');
        off.width = W; off.height = H;
        const oc = off.getContext('2d');
        oc.fillStyle = '#FFFFFF';
        oc.font = `${Math.round(this.curFontWeight)} ${Math.round(this.curFontSize)}px ${fontFamily}`;
        oc.textAlign = 'center';
        oc.textBaseline = 'middle';
        oc.fillText(this.displayText, W / 2, H / 2);
        const idata = oc.getImageData(0, 0, W, H).data;
        const dots = [];
        for (let y = 0; y < H; y += 3) {
            for (let x = 0; x < W; x += 3) {
                if (idata[(y * W + x) * 4 + 3] > 128) dots.push({ x, y });
            }
        }
        for (let i = dots.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [dots[i], dots[j]] = [dots[j], dots[i]];
        }
        this.dissolveDots = dots;
    },

    _sampleBubbleTextDots() {
        const W = this.canvas.width;
        const H = this.canvas.height;
        const fontFamily = this.fontFamily || "'Noto Sans JP', sans-serif";
        const off = document.createElement('canvas');
        off.width = W; off.height = H;
        const oc = off.getContext('2d');
        oc.fillStyle = '#FFFFFF';
        oc.font = `${Math.round(this.curFontWeight)} ${Math.round(this.curFontSize)}px ${fontFamily}`;
        oc.textAlign = 'center';
        oc.textBaseline = 'middle';
        oc.fillText(this.displayText, W / 2, H / 2);
        const idata = oc.getImageData(0, 0, W, H).data;
        const dots = [];
        for (let y = 2; y < H - 2; y += 2) {
            for (let x = 2; x < W - 2; x += 2) {
                if (idata[(y * W + x) * 4 + 3] > 128) {
                    const nb = [
                        idata[((y - 2) * W + x) * 4 + 3],
                        idata[((y + 2) * W + x) * 4 + 3],
                        idata[(y * W + (x - 2)) * 4 + 3],
                        idata[(y * W + (x + 2)) * 4 + 3]
                    ];
                    if (nb.some(n => n < 64)) dots.push({ x, y });
                }
            }
        }
        this.bubbleTextDots = dots;
    },

    _triggerBlast(now) {
        this.isBlastActive = true;
        this.blastStartTime = now;
        this.blastTextEl.textContent = this.mainTextEl.textContent;
        this.blastTextEl.style.fontSize = this.curFontSize + 'px';
        this.blastTextEl.style.fontWeight = String(Math.round(this.curFontWeight));
        this.blastTextEl.style.letterSpacing = this.curLetterSpacing.toFixed(4) + 'em';
        this.blastTransformEl.style.transform = 'translate(-50%, -50%)';
        this.blastTextEl.style.opacity = '1';
        this.blastWrapper.style.display = 'block';
    },
};
