import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { signInWithPassword: vi.fn(), signUp: vi.fn() } } }))
vi.mock('../../lib/api', () => ({ startDemo: vi.fn() }))
vi.mock('../../components/Lazy', () => ({ Mascot: () => <div /> }))
import Auth from '../Auth'
import { supabase } from '../../lib/supabase'
import { startDemo } from '../../lib/api'

describe('Auth page', () => {
  it('has labelled fields, a prominent demo button and no axe violations', async () => {
    const { container } = render(<Auth />)
    expect(screen.getByLabelText('Email')).toBeRequired(); expect(screen.getByLabelText('Password')).toHaveAttribute('minlength', '6')
    expect(screen.getByRole('button', { name: /continue as demo user/i })).toBeEnabled(); expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })
  it('starts a demo session without any credentials', async () => {
    startDemo.mockResolvedValue(); render(<Auth />); await userEvent.click(screen.getByRole('button', { name: /continue as demo user/i }))
    expect(startDemo).toHaveBeenCalledTimes(1); expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled()
  })
  it('announces demo failures and re-enables the button', async () => {
    startDemo.mockRejectedValue(new Error('Demo mode is disabled')); render(<Auth />); await userEvent.click(screen.getByRole('button', { name: /continue as demo user/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Demo mode is disabled'); expect(screen.getByRole('button', { name: /continue as demo user/i })).toBeEnabled()
  })
  it('signs in and marks fields invalid with a described error on failure', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } }); render(<Auth />)
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co'); await userEvent.type(screen.getByLabelText('Password'), 'secret1'); await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.co', password: 'secret1' })
    const alert = await screen.findByRole('alert'); expect(alert).toHaveTextContent('Invalid login credentials')
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true'); expect(screen.getByLabelText('Email')).toHaveAttribute('aria-describedby', alert.id)
  })
  it('switches to sign-up and tells the user to confirm their email', async () => {
    supabase.auth.signUp.mockResolvedValue({ data: { session: null }, error: null }); render(<Auth />)
    await userEvent.click(screen.getByRole('button', { name: /create an account/i })); await userEvent.type(screen.getByLabelText('Email'), 'n@b.co'); await userEvent.type(screen.getByLabelText('Password'), 'secret1')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' })); await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/check your email/i))
  })
})
