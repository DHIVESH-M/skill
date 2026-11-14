import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useApp } from '../App'
import { Loader, ErrorBox } from '../components/ui'
const FOCUS_RING = 'has-[:focus-visible]:outline has-[:focus-visible]:outline-4 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[#5b2fa8]'
export default function Assess() {
  const { me, refresh } = useApp(), [sp] = useSearchParams(), [quiz, setQuiz] = useState(null), [i, setI] = useState(0), [ans, setAns] = useState([]), [sel, setSel] = useState(null), [res, setRes] = useState(null), [busy, setBusy] = useState(''), [err, setErr] = useState('')
  const focusRef = useRef()
  useEffect(() => { focusRef.current?.focus() }, [i, res, quiz, busy])   // move focus to the new question/result for keyboard + screen-reader users
  const start = async skill => { setBusy('Generating your quiz…'); setErr(''); setRes(null); try { const q = await api(`/quiz/${encodeURIComponent(skill)}`); setQuiz(q); setI(0); setAns([]); setSel(null) } catch (e) { setErr(e.message) } setBusy('') }
  const next = async () => { const a = [...ans, sel]; setAns(a); setSel(null)
    if (i + 1 < quiz.questions.length) return setI(i + 1)
    setBusy('Assessment Evaluator is grading…'); try { setRes(await api('/quiz/submit', { token: quiz.token, answers: a })); await refresh() } catch (e) { setErr(e.message) } setBusy('') }
  if (busy) return <Loader text={busy} />
  const skills = Object.keys(me.skills), pre = sp.get('skill')
  if (res) return <div className="card text-center space-y-3 !bg-lavender"><div aria-hidden="true" className="text-6xl">{res.score >= 80 ? '🎉' : res.score >= 60 ? '👍' : '💪'}</div><h1 ref={focusRef} tabIndex={-1} className="text-3xl font-black outline-none">Your score: {res.score}%</h1><p className="font-bold">{res.feedback}</p>
    <p className="font-extrabold">+{res.xp} XP · {quiz.skill} level is now {res.new_level}</p>{res.adapted && <p className="card !bg-cream font-bold">🔁 I added a review quest to your roadmap.</p>}{res.new_achievements.length > 0 && <p className="font-extrabold">🏆 New badge unlocked!</p>}
    <button className="btn btn-mint" onClick={() => { setQuiz(null); setRes(null) }}>Another quiz</button></div>
  if (quiz) { const q = quiz.questions[i]; const last = i + 1 === quiz.questions.length
    return <div className="space-y-4"><div className="bar" role="progressbar" aria-label="Quiz progress" aria-valuemin={0} aria-valuemax={quiz.questions.length} aria-valuenow={i}><div style={{ width: `${(100 * i) / quiz.questions.length}%` }} /></div><ErrorBox error={err} />
      <fieldset className="card"><legend ref={focusRef} tabIndex={-1} className="outline-none"><span className="block text-xs font-extrabold text-ink/80">{quiz.skill} · Question {i + 1} of {quiz.questions.length}</span><span className="block text-2xl font-black my-3">{q.q}</span></legend>
        <div className="space-y-2">{q.options.map((o, k) => <label key={`${i}-${k}`} className={`btn w-full !justify-start !normal-case cursor-pointer ${sel === k ? 'btn-primary' : 'bg-white'} ${FOCUS_RING}`}>
          <input type="radio" name={`q${i}`} className="sr-only" checked={sel === k} onChange={() => setSel(k)} />{o}</label>)}</div></fieldset>
      <button className="btn btn-mint w-full" disabled={sel === null} onClick={next}>{last ? 'Finish' : 'Check & next'}</button></div> }
  return <div className="space-y-4"><h1 className="text-3xl font-black">Pick a skill to test <span aria-hidden="true">🧪</span></h1><ErrorBox error={err} />{pre && me.skills[pre] !== undefined && <button className="btn btn-pink" onClick={() => start(pre)}>Start suggested: {pre}</button>}
    <ul className="grid grid-cols-2 md:grid-cols-3 gap-3 list-none p-0">{skills.map(s => <li key={s}><button onClick={() => start(s)} className="card w-full text-left font-extrabold hover:-translate-y-1 transition">{s}<span className="sr-only"> — current level {me.skills[s]} out of 100</span><div aria-hidden="true" className="bar mt-2"><div style={{ width: `${me.skills[s]}%` }} /></div></button></li>)}</ul></div>
}
