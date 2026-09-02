"use client";

import { ArrowRight, Check, Command, LockKeyhole, Mic, Monitor, Pause, PlugZap, ShieldCheck, Sparkles, WandSparkles } from "lucide-react";
import { FormEvent, useState } from "react";

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
  const [assistantName, setAssistantName] = useState("Wicked");
  const [accent, setAccent] = useState("cyan");

  function runCommand(event: FormEvent) {
    event.preventDefault();
    if (!command.trim()) return;
    setMode("thinking");
    setReply(`I understood: “${command.trim()}”`);
    setTimeout(() => {
      setReply("The secure action engine is the next capability.");
      setMode("ready");
    }, 900);
  }

  return (
    <main className={`shell accent-${accent}`}>
      <nav>
        <a className="brand" href="#home"><span><Command size={17} /></span>WickedOps</a>
        <div className="navlinks"><a href="#capabilities">Capabilities</a><a href="#personalize">Personalize</a><a href="#roadmap">Roadmap</a></div>
        <div className="founder">Founder preview</div>
      </nav>

      <section className="hero" id="home">
        <div className="copy">
          <div className="eyebrow"><i /> Personal AI, built around you</div>
          <h1>Your computer finally<br />speaks <em>your language.</em></h1>
          <p>Name it. Shape its personality. Connect your world. WickedOps turns natural conversation into useful action—with you in control.</p>
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
            <button type="button" className={mode === "listening" ? "active" : ""} onClick={() => {
              const listening = mode !== "listening";
              setMode(listening ? "listening" : "ready");
              setReply(listening ? "I’m listening. Live voice comes next." : "Listening paused.");
            }} aria-label="Toggle microphone">{mode === "listening" ? <Pause size={19} /> : <Mic size={19} />}</button>
            <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder={`Ask ${assistantName} anything…`} aria-label="Command" />
            <button type="submit" aria-label="Send command"><ArrowRight size={18} /></button>
          </form>
          <small>Interactive prototype · actions are not connected yet</small>
        </div>
      </section>

      <section className="examples"><span>Try saying</span>{examples.map((x) => <button key={x} onClick={() => setCommand(x)}>“{x}”</button>)}</section>

      <section className="section" id="capabilities">
        <header><span>More than a chatbot</span><h2>One conversation.<br />Your whole digital world.</h2><p>WickedOps is designed to understand what you mean, choose the right ability, and get the work done.</p></header>
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
            <div className="settings-head"><span>Assistant profile</span><b><Check size={13} /> Saved</b></div>
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
          <article className="current"><span>Now</span><b>Product foundation</b><p>Identity, console, safety model, and architecture.</p></article>
          <article><span>Next</span><b>Live voice</b><p>Natural speech, interruptions, answers, and wake phrase.</p></article>
          <article><span>Then</span><b>Windows companion</b><p>Secure control of apps, files, browser tasks, and PowerShell.</p></article>
          <article><span>Later</span><b>Your own WickedOps</b><p>Customer accounts, skills, personalization, and subscriptions.</p></article>
        </div>
      </section>

      <footer><a className="brand" href="#home"><span><Command size={17} /></span>WickedOps</a><p>Personal AI that acts with your permission.</p><small>Founder build · 2026</small></footer>
    </main>
  );
}
