"use client";

import { ArrowRight, Check, Command, LockKeyhole, Mic, Monitor, Pause, PlugZap, ShieldCheck, Sparkles, WandSparkles } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

const examples = [
  "Open Spotify and play my focus playlist",
  "Summarize the document on my screen",
  "Find a good Italian restaurant nearby",
  "Check my calendar for tomorrow",
];

export default function Home() {
  const [command, setCommand] = useState("");
  const [mode, setMode] = useState<"ready" | "listening" | "thinking">("ready");
  const [reply, setReply] = useState("Ready when you are, Mark.");
  const [assistantName, setAssistantName] = useState("Sable");
  const [accent, setAccent] = useState("cyan");
  const [connected, setConnected] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const saved =
      window.localStorage.getItem("sable-profile") ??
      window.localStorage.getItem("wickedops-profile");
    if (saved) {
      try {
        const profile = JSON.parse(saved) as { name?: string; accent?: string };
        if (profile.name && profile.name !== "Wicked") {
          setAssistantName(profile.name);
        } else {
          setAssistantName("Sable");
        }
        if (profile.accent) setAccent(profile.accent);
      } catch {
        window.localStorage.removeItem("sable-profile");
      }
    }
    return () => disconnectVoice();
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      "sable-profile",
      JSON.stringify({ name: assistantName, accent }),
    );
  }, [assistantName, accent]);

  function disconnectVoice() {
    channelRef.current?.close();
    peerRef.current?.close();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioRef.current) audioRef.current.srcObject = null;
    channelRef.current = null;
    peerRef.current = null;
    streamRef.current = null;
    setConnected(false);
    setMode("ready");
  }

  async function connectVoice() {
    if (connected) {
      disconnectVoice();
      setReply("Voice session ended.");
      return;
    }
    setVoiceError("");
    setMode("thinking");
    setReply("Connecting securely…");
    try {
      const pc = new RTCPeerConnection();
      peerRef.current = pc;
      const audio = new Audio();
      audio.autoplay = true;
      audioRef.current = audio;
      pc.ontrack = (event) => {
        audio.srcObject = event.streams[0];
      };

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      pc.addTrack(stream.getAudioTracks()[0]);

      const dc = pc.createDataChannel("oai-events");
      channelRef.current = dc;
      dc.addEventListener("open", () => {
        setConnected(true);
        setMode("listening");
        setReply(`${assistantName} is listening.`);
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
        if (message.type === "response.audio_transcript.delta" && message.delta) {
          setMode("ready");
          setReply((current) => current === "Thinking…" ? message.delta : current + message.delta);
        }
        if (message.type === "response.output_audio_transcript.delta" && message.delta) {
          setMode("ready");
          setReply((current) => current === "Thinking…" ? message.delta : current + message.delta);
        }
        if (message.type === "error") {
          setVoiceError(message.error?.message || "The voice session reported an error.");
          setMode("ready");
        }
      });
      dc.addEventListener("close", () => disconnectVoice());

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const response = await fetch("/api/realtime/session", {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: offer.sdp,
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Voice service is unavailable.");
      }
      await pc.setRemoteDescription({ type: "answer", sdp: await response.text() });
    } catch (error) {
      disconnectVoice();
      const message = error instanceof Error ? error.message : "Could not start voice.";
      setVoiceError(message);
      setReply("Voice could not connect.");
    }
  }

  function runCommand(event: FormEvent) {
    event.preventDefault();
    if (!command.trim()) return;
    if (!connected || channelRef.current?.readyState !== "open") {
      setVoiceError("Start the voice session before sending a command.");
      return;
    }
    setMode("thinking");
    setReply("Thinking…");
    channelRef.current.send(JSON.stringify({
      type: "conversation.item.create",
      item: { type: "message", role: "user", content: [{ type: "input_text", text: command.trim() }] },
    }));
    channelRef.current.send(JSON.stringify({ type: "response.create" }));
    setCommand("");
  }

  return (
    <main className={`shell accent-${accent}`}>
      <nav>
        <a className="brand" href="#home"><span><Command size={17} /></span>Sable</a>
        <div className="navlinks"><a href="#capabilities">Capabilities</a><a href="#personalize">Personalize</a><a href="#roadmap">Roadmap</a></div>
        <div className="founder">Founder preview</div>
      </nav>

      <section className="hero" id="home">
        <div className="copy">
          <div className="eyebrow"><i /> Personal AI, built around you</div>
          <h1>Your computer finally<br />speaks <em>your language.</em></h1>
          <p>Shape its personality. Connect your world. Sable turns natural conversation into useful action—with you in control.</p>
          <a className="cta" href="#console">Meet your assistant <ArrowRight size={18} /></a>
          <div className="trust"><span><Check size={15} /> Your assistant, your name</span><span><Check size={15} /> Approval before sensitive actions</span></div>
        </div>

        <div className="console" id="console">
          <div className="grid" />
          <div className={`orb-wrap ${mode}`}>
            <div className="orbit one"><b /></div><div className="orbit two"><b /></div>
            <div className="orb"><div className="core" /><div className="scan" /></div>
          </div>
          <div className="status"><i /> <strong>{assistantName}</strong><span>{mode}</span></div>
          <p className="reply" aria-live="polite">{reply}</p>
          <form onSubmit={runCommand}>
            <button type="button" className={connected ? "active" : ""} onClick={connectVoice} aria-label={connected ? "End voice session" : "Start voice session"}>{connected ? <Pause size={19} /> : <Mic size={19} />}</button>
            <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder={`Ask ${assistantName} anything…`} aria-label="Command" />
            <button type="submit" aria-label="Send command"><ArrowRight size={18} /></button>
          </form>
          <small className={voiceError ? "voice-error" : ""}>{voiceError || (connected ? "Live voice connected · tap pause to end" : "Tap the microphone to start live voice")}</small>
        </div>
      </section>

      <section className="examples"><span>Try saying</span>{examples.map((x) => <button key={x} onClick={() => setCommand(x)}>“{x}”</button>)}</section>

      <section className="section" id="capabilities">
        <header><span>More than a chatbot</span><h2>One conversation.<br />Your whole digital world.</h2><p>Sable is designed to understand what you mean, choose the right ability, and get the work done.</p></header>
        <div className="cards">
          {[
            [Monitor, "Computer control", "Apps, files, settings, and browser"],
            [Sparkles, "Natural conversation", "Ask, follow up, and think out loud"],
            [PlugZap, "Connected services", "Add the tools you already use"],
            [ShieldCheck, "You stay in control", "Approvals for sensitive actions"],
          ].map(([Icon, title, text], i) => {
            const C = Icon as typeof Monitor;
            return <article key={String(title)}><small>0{i + 1}</small><C size={22} /><h3>{String(title)}</h3><p>{String(text)}</p></article>;
          })}
        </div>
      </section>

      <section className="section personalize" id="personalize">
        <div className="personal-card">
          <div>
            <div className="eyebrow"><WandSparkles size={16} /> Make it yours</div>
            <h2>Not another assistant.<br /><em>Your</em> assistant.</h2>
            <p>Choose how it sounds, looks, remembers, and acts. Each customer gets a private assistant profile.</p>
            <ul><li><Sparkles size={17} /> Voice and personality</li><li><PlugZap size={17} /> Abilities and connected services</li><li><LockKeyhole size={17} /> Permission level for every action</li></ul>
          </div>
          <div className="settings">
            <div className="settings-head"><span>Assistant profile</span><b><Check size={13} /> Saved on this device</b></div>
            <label>Assistant name<input value={assistantName} onChange={(e) => setAssistantName(e.target.value || "Assistant")} /></label>
            <label>Orb color</label>
            <div className="colors">{["cyan","violet","amber"].map((c) => <button key={c} className={accent === c ? "selected" : ""} onClick={() => setAccent(c)}><i className={c} />{c}</button>)}</div>
            <div className="setting"><span>Personality</span><strong>Calm & capable</strong></div>
            <div className="setting"><span>Action mode</span><strong>Ask before sensitive actions</strong></div>
          </div>
        </div>
      </section>

      <section className="section roadmap" id="roadmap">
        <header><span>Building in the open</span><h2>From prototype to personal AI.</h2></header>
        <div className="steps">
          <article><span>Complete</span><b>Product foundation</b><p>Identity, console, safety model, and architecture.</p></article>
          <article className="current"><span>Now</span><b>Live voice</b><p>Natural speech, interruptions, answers, and text input.</p></article>
          <article><span>Then</span><b>Windows companion</b><p>Secure control of apps, files, browser tasks, and PowerShell.</p></article>
          <article><span>Later</span><b>Your own Sable</b><p>Customer accounts, skills, personalization, and subscriptions.</p></article>
        </div>
      </section>

      <footer><a className="brand" href="#home"><span><Command size={17} /></span>Sable</a><p>Personal AI that acts with your permission.</p><small>Founder build · 2026</small></footer>
    </main>
  );
}
