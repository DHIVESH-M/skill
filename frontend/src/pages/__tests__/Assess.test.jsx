import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { axe } from 'vitest-axe'
const refresh = vi.fn()
vi.mock('../../App', () => ({ useApp: () => ({ me: { skills: { Python: 40, SQL: 20 } }, refresh }) }))
vi.mock('../../lib/api', () => ({ api: vi.fn() }))
import Assess from '../Assess'
import { api } from '../../lib/api'
const quiz = { skill: 'Python', token: 'TOK', questions: [{ q: 'What is a list?', options: ['A', 'B', 'C', 'D'] }, { q: 'What is a dict?', options: ['E', 'F', 'G', 'H'] }] }
const view = (url = '/assess') => render(<MemoryRouter initialEntries={[url]}><Assess /></MemoryRouter>)
beforeEach(() => { api.mockReset(); refresh.mockReset() })

describe('Assess (quiz workflow)', () => {
  it('lists the learner skills as buttons with their level', async () => {
    const { container } = view(); expect(screen.getByRole('button', { name: /Python.*level 40/ })).toBeInTheDocument(); expect(await axe(container)).toHaveNoViolations()
  })
  it('offers the mentor-suggested skill only if the learner has it', () => {
    view('/assess?skill=SQL'); expect(screen.getByRole('button', { name: 'Start suggested: SQL' })).toBeInTheDocument()
    view('/assess?skill=Hacking'); expect(screen.queryByRole('button', { name: /Hacking/ })).not.toBeInTheDocument()
  })
  it('runs a full quiz: radio options, gated Next button, submits token + answers, shows results and refreshes progress', async () => {
    api.mockResolvedValueOnce(quiz); const { container } = view(); await userEvent.click(screen.getByRole('button', { name: /Python/ }))
    expect(api).toHaveBeenCalledWith('/quiz/Python')
    expect(await screen.findByRole('group', { name: /What is a list\?/ })).toBeInTheDocument(); expect(await axe(container)).toHaveNoViolations()
    const next = screen.getByRole('button', { name: 'Check & next' }); expect(next).toBeDisabled()
    await userEvent.click(screen.getByRole('radio', { name: 'B' })); expect(next).toBeEnabled(); await userEvent.click(next)
    expect(screen.getByRole('group', { name: /What is a dict\?/ })).toBeInTheDocument()
    api.mockResolvedValueOnce({ score: 100, feedback: 'Great!', new_level: 70, xp: 30, new_achievements: ['quiz_whiz'], adapted: false })
    await userEvent.click(screen.getByRole('radio', { name: 'H' })); await userEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(api).toHaveBeenLastCalledWith('/quiz/submit', { token: 'TOK', answers: [1, 3] })
    expect(await screen.findByRole('heading', { name: /Your score: 100%/ })).toHaveFocus(); expect(screen.getByText(/level is now 70/)).toBeInTheDocument(); expect(screen.getByText(/New badge unlocked/)).toBeInTheDocument(); expect(refresh).toHaveBeenCalled()
  })
  it('tells the learner when a failed quiz added a review quest', async () => {
    api.mockResolvedValueOnce({ ...quiz, questions: [quiz.questions[0]] }); view(); await userEvent.click(screen.getByRole('button', { name: /SQL/ }))
    api.mockResolvedValueOnce({ score: 20, feedback: 'Keep going', new_level: 20, xp: 14, new_achievements: [], adapted: true })
    await userEvent.click(await screen.findByRole('radio', { name: 'A' })); await userEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(await screen.findByText(/review quest to your roadmap/)).toBeInTheDocument()
  })
  it('shows an announced error if the quiz cannot be loaded', async () => {
    api.mockRejectedValueOnce(new Error('Unknown skill')); view(); await userEvent.click(screen.getByRole('button', { name: /Python/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Unknown skill')
  })
})
