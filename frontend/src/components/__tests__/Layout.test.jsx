import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { axe } from 'vitest-axe'
const state = { me: null }, refresh = vi.fn()
vi.mock('../../App', () => ({ useApp: () => ({ me: state.me, refresh }) }))
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { signOut: vi.fn() } } }))
vi.mock('../../lib/api', () => ({ api: vi.fn(async () => ({ ok: true })) }))
import Layout from '../Layout'
import { api } from '../../lib/api'
import { supabase } from '../../lib/supabase'
const view = () => render(<MemoryRouter><Routes><Route element={<Layout />}><Route index element={<h1>Home page</h1>} /></Route></Routes></MemoryRouter>)
beforeEach(() => { refresh.mockReset(); api.mockClear(); state.me = { profile: { name: 'Sam', xp: 120, streak: 4, is_demo: false } } })

describe('Layout', () => {
  it('provides a skip link, uniquely-labelled landmarks and no axe violations', async () => {
    const { container } = view()
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main'); expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument(); expect(screen.getByRole('navigation', { name: 'Mobile' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Roadmap/ })).toHaveLength(2); expect(await axe(container)).toHaveNoViolations()
  })
  it('shows XP and streak with screen-reader text, and no demo label for real users', () => {
    view(); expect(screen.getByText(/120 XP/)).toBeInTheDocument(); expect(screen.getByText('day streak')).toBeInTheDocument(); expect(screen.queryByText('Demo User')).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Reset demo' })).not.toBeInTheDocument()
  })
  it('clearly labels demo accounts and resets only after confirmation', async () => {
    state.me.profile.is_demo = true; view(); expect(screen.getByText(/Demo User/)).toBeInTheDocument()
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false); await userEvent.click(screen.getByRole('button', { name: 'Reset demo' })); expect(api).not.toHaveBeenCalled()
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true); await userEvent.click(screen.getByRole('button', { name: 'Reset demo' }))
    expect(api).toHaveBeenCalledWith('/demo/reset', {}); expect(refresh).toHaveBeenCalled()
  })
  it('signs out', async () => { view(); await userEvent.click(screen.getByRole('button', { name: 'Sign out' })); expect(supabase.auth.signOut).toHaveBeenCalled() })
})
