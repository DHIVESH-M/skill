import { NavLink, Outlet } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { useApp } from '../App'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import { reducedMotion } from '../lib/motion'
const links = [['/', '🏠', 'Home'], ['/roadmap', '🗺️', 'Roadmap'], ['/assess', '🧪', 'Quiz'], ['/mentor', '🤖', 'Mentor']]
export default function Layout() {
  const { me, refresh } = useApp(), ref = useRef(), p = me?.profile, demo = !!p?.is_demo
  useEffect(() => { if (!reducedMotion()) gsap.fromTo(ref.current, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' }) }, [])
  const reset = async () => { if (!window.confirm('Reset all demo progress and start over?')) return; try { await api('/demo/reset', {}); await refresh() } catch (e) { window.alert(e.message) } }
  return (<div className="min-h-screen pb-24 md:pb-6 md:pl-56">
    <a href="#main" className="skip-link">Skip to main content</a>
    <nav aria-label="Primary" className="hidden md:flex fixed left-0 top-0 h-full w-56 flex-col gap-2 p-4 bg-white/70 backdrop-blur border-r-2 border-ink/10">
      <div className="text-2xl font-black mb-4">Skill<span className="text-[#7a3fc4]">Path</span> AI</div>
      {links.map(([to, e, l]) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `rounded-2xl px-4 py-3 font-extrabold ${isActive ? 'bg-lavender' : 'hover:bg-cream'}`}><span aria-hidden="true">{e}</span> {l}</NavLink>)}
      {demo && <div className="mt-auto card !p-3 !bg-cream text-xs font-bold"><span aria-hidden="true">🎭</span> You're using a <b>Demo Account</b>. Progress is saved to this browser's session.<button className="btn btn-mint !py-1 mt-2 w-full" onClick={reset}>Reset demo</button></div>}
      <button className={`btn btn-pink ${demo ? '' : 'mt-auto'}`} onClick={() => supabase.auth.signOut()}>Sign out</button>
    </nav>
    <header className="flex items-center justify-between p-4 md:justify-end gap-3">
      <div className="md:hidden text-xl font-black">SkillPath AI</div>
      <div className="flex gap-2 font-extrabold items-center">
        {demo && <span className="card !p-2 !px-4 !rounded-full !bg-pink"><span aria-hidden="true">🎭</span> Demo User</span>}
        {demo && <button className="md:hidden text-xs underline font-extrabold min-h-[44px] px-2" onClick={reset}>Reset</button>}
        <span className="card !p-2 !px-4 !rounded-full"><span aria-hidden="true">🔥</span> {p?.streak || 0}<span className="sr-only"> day streak</span></span>
        <span className="card !p-2 !px-4 !rounded-full"><span aria-hidden="true">⭐</span> {p?.xp || 0} XP</span>
      </div>
    </header>
    <main id="main" tabIndex={-1} ref={ref} className="px-4 max-w-5xl mx-auto outline-none"><Outlet /></main>
    <nav aria-label="Mobile" className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t-2 border-ink/10 flex justify-around p-2 z-10">
      {links.map(([to, e, l]) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `flex flex-col items-center justify-center min-w-[44px] min-h-[44px] text-xs font-extrabold px-3 py-1 rounded-2xl ${isActive ? 'bg-lavender' : ''}`}><span aria-hidden="true" className="text-xl">{e}</span>{l}</NavLink>)}
    </nav></div>)
}
