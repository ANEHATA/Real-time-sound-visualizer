/**
 * audio_analyzer.js
 * 全シーン共通の音声解析モジュール
 * Web Audio APIをラップし、RMS・帯域エネルギー・スペクトラルフラックス・ビート検出を提供する
 *
 * 使い方:
 *   const analyzer = new AudioAnalyzer();
 *   await analyzer.start();
 *
 *   function animate() {
 *     requestAnimationFrame(animate);
 *     analyzer.update();
 *     const data = analyzer.getData();
 *     // data.bassSmooth, data.isBeat などでビジュアルを更新
 *   }
 *   animate();
 */

class AudioAnalyzer {
  /**
   * @param {object} options
   * @param {number} [options.fftSize=2048]
   * @param {number} [options.smoothingTimeConstant=0.75]
   * @param {number} [options.beatThresholdMultiplier=2.5]  ビート検出感度（flux履歴平均の何倍を閾値とするか）
   * @param {number} [options.minBeatInterval=150]          ビート最小間隔(ms)
   */
  constructor(options = {}) {
    this.options = {
      fftSize:                  options.fftSize                  ?? 2048,
      smoothingTimeConstant:    options.smoothingTimeConstant    ?? 0.75,
      beatThresholdMultiplier:  options.beatThresholdMultiplier  ?? 2.5,
      minBeatInterval:          options.minBeatInterval          ?? 150,
    };

    // Web Audio API関連
    this.audioContext = null;
    this.analyser     = null;
    this.source       = null;
    this.stream       = null;

    // FFTデータバッファ（Uint8Array, 0〜255）
    this.dataArray     = null;
    this.prevDataArray = null;
    this.binCount      = 0;

    // スペクトラルフラックス履歴（過去30フレーム）
    this.fluxHistory    = [];
    this.maxFluxHistory = 30;

    // ビート検出タイミング管理
    this.lastBeatTime = 0;

    // lerp後の平滑化値（0〜1）
    this.smooth = {
      bass:   0,
      mid:    0,
      high:   0,
      volume: 0,
    };

    // 最新の解析データキャッシュ
    this.currentData = this._emptyData();

    this.isRunning = false;

    // デバッグログ用タイマー（1秒間隔制御）
    this._lastDebugLogTime = 0;
  }

  // ---- 公開API ----

  /** マイク入力を開始し、AudioContextとAnalyserNodeをセットアップする（StreamとContextは再利用） */
  async start() {
    try {
      // 既にStreamが存在し、トラックがactiveなら再利用する
      if (this.stream && this.stream.getAudioTracks().some(t => t.readyState === 'live')) {
        // AudioContextが閉じている場合のみ再作成
        if (!this.audioContext || this.audioContext.state === 'closed') {
          this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
        }
      } else {
        // getUserMediaが利用可能か確認
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('navigator.mediaDevices.getUserMedia が利用できません。HTTPS環境か localhost で実行してください。');
        }

        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
          video: false,
        });
        console.log('analyzer started with device:', this.stream.getAudioTracks()[0].label);

        if (!this.audioContext || this.audioContext.state === 'closed') {
          this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
        }
      }

      console.log('AudioContext 初期状態:', this.audioContext.state);

      // suspended状態のまま放置するとgetByteFrequencyDataが全て0になるためresumeする
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
        console.log('AudioContext resume 後:', this.audioContext.state);
      }

      // AnalyserNodeが未作成、またはAudioContextが新しくなった場合のみ作成
      if (!this.analyser) {
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = this.options.fftSize;
        this.analyser.smoothingTimeConstant = this.options.smoothingTimeConstant;
      }

      // sourceが未接続の場合のみ接続する
      if (!this.source) {
        this.source = this.audioContext.createMediaStreamSource(this.stream);
        this.source.connect(this.analyser);
      }

      this.binCount      = this.analyser.frequencyBinCount;
      this.dataArray     = new Uint8Array(this.binCount);
      this.prevDataArray = new Uint8Array(this.binCount);

      this.isRunning = true;

      // デバッグログ: 音声デバイス情報
      console.log('Audio device:', this.stream.getAudioTracks()[0].label);
      console.log('Sample rate:', this.audioContext.sampleRate);
      console.log('FFT size:', this.analyser.fftSize);
      console.log('Frequency bin count:', this.analyser.frequencyBinCount);
    } catch (err) {
      console.error('マイク入力の開始に失敗しました:', err);
      throw err;
    }
  }

  /** 音声解析を一時停止する（StreamとAudioContextは保持したまま） */
  stop() {
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    this.isRunning = false;
    this.currentData = this._emptyData();
  }

  /** StreamとAudioContextを完全に解放する */
  destroy() {
    this.stop();
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
    this.audioContext = null;
    this.analyser    = null;
  }

  /**
   * 毎フレーム呼ぶ（requestAnimationFrameから）
   * FFTデータを取得して全指標を計算し、currentDataを更新する
   */
  update() {
    if (!this.isRunning || !this.analyser) return;

    // FFT周波数データを取得（0〜255の整数）
    this.analyser.getByteFrequencyData(this.dataArray);

    // 帯域境界ビンを計算（サンプルレートに依存）
    const sampleRate = this.audioContext.sampleRate;
    const binHz      = (sampleRate / 2) / this.binCount; // 1ビンあたりのHz幅（約21.5Hz@44100Hz）
    const bassEnd    = Math.floor(200  / binHz);          // Bass 0〜200Hz
    const midEnd     = Math.floor(2000 / binHz);          // Mid 200〜2000Hz
    // High は midEnd〜binCount

    // RMS（volume）: sqrt( sum(bin²) / n )
    let sumSq = 0;
    for (let i = 0; i < this.binCount; i++) {
      sumSq += this.dataArray[i] * this.dataArray[i];
    }
    const volume = Math.sqrt(sumSq / this.binCount);
    // 実測値: 平均51.61 / P90=78.66 / 最大121.05（11曲実測値）

    // 帯域エネルギー: 各帯域ビンの平均（0〜255、実測最大は各帯域で異なる）
    const bass = this._bandAverage(0,       bassEnd);
    const mid  = this._bandAverage(bassEnd, midEnd);
    const high = this._bandAverage(midEnd,  this.binCount);

    // スペクトラルフラックス: 前フレームからの正方向変化量の合計
    let flux = 0;
    for (let i = 0; i < this.binCount; i++) {
      const diff = this.dataArray[i] - this.prevDataArray[i];
      if (diff > 0) flux += diff;
    }

    // フラックス履歴を更新
    this.fluxHistory.push(flux);
    if (this.fluxHistory.length > this.maxFluxHistory) this.fluxHistory.shift();

    // ビート検出: 現在のfluxが履歴平均のbeatThresholdMultiplier倍を超えたらビート
    const fluxMean      = this.fluxHistory.reduce((a, b) => a + b, 0) / this.fluxHistory.length;
    const beatThreshold = fluxMean * this.options.beatThresholdMultiplier;
    const now           = performance.now();
    const isBeat        = flux > beatThreshold
                       && flux > 0
                       && (now - this.lastBeatTime) > this.options.minBeatInterval;
    if (isBeat) this.lastBeatTime = now;

    // 正規化（P90値を1.0の基準とする、11曲実測値）
    const fluxNormalized = Math.min(1, flux / 3586.70);
    const beatStrength   = Math.min(1, flux / 3599);
    const bassNorm       = Math.min(1, bass   / 188.22);
    const midNorm        = Math.min(1, mid    / 134.89);
    const highNorm       = Math.min(1, high   /  52.88);
    const volumeNorm     = Math.min(1, volume /  78.66);

    // 盛り上がり・静寂・エネルギーレベル
    const isIntense = volume > 67.09;
    const isSilent  = volume < 7.74;
    let energyLevel = 1; // 通常
    if (isSilent)        energyLevel = 0;
    else if (volume > 100) energyLevel = 3;
    else if (isIntense)  energyLevel = 2;

    // lerp平滑化（上昇0.25 / 下降0.06）
    this.smooth.bass   = this._lerp(this.smooth.bass,   bassNorm,   bassNorm   > this.smooth.bass   ? 0.25 : 0.06);
    this.smooth.mid    = this._lerp(this.smooth.mid,    midNorm,    midNorm    > this.smooth.mid    ? 0.25 : 0.06);
    this.smooth.high   = this._lerp(this.smooth.high,   highNorm,   highNorm   > this.smooth.high   ? 0.25 : 0.06);
    this.smooth.volume = this._lerp(this.smooth.volume, volumeNorm, volumeNorm > this.smooth.volume ? 0.25 : 0.06);

    // 次フレームのフラックス計算用にFFTデータを保持
    this.prevDataArray.set(this.dataArray);

    // 解析結果を更新
    this.currentData = {
      // 基本値（実測値スケール）
      volume,
      bass,
      mid,
      high,

      // スペクトラルフラックス
      flux,
      fluxNormalized,

      // ビート検出
      isBeat,
      beatStrength,

      // 盛り上がり・静寂
      isIntense,
      isSilent,
      energyLevel,

      // 正規化済み（0〜1、ビジュアルマッピング用）
      bassNorm,
      midNorm,
      highNorm,
      volumeNorm,

      // lerp平滑化済み（0〜1）
      bassSmooth:   this.smooth.bass,
      midSmooth:    this.smooth.mid,
      highSmooth:   this.smooth.high,
      volumeSmooth: this.smooth.volume,
    };
  }

  /** 現在の解析データを返す（update()を呼んだ後に有効） */
  getData() {
    // デバッグログ: 1秒に1回FFTデータを出力
    const now = performance.now();
    if (this.dataArray && now - this._lastDebugLogTime >= 1000) {
      this._lastDebugLogTime = now;
      console.log('FFT bins [0-9]:', Array.from(this.dataArray.slice(0, 10)));
      console.log('FFT max:', Math.max(...this.dataArray));
    }
    return this.currentData;
  }

  /** FFT周波数データの生配列を返す（エフェクト用） */
  getFrequencyData() {
    if (!this.isRunning || !this.analyser) return null;
    return this.dataArray;
  }

  /** AnalyserNodeのgetByteFrequencyDataの生Uint8Arrayを返す（エフェクト用） */
  getRawFrequencyData() {
    if (!this.isRunning || !this.analyser) return null;
    return this.dataArray;
  }

  /** AnalyserNodeのgetByteTimeDomainDataの生Uint8Arrayを返す（エフェクト用） */
  getRawTimeDomainData() {
    if (!this.isRunning || !this.analyser) return null;
    const timeDomainData = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(timeDomainData);
    return timeDomainData;
  }

  // ---- プライベートメソッド ----

  /** 指定ビン範囲の平均値を返す（0〜255） */
  _bandAverage(startBin, endBin) {
    const count = endBin - startBin;
    if (count <= 0) return 0;
    let sum = 0;
    for (let i = startBin; i < endBin; i++) sum += this.dataArray[i];
    return sum / count;
  }

  /** 線形補間 */
  _lerp(current, target, factor) {
    return current + (target - current) * factor;
  }

  /** 初期状態のデータオブジェクトを生成 */
  _emptyData() {
    return {
      volume: 0, bass: 0, mid: 0, high: 0,
      flux: 0, fluxNormalized: 0,
      isBeat: false, beatStrength: 0,
      isIntense: false, isSilent: true, energyLevel: 0,
      bassNorm: 0, midNorm: 0, highNorm: 0, volumeNorm: 0,
      bassSmooth: 0, midSmooth: 0, highSmooth: 0, volumeSmooth: 0,
    };
  }
}

console.log('audio_analyzer loaded');
