import { useState } from 'react'
import { api } from '../lib/api'
import { useApp } from '../App'
import { Roadmap3D } from '../components/Lazy'
import { ErrorBox } from '../components/ui'
export default function Roadmap() {
  const { me, refresh } = useApp(), steps = me.roadmap?.steps || [], [busy, setBusy] = useState(''), [err, setErr] = useState(''), [toast, setToast] = useState('')
  const finish = async id => { setBusy(id); setErr(''); try { const r = await api(`/roadmap/${id}/complete`, {}); setToast(`+${r.xp} XP! ${r.new_achievements.length ? '🏆 New badge unlocked!' : ''}`); await refresh(); setTimeout(() => setToast(''), 3000) } catch (e) { setErr(e.message) } setBusy('') }
  return <div className="space-y-4"><h1 className="text-3xl font-black">Your career roadmap</h1><div className="card !bg-sky"><Roadmap3D steps={steps} /></div>
    <ErrorBox error={err} />{toast && <div role="status" className="card !bg-mint font-extrabold text-center">{toast}</div>}
    {steps.map((s, i) => <div key={s.id} className={`card ${s.done ? '!bg-mint/60' : ''}`}><div className="flex justify-between gap-3"><div><div className="text-xs font-extrabold text-ink/80">QUEST {i + 1} · {s.skill}</div><h2 className="text-xl font-black">{s.title}</h2></div><div className="font-extrabold"><span aria-hidden="true">⭐</span> {s.xp}<span className="sr-only"> XP</span></div></div>
      <p className="font-semibold mt-1">{s.description}</p><p className="mt-2 text-sm font-bold">📚 {s.course}</p><p className="text-sm font-bold">🛠️ Project: {s.project}</p>
      {!s.done && <button className="btn btn-mint mt-3" aria-label={`Mark "${s.title}" complete`} disabled={busy === s.id} onClick={() => finish(s.id)}>{busy === s.id ? 'Saving…' : 'Mark complete'}</button>}</div>)}</div>
}
