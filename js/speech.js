/* ================================================================
 * SpeechInput - 音声認識クラス
 *
 * Web Speech APIを使用してリアルタイム音声認識を行う。
 * 認識されたテキストをコールバックで通知する。
 * 最後に認識された確定テキストを保持し続ける。
 * ================================================================ */
class SpeechInput {
    constructor() {
        this._recognition = null;
        this._active = false;
        this._currentText = '';
        this._language = 'ja-JP';
        this._callback = null;
        this.supported = false;

        // テキスト幅測定用オフスクリーンキャンバス
        this._measureCanvas = document.createElement('canvas');
        this._measureCtx = this._measureCanvas.getContext('2d');

        this._init();
    }

    _init() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            console.warn('Web Speech API 非対応');
            return;
        }
        this.supported = true;

        this._recognition = new SR();
        this._recognition.continuous = true;
        this._recognition.interimResults = true;
        this._recognition.lang = this._language;

        this._recognition.onresult = (e) => {
            let text = '';
            let isFinal = false;

            for (let i = e.resultIndex; i < e.results.length; i++) {
                text += e.results[i][0].transcript;
                if (e.results[i].isFinal) isFinal = true;
            }

            text = text.trim();
            if (!text) return;

            // 画面幅の80%を超えたら先頭から文字を削除
            text = this._trimToFit(text);

            this._currentText = text;

            if (this._callback) this._callback(this._currentText, isFinal);
        };

        this._recognition.onend = () => {
            // アクティブならば自動再起動
            if (this._active) {
                try {
                    this._recognition.start();
                } catch (err) {
                    // already started の場合は無視
                }
            }
        };

        this._recognition.onerror = (e) => {
            if (e.error === 'no-speech') return;
            if (e.error === 'aborted') return;
            console.error('SpeechRecognition error:', e.error);
        };
    }

    /** 音声認識を開始する */
    start() {
        if (!this.supported || !this._recognition) return false;
        if (this._active) return true;

        try {
            this._recognition.lang = this._language;
            this._recognition.start();
            this._active = true;
            console.log('SpeechInput started, lang:', this._language);
            return true;
        } catch (err) {
            console.error('SpeechRecognition start failed:', err);
            return false;
        }
    }

    /** 音声認識を停止する（最後のテキストは保持する） */
    stop() {
        if (!this._recognition) return;
        this._active = false;
        try {
            this._recognition.stop();
        } catch (err) {
            // 既に停止済みの場合は無視
        }
        console.log('SpeechInput stopped');
    }

    /** 認識中かどうかを返す */
    isActive() {
        return this._active;
    }

    /** 現在の認識テキストを返す */
    getText() {
        return this._currentText;
    }

    /** 認識言語を設定する */
    setLanguage(lang) {
        this._language = lang;
        if (this._recognition) {
            this._recognition.lang = lang;
        }
        // アクティブ中ならば再起動して言語を反映
        if (this._active) {
            try {
                this._recognition.stop();
            } catch (err) {
                // onendで自動再起動される
            }
        }
        console.log('SpeechInput language:', lang);
    }

    /** テキスト更新時のコールバックを登録する */
    onTextUpdate(callback) {
        this._callback = callback;
    }

    /** テキスト幅が画面幅の80%を超えたら先頭から削除する */
    _trimToFit(text) {
        const maxWidth = window.innerWidth * 0.8;
        this._measureCtx.font = "400 160px 'Noto Sans JP', sans-serif";

        const chars = [...text];
        let startIdx = 0;

        while (startIdx < chars.length - 1) {
            const sub = chars.slice(startIdx).join('');
            const width = this._measureCtx.measureText(sub).width;
            if (width <= maxWidth) break;
            startIdx++;
        }

        if (startIdx > 0) {
            return chars.slice(startIdx).join('');
        }
        return text;
    }
}
