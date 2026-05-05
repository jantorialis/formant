import { compileString } from 'klattsch';

class KlattschEngine {
    constructor() {
        this.audioCtx = null;
        this.workletNode = null;
        this.isInitialized = false;
        this.resolvePlayback = null;
        this.stopTimeout = null;
    }

    async init() {
        if (this.isInitialized && this.audioCtx && this.audioCtx.state !== 'closed') return;
        
        if (this.audioCtx && this.audioCtx.state !== 'closed') {
            try {
                await this.audioCtx.close();
            } catch(e) {}
        }
        
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        await this.audioCtx.audioWorklet.addModule('https://esm.sh/klattsch/formant-worklet.js');
        this.workletNode = new AudioWorkletNode(this.audioCtx, 'formant-processor');
        this.workletNode.connect(this.audioCtx.destination);
        this.isInitialized = true;
        console.log('klattsch engine ready');
    }

    async speak(phonemeString) {
        await this.init();
        
        if (this.audioCtx.state === 'suspended') {
            await this.audioCtx.resume();
        }
        
        if (this.stopTimeout) {
            clearTimeout(this.stopTimeout);
            this.stopTimeout = null;
        }
        
        console.log('speaking:', phonemeString);
        const { schedule } = compileString(phonemeString);
        console.log('schedule entries:', schedule.length);
        
        if (!schedule.length) return;
        
        const lastEntry = schedule[schedule.length - 1];
        const totalMs = lastEntry.atMs + (lastEntry.transitionMs || 200) + 2000;
        
        const playbackPromise = new Promise((resolve) => {
            this.resolvePlayback = resolve;
            this.stopTimeout = setTimeout(() => {
                if (this.resolvePlayback) {
                    this.resolvePlayback();
                    this.resolvePlayback = null;
                }
                this.stopTimeout = null;
            }, totalMs);
        });
        
        this.workletNode.port.postMessage({ type: 'schedule', schedule });
        
        return playbackPromise;
    }

    stop() {
        if (this.stopTimeout) {
            clearTimeout(this.stopTimeout);
            this.stopTimeout = null;
        }
        
        if (this.workletNode) {
            try {
                this.workletNode.port.postMessage({ type: 'clear' });
            } catch(e) {}
        }
        
        if (this.audioCtx && this.audioCtx.state !== 'closed') {
            this.audioCtx.close();
            this.audioCtx = null;
            this.workletNode = null;
            this.isInitialized = false;
        }
        
        if (this.resolvePlayback) {
            this.resolvePlayback();
            this.resolvePlayback = null;
        }
        
        console.log('stopped - audio silenced');
    }
    
   async renderToBuffer(phonemeString) {
    await this.init();
    
    if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
    }

    const { schedule } = compileString(phonemeString);
    if (!schedule.length) return null;

    const lastEntry = schedule[schedule.length - 1];
    const totalMs = lastEntry.atMs + (lastEntry.transitionMs || 200) + 1000;
    const sr = this.audioCtx.sampleRate;
    const totalSamples = Math.ceil(sr * totalMs / 1000);

    const dest = this.audioCtx.createMediaStreamDestination();
    this.workletNode.connect(dest);

    const recordedChunks = [];
    const recorder = new MediaRecorder(dest.stream);
    recorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };

    recorder.start();
    this.workletNode.port.postMessage({ type: 'schedule', schedule });

    await new Promise(resolve => setTimeout(resolve, totalMs));
    recorder.stop();

    await new Promise(resolve => recorder.onstop = resolve);

    const blob = new Blob(recordedChunks, { type: 'audio/webm' });
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
    
    this.workletNode.disconnect(dest);
    this.workletNode.connect(this.audioCtx.destination);

    return audioBuffer;
    }
}

export default new KlattschEngine();