import { lazy, Suspense } from 'react'
import ErrorBoundary from './ErrorBoundary'
// 3D scenes (three.js / R3F / drei ≈ 1MB) are code-split so they never block first paint or the non-3D pages.
const MascotScene = lazy(() => import('./Mascot')), SkillScene = lazy(() => import('./SkillViz')), RoadmapScene = lazy(() => import('./Roadmap3D'))
const Skeleton = ({ height }) => <div style={{ height }} className="grid place-items-center" role="status"><span className="sr-only">Loading 3D scene</span><span aria-hidden="true" className="text-4xl animate-pulse">🤖</span></div>
const Safe = ({ height, children }) => <ErrorBoundary fallback={<div style={{ height }} aria-hidden="true" className="grid place-items-center text-5xl">🤖</div>}><Suspense fallback={<Skeleton height={height} />}>{children}</Suspense></ErrorBoundary>

/** Decorative mascot: hidden from assistive tech. */
export const Mascot = ({ height = 320, className = '', ...rest }) => <div aria-hidden="true" className={className}><Safe height={height}><MascotScene height={height} {...rest} /></Safe></div>
/** Roadmap path is conveyed by the quest list; the 3D view is decorative. */
export const Roadmap3D = ({ steps, height = 260 }) => <div aria-hidden="true"><Safe height={height}><RoadmapScene steps={steps} height={height} /></Safe></div>
/** 3D bar chart with a text alternative for screen readers. */
export const SkillViz = ({ skills = {}, height = 340 }) => {
  const e = Object.entries(skills)
  return <figure className="m-0"><div role="img" aria-label={`Interactive 3D bar chart of ${e.length} skill levels. The same data is listed below.`}><Safe height={height}><SkillScene skills={skills} height={height} /></Safe></div>
    <ul className="sr-only">{e.map(([s, l]) => <li key={s}>{s}: {l} out of 100</li>)}</ul></figure>
}
