import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { ErrorBox, Loader } from '../ui'
import ErrorBoundary from '../ErrorBoundary'
import { SkillViz } from '../Lazy'

describe('ui', () => {
  it('ErrorBox announces errors via role=alert and supports retry', async () => {
    const retry = vi.fn(); render(<ErrorBox error="Boom" retry={retry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Boom'); await userEvent.click(screen.getByRole('button', { name: 'Retry' })); expect(retry).toHaveBeenCalled()
  })
  it('ErrorBox renders nothing without an error', () => { const { container } = render(<ErrorBox error="" />); expect(container).toBeEmptyDOMElement() })
  it('Loader is a polite live status', async () => {
    const { container } = render(<Loader text="Loading quiz" />); expect(screen.getByRole('status')).toHaveTextContent('Loading quiz'); expect(await axe(container)).toHaveNoViolations()
  })
})
describe('ErrorBoundary', () => {
  const Bomb = () => { throw new Error('kaboom') }
  it('shows an accessible fallback instead of crashing the app', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ErrorBoundary><Bomb /></ErrorBoundary>); expect(screen.getByRole('alert')).toHaveTextContent(/something went wrong/i); expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  })
  it('renders a custom fallback and children when healthy', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rerender } = render(<ErrorBoundary fallback={<p>fallback</p>}><Bomb /></ErrorBoundary>); expect(screen.getByText('fallback')).toBeInTheDocument()
    rerender(<ErrorBoundary key="2"><p>healthy</p></ErrorBoundary>); expect(screen.getByText('healthy')).toBeInTheDocument()
  })
})
describe('SkillViz accessibility', () => {
  it('exposes the 3D chart data as text for screen readers', async () => {
    const { container } = render(<SkillViz skills={{ Python: 40, SQL: 75 }} />)
    expect(screen.getByRole('img', { name: /3D bar chart of 2 skill levels/i })).toBeInTheDocument()
    expect(screen.getByText('Python: 40 out of 100')).toBeInTheDocument(); expect(screen.getByText('SQL: 75 out of 100')).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })
})
