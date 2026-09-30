"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { actions as actionBank, knowledgeBase, scenarios } from "./tickets";

const STORAGE_KEY = "ithSimulator.v1";
const SETTINGS_KEY = "ithSimulator.settings";
const ranks = ["Helpdesk Intern", "Junior IT Support", "IT Support Technician", "Senior Helpdesk Technician", "System Support Specialist", "IT Administrator"];
const priorities = { LOW: 180, MEDIUM: 150, HIGH: 120, CRITICAL: 90 };
const reasons = ["Password reset", "Network issue resolved", "Hardware reconnected", "Application repaired", "User guidance provided", "Escalated"];
const initialProfile = { xp: 0, resolved: 0, failed: 0, seconds: 0, totalActions: 0, totalCorrect: 0, best: 0, highSat: 100, achievements: [], network: 0, security: 0, shifts: [] };
const fmt = seconds => {
  const safe = Math.max(0, Math.floor(seconds || 0));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
};
const shuffle = list => [...list].sort(() => Math.random() - 0.5);
const newTicket = (scenario, difficulty, arrival, index) => {
  const multiplier = { Easy: 1.3, Normal: 1, Hard: .78 }[difficulty];
  const seconds = Math.round(priorities[scenario.priority] * multiplier);
  return { ...scenario, id: `HD-${1042 + index}-${Math.floor(Math.random() * 90)}`, arrival, remaining: seconds, maxTime: seconds, elapsed: 0, status: "open", shown: arrival === 0, evidence: [], done: [], fixed: false, verified: false, feedback: "", log: arrival === 0 ? [{ time: "09:00", text: "Ticket opened" }] : [], penalty: 0, unnecessary: 0, hintUsed: false };
};

export default function Home() {
  const [profile, setProfile] = useState(initialProfile);
  const [settings, setSettings] = useState({ difficulty: "Normal", sound: true });
  const [ready, setReady] = useState(false);
  const [view, setView] = useState("dashboard");
  const [shift, setShift] = useState(0);
  const [tickets, setTickets] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [score, setScore] = useState(0);
  const [satisfaction, setSatisfaction] = useState(100);
  const [shiftXp, setShiftXp] = useState(0);
  const [elapsedShift, setElapsedShift] = useState(0);
  const [paused, setPaused] = useState(false);
  const [event, setEvent] = useState("");
  const [resolution, setResolution] = useState("");
  const [toast, setToast] = useState(null);
  const [summary, setSummary] = useState(false);
  const level = Math.min(6, Math.floor(profile.xp / 250) + 1);
  const selected = tickets.find(ticket => ticket.id === selectedId && ticket.status === "open" && ticket.shown) || null;
  const openCount = tickets.filter(ticket => ticket.status === "open").length;

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (stored) setProfile(current => ({ ...current, ...stored }));
      const prefs = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      if (prefs) setSettings(current => ({ ...current, ...prefs }));
    } catch { /* Start with a clean local profile if saved data is malformed. */ }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }, [profile, ready]);

  useEffect(() => {
    if (ready) localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings, ready]);

  useEffect(() => {
    if (!tickets.length || paused || summary) return;
    const timer = setInterval(() => {
      setElapsedShift(seconds => seconds + 1);
      setTickets(current => current.map(ticket => {
        if (ticket.status !== "open") return ticket;
        if (!ticket.shown && ticket.arrival <= elapsedShift + 1) {
          return { ...ticket, shown: true, remaining: ticket.remaining - 1, elapsed: ticket.elapsed + 1, log: [...ticket.log, { time: "09:00", text: "Ticket opened" }] };
        }
        if (!ticket.shown) return ticket;
        return { ...ticket, remaining: ticket.remaining - 1, elapsed: ticket.elapsed + 1 };
      }));
      setSatisfaction(value => Math.max(0, value - (elapsedShift > 45 && elapsedShift % 20 === 0 ? 1 : 0)));
    }, 1000);
    return () => clearInterval(timer);
  }, [tickets.length, paused, summary, ready, elapsedShift]);

  useEffect(() => {
    if (!tickets.length) return;
    if (!tickets.some(ticket => ticket.status === "open" && ticket.shown && ticket.remaining <= 0)) return;
    setTickets(current => current.map(ticket => ticket.status === "open" && ticket.shown && ticket.remaining <= 0
      ? { ...ticket, status: "failed", reason: "Time limit reached", log: [...ticket.log, { time: "09:00", text: "Ticket failed - time limit reached" }] }
      : ticket));
  }, [tickets]);

  useEffect(() => {
    if (!tickets.length || tickets.some(ticket => ticket.status === "open") || summary) return;
    const resolved = tickets.filter(ticket => ticket.status === "resolved").length;
    const failed = tickets.filter(ticket => ticket.status === "failed").length;
    const perfect = resolved === tickets.length;
    const noUnnecessary = tickets.every(ticket => ticket.unnecessary === 0);
    setProfile(current => {
      const achievements = new Set(current.achievements);
      if (perfect) achievements.add("perfect");
      if (noUnnecessary) achievements.add("noesc");
      const failedTickets = tickets.filter(ticket => ticket.status === "failed");
      const next = { ...current, failed: current.failed + failed,
        totalActions: current.totalActions + failedTickets.reduce((sum, ticket) => sum + ticket.done.length, 0),
        totalCorrect: current.totalCorrect + failedTickets.reduce((sum, ticket) => sum + Math.max(0, ticket.done.length - ticket.penalty), 0),
        best: Math.max(current.best, score), highSat: Math.max(current.highSat, satisfaction), shifts: [...current.shifts, { score, resolved }], achievements: [...achievements] };
      return next;
    });
    setSummary(true);
    setPaused(false);
  }, [tickets, summary, score, satisfaction]);

  const notify = useCallback((message, kind = "") => {
    setToast({ message, kind, key: Date.now() + Math.random() });
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  const startShift = () => {
    const difficulty = settings.difficulty;
    let pool = shuffle(scenarios);
    let linked = [];
    const nextEvent = Math.random() < .4 ? ["Network Outage", "Monday Morning Rush", "Security Alert"][Math.floor(Math.random() * 3)] : "";
    if (nextEvent === "Network Outage") linked = [scenarios[0], scenarios[2]];
    if (nextEvent === "Security Alert") linked = [scenarios[21], scenarios[22]];
    pool = pool.filter(item => !linked.includes(item));
    const queue = [...linked, ...pool].slice(0, 10).map((item, index) => newTicket(item, difficulty, index * (nextEvent === "Monday Morning Rush" ? 6 : 14), index));
    setShift(value => value + 1);
    setTickets(queue);
    setSelectedId(queue[0]?.id || null);
    setScore(0); setSatisfaction(100); setShiftXp(0); setElapsedShift(0);
    setPaused(false); setSummary(false); setEvent(nextEvent); setResolution(""); setView("dashboard");
    notify(`Shift started - ${nextEvent || "10 tickets in queue"}`, "success");
  };

  const appendLog = (ticket, text) => ({ ...ticket, log: [...ticket.log, { time: `09:${String(Math.floor(elapsedShift / 60) % 60).padStart(2, "0")}`, text }] });
  const ticketActions = useMemo(() => {
    if (!selected) return [];
    const list = (actionBank[selected.type] || []).filter(item => !selected.done.includes(item.name));
    if (selected.fixed && !selected.verified && !selected.done.includes("Verify service with user")) list.unshift({ name: "Verify service with user", group: "VERIFICATION", result: "The user confirms the original symptom is resolved after the change.", kind: "verify" });
    if (settings.difficulty !== "Easy" && selected.category !== "SECURITY") list.push({ name: "Restart router", group: "NETWORK", result: "This could interrupt other users; the current evidence does not point to a shared router fault.", kind: "wrong" });
    if (settings.difficulty === "Hard") list.push({ name: "Reinstall graphics driver", group: "SYSTEM", result: "Graphics drivers are unrelated to the reported symptoms.", kind: "wrong" }, { name: "Reset password", group: "ACCOUNT", result: "No account issue has been identified.", kind: "wrong" });
    return list;
  }, [selected, settings.difficulty]);

  const takeAction = item => {
    if (!selected || paused) return;
    let next = appendLog({ ...selected, done: [...selected.done, item.name] }, item.name);
    const kind = item.kind;
    if (["diag", "ip", "clue"].includes(kind)) {
      next.evidence = [...next.evidence, kind];
      setScore(value => value + 5);
      notify("+5 - Useful diagnostic evidence", "score");
    } else if (kind === "fix" || kind === "escalate") {
      if (!next.needs.every(evidence => next.evidence.includes(evidence))) {
        next.unnecessary += 1; next.penalty += 1;
        next.remaining = Math.max(0, next.remaining - 5);
        setScore(value => Math.max(0, value - 10)); setSatisfaction(value => Math.max(0, value - 4));
        next.feedback = "Gather enough diagnostic evidence before changing the system or escalating.";
        notify("-10 points - Gather evidence before changing the system", "error");
      } else if (next.fix === "escalate" && kind !== "escalate") {
        next.unnecessary += 1; next.penalty += 1; next.remaining = Math.max(0, next.remaining - 10);
        setScore(value => Math.max(0, value - 10)); setSatisfaction(value => Math.max(0, value - 8));
        next.feedback = "This incident requires escalation to the appropriate specialist team.";
        notify(next.feedback, "error");
      } else {
        next.fixed = true; setScore(value => value + 5);
        next = appendLog(next, kind === "escalate" ? "Escalated with diagnostic evidence" : "Corrective action completed");
        notify("+5 - Supported corrective action", "success");
      }
    } else if (kind === "verify") {
      next.verified = true; next.evidence = [...next.evidence, "verify"]; setScore(value => value + 5);
      next = appendLog(next, "Service verified with the user"); notify("+5 - Verification completed", "success");
    } else {
      next.unnecessary += 1; next.penalty += 1;
      next.remaining = Math.max(0, next.remaining - (kind === "verywrong" ? 10 : 5));
      setScore(value => Math.max(0, value - 10)); setSatisfaction(value => Math.max(0, value - (kind === "verywrong" ? 8 : 4)));
      next.feedback = item.result; next = appendLog(next, "Unhelpful action - time and satisfaction impact");
      notify("-10 points - " + item.result, "error");
    }
    next.feedback = next.feedback || item.result;
    setTickets(current => current.map(ticket => ticket.id === selected.id ? next : ticket));
  };

  const useHint = () => {
    if (!selected || selected.hintUsed) return;
    const next = appendLog({ ...selected, hintUsed: true, feedback: selected.hint }, "Hint used");
    setTickets(current => current.map(ticket => ticket.id === selected.id ? next : ticket));
    setScore(value => Math.max(0, value - 8)); notify("Hint used - 8 points");
  };

  const resolveTicket = () => {
    if (!selected) return;
    if (!resolution) return notify("Choose a resolution reason first.", "error");
    const valid = selected.fixed && selected.verified && selected.needs.every(item => selected.evidence.includes(item));
    if (!valid) return notify("Diagnosis incomplete. Gather evidence, apply a supported fix, then verify it.", "error");
    if (resolution !== selected.resolution) {
      setScore(value => Math.max(0, value - 75)); setSatisfaction(value => Math.max(0, value - 18));
      const wrong = appendLog({ ...selected, remaining: Math.max(0, selected.remaining - 10), penalty: selected.penalty + 1 }, "Incorrect resolution reason selected");
      wrong.feedback = "The selected resolution reason does not match the ticket.";
      setTickets(current => current.map(ticket => ticket.id === selected.id ? wrong : ticket));
      notify("Incorrect resolution reason - 75 points", "error"); return;
    }
    const speed = Math.min(100, Math.round(selected.remaining / selected.maxTime * 100));
    const reward = 100 + speed + Math.max(0, 30 - selected.unnecessary * 10 - selected.done.length * 2) + (selected.priority === "CRITICAL" ? 30 : 0);
    const xp = Math.round(priorities[selected.priority] * .6 + speed * .3);
    const resolved = appendLog({ ...selected, status: "resolved", reason: resolution, time: selected.elapsed, award: reward }, "Ticket resolved");
    setTickets(current => current.map(ticket => ticket.id === selected.id ? resolved : ticket));
    setScore(value => value + reward); setSatisfaction(value => Math.min(100, value + (selected.penalty ? 0 : 2))); setShiftXp(value => value + xp);
    setProfile(current => {
      const achievements = new Set(current.achievements); achievements.add("first");
      if (selected.elapsed < 30) achievements.add("quick");
      const network = current.network + (selected.category === "NETWORKING" ? 1 : 0);
      const security = current.security + (selected.category === "SECURITY" ? 1 : 0);
      if (network >= 10) achievements.add("network");
      if (security >= 5) achievements.add("security");
      return { ...current, xp: current.xp + xp, resolved: current.resolved + 1, seconds: current.seconds + selected.elapsed,
        totalActions: current.totalActions + selected.done.length, totalCorrect: current.totalCorrect + Math.max(0, selected.done.length - selected.penalty),
        network, security, achievements: [...achievements] };
    });
    notify(`Ticket resolved - +${reward} points - +${xp} XP`, "success");
    setResolution("");
    const nextTicket = tickets.find(ticket => ticket.status === "open" && ticket.shown && ticket.id !== selected.id) || tickets.find(ticket => ticket.status === "open" && ticket.id !== selected.id);
    setSelectedId(nextTicket?.id || null);
  };

  const activeTickets = tickets.filter(ticket => ticket.shown && ticket.status === "open");
  const grade = useMemo(() => {
    const resolved = tickets.filter(ticket => ticket.status === "resolved");
    const accuracy = tickets.reduce((sum, ticket) => sum + Math.max(0, ticket.done.length - ticket.penalty), 0) / Math.max(1, tickets.reduce((sum, ticket) => sum + ticket.done.length, 0));
    const speed = resolved.reduce((sum, ticket) => sum + ticket.remaining / ticket.maxTime, 0) / Math.max(1, resolved.length);
    const value = resolved.length / Math.max(1, tickets.length) * 35 + accuracy * 20 + satisfaction * .25 + speed * 20;
    return value >= 90 ? "S" : value >= 80 ? "A" : value >= 68 ? "B" : value >= 55 ? "C" : "D";
  }, [tickets, satisfaction]);

  useEffect(() => {
    const onKey = event => {
      if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
      if (event.key.toLowerCase() === "p" && tickets.length) setPaused(value => !value);
      if (event.key.toLowerCase() === "h") useHint();
      if (event.key.toLowerCase() === "r") resolveTicket();
      if (/^[1-9]$/.test(event.key) && ticketActions[Number(event.key) - 1]) takeAction(ticketActions[Number(event.key) - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const groupedActions = ticketActions.reduce((groups, item) => ({ ...groups, [item.group]: [...(groups[item.group] || []), item] }), {});
  const isReady = selected?.fixed && selected.verified && selected.needs.every(item => selected.evidence.includes(item));
  const chooseTicket = ticket => { setSelectedId(ticket.id); setResolution(""); };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">IT</span><div><strong>Service Desk</strong><small>SIMULATOR</small></div></div>
        <div className="shift-label">WORKSPACE</div>
        <nav>
          {[ ["dashboard","▦","Dashboard"], ["queue","▤","Ticket Queue"], ["resolved","✓","Resolved Tickets"], ["knowledge","◫","Knowledge Base"], ["performance","▥","Performance"] ].map(([key,icon,label]) =>
            <button key={key} className={`nav-item ${view === key ? "active" : ""}`} onClick={() => setView(key)}><span>{icon}</span>{label}{key === "queue" && <b>{openCount}</b>}</button>
          )}
        </nav>
        <div className="sidebar-bottom"><div className="level-badge"><span>TECHNICIAN LEVEL</span><strong>{level} · {ranks[level - 1]}</strong><div className="xp-track"><i style={{ width: `${profile.xp % 250 / 250 * 100}%` }} /></div><small>{profile.xp % 250} / 250 XP</small></div>
          <button className="sound-toggle" onClick={() => setSettings(value => ({ ...value, sound: !value.sound }))}>Sound <span>{settings.sound ? "On" : "Off"}</span></button>
        </div>
      </aside>
      <main className="main-shell">
        <header className="topbar"><div><div className="eyebrow">CURRENT SHIFT</div><strong>{shift ? `Shift ${shift} · Morning Desk` : "Ready to start · Morning Desk"}</strong></div>
          <div className="top-stats"><div><small>RESOLVED</small><strong>{tickets.filter(ticket => ticket.status === "resolved").length} / 10</strong></div><div><small>SCORE</small><strong>{score.toLocaleString()}</strong></div><div><small>SATISFACTION</small><strong>{Math.round(satisfaction)}%</strong></div><div><small>LEVEL</small><strong>{level}</strong></div></div>
          <button className="pause-button" onClick={() => tickets.length && setPaused(value => !value)}>{paused ? "Resume" : "Pause"}</button>
        </header>
        <section className="content">
          {view === "dashboard" && <>
            <div className="dashboard-heading"><div><h1>Helpdesk Dashboard</h1><p>Investigate, resolve, and verify incoming support requests.</p></div>
              <div className="head-controls"><label className="eyebrow">DIFFICULTY</label><select className="select-control" value={settings.difficulty} disabled={!!openCount} onChange={event => setSettings(value => ({ ...value, difficulty: event.target.value }))}><option>Easy</option><option>Normal</option><option>Hard</option></select>{(!tickets.length || openCount === 0) && <button className="primary" onClick={startShift}>Start Shift</button>}</div>
            </div>
            {event && <div className="event-banner"><strong>{event}</strong> · {event === "Network Outage" ? "Several network tickets share a DHCP issue." : event === "Security Alert" ? "Related phishing reports have arrived. Handle messages safely." : "Tickets are arriving quickly; prioritize clear diagnosis."}</div>}
            <div className="game-grid">
              <section className="panel ticket-panel"><div className="panel-header"><strong>Ticket inbox</strong><span>{activeTickets.length} active</span></div><div className="ticket-list">{activeTickets.map(ticket =>
                <button key={ticket.id} className={`ticket-row ${selectedId === ticket.id ? "selected" : ""}`} onClick={() => chooseTicket(ticket)}><div className="row-top"><span className="ticket-id">{ticket.id}</span><span className={`priority ${ticket.priority}`}>{ticket.priority}</span></div><p>{ticket.title}</p><div className="row-meta"><span>{ticket.user} · {ticket.department}</span><span>{fmt(ticket.remaining)}</span></div></button>
              )}{!activeTickets.length && <div className="empty-state"><p>{tickets.length ? "Inbox is clear." : "Start your shift to receive the first ticket."}</p>{tickets.length > 0 && openCount === 0 && <button className="primary" onClick={startShift}>Start New Shift</button>}</div>}</div></section>
              {selected ? <section className="panel ticket-detail"><div className="panel-header"><strong>Ticket details</strong><span className={`priority ${selected.priority}`}>{selected.priority}</span></div><div className="ticket-body">
                <div className="ticket-title-row"><div><div className="ticket-id-line">{selected.id} · {selected.category}</div><h2>{selected.title}</h2></div><div className={`timer ${selected.remaining < 25 ? "urgent" : ""}`}>{fmt(selected.remaining)}</div></div>
                <div className="ticket-person"><div className="avatar">{selected.user.split(" ").map(part => part[0]).slice(0,2).join("")}</div><div><div className="person-name">{selected.user}</div><div className="person-meta">{selected.department} · Requester</div></div></div>
                <div className="ticket-section"><div className="section-label">PROBLEM DESCRIPTION</div><div className="description">{selected.description}</div></div>
                <div className="ticket-section"><div className="section-label">DEVICE</div><span className="device-chip">{selected.device}</span></div>
                {selected.feedback && <div className="ticket-section"><div className="section-label">LATEST ACTION RESULT</div><div className="message-box">{selected.feedback}</div></div>}
                <div className="activity"><div className="section-label">ACTIVITY LOG</div>{selected.log.length ? <ul className="log-list">{[...selected.log].reverse().map((entry,index) => <li key={index}><time>{entry.time}</time><span>{entry.text}</span></li>)}</ul> : <div className="empty-log">Activity will appear here.</div>}</div>
              </div></section> : <section className="panel"><div className="empty-state"><h2>{tickets.length ? "Select an active ticket" : "Ready for the shift?"}</h2><p>Review symptoms, gather evidence, apply a supported fix, and verify the result.</p>{!tickets.length && <button className="primary" onClick={startShift}>Start Shift</button>}</div></section>}
              {selected ? <section className="panel actions-panel"><div className="panel-header"><strong>Troubleshooting</strong><span>{selected.done.length} actions</span></div><div className="action-panel-body">
                {!selected.hintUsed && <div className="hint-card"><strong>Need a nudge?</strong><p>Use one hint for this ticket. It costs 8 points.</p><button className="secondary" onClick={useHint}>Use hint <span className="shortcut">H</span></button></div>}
                {Object.entries(groupedActions).map(([group,items]) => <div className="action-group" key={group}><h3>{group}</h3><div className="action-list">{items.map((item,index) => <button className="action-btn" key={item.name} onClick={() => takeAction(item)} disabled={paused}><span>{item.name}</span><span className="shortcut">{index < 9 ? index + 1 : ""}</span></button>)}</div></div>)}
              </div><div className="resolution-box"><label htmlFor="resolution">RESOLUTION REASON</label><select id="resolution" value={resolution} onChange={event => setResolution(event.target.value)}><option value="">Select resolution...</option>{reasons.map(reason => <option key={reason}>{reason}</option>)}</select><button className="primary" onClick={resolveTicket} disabled={paused}>Resolve Ticket</button>{!isReady && <div className="notice">Gather evidence, apply a supported fix or escalation, then verify.</div>}</div></section> : <section className="panel actions-panel"><div className="panel-header"><strong>Troubleshooting</strong></div><div className="empty-state">Select an active ticket to begin.</div></section>}
            </div>
          </>}
          {view === "queue" && <><Heading title="Ticket Queue" subtitle="All requests in the current shift."/><DataTable headers={["TICKET","REQUEST","REQUESTER","PRIORITY","STATUS","TIME"]} rows={tickets.map(ticket => [ticket.id,ticket.title,`${ticket.user} · ${ticket.department}`,ticket.priority,ticket.status === "open" ? (ticket.shown ? "Open" : "Incoming") : ticket.status,ticket.status === "open" ? fmt(ticket.remaining) : "—"])}/></>}
          {view === "resolved" && <><Heading title="Resolved Tickets" subtitle="Completed and failed tickets from this shift."/><DataTable headers={["TICKET","ISSUE","REQUESTER","OUTCOME","TIME","ACTIVITY"]} rows={tickets.filter(ticket => ticket.status !== "open").map(ticket => [ticket.id,ticket.title,ticket.user,ticket.reason || "Failed",fmt(ticket.time ?? ticket.elapsed),`${ticket.log.length} entries`])}/></>}
          {view === "knowledge" && <><Heading title="Knowledge Base" subtitle="Practical checks for common support issues."/><div className="kb-grid">{knowledgeBase.map(([title,items]) => <article className="kb-card" key={title}><h3>{title}</h3><ul>{items.map(item => <li key={item}>{item}</li>)}</ul></article>)}</div></>}
          {view === "performance" && <><Heading title="Performance" subtitle="Career stats and achievements saved in this browser."/><div className="stat-grid">{[["TICKETS RESOLVED",profile.resolved],["TICKETS FAILED",profile.failed],["AVERAGE RESOLUTION",profile.resolved ? fmt(profile.seconds / profile.resolved) : "—"],["BEST SHIFT SCORE",profile.best],["HIGHEST SATISFACTION",profile.highSat+"%"],["CAREER ACCURACY",Math.round(profile.totalCorrect / Math.max(1,profile.totalActions) * 100)+"%"],["TECHNICIAN LEVEL",level],["CAREER XP",profile.xp]].map(([label,value]) => <div className="stat-card" key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>
            <div className="table-wrap"><div className="panel-header"><strong>Achievements</strong><span>{profile.achievements.length} / 6 unlocked</span></div><div className="achievement-list">{[["first","FIRST FIX","Resolve your first ticket."],["quick","QUICK FIX","Resolve a ticket under 30 seconds."],["perfect","PERFECT SHIFT","Resolve every ticket in a shift."],["network","NETWORK TECH","Resolve 10 networking issues."],["security","SECURITY AWARE","Handle 5 security tickets."],["noesc","NO ESCALATION NEEDED","Complete a shift without unnecessary actions."]].map(([id,name,description]) => <div className={`achievement ${profile.achievements.includes(id) ? "unlocked" : ""}`} key={id}><strong>{profile.achievements.includes(id) ? "✓ " : ""}{name}</strong><p>{description}</p></div>)}</div></div>
          </>}
        </section>
      </main>
      {toast && <div className="toast-region" aria-live="polite"><div className={`toast ${toast.kind}`}>{toast.message}</div></div>}
      {paused && <div className="paused-overlay"><div className="paused-card"><h2>Shift paused</h2><p>Ticket timers are stopped.</p><button className="primary" onClick={() => setPaused(false)}>Resume shift <span className="shortcut">P</span></button></div></div>}
      {summary && <div className="modal-backdrop"><div className="modal"><div className="modal-head"><small>SHIFT {shift} PERFORMANCE REPORT</small><h2>Shift complete</h2></div><div className="modal-content"><div className="summary-grade"><div className="grade-letter">{grade}</div><p><strong>Performance grade</strong><br/>Your shift report is ready.</p></div><div className="summary-stats">{[["TICKETS RESOLVED",tickets.filter(ticket=>ticket.status==="resolved").length+" / 10"],["TICKETS FAILED",tickets.filter(ticket=>ticket.status==="failed").length],["AVERAGE TIME",fmt(tickets.filter(ticket=>ticket.status==="resolved").reduce((sum,ticket)=>sum+ticket.elapsed,0)/Math.max(1,tickets.filter(ticket=>ticket.status==="resolved").length))],["ACCURACY",Math.round(tickets.reduce((sum,ticket)=>sum+Math.max(0,ticket.done.length-ticket.penalty),0)/Math.max(1,tickets.reduce((sum,ticket)=>sum+ticket.done.length,0))*100)+"%"],["SATISFACTION",Math.round(satisfaction)+"%"],["FINAL SCORE",score.toLocaleString()],["XP EARNED",shiftXp],["DIFFICULTY",settings.difficulty],["SHIFT EVENT",event||"Standard day"]].map(([label,value])=><div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div></div><div className="modal-actions"><button className="secondary" onClick={()=>{setSummary(false);setView("resolved")}}>Review Tickets</button><button className="primary" onClick={startShift}>Start New Shift</button></div></div></div>}
    </div>
  );
}

function Heading({ title, subtitle }) {
  return <div className="dashboard-heading"><div><h1>{title}</h1><p>{subtitle}</p></div></div>;
}
function DataTable({ headers, rows }) {
  return <div className="table-wrap"><table className="data-table"><thead><tr>{headers.map(header=><th key={header}>{header}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row,index)=><tr key={index}>{row.map((cell,i)=><td key={i}>{i===3 && ["LOW","MEDIUM","HIGH","CRITICAL"].includes(cell) ? <span className={`priority ${cell}`}>{cell}</span> : cell}</td>)}</tr>) : <tr><td colSpan={headers.length}>No tickets to display yet.</td></tr>}</tbody></table></div>;
}
