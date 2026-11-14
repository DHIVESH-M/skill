import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
const navigate = vi.fn()
vi.mock('react-router-dom', async orig => ({ ...(await orig()), useNavigate: () => navigate }))
vi.mock('../../lib/api', () => ({ api: vi.fn() }))
vi.mock('../../components/Lazy', () => ({ Mascot: () => <div /> }))
import Mentor from '../Mentor'
import { api } from '../../lib/api'
beforeEach(() => { api.mockReset(); navigate.mockReset(); api.mockImplementation(async path => path === '/mentor/history' ? [{ role: 'assistant', content: 'Welcome back!' }] : {}) })

describe('Mentor chat', () => {
  it('loads history into an accessible live log', async () => {
    const { container } = render(<Mentor />); expect(await screen.findByText('Welcome back!')).toBeInTheDocument()
    expect(screen.getByRole('log', { name: /conversation with pip/i })).toBeInTheDocument(); expect(await axe(container)).toHaveNoViolations()
  })
  it('sends a message, shows the reply and the agent trace, and follows quiz actions', async () => {
    api.mockImplementation(async path => path === '/mentor/history' ? [] : { reply: 'Try a quiz on SQL!', action: { type: 'quiz', skill: 'SQL' }, trace: [{ agent: 'SkillAnalyzer' }, { agent: 'AIMentor' }] })
    render(<Mentor />); await userEvent.type(screen.getByLabelText('Message Pip'), 'What next?'); await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(api).toHaveBeenCalledWith('/mentor', { message: 'What next?' })
    expect(await screen.findByText(/Try a quiz on SQL!/)).toBeInTheDocument(); expect(screen.getByText(/SkillAnalyzer → AIMentor/)).toBeInTheDocument()
    expect(screen.getByLabelText('Message Pip')).toHaveValue(''); await userEvent.click(screen.getByRole('button', { name: 'Quiz: SQL' })); expect(navigate).toHaveBeenCalledWith('/assess?skill=SQL')
  })
  it('ignores blank messages', async () => {
    render(<Mentor />); await screen.findByText('Welcome back!'); await userEvent.type(screen.getByLabelText('Message Pip'), '   '); await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(api).not.toHaveBeenCalledWith('/mentor', expect.anything())
  })
  it('announces failures', async () => {
    api.mockImplementation(async path => { if (path === '/mentor/history') return []; throw new Error('Service unavailable') })
    render(<Mentor />); await userEvent.type(screen.getByLabelText('Message Pip'), 'hi'); await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable')
  })
})
