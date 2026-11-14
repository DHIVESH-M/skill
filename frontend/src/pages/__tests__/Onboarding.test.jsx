import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
const navigate = vi.fn(), refresh = vi.fn()
vi.mock('react-router-dom', async orig => ({ ...(await orig()), useNavigate: () => navigate }))
vi.mock('../../App', () => ({ useApp: () => ({ me: { profile: { name: 'Sam', is_demo: true } }, refresh }) }))
vi.mock('../../lib/api', () => ({ api: vi.fn() }))
vi.mock('../../components/Lazy', () => ({ Mascot: () => <div /> }))
import Onboarding from '../Onboarding'
import { api } from '../../lib/api'
beforeEach(() => { api.mockReset(); navigate.mockReset(); refresh.mockReset(); api.mockImplementation(async p => p === '/careers' ? { 'Data Scientist': ['Python', 'SQL'], 'UX Designer': ['Figma'] } : { ok: true }) })

describe('Onboarding', () => {
  it('requires a career + name before continuing, with accessible toggle buttons', async () => {
    const { container } = render(<Onboarding />); await screen.findByRole('button', { name: /Data Scientist/ })
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled(); expect(screen.getByText(/Demo User/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Data Scientist/ })); expect(screen.getByRole('button', { name: /Data Scientist/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled(); expect(await axe(container)).toHaveNoViolations()
  })
  it('submits goal + self-assessed ratings to the analysis API, refreshes and navigates home', async () => {
    render(<Onboarding />); await userEvent.click(await screen.findByRole('button', { name: /Data Scientist/ })); await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.change(screen.getByLabelText('Python'), { target: { value: '70' } })
    await userEvent.click(screen.getByRole('button', { name: /build my roadmap/i }))
    expect(api).toHaveBeenCalledWith('/analyze', { name: 'Sam', goal: 'Data Scientist', ratings: { Python: 70, SQL: 30 } })
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/')); expect(refresh).toHaveBeenCalled()
  })
  it('shows an error and keeps the form when analysis fails', async () => {
    render(<Onboarding />); await userEvent.click(await screen.findByRole('button', { name: /UX Designer/ })); await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    api.mockRejectedValueOnce(new Error('Ratings contain skills outside this career')); await userEvent.click(screen.getByRole('button', { name: /build my roadmap/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('outside this career'); expect(navigate).not.toHaveBeenCalled()
  })
})
