/* ================================================================
 * MIDIManager - Web MIDI API管理クラス
 *
 * LPD8等のMIDIコントローラーからパッド・ノブ入力を受け取る。
 * パッド: ノート36〜43（LPD8デフォルト）
 * ノブ: CC1〜8（LPD8デフォルト）
 * ================================================================ */
class MIDIManager {
    constructor() {
        this.midiAccess = null;
        this.selectedDevice = null;
        this.selectedDeviceId = null;
        this.padCallbacks = [];
        this.knobCallbacks = [];
        this.devices = [];
        this.onDeviceChange = null;
        this.onMessage = null;
    }

    /** Web MIDI APIでMIDIアクセスを要求する */
    async start() {
        if (!navigator.requestMIDIAccess) {
            console.warn('Web MIDI APIが利用できません');
            return false;
        }

        try {
            this.midiAccess = await navigator.requestMIDIAccess();
            this._updateDevices();

            this.midiAccess.onstatechange = (e) => {
                console.log(`MIDIデバイス ${e.port.name}: ${e.port.state}`);
                this._updateDevices();
                if (this.onDeviceChange) this.onDeviceChange(this.devices);
            };

            console.log('MIDI初期化完了');
            return true;
        } catch (err) {
            console.error('MIDIアクセス失敗:', err);
            return false;
        }
    }

    /** 接続中のデバイス一覧を更新する */
    _updateDevices() {
        this.devices = [];
        if (!this.midiAccess) return;

        this.midiAccess.inputs.forEach((input) => {
            this.devices.push({ id: input.id, name: input.name, input });
        });

        // 選択中のデバイスが切断された場合
        if (this.selectedDeviceId) {
            const stillExists = this.devices.find(d => d.id === this.selectedDeviceId);
            if (!stillExists) {
                this.selectedDevice = null;
                this.selectedDeviceId = null;
            }
        }

        // デバイスが1つだけなら自動選択
        if (!this.selectedDevice && this.devices.length === 1) {
            this.selectDevice(this.devices[0].id);
        }
    }

    /** 接続中のMIDIデバイス一覧を返す */
    getDevices() {
        return this.devices;
    }

    /** デバイスを選択する */
    selectDevice(deviceId) {
        if (this.selectedDevice) {
            this.selectedDevice.onmidimessage = null;
        }

        if (!deviceId) {
            this.selectedDevice = null;
            this.selectedDeviceId = null;
            return;
        }

        const device = this.devices.find(d => d.id === deviceId);
        if (!device) {
            this.selectedDevice = null;
            this.selectedDeviceId = null;
            return;
        }

        this.selectedDevice = device.input;
        this.selectedDeviceId = deviceId;
        this.selectedDevice.onmidimessage = (e) => this._handleMessage(e);
        console.log(`MIDIデバイス選択: ${device.name}`);
    }

    /** MIDIメッセージを解析する */
    _handleMessage(e) {
        const [status, data1, data2] = e.data;
        const type = status & 0xF0;

        // パッド（ノートオン: 0x90）
        if (type === 0x90) {
            const padNumber = data1 - 36 + 1;
            if (padNumber >= 1 && padNumber <= 8) {
                const velocity = data2;
                console.log(`MIDI パッド${padNumber}: velocity=${velocity}`);
                this.padCallbacks.forEach(cb => cb(padNumber, velocity));
                if (this.onMessage) this.onMessage({ type: 'pad', pad: padNumber, velocity });
            }
        }

        // ノブ（コントロールチェンジ: 0xB0）
        if (type === 0xB0) {
            const knobNumber = data1;
            if (knobNumber >= 1 && knobNumber <= 8) {
                const value = data2;
                console.log(`MIDI ノブ${knobNumber}: value=${value}`);
                this.knobCallbacks.forEach(cb => cb(knobNumber, value));
                if (this.onMessage) this.onMessage({ type: 'knob', knob: knobNumber, value });
            }
        }
    }

    /** パッド入力時のコールバックを登録する */
    onPad(callback) {
        this.padCallbacks.push(callback);
    }

    /** ノブ入力時のコールバックを登録する */
    onKnob(callback) {
        this.knobCallbacks.push(callback);
    }
}
