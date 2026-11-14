import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Mascot } from '../components/Lazy'
import { ErrorBox } from '../components/ui'
import { startDemo } from '../lib/api'
export default function Auth() {
  const [mode, setMode] = useState('in'), [email, setEmail] = useState(''), [pw, setPw] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [note, setNote] = useState('')
  const demo = async () => { setBusy(true); setErr(''); try { await startDemo() } catch (e) { setErr(e.message); setBusy(false) } }
  const go = async e => { e.preventDefault(); setBusy(true); setErr(''); setNote('')
    const { data, error } = mode === 'in' ? await supabase.auth.signInWithPassword({ email, password: pw }) : await supabase.auth.signUp({ email, password: pw })
    if (error) setErr(error.message); else if (mode === 'up' && !data.session) setNote('Check your email to confirm, then sign in!'); setBusy(false) }
  const bad = !!err
  return <main className="min-h-screen grid md:grid-cols-2 items-center max-w-5xl mx-auto p-4 gap-4">
    <Mascot height={380} />
    <form onSubmit={go} className="card space-y-4" aria-busy={busy}>
      <h1 className="text-3xl font-black">Skill<span className="text-[#7a3fc4]">Path</span> AI</h1>
      <p className="font-bold text-ink/80">Your personal AI learning adventure <span aria-hidden="true">✨</span></p>
      <button type="button" className="btn btn-pink w-full !py-4 text-base" disabled={busy} onClick={demo}>{busy ? 'Starting…' : <><span aria-hidden="true">🎭</span> Continue as Demo User</>}</button>
      <p className="text-xs font-bold text-ink/80 text-center -mt-2">No signup or email needed · full access · private to this browser</p>
      <div aria-hidden="true" className="flex items-center gap-3 text-xs font-extrabold text-ink/80"><div className="h-px bg-ink/10 flex-1" />OR<div className="h-px bg-ink/10 flex-1" /></div>
      <div><label htmlFor="email" className="block font-extrabold mb-1">Email</label>
        <input id="email" className="input" type="email" required autoComplete="email" aria-invalid={bad} aria-describedby={bad ? 'auth-error' : undefined} placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} /></div>
      <div><label htmlFor="password" className="block font-extrabold mb-1">Password</label>
        <input id="password" className="input" type="password" required minLength={6} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} aria-invalid={bad} aria-describedby={bad ? 'auth-error' : 'pw-hint'} placeholder="6+ characters" value={pw} onChange={e => setPw(e.target.value)} />
        <p id="pw-hint" className="text-xs font-bold text-ink/80 mt-1">At least 6 characters.</p></div>
      <ErrorBox error={err} id="auth-error" />{note && <div role="status" className="card !bg-mint font-bold">{note}</div>}
      <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'One sec…' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
      <button type="button" className="w-full font-extrabold text-sm underline min-h-[44px]" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>{mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}</button>
    </form></main>
}
