"use client";

import { ArrowLeft, ArrowRight, Mic, Pause, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

type Mode = "ready" | "connecting" | "listening" | "thinking" | "speaking";
type IntelligenceMode = "sable" | "gpt" | "claude" | "grok" | "all" | "collaborate";

const intelligenceModes: Array<{ key: IntelligenceMode; label: string }> = [
  { key: "sable", label: "Sable" }, { key: "gpt", label: "GPT" }, { key: "claude", label: "Claude" },
  { key: "grok", label: "Grok" }, { key: "all", label: "Ask All" }, { key: "collaborate", label: "Collaborate" },
];

function intelligenceRequest(selected: IntelligenceMode, prompt: string) {
  if (selected === "all") return { mode: "all", prompt };
  if (selected === "collaborate") return { mode: "synth", prompt, providers: ["gpt", "claude", "grok"], synthesizer: "claude" };
  return { mode: "ask", provider: selected, prompt };
}
function intelligenceText(result: any) {
  if (typeof result?.text === "string") return result.text;
  if (Array.isArray(result)) return result.map((item) => `${item.label ?? item.provider}: ${item.text ?? item.error ?? "No response"}`).join("\n\n");
  return "The model completed the request but returned no displayable text.";
}

export default function AssistantConsole({ displayName }: { displayName: string }) {
  const [command, setCommand] = useState(""); const [mode, setMode] = useState<Mode>("ready");
  const [intelligenceMode, setIntelligenceMode] = useState<IntelligenceMode>("sable");
  const [reply, setReply] = useState("Whenever you’re ready."); const [error, setError] = useState(""); const [connected, setConnected] = useState(false);
  const peerRef = useRef<RTCPeerConnection | null>(null); const channelRef = useRef<RTCDataChannel | null>(null); const localStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null); const remoteAudioRef = useRef<HTMLAudioElement | null>(null); const animationRef = useRef<number | null>(null); const orbRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => () => disconnect(), []);

  function stopMeter() { if (animationRef.current) cancelAnimationFrame(animationRef.current); animationRef.current = null; if (orbRef.current) { orbRef.current.style.transform = "scale(1)"; orbRef.current.style.filter = ""; } }
  async function startPlayback(stream: MediaStream) {
    const audio = remoteAudioRef.current; if (audio) { audio.srcObject = stream; audio.volume = 1; await audio.play(); }
    const context = audioContextRef.current ?? new AudioContext(); if (context.state === "suspended") await context.resume(); audioContextRef.current = context;
    const analyser = context.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.72; context.createMediaStreamSource(stream).connect(analyser); const samples = new Uint8Array(analyser.frequencyBinCount);
    const measure = () => { analyser.getByteFrequencyData(samples); const average = samples.reduce((sum, value) => sum + value, 0) / samples.length / 255; const level = Math.min(1, average * 3.2); if (orbRef.current) { orbRef.current.style.transform = `scale(${1 + level * 0.28})`; orbRef.current.style.filter = `drop-shadow(0 0 ${30 + level * 95}px rgba(69, 230, 208, ${0.2 + level * 0.62}))`; } animationRef.current = requestAnimationFrame(measure); }; measure();
  }
  function disconnect() { stopMeter(); channelRef.current?.close(); peerRef.current?.close(); localStreamRef.current?.getTracks().forEach((track) => track.stop()); audioContextRef.current?.close(); if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null; channelRef.current = null; peerRef.current = null; localStreamRef.current = null; audioContextRef.current = null; setConnected(false); setMode("ready"); }

  async function callIntelligence(selected: IntelligenceMode, prompt: string) {
    const response = await fetch("/api/intelligence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(intelligenceRequest(selected, prompt)) });
    const result = await response.json(); if (!response.ok) throw new Error(result?.error || "Multi-model request failed."); return intelligenceText(result);
  }

  async function handleVoiceTool(message: any, dc: RTCDataChannel) {
    if (message.type !== "response.function_call_arguments.done" || message.name !== "ask_model") return false;
    let args: { mode?: IntelligenceMode; prompt?: string } = {};
    try { args = JSON.parse(message.arguments || "{}"); } catch { /* handled below */ }
    const selected = args.mode; const prompt = args.prompt?.trim();
    if (!selected || selected === "sable" || !prompt) {
      dc.send(JSON.stringify({ type: "conversation.item.create", item: { type: "function_call_output", call_id: message.call_id, output: JSON.stringify({ error: "Invalid ask_model arguments." }) } }));
      dc.send(JSON.stringify({ type: "response.create" })); return true;
    }
    setMode("thinking"); setReply(`Asking ${intelligenceModes.find((item) => item.key === selected)?.label ?? selected}…`);
    try {
      const text = await callIntelligence(selected, prompt); setReply(text);
      dc.send(JSON.stringify({ type: "conversation.item.create", item: { type: "function_call_output", call_id: message.call_id, output: JSON.stringify({ mode: selected, answer: text }) } }));
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : "Multi-model request failed."; setError(detail);
      dc.send(JSON.stringify({ type: "conversation.item.create", item: { type: "function_call_output", call_id: message.call_id, output: JSON.stringify({ mode: selected, error: detail }) } }));
    }
    dc.send(JSON.stringify({ type: "response.create", response: { instructions: "Use the tool output to answer the user naturally. Keep it concise and identify the model or multi-model mode used." } })); return true;
  }

  async function toggleVoice() {
    if (connected) { disconnect(); setReply("Voice session ended."); return; }
    setError(""); setMode("connecting"); setReply("Connecting securely…");
    try {
      const audioContext = new AudioContext(); await audioContext.resume(); audioContextRef.current = audioContext; const pc = new RTCPeerConnection(); peerRef.current = pc;
      pc.ontrack = (event) => { const stream = event.streams[0] ?? new MediaStream([event.track]); startPlayback(stream).catch(() => setError("Your browser blocked Sable's speaker. Tap the microphone once more.")); };
      const localStream = await navigator.mediaDevices.getUserMedia({ audio: true }); localStreamRef.current = localStream; pc.addTrack(localStream.getAudioTracks()[0]);
      const dc = pc.createDataChannel("oai-events"); channelRef.current = dc;
      dc.addEventListener("open", () => { setConnected(true); setMode("thinking"); setReply("Sable is joining you…"); dc.send(JSON.stringify({ type: "response.create", response: { instructions: "Greet Mark warmly in one short sentence and ask what he would like to do." } })); });
      dc.addEventListener("message", (event) => {
        const message = JSON.parse(event.data); handleVoiceTool(message, dc).catch((reason) => setError(reason instanceof Error ? reason.message : "Voice tool failed."));
        if (message.type === "input_audio_buffer.speech_started") { setMode("listening"); setReply("Listening…"); }
        if (message.type === "response.created") { setMode("thinking"); setReply("Thinking…"); }
        if (message.type === "response.output_audio.delta" || message.type === "response.audio.delta") setMode("speaking");
        if ((message.type === "response.output_audio_transcript.delta" || message.type === "response.audio_transcript.delta") && message.delta) setReply((current) => current === "Thinking…" || current === "I’m listening." ? message.delta : current + message.delta);
        if (message.type === "response.done") setMode("listening"); if (message.type === "error") { setError(message.error?.message || "Sable reported a voice error."); setMode("ready"); }
      });
      dc.addEventListener("close", () => disconnect()); const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
      const response = await fetch("/api/realtime/session", { method: "POST", headers: { "Content-Type": "application/sdp" }, body: offer.sdp }); if (!response.ok) throw new Error(await response.text()); await pc.setRemoteDescription({ type: "answer", sdp: await response.text() });
    } catch (reason) { disconnect(); setError(reason instanceof Error ? reason.message : "Could not start Sable."); setReply("Voice could not connect."); }
  }

  async function sendText(event: FormEvent) {
    event.preventDefault(); const text = command.trim(); if (!text) return; setError(""); setMode("thinking"); setReply("Thinking…"); setCommand("");
    if (intelligenceMode === "sable") { if (channelRef.current?.readyState !== "open") { setError("Start the voice session for Sable mode, or select GPT, Claude, Grok, Ask All, or Collaborate."); setMode("ready"); return; } channelRef.current.send(JSON.stringify({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text }] } })); channelRef.current.send(JSON.stringify({ type: "response.create" })); return; }
    try { setReply(await callIntelligence(intelligenceMode, text)); setMode(connected ? "listening" : "ready"); } catch (reason) { setError(reason instanceof Error ? reason.message : "Multi-model request failed."); setReply("The selected model could not complete the request."); setMode(connected ? "listening" : "ready"); }
  }

  return <main className="assistant-page"><header className="assistant-nav"><a href="/"><ArrowLeft size={17}/> Sable</a><div className="account-chip"><span>{displayName}</span><i/></div></header><section className="assistant-room"><audio ref={remoteAudioRef} autoPlay playsInline/><div className="assistant-grid"/><div className="assistant-orb-space"><div className={`account-orb-shell ${mode}`} ref={orbRef}><div className="account-orbit orbit-a"><i/></div><div className="account-orbit orbit-b"><i/></div><div className="account-orb"><div className="account-core"/><div className="account-scan"/><span className="wave-ring ring-one"/><span className="wave-ring ring-two"/></div></div></div><div className="assistant-identity"><span className={`presence ${connected ? "online" : ""}`}/><strong>Sable</strong><small>{mode}</small></div><p className="assistant-words" aria-live="polite">{reply}</p><div className="intelligence-modes" aria-label="AI mode">{intelligenceModes.map((item) => <button key={item.key} type="button" className={intelligenceMode === item.key ? "selected" : ""} onClick={() => setIntelligenceMode(item.key)}>{item.label}</button>)}</div><form className="assistant-command" onSubmit={sendText}><button type="button" className={connected ? "active" : ""} onClick={toggleVoice} aria-label={connected ? "End voice session" : "Start voice session"}>{connected ? <Pause size={20}/> : <Mic size={20}/>}</button><input value={command} onChange={(event) => setCommand(event.target.value)} placeholder={`Ask ${intelligenceModes.find((item) => item.key === intelligenceMode)?.label ?? "Sable"} anything…`} aria-label="Message Sable"/><button type="submit" aria-label="Send message"><ArrowRight size={19}/></button></form><div className={`assistant-note ${error ? "error" : ""}`}>{error || (connected ? "Live voice connected · say ‘ask Claude’, ‘ask all models’, or ‘collaborate’" : intelligenceMode === "sable" ? "Tap the microphone to begin" : `${intelligenceModes.find((item) => item.key === intelligenceMode)?.label} text mode ready`)}</div><div className="privacy-note"><ShieldCheck size={14}/> Private to your account</div></section></main>;
}
