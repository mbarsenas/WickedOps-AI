"use client";

import { ArrowLeft, ArrowRight, Mic, Pause, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

type Mode = "ready" | "connecting" | "listening" | "thinking" | "speaking";

export default function AssistantConsole({ displayName }: { displayName: string }) {
  const [command, setCommand] = useState("");
  const [mode, setMode] = useState<Mode>("ready");
  const [reply, setReply] = useState("Whenever you’re ready.");
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);
  const orbRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => disconnect(), []);

  function stopMeter() {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    if (orbRef.current) {
      orbRef.current.style.transform = "scale(1)";
      orbRef.current.style.filter = "";
    }
  }

  function startMeter(stream: MediaStream) {
    const context = audioContextRef.current ?? new AudioContext();
    audioContextRef.current = context;
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.72;
    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    analyser.connect(context.destination);
    const samples = new Uint8Array(analyser.frequencyBinCount);

    const measure = () => {
      analyser.getByteFrequencyData(samples);
      const average = samples.reduce((sum, value) => sum + value, 0) / samples.length / 255;
      const level = Math.min(1, average * 3.2);
      if (orbRef.current) {
        orbRef.current.style.transform = `scale(${1 + level * 0.2})`;
        orbRef.current.style.filter = `drop-shadow(0 0 ${30 + level * 75}px rgba(69, 230, 208, ${0.2 + level * 0.5}))`;
      }
      animationRef.current = requestAnimationFrame(measure);
    };
    measure();
  }

  function disconnect() {
    stopMeter();
    channelRef.current?.close();
    peerRef.current?.close();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioContextRef.current?.close();
    channelRef.current = null;
    peerRef.current = null;
    localStreamRef.current = null;
    audioContextRef.current = null;
    setConnected(false);
    setMode("ready");
  }

  async function toggleVoice() {
    if (connected) {
      disconnect();
      setReply("Voice session ended.");
      return;
    }
    setError("");
    setMode("connecting");
    setReply("Connecting securely…");
    try {
      const audioContext = new AudioContext();
      await audioContext.resume();
      audioContextRef.current = audioContext;
      const pc = new RTCPeerConnection();
      peerRef.current = pc;
      pc.ontrack = (event) => startMeter(event.streams[0]);

      const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = localStream;
      pc.addTrack(localStream.getAudioTracks()[0]);

      const dc = pc.createDataChannel("oai-events");
      channelRef.current = dc;
      dc.addEventListener("open", () => {
        setConnected(true);
        setMode("listening");
        setReply("I’m listening.");
      });
      dc.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "input_audio_buffer.speech_started") {
          setMode("listening");
          setReply("Listening…");
        }
        if (message.type === "response.created") {
          setMode("thinking");
          setReply("Thinking…");
        }
        if (message.type === "response.output_audio.delta" || message.type === "response.audio.delta") {
          setMode("speaking");
        }
        if (
          (message.type === "response.output_audio_transcript.delta" ||
            message.type === "response.audio_transcript.delta") &&
          message.delta
        ) {
          setReply((current) =>
            current === "Thinking…" || current === "I’m listening."
              ? message.delta
              : current + message.delta,
          );
        }
        if (message.type === "response.done") {
          setMode("listening");
        }
        if (message.type === "error") {
          setError(message.error?.message || "Sable reported a voice error.");
          setMode("ready");
        }
      });
      dc.addEventListener("close", () => disconnect());

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const response = await fetch("/api/realtime/session", {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: offer.sdp,
      });
      if (!response.ok) throw new Error(await response.text());
      await pc.setRemoteDescription({ type: "answer", sdp: await response.text() });
    } catch (reason) {
      disconnect();
      setError(reason instanceof Error ? reason.message : "Could not start Sable.");
      setReply("Voice could not connect.");
    }
  }

  function sendText(event: FormEvent) {
    event.preventDefault();
    const text = command.trim();
    if (!text || channelRef.current?.readyState !== "open") {
      setError("Start the voice session before sending a message.");
      return;
    }
    setError("");
    setMode("thinking");
    setReply("Thinking…");
    channelRef.current.send(JSON.stringify({
      type: "conversation.item.create",
      item: { type: "message", role: "user", content: [{ type: "input_text", text }] },
    }));
    channelRef.current.send(JSON.stringify({ type: "response.create" }));
    setCommand("");
  }

  return (
    <main className="assistant-page">
      <header className="assistant-nav">
        <a href="/"><ArrowLeft size={17} /> Sable</a>
        <div className="account-chip"><span>{displayName}</span><i /></div>
      </header>

      <section className="assistant-room">
        <div className="assistant-grid" />
        <div className="assistant-orb-space">
          <div className={`account-orb-shell ${mode}`} ref={orbRef}>
            <div className="account-orbit orbit-a"><i /></div>
            <div className="account-orbit orbit-b"><i /></div>
            <div className="account-orb">
              <div className="account-core" />
              <div className="account-scan" />
              <span className="wave-ring ring-one" />
              <span className="wave-ring ring-two" />
            </div>
          </div>
        </div>

        <div className="assistant-identity">
          <span className={`presence ${connected ? "online" : ""}`} />
          <strong>Sable</strong>
          <small>{mode}</small>
        </div>
        <p className="assistant-words" aria-live="polite">{reply}</p>

        <form className="assistant-command" onSubmit={sendText}>
          <button type="button" className={connected ? "active" : ""} onClick={toggleVoice} aria-label={connected ? "End voice session" : "Start voice session"}>
            {connected ? <Pause size={20} /> : <Mic size={20} />}
          </button>
          <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Ask Sable anything…" aria-label="Message Sable" />
          <button type="submit" aria-label="Send message"><ArrowRight size={19} /></button>
        </form>
        <div className={`assistant-note ${error ? "error" : ""}`}>
          {error || (connected ? "Live voice connected · interrupt Sable naturally" : "Tap the microphone to begin")}
        </div>
        <div className="privacy-note"><ShieldCheck size={14} /> Private to your account</div>
      </section>
    </main>
  );
}
