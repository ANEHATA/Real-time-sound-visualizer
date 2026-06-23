/* ================================================================
 * CaptureManager - キャプチャ・フレーム生成・Cloudinary upload・QR表示
 * ================================================================ */
class CaptureManager {
    constructor() {
        this.container = document.getElementById('main-canvas-container');
        this.captureBtn = null;
        this.videoCaptureBtn = null;
        this.captureStatus = null;
        this._compositeAnimationId = null;
        this._isRecording = false;
        this._audioDestination = null;
    }

    /* 初期化：ボタンにイベントリスナーを接続 */
    init() {
        this.captureBtn = document.getElementById('captureBtn');
        this.videoCaptureBtn = document.getElementById('videoCaptureBtn');
        this.captureStatus = document.getElementById('captureStatus');
        if (this.captureBtn) {
            this.captureBtn.addEventListener('click', () => this.captureAndShare());
        }
        if (this.videoCaptureBtn) {
            this.videoCaptureBtn.addEventListener('click', () => this.startVideoCapture());
        }
    }

    /* ================================================================
     * フレーム付きCanvas生成
     * ================================================================ */
    generateFrameCanvas() {
        const srcW = this.container.clientWidth;
        const srcH = this.container.clientHeight;

        const outputW = Math.max(390, Math.min(1920, srcW));
        const scaleX = outputW / srcW;
        const visualH = Math.round(srcH * scaleX);

        const metaH = Math.round(visualH * 0.25);
        const totalH = visualH + metaH;

        const canvas = document.createElement('canvas');
        canvas.width = outputW;
        canvas.height = totalH;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, outputW, totalH);

        const canvases = [...this.container.querySelectorAll('canvas')];
        canvases.sort((a, b) =>
            (parseInt(a.style.zIndex) || 0) - (parseInt(b.style.zIndex) || 0)
        );

        canvases.forEach(c => {
            if (c.width > 0 && c.height > 0 && c.style.display !== 'none') {
                ctx.drawImage(c, 0, 0, outputW, visualH);
            }
        });

        this._drawMetadata(ctx, outputW, visualH, metaH);

        return canvas;
    }

    /* メタデータエリアを描画 */
    _drawMetadata(ctx, w, y, h) {
        const audioData = window.currentAudioData || {
            volume: 0, bass: 0, mid: 0, high: 0, flux: 0
        };

        const padding = Math.round(w * 0.05);
        const fontSize = Math.max(12, Math.round(w * 0.028));
        const lh = fontSize * 1.6;

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, y, w, h);

        ctx.fillStyle = '#ffffff';
        ctx.font = `300 ${fontSize}px 'Inter', sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        const lines = [
            `Volume ${Math.round(audioData.volume)}`,
            `Bass ${Math.round(audioData.bass)}`,
            `Mid ${Math.round(audioData.mid)}`,
            `High ${Math.round(audioData.high)}`,
            `Flux ${Math.round(audioData.flux)}`,
            this._formatDisplayDate(),
        ];

        let textY = y + padding;
        lines.forEach(line => {
            ctx.fillText(line, padding, textY);
            textY += lh;
        });

        const titleSize = Math.max(14, Math.round(w * 0.035));
        ctx.font = `700 ${titleSize}px 'Inter', sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText('SOUND TYPO', padding, y + h - padding);

        ctx.font = `300 ${fontSize}px 'Inter', sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText('Shimon Fukiura', w - padding, y + h - padding);
    }

    /* ================================================================
     * Cloudinaryアップロード
     * ================================================================ */
    async _uploadToCloudinary(base64ImageData, filename) {
        /* base64をBlobに変換 */
        const byteString = atob(base64ImageData);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: 'image/png' });

        /* FormDataでアップロード */
        const formData = new FormData();
        formData.append('file', blob, filename);
        formData.append('upload_preset', CAPTURE_CONFIG.uploadPreset);
        formData.append('public_id', `sound-typo/captures/${filename.replace('.png', '')}`);

        const response = await fetch(
            `https://api.cloudinary.com/v1_1/${CAPTURE_CONFIG.cloudName}/image/upload`,
            {
                method: 'POST',
                body: formData,
            }
        );

        if (!response.ok) throw new Error('Cloudinary upload failed');

        const data = await response.json();
        return data.secure_url;
    }

    /* ================================================================
     * QRコード表示
     * ================================================================ */
    _showQROverlay(url, filename) {
        const existing = document.getElementById('qr-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'qr-overlay';

        const card = document.createElement('div');
        card.className = 'qr-card';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'qr-close';
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', () => overlay.remove());

        const qrContainer = document.createElement('div');
        qrContainer.id = 'qr-code';

        const msg = document.createElement('p');
        msg.className = 'qr-message';
        msg.textContent = 'スマホで読み取ると画像をダウンロードできます';

        const fname = document.createElement('p');
        fname.className = 'qr-filename';
        fname.textContent = filename;

        card.appendChild(closeBtn);
        card.appendChild(qrContainer);
        card.appendChild(msg);
        card.appendChild(fname);
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        new QRCode(qrContainer, {
            text: url,
            width: 200,
            height: 200,
            colorDark: '#000000',
            colorLight: '#ffffff',
        });

        const escHandler = (e) => {
            if (e.key === 'Escape') {
                overlay.remove();
                window.removeEventListener('keydown', escHandler);
            }
        };
        window.addEventListener('keydown', escHandler);
    }

    /* CENTERシーンのDOMテキストをbgCanvasに一時描画 */
    _prepareCenterForCapture() {
        const scene = window.sceneManager?.getCurrentScene();
        if (!scene || scene.id !== 'center' || scene.drawCanvasText) return null;
        scene.drawCanvasText = true;
        if (scene.mainTextWrapper) scene.mainTextWrapper.style.visibility = 'hidden';
        const bgCanvas = this.container.querySelector('canvas');
        if (bgCanvas) {
            const bgCtx = bgCanvas.getContext('2d');
            bgCtx.fillStyle = '#0A0A0A';
            bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
            scene.update(window.currentAudioData || {}, scene.displayText, performance.now());
        }
        return scene;
    }

    _restoreCenterAfterCapture(scene) {
        if (!scene) return;
        scene.drawCanvasText = false;
        if (scene.mainTextWrapper) scene.mainTextWrapper.style.visibility = 'visible';
    }

    /* ================================================================
     * キャプチャ全体フロー
     * ================================================================ */
    async captureAndShare() {
        if (!this.captureBtn) return;

        this.captureBtn.textContent = '処理中...';
        this.captureBtn.disabled = true;
        if (this.captureStatus) this.captureStatus.textContent = '';

        try {
            const centerScene = this._prepareCenterForCapture();
            const canvas = this.generateFrameCanvas();
            this._restoreCenterAfterCapture(centerScene);
            const base64 = canvas.toDataURL('image/png').split(',')[1];
            const filename = this._formatFilename();

            if (this.captureStatus) this.captureStatus.textContent = 'アップロード中...';
            const imageUrl = await this._uploadToCloudinary(base64, filename);

            this._showQROverlay(imageUrl, filename);
            if (this.captureStatus) this.captureStatus.textContent = '';
        } catch (err) {
            console.error('キャプチャ失敗:', err);
            if (this.captureStatus) this.captureStatus.textContent = `エラー: ${err.message}`;
        }

        this.captureBtn.textContent = '📸 静止画キャプチャ';
        this.captureBtn.disabled = false;
    }

    /* ================================================================
     * 動画キャプチャ
     * ================================================================ */

    /* 合成用canvasを作成 */
    _createCompositeCanvas() {
        const srcW = this.container.clientWidth;
        const srcH = this.container.clientHeight;
        const outputW = Math.max(390, Math.min(1920, srcW));
        const scaleX = outputW / srcW;
        const visualH = Math.round(srcH * scaleX);
        const metaH = Math.round(visualH * 0.25);

        const canvas = document.createElement('canvas');
        canvas.width = outputW;
        canvas.height = visualH + metaH;
        return canvas;
    }

    /* 合成描画ループ：全レイヤーとメタデータを毎フレーム描画 */
    _startCompositeLoop(compositeCanvas) {
        const ctx = compositeCanvas.getContext('2d');
        const srcW = this.container.clientWidth;
        const srcH = this.container.clientHeight;
        const outputW = compositeCanvas.width;
        const scaleX = outputW / srcW;
        const visualH = Math.round(srcH * scaleX);
        const metaH = compositeCanvas.height - visualH;

        const draw = () => {
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, outputW, compositeCanvas.height);

            const canvases = [...this.container.querySelectorAll('canvas')];
            canvases.sort((a, b) =>
                (parseInt(a.style.zIndex) || 0) - (parseInt(b.style.zIndex) || 0)
            );
            canvases.forEach(c => {
                if (c.width > 0 && c.height > 0 && c.style.display !== 'none') {
                    ctx.drawImage(c, 0, 0, outputW, visualH);
                }
            });

            this._drawMetadata(ctx, outputW, visualH, metaH);

            this._compositeAnimationId = requestAnimationFrame(draw);
        };
        draw();
    }

    _stopCompositeLoop() {
        if (this._compositeAnimationId) {
            cancelAnimationFrame(this._compositeAnimationId);
            this._compositeAnimationId = null;
        }
    }

    /* 動画キャプチャ全体フロー */
    async startVideoCapture() {
        if (this._isRecording || !this.videoCaptureBtn) return;
        this._isRecording = true;

        const DURATION = 4000;
        const originalText = this.videoCaptureBtn.textContent;
        this.videoCaptureBtn.disabled = true;
        if (this.captureBtn) this.captureBtn.disabled = true;
        if (this.captureStatus) this.captureStatus.textContent = '';

        try {
            const compositeCanvas = this._createCompositeCanvas();
            const videoStream = compositeCanvas.captureStream(30);

            /* 音声ストリームの接続 */
            const combinedTracks = [...videoStream.getVideoTracks()];
            const analyzer = window.audioAnalyzer;
            if (analyzer && analyzer.source && analyzer.audioContext) {
                this._audioDestination = analyzer.audioContext.createMediaStreamDestination();
                analyzer.source.connect(this._audioDestination);
                combinedTracks.push(...this._audioDestination.stream.getAudioTracks());
            }

            const combinedStream = new MediaStream(combinedTracks);

            /* MediaRecorderのmimeType選定 */
            let mimeType = 'video/webm;codecs=vp9,opus';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'video/webm;codecs=vp8,opus';
            }
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'video/webm';
            }

            const recorder = new MediaRecorder(combinedStream, { mimeType });
            const chunks = [];
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            /* 合成描画ループ開始 */
            this._startCompositeLoop(compositeCanvas);

            /* カウントダウン表示 */
            let remaining = Math.ceil(DURATION / 1000);
            this.videoCaptureBtn.textContent = `🔴 録画中... (${remaining}秒)`;
            const countdownId = setInterval(() => {
                remaining--;
                if (remaining > 0) {
                    this.videoCaptureBtn.textContent = `🔴 録画中... (${remaining}秒)`;
                }
            }, 1000);

            /* 録画完了時の処理をPromiseで待つ */
            const videoUrl = await new Promise((resolve, reject) => {
                recorder.onstop = async () => {
                    clearInterval(countdownId);
                    this._stopCompositeLoop();
                    this._disconnectAudioDestination();

                    this.videoCaptureBtn.textContent = 'アップロード中...';
                    if (this.captureStatus) this.captureStatus.textContent = 'アップロード中...';

                    try {
                        const blob = new Blob(chunks, { type: mimeType });
                        const url = await this._uploadVideoToCloudinary(blob);
                        resolve(url);
                    } catch (err) {
                        reject(err);
                    }
                };

                recorder.start();

                setTimeout(() => {
                    if (recorder.state === 'recording') {
                        recorder.stop();
                    }
                }, DURATION);
            });

            const filename = this._formatVideoFilename();
            this._showQROverlay(videoUrl, filename);
            if (this.captureStatus) this.captureStatus.textContent = '';

        } catch (err) {
            console.error('動画キャプチャ失敗:', err);
            this._stopCompositeLoop();
            this._disconnectAudioDestination();
            if (this.captureStatus) this.captureStatus.textContent = `エラー: ${err.message}`;
        }

        this.videoCaptureBtn.textContent = originalText;
        this.videoCaptureBtn.disabled = false;
        if (this.captureBtn) this.captureBtn.disabled = false;
        this._isRecording = false;
    }

    /* 録音用destinationの切断 */
    _disconnectAudioDestination() {
        if (this._audioDestination && window.audioAnalyzer?.source) {
            try {
                window.audioAnalyzer.source.disconnect(this._audioDestination);
            } catch (_) { /* 既に切断済み */ }
        }
        this._audioDestination = null;
    }

    /* Cloudinaryへの動画アップロード */
    async _uploadVideoToCloudinary(blob) {
        const filename = this._formatVideoFilename();

        const formData = new FormData();
        formData.append('file', blob, filename);
        formData.append('upload_preset', CAPTURE_CONFIG.uploadPreset);
        formData.append('public_id', `sound-typo/captures/${filename.replace('.webm', '')}`);

        const response = await fetch(
            `https://api.cloudinary.com/v1_1/${CAPTURE_CONFIG.cloudName}/video/upload`,
            {
                method: 'POST',
                body: formData,
            }
        );

        if (!response.ok) throw new Error('Cloudinary video upload failed');

        const data = await response.json();
        return data.secure_url;
    }

    /* ================================================================
     * ユーティリティ
     * ================================================================ */
    _formatFilename() {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return `capture_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.png`;
    }

    _formatVideoFilename() {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return `capture_video_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.webm`;
    }

    _formatDisplayDate() {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}`;
    }
}
