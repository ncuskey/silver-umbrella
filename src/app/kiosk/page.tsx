"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";

function formatMMSS(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.max(0, totalSeconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function KioskPage() {
  const [student, setStudent] = useState("");
  const [minutes, setMinutes] = useState<number>(3);
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [prohibitPaste, setProhibitPaste] = useState(false);
  const [showTimer, setShowTimer] = useState(false);
  const [stage, setStage] = useState<"setup" | "writing" | "done">("setup");
  const [submitState, setSubmitState] = useState<"idle"|"submitting"|"success"|"error">('idle');
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const submittedRef = useRef(false);
  const startTimeRef = useRef<number | null>(null);
  const endTimeRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Derived
  const total = useMemo(() => Math.max(1, Math.floor(minutes * 60)), [minutes]);
  const elapsed = Math.max(0, total - remaining);
  const done = remaining <= 0 && (startTimeRef.current !== null || endTimeRef.current !== null);
  const words = useMemo(() => (text.trim() ? text.trim().split(/\s+/).length : 0), [text]);

  // Persist (simple localStorage)
  useEffect(() => {
    try {
      const payload = JSON.stringify({ student, minutes, text, running, remaining, prohibitPaste, showTimer });
      localStorage.setItem("kiosk.v1", payload);
    } catch {}
  }, [student, minutes, text, running, remaining, prohibitPaste, showTimer]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("kiosk.v1");
      if (raw) {
        const saved = JSON.parse(raw || "null");
        if (saved && typeof saved === "object") {
          if (typeof saved.student === "string") setStudent(saved.student);
          if (typeof saved.minutes === "number") setMinutes(saved.minutes);
          if (typeof saved.text === "string") setText(saved.text);
          if (typeof saved.remaining === "number") setRemaining(saved.remaining);
          if (typeof saved.prohibitPaste === "boolean") setProhibitPaste(saved.prohibitPaste);
          if (typeof saved.showTimer === "boolean") setShowTimer(saved.showTimer);
        }
      } else {
        setRemaining(Math.max(1, Math.floor(minutes * 60)));
      }
    } catch {
      setRemaining(Math.max(1, Math.floor(minutes * 60)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep remaining time in sync with duration if not started
  useEffect(() => {
    if (!running && startTimeRef.current === null) {
      setRemaining(Math.max(1, Math.floor(minutes * 60)));
    }
  }, [minutes, running]);

  // Timer loop
  useEffect(() => {
    if (!running) return;
    if (remaining <= 0) {
      setRunning(false);
      if (timerRef.current) window.clearInterval(timerRef.current);
      endTimeRef.current = Date.now();
      beep();
      setStage('done');
      try { document.body.dataset.kioskMode = ''; window.dispatchEvent(new Event('kioskmodechange')); } catch {}
      return;
    }
    timerRef.current = window.setInterval(() => {
      setRemaining((r) => (r > 0 ? r - 1 : 0));
    }, 1000) as unknown as number;
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [running, remaining]);

  // On done, submit to DB once
  useEffect(() => {
    if (stage !== 'done') return;
    if (submittedRef.current) return;
    submittedRef.current = true;
    (async () => {
      try {
        setSubmitState('submitting');
        const res = await fetch('/api/submissions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            student,
            text,
            durationSeconds: Math.max(1, Math.floor(minutes * 60)),
            startedAt: startTimeRef.current ? new Date(startTimeRef.current).toISOString() : null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'submit failed');
        setSubmissionId(data.id);
        setSubmitState('success');
      } catch (e) {
        console.error(e);
        setSubmitState('error');
      }
    })();
  }, [stage, minutes, student, text]);

  // Warn on navigation while running
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (running) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [running]);

  function startTimer() {
    if (running) return;
    const tot = Math.max(1, Math.floor(minutes * 60));
    setRemaining(tot);
    startTimeRef.current = Date.now();
    endTimeRef.current = null;
    setRunning(true);
  }

  function stopEarly() {
    setRunning(false);
    endTimeRef.current = Date.now();
    if (timerRef.current) window.clearInterval(timerRef.current);
    // finalize the session
    setRemaining(0);
  }

  function resetSession() {
    setRunning(false);
    endTimeRef.current = null;
    startTimeRef.current = null;
    setText("");
    setRemaining(Math.max(1, Math.floor(minutes * 60)));
    setStage('setup');
    try { document.body.dataset.kioskMode = ''; window.dispatchEvent(new Event('kioskmodechange')); } catch {}
  }

  function copyText() {
    try {
      navigator.clipboard.writeText(text);
    } catch {}
  }

  function downloadText() {
    const name = student?.trim() ? `-${student.trim().replace(/\s+/g, "_")}` : "";
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kiosk-writing${name}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function beep() {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = "sine"; o.frequency.value = 880;
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      o.start(); o.stop(ctx.currentTime + 0.4);
    } catch {}
  }

  // Setup screen (name + time)
  if (stage === 'setup') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-4 md:p-8">
        <div className="mx-auto w-full max-w-md">
          <Card>
            <CardHeader>
              <CardTitle>Start Kiosk Session</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm text-slate-700">Student Name</label>
                <Input value={student} onChange={(e) => setStudent(e.target.value)} placeholder="Optional" />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-700">Duration (minutes)</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={minutes}
                    onChange={(e) => setMinutes(Math.max(1, Math.floor(Number(e.target.value) || 0)))}
                    className="w-28"
                  />
                  <div className="flex flex-wrap gap-2">
                    {[1,3,5,10].map((m) => (
                      <button
                        key={m}
                        onClick={() => setMinutes(m)}
                        className={`px-2 py-1 rounded border text-sm ${minutes===m ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-300 hover:bg-slate-100'}`}
                      >
                        {m}m
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <input id="paste" type="checkbox" checked={prohibitPaste} onChange={(e) => setProhibitPaste(e.target.checked)} />
                <label htmlFor="paste">Prevent paste during writing</label>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <input id="timer" type="checkbox" checked={showTimer} onChange={(e) => setShowTimer(e.target.checked)} />
                <label htmlFor="timer">Show timer in writing view</label>
              </div>
              <div className="pt-2">
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => {
                    setText("");
                    setRemaining(Math.max(1, Math.floor(minutes * 60)));
                    startTimeRef.current = null;
                    endTimeRef.current = null;
                    setRunning(false);
                    setStage('writing');
                    try { document.body.dataset.kioskMode = 'writing'; window.dispatchEvent(new Event('kioskmodechange')); } catch {}
                    setTimeout(() => textareaRef.current?.focus(), 0);
                  }}
                >
                  Continue
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Writing screen (clean — only text area)
  if (stage === 'writing') {
    return (
      <div className="min-h-screen bg-white p-4 md:p-8">
        {showTimer && (
          <div className="fixed top-3 right-3 z-40 rounded-md bg-black/70 text-white px-2 py-1 font-mono text-sm tabular-nums select-none">
            {startTimeRef.current === null ? formatMMSS(Math.max(1, Math.floor(minutes * 60))) : formatMMSS(remaining)}
          </div>
        )}
        {submitState === 'success' && (
          <div className="fixed top-12 right-3 z-40 flex items-center gap-1 rounded-md bg-emerald-600 text-white px-2 py-1 text-sm shadow">
            <CheckCircle className="h-4 w-4" />
            <span>Submitted</span>
          </div>
        )}
        <div className="mx-auto w-full max-w-screen-lg">
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              const next = e.target.value;
              if (!running && startTimeRef.current === null && text.length === 0 && next.length > 0) {
                startTimer();
              }
              setText(next);
            }}
            onPaste={(e) => { if (running && prohibitPaste) e.preventDefault(); }}
            disabled={false}
            placeholder={startTimeRef.current === null ? "Begin typing to start your timer…" : ""}
            className="min-h-[70vh] text-lg"
          />
        </div>
      </div>
    );
  }

  // Done screen (post-session actions)
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-4 md:p-8">
      {submitState === 'success' && (
        <div className="fixed top-3 right-3 z-40 flex items-center gap-1 rounded-md bg-emerald-600 text-white px-2 py-1 text-sm shadow">
          <CheckCircle className="h-4 w-4" />
          <span>Submitted</span>
        </div>
      )}
      <div className="mx-auto w-full max-w-screen-md space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Session Complete</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-slate-600">Time has expired for {student || 'student'}.</div>
            {submitState === 'submitting' && (
              <div className="text-sm text-slate-700">Saving to database…</div>
            )}
            {submitState === 'error' && (
              <div className="text-sm text-rose-700">Save failed. The text remains on this device.</div>
            )}
            {submitState === 'success' && submissionId && (
              <div className="text-sm text-emerald-700">Saved. ID: {submissionId}</div>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <Button onClick={copyText} variant="secondary">Copy Text</Button>
              <Button onClick={downloadText} variant="secondary">Download .txt</Button>
              {submissionId && (
                <a
                  href={`/?submission=${encodeURIComponent(submissionId)}`}
                  className="inline-flex items-center justify-center rounded-md bg-blue-600 text-white px-3 py-2 text-sm hover:bg-blue-700"
                >
                  Open in Scoring
                </a>
              )}
              <Button onClick={resetSession} className="bg-slate-900 hover:bg-slate-800">New Session</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Written Text</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea value={text} readOnly className="min-h-[50vh]" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
